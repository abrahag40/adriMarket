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

    const kindRows = await db.execute<{ kind: "tour" | "stay" }>(sql`
      select kind from products where id = ${productId}::uuid
    `);
    if (kindRows[0]?.kind === "tour") {
      const options = await db.execute<{ n: number }>(sql`
        select count(*)::int as n
          from tour_options o
          join tour_pax_prices p on p.tour_option_id = o.id and p.pax_type = 'adult'
         where o.product_id = ${productId}::uuid and o.active
      `);
      if (options[0]!.n === 0) {
        // Igual que sin fotos: un tour sin ninguna opción activa con precio de
        // adulto no tiene nada que un huésped pueda reservar.
        return {
          error: "Agrega al menos una opción activa con precio de adulto antes de publicar.",
          ok: null,
        };
      }
    }

    if (kindRows[0]?.kind === "stay") {
      const rates = await db.execute<{ n: number }>(sql`
        select count(*)::int as n
          from stay_units su
          join stay_rate_plans p on p.unit_id = su.id and p.active
          join stay_rates r on r.rate_plan_id = p.id
         where su.product_id = ${productId}::uuid and su.active
      `);
      if (rates[0]!.n === 0) {
        // Una unidad sin ninguna tarifa cargada no se puede cotizar: publicarla
        // sería mostrar algo que ningún huésped puede reservar todavía.
        return {
          error: "Agrega al menos una unidad con una tarifa cargada antes de publicar.",
          ok: null,
        };
      }
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

// ---------------------------------------------------------------------------
// S6-6 · Opciones de tour y precio por pasajero
// ---------------------------------------------------------------------------

/**
 * Alta de una opción de tour: horario, punto de encuentro, cupo y el precio
 * por tipo de pasajero. Sin esto un tour no tiene nada que vender — antes se
 * insertaba a mano, directo en la base.
 */
export async function createTourOption(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const productId = text(form, "productId");
  const code = text(form, "code").toLowerCase();
  const nameEs = text(form, "nameEs");
  const nameEn = text(form, "nameEn") || null;
  const durationRaw = text(form, "duration");
  const meetingPoint = text(form, "meetingPoint") || null;
  const capacity = Number(text(form, "capacity"));

  if (!SLUG.test(code)) {
    return {
      error: "El código solo lleva minúsculas, números y guiones. Ejemplo: shared-am.",
      ok: null,
    };
  }
  if (nameEs.length < 3) return { error: "Escribe el nombre de la opción.", ok: null };
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return { error: "El cupo tiene que ser mayor que cero.", ok: null };
  }

  const duration = durationRaw ? Number(durationRaw) : null;
  if (duration !== null && (!Number.isInteger(duration) || duration <= 0)) {
    return { error: "La duración, en minutos, tiene que ser mayor que cero.", ok: null };
  }

  const adultPrice = cents(text(form, "adultPrice"));
  if (adultPrice === null || adultPrice < 0) {
    return { error: "Escribe el precio de adulto, en pesos. Ejemplo: 1800 o 1800.50", ok: null };
  }

  const childRaw = text(form, "childPrice");
  const childPrice = childRaw ? cents(childRaw) : null;
  if (childRaw && childPrice === null) return { error: "El precio de menor no es válido.", ok: null };

  const infantRaw = text(form, "infantPrice");
  const infantPrice = infantRaw ? cents(infantRaw) : null;
  if (infantRaw && infantPrice === null) {
    return { error: "El precio de infante no es válido.", ok: null };
  }

  try {
    const rows = await db.execute<{ id: string }>(sql`
      insert into tour_options
        (product_id, code, name_es, name_en, duration_minutes, meeting_point, default_capacity)
      values (${productId}::uuid, ${code}, ${nameEs}, ${nameEn}, ${duration}, ${meetingPoint}, ${capacity})
      returning id
    `);
    const optionId = rows[0]!.id;

    // El adulto siempre existe: es el único tipo de pasajero que no puede
    // quedar sin precio. Menor e infante son opcionales — una opción puede
    // vender solo para adultos.
    await db.execute(sql`
      insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity)
      values (${optionId}::uuid, 'adult', ${adultPrice}, true)
    `);
    if (childPrice !== null) {
      await db.execute(sql`
        insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity)
        values (${optionId}::uuid, 'child', ${childPrice}, true)
      `);
    }
    if (infantPrice !== null) {
      await db.execute(sql`
        insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity)
        values (${optionId}::uuid, 'infant', ${infantPrice}, false)
      `);
    }

    await db.execute(sql`
      select audit_record(${staff.id}::uuid, 'tour_option.create', 'product', ${productId}, null,
                          ${JSON.stringify({ code, nameEs, capacity, duration, adultPrice, childPrice, infantPrice })}::jsonb)
    `);

    revalidatePath(`/admin/catalogo/${productId}/opciones`);
    return { error: null, ok: `Opción creada: ${nameEs}.` };
  } catch (error: unknown) {
    if (/unique|duplicate/i.test(describe(error))) {
      return { error: "Ya existe una opción con ese código en este tour.", ok: null };
    }
    throw error;
  }
}

/**
 * Activa o desactiva una opción.
 *
 * No se borra: si ya generó salidas o reservas, borrarla dejaría esas filas
 * apuntando a una opción que ya no existe. Se apaga, igual que un cupón usado.
 */
export async function toggleTourOption(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const optionId = text(form, "optionId");
  const productId = text(form, "productId");
  if (!/^[0-9a-f-]{36}$/i.test(optionId)) return { error: "Opción no válida.", ok: null };

  const rows = await db.execute<{ code: string; active: boolean }>(sql`
    update tour_options set active = not active where id = ${optionId}::uuid
    returning code, active
  `);
  const row = rows[0];

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'tour_option.toggle', 'product', ${productId}, null,
                        ${JSON.stringify({ code: row?.code, active: row?.active })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}/opciones`);
  return {
    error: null,
    ok: row?.active ? `Opción ${row.code} activada.` : `Opción ${row?.code} desactivada.`,
  };
}

/**
 * Agrega un paso al horario de una opción de tour.
 *
 * Se agrega al final (`position` = el máximo actual + 1): no hay forma de
 * reordenar todavía, así que el orden en que se capturan es el orden en que
 * se van a mostrar — capturar en el orden real del día es la única manera
 * de que salga bien.
 */
export async function createItineraryStep(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const productId = text(form, "productId");
  const optionId = text(form, "optionId");
  const timeLabel = text(form, "timeLabel") || null;
  const titleEs = text(form, "titleEs");
  const titleEn = text(form, "titleEn") || null;
  const descriptionEs = text(form, "descriptionEs") || null;
  const descriptionEn = text(form, "descriptionEn") || null;

  if (!/^[0-9a-f-]{36}$/i.test(optionId)) return { error: "Opción no válida.", ok: null };
  if (titleEs.length < 3) return { error: "Escribe el título del paso.", ok: null };

  const rows = await db.execute<{ next_position: number }>(sql`
    select coalesce(max(position), -1) + 1 as next_position
      from tour_itinerary_steps
     where tour_option_id = ${optionId}::uuid
  `);
  const nextPosition = Number(rows[0]?.next_position ?? 0);

  await db.execute(sql`
    insert into tour_itinerary_steps
      (tour_option_id, position, time_label, title_es, title_en, description_es, description_en)
    values (${optionId}::uuid, ${nextPosition}, ${timeLabel}, ${titleEs}, ${titleEn},
            ${descriptionEs}, ${descriptionEn})
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'tour_itinerary_step.create', 'product', ${productId}, null,
                        ${JSON.stringify({ optionId, timeLabel, titleEs })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}/opciones`);
  return { error: null, ok: `Paso agregado: ${titleEs}.` };
}

/** Quita un paso del horario. Se borra de verdad, no se apaga: a diferencia
    de una opción o una unidad, un paso del itinerario nunca queda referenciado
    por una reserva — no hay nada que se rompa al desaparecer. */
export async function deleteItineraryStep(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const stepId = text(form, "stepId");
  const productId = text(form, "productId");
  if (!/^[0-9a-f-]{36}$/i.test(stepId)) return { error: "Paso no válido.", ok: null };

  const rows = await db.execute<{ title_es: string }>(sql`
    delete from tour_itinerary_steps where id = ${stepId}::uuid returning title_es
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'tour_itinerary_step.delete', 'product', ${productId}, null,
                        ${JSON.stringify({ stepId, titleEs: rows[0]?.title_es })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}/opciones`);
  return { error: null, ok: "Paso eliminado." };
}

// ---------------------------------------------------------------------------
// S8 · Unidades de estancia y planes de tarifa
// ---------------------------------------------------------------------------

/** Número con hasta un decimal, para los baños. "2" o "2.5". */
function decimal1(value: string): string | null {
  if (!/^\d+(\.\d)?$/.test(value)) return null;
  return value;
}

/**
 * Alta de una unidad de estancia, con su primer plan de tarifa.
 *
 * Una unidad sin plan no sirve de nada: la pantalla de Tarifas necesita un
 * plan para poder agregar una tarifa encima. Por eso nace con uno —el mismo
 * criterio que un tour nace con el precio de adulto— y desde aquí se pueden
 * agregar más después, para separar por ejemplo "estándar" de "todo incluido".
 */
export async function createStayUnit(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const productId = text(form, "productId");
  const code = text(form, "code").toLowerCase();
  const maxGuests = Number(text(form, "maxGuests"));
  const baseGuests = Number(text(form, "baseGuests"));
  const extraGuestFee = cents(text(form, "extraGuestFee") || "0");
  const cleaningFee = cents(text(form, "cleaningFee") || "0");
  const bedrooms = Number(text(form, "bedrooms") || "1");
  const beds = Number(text(form, "beds") || "1");
  const bathrooms = decimal1(text(form, "bathrooms") || "1");
  const minNights = Number(text(form, "minNights") || "1");
  const checkinTime = text(form, "checkinTime") || "15:00";
  const checkoutTime = text(form, "checkoutTime") || "11:00";
  const planName = text(form, "planName") || "Tarifa general";

  if (!SLUG.test(code)) {
    return {
      error: "El código solo lleva minúsculas, números y guiones. Ejemplo: casa-akumal.",
      ok: null,
    };
  }
  if (!Number.isInteger(maxGuests) || maxGuests <= 0) {
    return { error: "La capacidad máxima tiene que ser mayor que cero.", ok: null };
  }
  if (!Number.isInteger(baseGuests) || baseGuests <= 0 || baseGuests > maxGuests) {
    return {
      error: "La ocupación base tiene que ser mayor que cero y no pasar de la capacidad máxima.",
      ok: null,
    };
  }
  if (extraGuestFee === null || cleaningFee === null) {
    return { error: "Las cuotas van en pesos. Ejemplo: 800 o 800.50", ok: null };
  }
  if (bathrooms === null) return { error: "Los baños admiten hasta un decimal. Ejemplo: 2.5", ok: null };
  if (!Number.isInteger(bedrooms) || bedrooms <= 0 || !Number.isInteger(beds) || beds <= 0) {
    return { error: "Recámaras y camas tienen que ser mayores que cero.", ok: null };
  }
  if (!Number.isInteger(minNights) || minNights <= 0) {
    return { error: "El mínimo de noches tiene que ser mayor que cero.", ok: null };
  }
  if (planName.length < 2) return { error: "Escribe el nombre del plan de tarifas.", ok: null };

  try {
    const rows = await db.execute<{ id: string }>(sql`
      insert into stay_units
        (product_id, code, max_guests, base_guests, extra_guest_fee_cents, cleaning_fee_cents,
         bedrooms, beds, bathrooms, min_nights, checkin_time, checkout_time)
      values (${productId}::uuid, ${code}, ${maxGuests}, ${baseGuests}, ${extraGuestFee},
              ${cleaningFee}, ${bedrooms}, ${beds}, ${bathrooms}::numeric, ${minNights},
              ${checkinTime}::time, ${checkoutTime}::time)
      returning id
    `);
    const unitId = rows[0]!.id;

    await db.execute(sql`
      insert into stay_rate_plans (unit_id, name) values (${unitId}::uuid, ${planName})
    `);

    await db.execute(sql`
      select audit_record(${staff.id}::uuid, 'stay_unit.create', 'product', ${productId}, null,
                          ${JSON.stringify({ code, maxGuests, baseGuests, planName })}::jsonb)
    `);

    revalidatePath(`/admin/catalogo/${productId}/unidades`);
    return { error: null, ok: `Unidad creada: ${code}, con el plan "${planName}".` };
  } catch (error: unknown) {
    if (/unique|duplicate/i.test(describe(error))) {
      return { error: "Ya existe una unidad con ese código en este producto.", ok: null };
    }
    throw error;
  }
}

/** Un plan de tarifa adicional para una unidad que ya existe. */
export async function addRatePlan(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const unitId = text(form, "unitId");
  const productId = text(form, "productId");
  const name = text(form, "name");

  if (!/^[0-9a-f-]{36}$/i.test(unitId)) return { error: "Unidad no válida.", ok: null };
  if (name.length < 2) return { error: "Escribe el nombre del plan.", ok: null };

  await db.execute(sql`
    insert into stay_rate_plans (unit_id, name) values (${unitId}::uuid, ${name})
  `);

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'rate_plan.create', 'product', ${productId}, null,
                        ${JSON.stringify({ unitId, name })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}/unidades`);
  return { error: null, ok: `Plan de tarifas creado: ${name}.` };
}

/**
 * Activa o desactiva una unidad.
 *
 * No se borra: una unidad con reservas ya tomadas necesita seguir existiendo
 * para que esas reservas tengan sentido. Se apaga, igual que una opción de
 * tour o un cupón.
 */
export async function toggleStayUnit(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const unitId = text(form, "unitId");
  const productId = text(form, "productId");
  if (!/^[0-9a-f-]{36}$/i.test(unitId)) return { error: "Unidad no válida.", ok: null };

  const rows = await db.execute<{ code: string; active: boolean }>(sql`
    update stay_units set active = not active where id = ${unitId}::uuid
    returning code, active
  `);
  const row = rows[0];

  await db.execute(sql`
    select audit_record(${staff.id}::uuid, 'stay_unit.toggle', 'product', ${productId}, null,
                        ${JSON.stringify({ code: row?.code, active: row?.active })}::jsonb)
  `);

  revalidatePath(`/admin/catalogo/${productId}/unidades`);
  return {
    error: null,
    ok: row?.active ? `Unidad ${row.code} activada.` : `Unidad ${row?.code} desactivada.`,
  };
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
