import { readFileSync } from "node:fs";

import postgres from "postgres";

/**
 * Carga en el catálogo las fichas que un cliente llenó en zahardev-intake.
 *
 *   SITIO=conquest-tours ./scripts/produccion.sh run npx tsx scripts/importar-fichas.ts /ruta/abel.json
 *   … importar-fichas.ts /ruta/abel.json --salidas      (además genera 90 días de salidas)
 *
 * El archivo sale de `zahardev-intake/scripts/exportar-cliente.ts` y vive FUERA de
 * los repositorios: trae datos del cliente.
 *
 * Hace lo mismo que el panel, en el mismo orden (ver src/app/admin/catalogo/actions.ts):
 * producto en **borrador**, su nombre en español, una opción con precio por tipo de
 * pasajero, el recorrido y los extras. **Nunca publica:** publicar exige al menos una
 * foto y la redacción aprobada por el cliente, y eso se hace en el panel.
 *
 * Se puede repetir sin miedo: un tour cuya dirección (slug) ya existe se salta.
 * Cada tour va en su propia transacción: si uno falla, los demás no quedan a medias.
 */

type PaxPrice = {
  pax_type: "adult" | "child" | "infant";
  price_cents: number;
  min_age: number | null;
  max_age: number | null;
  counts_toward_capacity: boolean;
};

type Ficha = {
  source: { form_id: string; client_name: string };
  facts: {
    name_es: string | null;
    zone: { value: string | null; label: string | null };
    categories: { value: string; label: string }[];
    currency: string | null;
    duration_minutes: number | null;
    meeting_point: string | null;
    departures: { days: string[]; times: string[]; closed_months: number[] };
    capacity: { max: number | null; min: number | null };
    pricing: { model: string | null; pax_prices: PaxPrice[]; group: unknown };
    included: string[];
    excluded: string[];
    paid_on_site: string | null;
    itinerary: { position: number; time_label: string; title_es: string }[];
    extras: { code: string; name_es: string; note_es: string | null; price_cents: number }[];
  };
  business: { deposit_pct: number | null };
  notes: string[];
};

const archivo = process.argv[2];
const conSalidas = process.argv.includes("--salidas");
if (!archivo) {
  console.error("Uso: importar-fichas.ts /ruta/cliente.json [--salidas]");
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL. En producción se corre con `SITIO=<sitio> ./scripts/produccion.sh run …`.");
  process.exit(2);
}

const { tours } = JSON.parse(readFileSync(archivo, "utf8")) as { tours: Ficha[] };

/** «Zona arqueológica de Tulum» → «zona-arqueologica-de-tulum». */
function slugify(texto: string): string {
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

const DIAS: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });
const servidor = new URL(url).hostname.split(".")[0];
console.log(`→ base: ${servidor}\n`);

let creados = 0;
let saltados = 0;
let fallidos = 0;

try {
  for (const f of tours) {
    const nombre = capitalizar((f.facts.name_es ?? "").trim());
    if (nombre.length < 3) {
      console.log(`✖ (sin nombre) — se salta: ${f.source.form_id}`);
      fallidos++;
      continue;
    }
    const slug = slugify(nombre);
    const [existe] = await sql<{ id: string }[]>`select id from products where slug = ${slug}`;
    if (existe) {
      console.log(`· ${nombre} — ya existe (${slug}), se salta`);
      saltados++;
      continue;
    }
    if (f.facts.pricing.model !== "person") {
      console.log(`✖ ${nombre} — cobra por grupo; la plataforma vende por persona. Cárgalo a mano.`);
      fallidos++;
      continue;
    }
    const adulto = f.facts.pricing.pax_prices.find((p) => p.pax_type === "adult");
    if (!adulto) {
      console.log(`✖ ${nombre} — sin precio de adulto, se salta`);
      fallidos++;
      continue;
    }

    try {
      await sql.begin(async (tx) => {
        // --- Ubicación: la zona del tour; se crea si el catálogo no la tiene ---
        const zona = capitalizar((f.facts.zone.label ?? "").trim()) || "Caribe mexicano";
        const zonaSlug = slugify(zona);
        // Toda salida se calcula en la hora de Quintana Roo, de donde salen los
        // tours aunque el destino quede fuera (Chichén Itzá está en Yucatán).
        await tx`
          insert into locations (name, slug, city, state, timezone)
          values (${zona}, ${zonaSlug}, ${zona}, 'Quintana Roo', 'America/Cancun')
          on conflict (slug) do nothing`;
        const [loc] = await tx<{ id: string }[]>`select id from locations where slug = ${zonaSlug}`;

        const [prod] = await tx<{ id: string }[]>`
          insert into products (kind, slug, status, location_id, currency, deposit_pct)
          values ('tour', ${slug}, 'draft', ${loc!.id}, ${f.facts.currency ?? "MXN"}, ${f.business.deposit_pct})
          returning id`;
        const productId = prod!.id;

        const noIncluye = [...f.facts.excluded];
        const extraDelDia = (f.facts.paid_on_site ?? "").trim();
        if (extraDelDia && !/^ningun/i.test(extraDelDia)) noIncluye.push(extraDelDia);

        // Sin resumen ni descripción: esos los redacta ZaharDev y los aprueba el cliente.
        await tx`
          insert into product_translations (product_id, locale, name, included, excluded)
          values (${productId}, 'es', ${nombre}, ${tx.json(f.facts.included)}, ${tx.json(noIncluye)})`;

        const [opt] = await tx<{ id: string }[]>`
          insert into tour_options (product_id, code, name_es, duration_minutes, meeting_point, default_capacity)
          values (${productId}, 'principal', ${nombre}, ${f.facts.duration_minutes},
                  ${f.facts.meeting_point}, ${f.facts.capacity.max ?? 10})
          returning id`;
        const optionId = opt!.id;

        for (const p of f.facts.pricing.pax_prices) {
          await tx`
            insert into tour_pax_prices (tour_option_id, pax_type, price_cents, min_age, max_age, counts_toward_capacity)
            values (${optionId}, ${p.pax_type}, ${p.price_cents}, ${p.min_age}, ${p.max_age}, ${p.counts_toward_capacity})`;
        }

        for (const m of f.facts.itinerary) {
          await tx`
            insert into tour_itinerary_steps (tour_option_id, position, time_label, title_es)
            values (${optionId}, ${m.position}, ${m.time_label || null}, ${m.title_es})`;
        }

        for (const [i, e] of f.facts.extras.entries()) {
          await tx`
            insert into tour_extras (product_id, code, name_es, note_es, price_cents, position)
            values (${productId}, ${e.code}, ${e.name_es}, ${e.note_es}, ${e.price_cents}, ${i})`;
        }

        for (const c of f.facts.categories) {
          await tx`
            insert into tags (slug, name_es) values (${c.value}, ${c.label})
            on conflict (slug) do nothing`;
          await tx`
            insert into product_tags (product_id, tag_id)
            select ${productId}, id from tags where slug = ${c.value}
            on conflict do nothing`;
        }

        let salidas = 0;
        if (conSalidas) {
          const dows = f.facts.departures.days.map((d) => DIAS[d]).filter((n): n is number => !!n);
          const cerrados = new Set(f.facts.departures.closed_months);
          const hoy = new Date();
          for (let d = 1; d <= 90; d++) {
            const dia = new Date(hoy.getTime() + d * 86_400_000);
            if (cerrados.has(dia.getUTCMonth() + 1)) continue;
            const iso = dia.toISOString().slice(0, 10);
            for (const hora of f.facts.departures.times) {
              const [r] = await tx<{ created: number }[]>`
                select created from departures_generate(
                  ${optionId}, ${iso}::date, ${iso}::date, ${dows}::smallint[], ${hora}::time,
                  ${f.facts.capacity.max ?? 10},
                  ${f.facts.duration_minutes ? `${f.facts.duration_minutes} minutes` : null}::interval)`;
              salidas += r?.created ?? 0;
            }
          }
        }

        await tx`
          select audit_record(null, 'product.import', 'product', ${productId}, null,
                              ${tx.json({ fuente: "zahardev-intake", form_id: f.source.form_id, slug })})`;

        console.log(`✔ ${nombre} → ${slug} · ${zona} · ${f.facts.pricing.pax_prices.length} precio(s)` +
          ` · ${f.facts.itinerary.length} momento(s) · ${f.facts.extras.length} extra(s)` +
          (conSalidas ? ` · ${salidas} salida(s)` : ""));
        for (const n of f.notes) console.log(`    nota: ${n}`);
      });
      creados++;
    } catch (e) {
      console.log(`✖ ${nombre} — ${e instanceof Error ? e.message : String(e)}`);
      fallidos++;
    }
  }
  console.log(`\n${creados} creado(s) en borrador · ${saltados} ya existían · ${fallidos} con problema.`);
  if (fallidos) process.exitCode = 1;
} finally {
  await sql.end();
}
