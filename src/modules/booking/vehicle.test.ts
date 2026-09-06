import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { InventoryUnavailableError } from "@/modules/availability/holds";

import { createBookingWithHold } from "./create";

/**
 * Un vehículo se reserva por el mismo camino que una casa · post-Sprint 7
 *
 * La garantía 24 prueba que la **base** trata igual a los dos. Esto prueba lo
 * otro: que el camino de código —`createBookingWithHold`, la cotización, el
 * apartado— tampoco los distingue.
 *
 * Vale la pena por lo que ya pasó una vez: la ficha del vehículo se pintaba,
 * el calendario respondía y la cotización salía con su desglose, y aun así
 * **ninguna reserva podía crearse**, porque `booking_items_shape` enumeraba
 * los dos tipos que existían cuando se escribió. Nada de eso se ve hasta que
 * alguien pulsa "Reservar" — o hasta que una prueba lo pulsa por él.
 *
 * Crea su propio producto en lugar de depender del seed: `dev_seed.sql` no
 * trae vehículos, y una prueba que solo corre cuando alguien cargó el catálogo
 * de demostración es una prueba que un día deja de correr sin avisar.
 */

const SLUG = "test-vehiculo-reserva";
let productId = "";

const titular = {
  fullName: "Ana Ruiz",
  email: "ana.vehiculo@example.com",
  phone: "+529981234567",
  locale: "es" as const,
  privacyVersion: "2026-08",
};

/** Un rango lejano y propio, para no pelear con lo que vendan otras pruebas. */
function rangoLibre(offsetDays: number): { from: string; to: string } {
  const inicio = new Date("2028-03-01T00:00:00Z");
  inicio.setUTCDate(inicio.getUTCDate() + offsetDays);
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 3);
  return { from: inicio.toISOString().slice(0, 10), to: fin.toISOString().slice(0, 10) };
}

before(async () => {
  const productos = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, currency)
    values ('vehicle', ${SLUG}, 'published', 'MXN')
    on conflict (slug) do update set status = 'published'
    returning id
  `);
  productId = productos[0]!.id;

  await db.execute(sql`
    insert into product_translations (product_id, locale, name, summary)
    values (${productId}::uuid, 'es', 'Auto de prueba', 'Para la prueba de reserva')
    on conflict (product_id, locale) do nothing
  `);

  const unidades = await db.execute<{ id: string }>(sql`
    insert into rental_units (product_id, code, max_guests, base_guests, min_nights,
                              checkin_time, checkout_time, transmission, luggage, doors)
    values (${productId}::uuid, 'TEST-VEH', 5, 5, 1, time '09:00', time '18:00',
            'automatica', 2, 4)
    on conflict (product_id, code) do update set active = true
    returning id
  `);
  const unitId = unidades[0]!.id;

  const planes = await db.execute<{ id: string }>(sql`
    insert into rental_rate_plans (unit_id, name, currency, active)
    values (${unitId}::uuid, 'Prueba', 'MXN', true)
    returning id
  `);
  await db.execute(sql`
    insert into rental_rates (rate_plan_id, name, season, nightly_cents, min_nights, priority)
    values (${planes[0]!.id}::uuid, 'Base',
            daterange(current_date, current_date + 1000, '[)'), 90000, 1, 0)
  `);
});

after(async () => {
  /* Una prueba que ensucia deja síntomas que parecen defectos de producción —
     y aquí, además, se sabotea a sí misma: borrar solo el producto falla por
     la llave foránea de las reservas, así que en la segunda corrida el rango
     seguía ocupado y el primer caso fallaba por basura propia. Se borran
     primero las reservas, que arrastran renglones y bloqueos. */
  await db.execute(sql`
    delete from bookings b
     using booking_items i, products p
     where i.booking_id = b.id and i.product_id = p.id and p.slug = ${SLUG}
  `);
  await db.execute(sql`delete from products where slug = ${SLUG}`);
  await sqlClient.end();
});

describe("reservar un vehículo", () => {
  it("se aparta por rango de fechas, igual que una casa", async () => {
    const range = rangoLibre(0);
    const booking = await createBookingWithHold(
      { kind: "vehicle", productId, range, guests: 4 },
      titular,
      [],
    );

    assert.ok(booking.code.startsWith("AM-"));

    const filas = await db.execute<{ kind: string; rango: string; unidad: string | null }>(sql`
      select i.kind::text as kind, i.rental_range::text as rango,
             i.rental_unit_id::text as unidad
        from booking_items i where i.booking_id = ${booking.bookingId}::uuid
    `);
    assert.equal(filas[0]?.kind, "vehicle");
    assert.equal(filas[0]?.rango, `[${range.from},${range.to})`);
    assert.ok(filas[0]?.unidad, "el renglón quedó sin unidad");
  });

  it("el bloqueo vive en rental_blocks, no en una tabla paralela", async () => {
    const range = rangoLibre(10);
    const booking = await createBookingWithHold(
      { kind: "vehicle", productId, range, guests: 2 },
      titular,
      [],
    );

    const bloqueos = await db.execute<{ n: number }>(sql`
      select count(*)::int as n
        from rental_blocks b
        join booking_items i on i.id = b.booking_item_id
       where i.booking_id = ${booking.bookingId}::uuid and b.released_at is null
    `);
    assert.equal(bloqueos[0]?.n, 1);
  });

  it("dos huéspedes no se llevan el mismo auto en fechas traslapadas", async () => {
    const range = rangoLibre(20);
    await createBookingWithHold({ kind: "vehicle", productId, range, guests: 2 }, titular, []);

    // Un día dentro del rango ya apartado.
    const inicio = new Date(`${range.from}T00:00:00Z`);
    inicio.setUTCDate(inicio.getUTCDate() + 2);
    const solapado = {
      from: inicio.toISOString().slice(0, 10),
      to: rangoLibre(23).to,
    };

    await assert.rejects(
      () => createBookingWithHold({ kind: "vehicle", productId, range: solapado, guests: 2 }, titular, []),
      InventoryUnavailableError,
      "se rentó el mismo vehículo dos veces",
    );
  });
});
