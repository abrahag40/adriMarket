"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { MediaError, deleteImage, uploadImage } from "@/modules/media/images";
import { requireStaff } from "@/modules/identity/session";

import type { ActionState } from "../actions";

/**
 * Acciones del catálogo · S6-1 a S6-5
 *
 * Todas exigen rol de gerencia. Publicar un producto, mover una tarifa o cambiar
 * el anticipo son decisiones comerciales, no operativas: recepción cobra y
 * bloquea, gerencia decide qué se vende y a cuánto.
 *
 * Todas escriben en la bitácora. Un cambio de tarifa que nadie recuerda haber
 * hecho es indistinguible de un error del sistema.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/**
 * Días de la semana como literal de arreglo de Postgres.
 *
 * Pasar el arreglo de JavaScript directo no funciona: el constructor de
 * consultas lo expande como una lista de parámetros —`($1, $2)`— que no es un
 * arreglo y Postgres rechaza. Se arma el literal `{2,4}` a mano. Los valores ya
 * vinieron convertidos a número, así que no hay nada que escapar.
 */
function dowsLiteral(dows: number[]): string {
  return `{${dows.join(",")}}`;
}

/** Centavos a partir de un monto escrito como "3200" o "3200.50". */
function cents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

function describe(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (typeof current !== "object") break;
    const candidate = current as { message?: unknown; cause?: unknown };
    if (typeof candidate.message === "string") parts.push(candidate.message);
    current = candidate.cause;
  }
  return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// S6-1 · Productos y traducciones
// ---------------------------------------------------------------------------

export async function createProduct(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const kind = text(form, "kind");
  const slug = text(form, "slug").toLowerCase();
  const name = text(form, "name");
  const locationId = text(form, "locationId");

  if (kind !== "tour" && kind !== "stay") return { error: "Elige tour o estancia.", ok: null };
  if (!SLUG.test(slug)) {
    return {
      error: "La dirección solo lleva minúsculas, números y guiones. Ejemplo: catamaran-al-arrecife.",
      ok: null,
    };
  }
  if (name.length < 3) return { error: "Escribe el nombre del producto.", ok: null };

  try {
    const rows = await db.execute<{ id: string }>(sql`
      insert into products (kind, slug, status, location_id, currency)
      values (${kind}::product_kind, ${slug}, 'draft',
              ${locationId || null}::uuid, 'MXN')
      returning id
    `);
    const id = rows[0]!.id;

    // Nace en borrador y con su nombre en español. Publicar es un paso aparte y
    // con sus propias validaciones: se puede dejar a medias sin publicar nada
    // roto.
    await db.execute(sql`
      insert into product_translations (product_id, locale, name)
      values (${id}::uuid, 'es', ${name})
    `);

    await db.execute(sql`
      select audit_record(${staff.id}::uuid, 'product.create', 'product', ${id},
                          null, ${JSON.stringify({ kind, slug, name })}::jsonb)
    `);

    revalidatePath("/admin/catalogo");
    return { error: null, ok: `Producto creado en borrador: ${name}.` };
  } catch (error: unknown) {
    if (/unique|duplicate/i.test(describe(error))) {
      return { error: "Ya existe un producto con esa dirección.", ok: null };
    }
    throw error;
  }
}

export async function saveTranslation(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const productId = text(form, "productId");
  const locale = text(form, "locale");
  const name = text(form, "name");
  const summary = text(form, "summary") || null;
  const description = text(form, "description") || null;

  if (locale !== "es" && locale !== "en") return { error: "Idioma no válido.", ok: null };
  if (name.length < 3) return { error: "El nombre no puede quedar vacío.", ok: null };

  await db.execute(sql`
    insert into product_translations (product_id, locale, name, summary, description)
    values (${productId}::uuid, ${locale}, ${name}, ${summary}, ${description})
    on conflict (product_id, locale) do update
      set name = excluded.name, summary = excluded.summary, description = excluded.description
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'product.translate', 'product', ${productId},
                        null, ${JSON.stringify({ locale, name })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}`);
  return { error: null, ok: `Texto en ${locale === "es" ? "español" : "inglés"} guardado.` };
}

/**
 * Publicar o volver a borrador.
 *
 * **Publicar exige traducción al español.** Desde el Sprint 1, un producto sin
 * nombre en un idioma responde 404 en ese idioma; publicarlo sin texto sería
 * publicar una página rota que además consume presupuesto de rastreo.
 */
export async function setProductStatus(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const productId = text(form, "productId");
  const status = text(form, "status");

  if (!["draft", "published", "archived"].includes(status)) {
    return { error: "Estado no válido.", ok: null };
  }

  if (status === "published") {
    const rows = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from product_translations
       where product_id = ${productId}::uuid and locale = 'es' and length(name) > 2
    `);
    if (rows[0]!.n === 0) {
      return { error: "Falta el nombre en español. Sin él, la ficha responde 404.", ok: null };
    }

    const media = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from product_media where product_id = ${productId}::uuid
    `);
    if (media[0]!.n === 0) {
      // Las fotos son el activo de venta de este producto. Publicar sin foto es
      // publicar algo que no se va a vender.
      return { error: "Sube al menos una foto antes de publicar.", ok: null };
    }
  }

  const before = await db.execute<{ status: string }>(sql`
    select status::text as status from products where id = ${productId}::uuid
  `);

  await db.execute(sql`
    update products set status = ${status}::product_status where id = ${productId}::uuid
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'product.status', 'product', ${productId},
                        ${JSON.stringify({ status: before[0]?.status })}::jsonb,
                        ${JSON.stringify({ status })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}`);
  revalidatePath("/admin/catalogo");
  return {
    error: null,
    ok: status === "published" ? "Producto publicado: ya se ve en el sitio." : "Producto en borrador.",
  };
}

// ---------------------------------------------------------------------------
// S6-1 · Fotos
// ---------------------------------------------------------------------------

export async function addPhoto(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const productId = text(form, "productId");
  const file = form.get("photo");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elige una foto.", ok: null };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadImage(productId, { name: file.name, bytes }, staff.id);

    await db.execute(sql`
      select audit_record(${staff.id}::uuid, 'media.upload', 'product', ${productId},
                          null, ${JSON.stringify({ name: file.name, bytes: bytes.length })}::jsonb)
    `);

    revalidatePath(`/admin/catalogo/${productId}`);
    return {
      error: null,
      // Se dice qué falta: la foto ya se ve, pero todavía pesa lo que pesaba.
      ok: "Foto subida. Los tamaños para móvil se generan en unos segundos.",
    };
  } catch (error: unknown) {
    if (error instanceof MediaError) return { error: error.message, ok: null };
    throw error;
  }
}

export async function removePhoto(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const mediaId = text(form, "mediaId");
  const productId = text(form, "productId");
  if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return { error: "Foto no válida.", ok: null };

  await deleteImage(mediaId);
  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'media.delete', 'product', ${productId},
                        ${JSON.stringify({ media_id: mediaId })}::jsonb, null)
  `);

  revalidatePath(`/admin/catalogo/${productId}`);
  return { error: null, ok: "Foto eliminada." };
}

// ---------------------------------------------------------------------------
// S6-2 · Tarifas
// ---------------------------------------------------------------------------

/**
 * Alta de una tarifa.
 *
 * **Un puente se pone encima, con más prioridad, sin partir la temporada.** Si
 * para cubrir un puente hubiera que cortar la temporada en tres tramos, cada
 * cambio dejaría huecos y solapes que se pagan con noches sin precio. Aquí se
 * agrega una regla más específica y el motor resuelve por prioridad — que es
 * para lo que existe la columna desde el Sprint 0.
 */
export async function saveRate(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const planId = text(form, "planId");
  const productId = text(form, "productId");
  const name = text(form, "name") || null;
  const from = text(form, "from");
  const to = text(form, "to");
  const nightly = cents(text(form, "nightly"));
  const minNights = text(form, "minNights");
  const priority = Number(text(form, "priority") || "0");
  const dows = form.getAll("dows").map((value) => Number(value));

  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { error: "Elige una unidad.", ok: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: "Faltan las fechas de la temporada.", ok: null };
  }
  if (from >= to) return { error: "La fecha de fin debe ser posterior al inicio.", ok: null };
  if (nightly === null || nightly <= 0) {
    return { error: "Escribe la tarifa por noche, en pesos. Ejemplo: 3200 o 3200.50", ok: null };
  }
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    return { error: "La prioridad va de 0 a 100.", ok: null };
  }

  await db.execute(sql`
    insert into stay_rates (rate_plan_id, name, season, dows, nightly_cents, min_nights, priority)
    values (${planId}::uuid, ${name}, daterange(${from}, ${to}),
            ${dows.length > 0 ? sql`${dowsLiteral(dows)}::smallint[]` : sql`null`},
            ${nightly},
            ${minNights ? Number(minNights) : null},
            ${priority})
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'rate.create', 'product', ${productId}, null,
                        ${JSON.stringify({ name, from, to, dows, nightly_cents: nightly, priority })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}/tarifas`);
  return { error: null, ok: `Tarifa guardada: ${(nightly / 100).toFixed(2)} por noche.` };
}

export async function deleteRate(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const rateId = text(form, "rateId");
  const productId = text(form, "productId");
  if (!/^[0-9a-f-]{36}$/i.test(rateId)) return { error: "Tarifa no válida.", ok: null };

  const rows = await db.execute<Record<string, unknown>>(sql`
    delete from stay_rates where id = ${rateId}::uuid
    returning name, season::text as season, nightly_cents::text as nightly_cents, priority
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'rate.delete', 'product', ${productId},
                        ${JSON.stringify(rows[0] ?? {})}::jsonb, null)
  `);

  revalidatePath(`/admin/catalogo/${productId}/tarifas`);
  return { error: null, ok: "Tarifa eliminada." };
}

// ---------------------------------------------------------------------------
// S6-3 · Salidas en lote
// ---------------------------------------------------------------------------

export async function generateDepartures(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const optionId = text(form, "optionId");
  const from = text(form, "from");
  const to = text(form, "to");
  const time = text(form, "time") || "09:00";
  const capacity = Number(text(form, "capacity") || "0");
  const dows = form.getAll("dows").map((value) => Number(value));

  if (!/^[0-9a-f-]{36}$/i.test(optionId)) return { error: "Elige el tour.", ok: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: "Faltan las fechas del periodo.", ok: null };
  }
  if (dows.length === 0) return { error: "Elige al menos un día de la semana.", ok: null };
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return { error: "El cupo tiene que ser mayor que cero.", ok: null };
  }

  try {
    const rows = await db.execute<{ created: number; skipped: number }>(sql`
      select created, skipped from departures_generate(
        ${optionId}::uuid, ${from}::date, ${to}::date,
        ${dowsLiteral(dows)}::smallint[], ${time}::time, ${capacity}, null, ${staff.id}::uuid
      )
    `);
    const result = rows[0]!;

    revalidatePath("/admin/salidas");
    revalidatePath("/admin/catalogo");
    return {
      error: null,
      // Se dice cuántas se omitieron, no solo cuántas se crearon: si el cliente
      // esperaba veinte y salieron dos, tiene que saber por qué sin preguntar.
      ok:
        result.skipped > 0
          ? `${result.created} salidas creadas. ${result.skipped} ya existían y se dejaron como estaban.`
          : `${result.created} salidas creadas.`,
    };
  } catch (error: unknown) {
    const message = describe(error);
    if (message.includes("invertido")) return { error: "El rango de fechas está al revés.", ok: null };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// S6-4 · Anticipo y cupones
// ---------------------------------------------------------------------------

/** Anticipo por omisión, el que heredan los productos sin uno propio. */
export async function setGlobalDeposit(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const pct = Number(text(form, "pct"));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { error: "El anticipo va de 1 a 100 por ciento.", ok: null };
  }

  await db.execute(sql`select settings_set_deposit_pct(${pct}, ${staff.id}::uuid)`);

  revalidatePath("/admin/ajustes");
  return {
    error: null,
    // La frase que evita la pregunta que sigue siempre.
    ok: `Anticipo por omisión: ${pct}%. Las reservas ya tomadas no cambian.`,
  };
}

/** Anticipo propio de un producto. Vacío significa "hereda el global". */
export async function setProductDeposit(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const productId = text(form, "productId");
  const raw = text(form, "pct");
  const pct = raw === "" ? null : Number(raw);

  if (pct !== null && (!Number.isFinite(pct) || pct <= 0 || pct > 100)) {
    return { error: "El anticipo va de 1 a 100 por ciento, o vacío para heredar.", ok: null };
  }

  const before = await db.execute<{ pct: string | null }>(sql`
    select deposit_pct::text as pct from products where id = ${productId}::uuid
  `);

  await db.execute(sql`
    update products set deposit_pct = ${pct} where id = ${productId}::uuid
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'product.deposit_pct', 'product', ${productId},
                        ${JSON.stringify({ pct: before[0]?.pct })}::jsonb,
                        ${JSON.stringify({ pct })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}`);
  return {
    error: null,
    ok:
      pct === null
        ? "Este producto vuelve a heredar el anticipo global. Las reservas ya tomadas no cambian."
        : `Anticipo de este producto: ${pct}%. Las reservas ya tomadas no cambian.`,
  };
}

export async function saveCoupon(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const code = text(form, "code").toUpperCase();
  const kind = text(form, "kind");
  const value = Number(text(form, "value"));
  const maxRedemptions = text(form, "maxRedemptions");
  const validTo = text(form, "validTo");

  if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
    return { error: "El código lleva de 3 a 24 letras, números o guiones.", ok: null };
  }
  if (kind !== "percent" && kind !== "fixed") return { error: "Tipo no válido.", ok: null };
  if (!Number.isFinite(value) || value <= 0) return { error: "El valor tiene que ser mayor que cero.", ok: null };
  if (kind === "percent" && value > 100) return { error: "Un porcentaje no puede pasar de 100.", ok: null };

  try {
    await db.execute(sql`
      insert into coupons (code, kind, value, currency, max_redemptions, valid_to)
      values (${code}, ${kind}::coupon_kind,
              ${kind === "fixed" ? value * 100 : value},
              ${kind === "fixed" ? "MXN" : null},
              ${maxRedemptions ? Number(maxRedemptions) : null},
              ${validTo || null}::timestamptz)
    `);

    await db.execute(sql`
      select audit_record(${staff.id}::uuid, 'coupon.create', 'coupon', ${code}, null,
                          ${JSON.stringify({ kind, value, maxRedemptions, validTo })}::jsonb)
    `);

    revalidatePath("/admin/ajustes");
    return { error: null, ok: `Cupón ${code} creado.` };
  } catch (error: unknown) {
    if (/unique|duplicate/i.test(describe(error))) {
      return { error: "Ya existe un cupón con ese código.", ok: null };
    }
    throw error;
  }
}

export async function toggleCoupon(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const id = text(form, "couponId");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Cupón no válido.", ok: null };

  // Se desactiva, no se borra: un cupón que ya se usó es parte de la historia de
  // esas reservas, y borrarlo deja descuentos sin explicación en la contabilidad.
  const rows = await db.execute<{ code: string; active: boolean }>(sql`
    update coupons set active = not active where id = ${id}::uuid
    returning code, active
  `);
  const row = rows[0];

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'coupon.toggle', 'coupon', ${row?.code ?? id}, null,
                        ${JSON.stringify({ active: row?.active })}::jsonb)
  `);

  revalidatePath("/admin/ajustes");
  return { error: null, ok: row?.active ? `Cupón ${row.code} activado.` : `Cupón ${row?.code} desactivado.` };
}
