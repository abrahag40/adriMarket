import type { Sql, TransactionSql } from "postgres";

/**
 * Cargar al catálogo las fichas que el cliente llena en zahardev-intake.
 *
 * El sitio de cada cliente le pregunta a la herramienta de fichas, con la llave de
 * ese cliente, por sus tours ENVIADOS (GET /api/sync/<cliente>). Cada ficha se
 * guarda como un producto:
 *
 * - ficha nueva → producto nuevo, como lo crea el panel;
 * - ficha con una versión (`rev`) mayor que la cargada → se actualiza su producto;
 * - ficha sin cambios → no se toca nada.
 *
 * `product_sources` recuerda qué ficha produjo qué producto. Un producto creado a
 * mano en el panel no tiene fila ahí y la sincronización nunca lo toca.
 *
 * Lo que la ficha NO trae no se pisa: resumen, descripción, fotos y la política
 * de cancelación los pone ZaharDev o el panel, y una actualización los respeta.
 */

export type PaxPrice = {
  pax_type: "adult" | "child" | "infant";
  price_cents: number;
  min_age: number | null;
  max_age: number | null;
  counts_toward_capacity: boolean;
};

export type Ficha = {
  source: { form_id: string; rev: number };
  facts: {
    name_es: string | null;
    zone: { value: string | null; label: string | null };
    categories: { value: string; label: string }[];
    currency: string | null;
    duration_minutes: number | null;
    meeting_point: string | null;
    departures: { days: string[]; times: string[]; closed_months: number[] };
    capacity: { max: number | null; min: number | null };
    pricing: { model: string | null; pax_prices: PaxPrice[] };
    included: string[];
    excluded: string[];
    paid_on_site: string | null;
    itinerary: { position: number; time_label: string; title_es: string }[];
    extras: { code: string; name_es: string; note_es: string | null; price_cents: number }[];
  };
  business: { deposit_pct: number | null };
};

export type Resultado = "creado" | "actualizado" | "sin-cambios" | "vinculado";

const FUENTE = "zahardev-intake";

/** «Zona arqueológica de Tulum» → «zona-arqueologica-de-tulum». */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Lo que el cliente escribió en minúsculas («Snorkel en akumal») sale con mayúscula inicial. */
const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Por qué una ficha no se puede cargar; `null` si se puede. */
export function motivoParaNoCargar(f: Ficha): string | null {
  if ((f.facts.name_es ?? "").trim().length < 3) return "sin nombre";
  if (f.facts.pricing.model !== "person") return "cobra por grupo; la plataforma vende por persona";
  if (!f.facts.pricing.pax_prices.some((p) => p.pax_type === "adult")) return "sin precio de adulto";
  return null;
}

function noIncluye(f: Ficha): string[] {
  const lista = [...f.facts.excluded];
  const delDia = (f.facts.paid_on_site ?? "").trim();
  if (delDia && !/^ningun/i.test(delDia)) lista.push(delDia);
  return lista;
}

/** La ubicación del tour; se crea si el catálogo no la tiene. */
async function ubicacion(tx: TransactionSql, f: Ficha): Promise<string> {
  const zona = capitalizar((f.facts.zone.label ?? "").trim()) || "Caribe mexicano";
  const slug = slugify(zona);
  // Las salidas se calculan en la hora de Quintana Roo, de donde salen los
  // tours aunque el destino quede fuera (Chichén Itzá está en Yucatán).
  await tx`
    insert into locations (name, slug, city, state, timezone)
    values (${zona}, ${slug}, ${zona}, 'Quintana Roo', 'America/Cancun')
    on conflict (slug) do nothing`;
  const [loc] = await tx<{ id: string }[]>`select id from locations where slug = ${slug}`;
  return loc!.id;
}

/** Precios, recorrido, extras y etiquetas: lo que se reescribe completo en cada versión. */
async function detalle(tx: TransactionSql, f: Ficha, productId: string, optionId: string): Promise<void> {
  await tx`delete from tour_pax_prices where tour_option_id = ${optionId}`;
  for (const p of f.facts.pricing.pax_prices) {
    await tx`
      insert into tour_pax_prices (tour_option_id, pax_type, price_cents, min_age, max_age, counts_toward_capacity)
      values (${optionId}, ${p.pax_type}, ${p.price_cents}, ${p.min_age}, ${p.max_age}, ${p.counts_toward_capacity})`;
  }

  await tx`delete from tour_itinerary_steps where tour_option_id = ${optionId}`;
  for (const m of f.facts.itinerary) {
    await tx`
      insert into tour_itinerary_steps (tour_option_id, position, time_label, title_es)
      values (${optionId}, ${m.position}, ${m.time_label || null}, ${m.title_es})`;
  }

  // Los extras no se borran: una reserva vieja puede apuntar a uno. Se apagan los
  // que la ficha ya no trae y se actualizan o crean los que sí.
  const codigos = f.facts.extras.map((e) => e.code);
  await tx`
    update tour_extras set active = false
     where product_id = ${productId}
       and code not in (select jsonb_array_elements_text(${JSON.stringify(codigos)}::jsonb))`;
  for (const [i, e] of f.facts.extras.entries()) {
    await tx`
      insert into tour_extras (product_id, code, name_es, note_es, price_cents, position, active)
      values (${productId}, ${e.code}, ${e.name_es}, ${e.note_es}, ${e.price_cents}, ${i}, true)
      on conflict (product_id, code) do update
        set name_es = excluded.name_es, note_es = excluded.note_es,
            price_cents = excluded.price_cents, position = excluded.position, active = true`;
  }

  for (const c of f.facts.categories) {
    await tx`insert into tags (slug, name_es) values (${c.value}, ${c.label}) on conflict (slug) do nothing`;
    await tx`
      insert into product_tags (product_id, tag_id)
      select ${productId}, id from tags where slug = ${c.value}
      on conflict do nothing`;
  }
}

/**
 * Crea o actualiza el producto de UNA ficha, en la transacción que se le pase.
 * `publicar` solo aplica al crear: un tour que alguien despublicó no se vuelve a
 * publicar solo.
 */
export async function upsertFicha(
  tx: TransactionSql,
  f: Ficha,
  opciones: { publicar: boolean },
): Promise<Resultado> {
  const nombre = capitalizar((f.facts.name_es ?? "").trim());
  const [origen] = await tx<{ product_id: string; external_rev: number }[]>`
    select product_id, external_rev from product_sources
     where source = ${FUENTE} and external_id = ${f.source.form_id}`;

  let productId = origen?.product_id ?? null;
  let resultado: Resultado;

  if (origen && origen.external_rev >= f.source.rev) return "sin-cambios";

  if (!productId) {
    // Los tours cargados antes de que existiera esta tabla (importar-fichas.ts) se
    // reconocen por su dirección y se vinculan, en vez de duplicarse.
    const [previo] = await tx<{ id: string }[]>`
      select p.id from products p
       where p.slug = ${slugify(nombre)} and p.kind = 'tour'
         and not exists (select 1 from product_sources s where s.product_id = p.id)`;
    productId = previo?.id ?? null;
  }

  const locationId = await ubicacion(tx, f);

  if (!productId) {
    const [prod] = await tx<{ id: string }[]>`
      insert into products (kind, slug, status, location_id, currency, deposit_pct, cancellation_policy_id)
      values ('tour', ${slugify(nombre)}, ${opciones.publicar ? "published" : "draft"}::product_status, ${locationId},
              ${f.facts.currency ?? "MXN"}, ${f.business.deposit_pct},
              -- La política del sitio: hoy cada sitio tiene una sola (Conquest:
              -- «Sin cancelación»). Si algún día tiene varias, se elige en el panel.
              (select id from cancellation_policies order by created_at limit 1))
      returning id`;
    productId = prod!.id;
    // Sin resumen ni descripción: esos los redacta ZaharDev y los aprueba el cliente.
    await tx`
      insert into product_translations (product_id, locale, name, included, excluded)
      values (${productId}, 'es', ${nombre}, ${JSON.stringify(f.facts.included)}::jsonb, ${JSON.stringify(noIncluye(f))}::jsonb)`;
    const [opt] = await tx<{ id: string }[]>`
      insert into tour_options (product_id, code, name_es, duration_minutes, meeting_point, default_capacity)
      values (${productId}, 'principal', ${nombre}, ${f.facts.duration_minutes},
              ${f.facts.meeting_point}, ${f.facts.capacity.max ?? 10})
      returning id`;
    await detalle(tx, f, productId, opt!.id);
    resultado = "creado";
  } else {
    await tx`
      update products set location_id = ${locationId}, currency = ${f.facts.currency ?? "MXN"}, updated_at = now()
       where id = ${productId}`;
    // El nombre y las listas sí vienen de la ficha; resumen y descripción no se tocan.
    await tx`
      insert into product_translations (product_id, locale, name, included, excluded)
      values (${productId}, 'es', ${nombre}, ${JSON.stringify(f.facts.included)}::jsonb, ${JSON.stringify(noIncluye(f))}::jsonb)
      on conflict (product_id, locale) do update
        set name = excluded.name, included = excluded.included, excluded = excluded.excluded`;
    const [opt] = await tx<{ id: string }[]>`
      select id from tour_options where product_id = ${productId} and code = 'principal'`;
    let optionId = opt?.id;
    if (optionId) {
      await tx`
        update tour_options
           set name_es = ${nombre}, duration_minutes = ${f.facts.duration_minutes},
               meeting_point = ${f.facts.meeting_point}, default_capacity = ${f.facts.capacity.max ?? 10},
               updated_at = now()
         where id = ${optionId}`;
    } else {
      const [nueva] = await tx<{ id: string }[]>`
        insert into tour_options (product_id, code, name_es, duration_minutes, meeting_point, default_capacity)
        values (${productId}, 'principal', ${nombre}, ${f.facts.duration_minutes},
                ${f.facts.meeting_point}, ${f.facts.capacity.max ?? 10})
        returning id`;
      optionId = nueva!.id;
    }
    await detalle(tx, f, productId, optionId);
    resultado = origen ? "actualizado" : "vinculado";
  }

  await tx`
    insert into product_sources (product_id, source, external_id, external_rev)
    values (${productId}, ${FUENTE}, ${f.source.form_id}, ${f.source.rev})
    on conflict (product_id) do update
      set external_id = excluded.external_id, external_rev = excluded.external_rev, synced_at = now()`;
  await tx`
    select audit_record(null, ${`product.sync.${resultado}`}, 'product', ${productId}, null,
                        ${JSON.stringify({ fuente: FUENTE, form_id: f.source.form_id, rev: f.source.rev })}::jsonb)`;
  return resultado;
}

/** Cada ficha en su propia transacción: si una falla, las demás se cargan igual. */
export async function cargarFichas(
  sql: Sql,
  fichas: Ficha[],
  opciones: { publicar: boolean },
): Promise<Record<Resultado | "con-problema", number>> {
  const cuenta = { creado: 0, actualizado: 0, "sin-cambios": 0, vinculado: 0, "con-problema": 0 };
  for (const f of fichas) {
    if (motivoParaNoCargar(f)) {
      cuenta["con-problema"]++;
      continue;
    }
    try {
      const r = await sql.begin((tx) => upsertFicha(tx, f, opciones));
      cuenta[r as Resultado]++;
    } catch {
      cuenta["con-problema"]++;
    }
  }
  return cuenta;
}

/**
 * Lo que corre el latido: pide las fichas del cliente de este sitio y las carga.
 * Sin configuración (`INTAKE_SYNC_URL`, `INTAKE_CLIENT`, `INTAKE_SYNC_TOKEN`) no
 * hace nada: adriMarket no tiene fichas que sincronizar.
 */
export async function syncFromIntake(sql: Sql): Promise<Record<string, number> | null> {
  const base = (process.env.INTAKE_SYNC_URL ?? "").replace(/\/+$/, "");
  const cliente = process.env.INTAKE_CLIENT ?? "";
  const llave = process.env.INTAKE_SYNC_TOKEN ?? "";
  if (!base || !cliente || !llave) return null;

  const respuesta = await fetch(`${base}/api/sync/${encodeURIComponent(cliente)}`, {
    headers: { authorization: `Bearer ${llave}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) throw new Error(`fichas: ${base} respondió ${respuesta.status}`);
  const { tours } = (await respuesta.json()) as { tours: Ficha[] };
  return cargarFichas(sql, tours, { publicar: process.env.INTAKE_AUTO_PUBLISH === "si" });
}
