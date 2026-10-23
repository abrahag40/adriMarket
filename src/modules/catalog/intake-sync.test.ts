import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { sqlClient as sql } from "@/db/index";
import { motivoParaNoCargar, upsertFicha, type Ficha } from "@/modules/catalog/intake-sync";

/**
 * Sincronización de fichas · el tour que el cliente envía llega solo al catálogo.
 *
 * Lo que tiene que ser cierto: una ficha nueva crea su tour, repetirla no toca
 * nada, una versión nueva lo actualiza (sin duplicarlo) y un extra que el cliente
 * quitó se apaga en vez de borrarse. La prueba recoge lo que crea.
 */
const formId = randomUUID();
const nombre = `[prueba] sync ${formId.slice(0, 8)}`;

function ficha(rev: number, cambios: Partial<Ficha["facts"]> = {}): Ficha {
  return {
    source: { form_id: formId, rev },
    business: { deposit_pct: null },
    facts: {
      name_es: nombre,
      zone: { value: "tulum", label: "Tulum" },
      categories: [],
      currency: "MXN",
      duration_minutes: 180,
      meeting_point: "Muelle de prueba",
      departures: { days: ["mon"], times: ["09:00"], closed_months: [] },
      capacity: { max: 12, min: 2 },
      pricing: {
        model: "person",
        pax_prices: [{ pax_type: "adult", price_cents: 85_000, min_age: 12, max_age: null, counts_toward_capacity: true }],
      },
      included: ["Guía"],
      excluded: [],
      paid_on_site: null,
      itinerary: [{ position: 1, time_label: "9:00", title_es: "Salida" }],
      extras: [{ code: "fotos", name_es: "Fotos", note_es: null, price_cents: 25_000 }],
      ...cambios,
    },
  };
}

const producto = async () =>
  (await sql<{ id: string; status: string }[]>`
    select p.id, p.status::text as status from products p
      join product_sources s on s.product_id = p.id
     where s.external_id = ${formId}`)[0];

after(async () => {
  await sql`delete from products where id in (select product_id from product_sources where external_id = ${formId})`;
});

describe("sincronización de fichas de zahardev-intake", () => {
  it("una ficha nueva crea su tour, en borrador si no se pide publicar", async () => {
    assert.equal(await sql.begin((tx) => upsertFicha(tx, ficha(3), { publicar: false })), "creado");
    const p = await producto();
    assert.ok(p, "el tour existe y recuerda de qué ficha viene");
    assert.equal(p.status, "draft");
  });

  it("la misma versión otra vez no toca nada", async () => {
    assert.equal(await sql.begin((tx) => upsertFicha(tx, ficha(3), { publicar: true })), "sin-cambios");
    assert.equal((await producto())!.status, "draft", "repetir no lo publica");
  });

  it("una versión nueva actualiza el MISMO tour", async () => {
    const r = await sql.begin((tx) =>
      upsertFicha(
        tx,
        ficha(5, {
          pricing: {
            model: "person",
            pax_prices: [{ pax_type: "adult", price_cents: 99_000, min_age: 12, max_age: null, counts_toward_capacity: true }],
          },
          extras: [],
        }),
        { publicar: false },
      ),
    );
    assert.equal(r, "actualizado");
    const [cuenta] = await sql<{ n: number }[]>`
      select count(*)::int as n from product_sources where external_id = ${formId}`;
    assert.equal(cuenta!.n, 1, "no se duplicó");
    const p = await producto();
    const [precio] = await sql<{ price_cents: string }[]>`
      select pp.price_cents::text from tour_pax_prices pp join tour_options o on o.id = pp.tour_option_id
       where o.product_id = ${p!.id} and pp.pax_type = 'adult'`;
    assert.equal(precio!.price_cents, "99000", "el precio nuevo quedó");
    const [extra] = await sql<{ active: boolean }[]>`
      select active from tour_extras where product_id = ${p!.id} and code = 'fotos'`;
    assert.equal(extra!.active, false, "el extra que se quitó se apaga, no se borra");
  });

  it("una ficha sin precio de adulto o por grupo no se carga", () => {
    assert.match(motivoParaNoCargar({ ...ficha(1), facts: { ...ficha(1).facts, pricing: { model: "group", pax_prices: [] } } })!, /grupo/);
    assert.match(
      motivoParaNoCargar({ ...ficha(1), facts: { ...ficha(1).facts, pricing: { model: "person", pax_prices: [] } } })!,
      /adulto/,
    );
  });
});
