// Una sola conexión, y todo dentro de una transacción que se deshace al final.
//
// `settings.resale` es un ajuste de TODO el sitio, y los archivos de prueba
// corren en paralelo, un proceso cada uno: activarlo con una conexión normal le
// cambiaría los precios a las pruebas de al lado mientras corren. Con una
// conexión, el BEGIN de abajo envuelve cada consulta de este proceso y nadie
// más ve el ajuste. La última prueba lo comprueba desde otra conexión.
//
// Va antes de usar la base: la conexión se abre con la primera consulta.
process.env.DATABASE_POOL_MAX = "1";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";
import postgres from "postgres";

import { db, sqlClient } from "@/db/index";
import { tourOptionsOnSale } from "@/modules/availability/calendar";
import { getProductDetail, listCatalog } from "@/modules/catalog/queries";

import { gatewayFeeCents, siteMarginCents, STRIPE_MX } from "./resale";
import { listTourExtras, quoteTour } from "./service";

/**
 * Reventa · decisión 0025 (D7 del plan de ZaharDev Tours).
 *
 * Alexis define su precio; el huésped paga ese precio más el 2.5 % de ZaharDev
 * más la comisión de Stripe, calculada con la tasa de tarjeta extranjera
 * (4.1 %). Lo que se comprueba aquí:
 *
 *   - el caso de la tabla: una entrada de MXN 1,500 se vende en 1,617.93 y, tras
 *     Stripe, quedan exactamente 1,500 para Alexis y 37.50 para ZaharDev;
 *   - la tarjeta, la ficha, el calendario, los extras y el cobro dicen el mismo
 *     número, hasta el centavo;
 *   - el 2.5 % es un piso: con cualquier grupo y cualquier tarjeta, ZaharDev
 *     nunca gana menos;
 *   - en reventa se cobra el total, aunque el producto diga otro anticipo.
 */

const ALEXIS = { adulto: 150_000, nino: 100_000, snorkel: 20_000 };
const BARCO = { precio: 1_000_000, incluidos: 6, muelle: 5_000, extra: 150_000 };

let tour: { productId: string; slug: string; departureId: string };
let barco: { productId: string; departureId: string };

/** El precio al huésped según la base: la única implementación de la fórmula. */
async function alPublico(cents: number, principal: boolean): Promise<number> {
  const rows = await db.execute<{ p: string }>(sql`select resale_price(${cents}::bigint, ${principal}) as p`);
  return Number(rows[0]!.p);
}

async function nuevoTour(kind: "per_pax" | "private"): Promise<{ productId: string; slug: string; optionId: string }> {
  const slug = `reventa-${kind}-${randomUUID().slice(0, 8)}`;
  const productos = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, location_id, currency, deposit_pct)
    values ('tour', ${slug}, 'published', (select id from locations order by created_at limit 1), 'MXN', 30)
    returning id
  `);
  const productId = productos[0]!.id;
  await db.execute(sql`
    insert into product_translations (product_id, locale, name, summary)
    values (${productId}::uuid, 'es', 'Tour de reventa', 'Prueba de la decisión 0025')
  `);

  const opciones = await db.execute<{ id: string }>(sql`
    insert into tour_options (product_id, code, name_es, duration_minutes, default_capacity,
                              pricing_mode, private_price_cents, private_included_pax, per_pax_fee_cents)
    values (${productId}::uuid, 'base', 'Base', 240, 12, ${kind},
            ${kind === "private" ? BARCO.precio : null}::bigint,
            ${kind === "private" ? BARCO.incluidos : null}::int,
            ${kind === "private" ? BARCO.muelle : 0})
    returning id
  `);
  const optionId = opciones[0]!.id;

  await db.execute(sql`
    insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity)
    values (${optionId}::uuid, 'adult', ${kind === "private" ? BARCO.extra : ALEXIS.adulto}, true),
           (${optionId}::uuid, 'child', ${ALEXIS.nino}, true),
           (${optionId}::uuid, 'infant', 0, false)
  `);
  return { productId, slug, optionId };
}

async function nuevaSalida(optionId: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
    values (${optionId}::uuid, now() + interval '400 days', now() + interval '400 days 4 hours', 12)
    returning id
  `);
  return rows[0]!.id;
}

before(async () => {
  await sqlClient.unsafe("begin");

  // ZaharDev vende con el IVA dentro del precio: el que se exhibe es el final.
  // Va primero: la base no deja revender con un impuesto sumado aparte.
  await db.execute(sql`update tax_rates set included_in_price = true`);
  // La configuración de ZaharDev Tours, decidida el 2026-11-12.
  await db.execute(sql`select settings_set_resale(2.5, 4.1, 300, 16)`);

  const t = await nuevoTour("per_pax");
  await db.execute(sql`
    insert into tour_extras (product_id, code, name_es, price_cents)
    values (${t.productId}::uuid, 'snorkel', 'Equipo de snorkel', ${ALEXIS.snorkel})
  `);
  tour = { productId: t.productId, slug: t.slug, departureId: await nuevaSalida(t.optionId) };

  const b = await nuevoTour("private");
  barco = { productId: b.productId, departureId: await nuevaSalida(b.optionId) };
});

after(async () => {
  await sqlClient.unsafe("rollback");
  await sqlClient.end();
});

describe("reventa: el precio de Alexis más el 2.5 % más Stripe", () => {
  it("una entrada de 1,500 se vende en 1,617.93 y deja 1,500 para Alexis y 37.50 para ZaharDev", async () => {
    const { quote, supplierCents } = await quoteTour(tour.productId, tour.departureId, {
      adult: 1,
      child: 0,
      infant: 0,
    });

    assert.equal(quote.total_cents, 161_793, "la tabla de D7: 1,617.93");
    assert.equal(supplierCents, 150_000, "a Alexis se le debe su precio completo");
    assert.equal(gatewayFeeCents(quote.total_cents, STRIPE_MX.extranjera), 8_043, "Stripe al 4.1 % + 3, con IVA");
    assert.equal(siteMarginCents(quote.total_cents, supplierCents, STRIPE_MX.extranjera), 3_750, "37.50 = 2.5 % de 1,500");

    // Con tarjeta mexicana Stripe cobra menos y la diferencia es de ZaharDev.
    // La tabla dice 46.89; el modelo redondea la comisión antes del IVA y da un
    // centavo menos. Cuál de los dos hace Stripe lo dirá la liquidación.
    const nacional = siteMarginCents(quote.total_cents, supplierCents, STRIPE_MX.nacional);
    assert.ok(nacional >= 4_688 && nacional <= 4_689, `tarjeta mexicana: ${nacional}`);
  });

  it("la tarjeta, la ficha, el calendario, los extras y el cobro dicen el mismo número", async () => {
    const adulto = await alPublico(ALEXIS.adulto, true);
    const nino = await alPublico(ALEXIS.nino, false);
    const snorkel = await alPublico(ALEXIS.snorkel, false);

    const tarjeta = (await listCatalog("es", { kind: "tour" })).find((card) => card.id === tour.productId);
    assert.equal(tarjeta?.fromCents, adulto, "la tarjeta del listado");

    const ficha = await getProductDetail("es", "tour", tour.slug);
    assert.equal(ficha?.fromCents, adulto, "el «desde» de la ficha");
    const precios = Object.fromEntries((ficha?.tour?.prices ?? []).map((p) => [p.paxType, p.priceCents]));
    assert.deepEqual(precios, { adult: adulto, child: nino, infant: 0 }, "la tabla de precios de la ficha");

    const opciones = await tourOptionsOnSale(tour.productId, "es");
    assert.equal(opciones[0]?.fromCents, adulto, "el selector de opciones");

    const extras = await listTourExtras(tour.productId, "es");
    assert.equal(extras[0]?.priceCents, snorkel, "el paso de extras");

    // Y el cobro es exactamente lo exhibido por la cantidad: dos adultos, un
    // niño y el infante en brazos (no ocupa lugar ni lleva snorkel).
    const { quote, supplierCents } = await quoteTour(
      tour.productId,
      tour.departureId,
      { adult: 2, child: 1, infant: 1 },
      new Date(),
      undefined,
      { codes: ["snorkel"], locale: "es" },
    );
    assert.equal(quote.total_cents, 2 * adulto + nino + 3 * snorkel);
    assert.equal(supplierCents, 2 * ALEXIS.adulto + ALEXIS.nino + 3 * ALEXIS.snorkel);
  });

  it("el 2.5 % es un piso: ningún grupo ni tarjeta deja menos", async () => {
    let casos = 0;
    for (let adult = 1; adult <= 4; adult++) {
      for (let child = 0; child <= 3; child++) {
        for (const infant of [0, 1]) {
          for (const codes of [[], ["snorkel"]]) {
            const { quote, supplierCents } = await quoteTour(
              tour.productId,
              tour.departureId,
              { adult, child, infant },
              new Date(),
              undefined,
              { codes, locale: "es" },
            );
            assert.ok(supplierCents !== null);
            for (const [tarjeta, rate] of Object.entries(STRIPE_MX)) {
              const margen = siteMarginCents(quote.total_cents, supplierCents, rate);
              assert.ok(
                margen * 1000 >= supplierCents * 25,
                `${adult} adultos, ${child} niños, ${infant} infante, ${codes.join() || "sin extras"}, ` +
                  `tarjeta ${tarjeta}: ZaharDev gana ${margen} sobre ${supplierCents}`,
              );
            }
            casos++;
          }
        }
      }
    }
    assert.equal(casos, 64);
  });

  it("en un barco, el precio del barco lleva el cargo fijo y la cuota de muelle sólo el porcentaje", async () => {
    const { quote, supplierCents } = await quoteTour(barco.productId, barco.departureId, {
      adult: 4,
      child: 0,
      infant: 0,
    });
    const precio = await alPublico(BARCO.precio, true);
    const muelle = await alPublico(BARCO.muelle, false);

    assert.equal(quote.total_cents, precio + 4 * muelle);
    assert.equal(supplierCents, BARCO.precio + 4 * BARCO.muelle);
    assert.ok(siteMarginCents(quote.total_cents, supplierCents, STRIPE_MX.extranjera) * 1000 >= supplierCents * 25);
  });

  it("en reventa se cobra el total, aunque el producto diga otro anticipo", async () => {
    const { quote } = await quoteTour(tour.productId, tour.departureId, { adult: 1, child: 0, infant: 0 });
    assert.equal(quote.deposit_pct, 100, "el producto dice 30 %, pero el saldo no pasaría por Stripe");
    assert.equal(quote.balance_cents, 0);
  });

  it("nada de esto se le escapa a las pruebas de al lado", async () => {
    const otra = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const filas = await otra`select count(*)::int as n from products where id = ${tour.productId}::uuid`;
      assert.equal(filas[0]!.n, 0, "otra conexión ve el producto de esta prueba: la transacción no lo envuelve");
    } finally {
      await otra.end();
    }
  });
});
