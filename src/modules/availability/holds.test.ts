import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { db, sqlClient } from "@/db/index";
import { sql } from "drizzle-orm";

import {
  InventoryUnavailableError,
  confirmBooking,
  expireHolds,
  holdStay,
  holdTourSeats,
  isStayAvailable,
  tourSeatsLeft,
} from "./holds";

/**
 * Pruebas de integración de la capa de acceso.
 *
 * Las garantías del inventario ya se prueban en SQL (db/tests/guarantees.sql).
 * Lo que se verifica aquí es distinto y no menos importante: que los errores
 * de la base lleguen a la aplicación como errores tipados con un mensaje que
 * se le puede mostrar al huésped, en lugar de como una excepción cruda de
 * Postgres.
 *
 * Requiere DATABASE_URL apuntando a una base con el esquema y el seed:
 *   npm run db:reset && npm run test:integration
 */

// Cada corrida crea su propio inventario. Una prueba que depende de que la
// base esté recién creada falla en cuanto alguien la corre dos veces.
//
// Se crea como borrador y no como publicado: es inventario falso, y publicado
// aparecería en la vitrina. Contra una base compartida eso sería ofrecerle al
// huésped una casa que no existe.
let UNIT: string;
let departureId: string;

async function createFixtures(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);

  const unit = await db.execute<{ id: string }>(sql`
    with p as (
      insert into products (kind, slug, status, currency, deposit_pct)
      values ('stay', ${`it-stay-${suffix}`}, 'draft', 'MXN', 40)
      returning id
    )
    insert into stay_units (product_id, code, max_guests, base_guests, min_nights)
    select p.id, 'unidad', 6, 4, 1 from p
    returning id
  `);
  UNIT = unit[0]!.id;

  const departure = await db.execute<{ id: string }>(sql`
    with p as (
      insert into products (kind, slug, status, currency)
      values ('tour', ${`it-tour-${suffix}`}, 'draft', 'MXN')
      returning id
    ), o as (
      insert into tour_options (product_id, code, name_es, default_capacity)
      select p.id, 'shared', 'Compartido', 4 from p
      returning id
    )
    insert into tour_departures (tour_option_id, starts_at, capacity)
    select o.id, now() + interval '10 days', 4 from o
    returning id
  `);
  departureId = departure[0]!.id;
}

async function newBookingItem(kind: "stay" | "tour", opts: {
  range?: string;
  departureId?: string;
  seats?: number;
}): Promise<string> {
  const rows = await db.execute<{ item_id: string }>(sql`
    with c as (
      insert into customers (full_name, email)
      values ('Prueba integración', 'it+' || gen_random_uuid() || '@example.com')
      returning id
    ), p as (
      select case
        when ${kind} = 'stay' then (select product_id from stay_units where id = ${UNIT}::uuid)
        else (select o.product_id from tour_options o
                join tour_departures d on d.tour_option_id = o.id
               where d.id = ${opts.departureId ?? null}::uuid)
      end as id
    ), b as (
      insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                            quote, deposit_due_at)
      select c.id, 'hold', 1000000, resolve_deposit_pct(p.id),
             round(1000000 * resolve_deposit_pct(p.id) / 100), '{}'::jsonb,
             now() + interval '15 minutes'
        from c, p
      returning id, customer_id
    )
    insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range, guests,
                              tour_departure_id, seats, subtotal_cents, quote)
    select b.id, ${kind}::product_kind, p.id,
           case when ${kind} = 'stay' then ${UNIT}::uuid end,
           case when ${kind} = 'stay' then ${opts.range ?? null}::daterange end,
           case when ${kind} = 'stay' then 2 end,
           ${opts.departureId ?? null}::uuid,
           ${opts.seats ?? null}::integer,
           1000000, '{}'::jsonb
      from b, p
    returning id as item_id
  `);
  return rows[0]!.item_id;
}

describe("apartado de inventario", () => {
  before(async () => {
    await createFixtures();
  });

  after(async () => {
    await sqlClient.end();
  });

  it("aparta noches y las reporta como ocupadas", async () => {
    const range = { from: "2028-05-10", to: "2028-05-14" };
    const item = await newBookingItem("stay", { range: "[2028-05-10,2028-05-14)" });

    assert.equal(await isStayAvailable(UNIT, range), true);
    const holdId = await holdStay(UNIT, range, item);
    assert.ok(holdId);
    assert.equal(await isStayAvailable(UNIT, range), false);
  });

  it("traduce el traslape de fechas a un error con mensaje para el huésped", async () => {
    const range = { from: "2028-05-12", to: "2028-05-16" };
    const item = await newBookingItem("stay", { range: "[2028-05-12,2028-05-16)" });

    await assert.rejects(
      () => holdStay(UNIT, range, item),
      (error: unknown) => {
        assert.ok(error instanceof InventoryUnavailableError);
        assert.equal(error.code, "AM002");
        assert.equal(error.guestMessage, "Esas fechas acaban de ocuparse.");
        return true;
      },
    );
  });

  it("rechaza un rango invertido antes de tocar la base", async () => {
    await assert.rejects(
      () => holdStay(UNIT, { from: "2028-07-10", to: "2028-07-10" }, null),
      /está vacío/,
    );
  });

  it("aparta lugares hasta agotar el cupo y luego falla con AM001", async () => {
    const first = await newBookingItem("tour", { departureId, seats: 3 });
    await holdTourSeats(departureId, 3, first);
    assert.equal(await tourSeatsLeft(departureId), 1);

    const second = await newBookingItem("tour", { departureId, seats: 2 });
    await assert.rejects(
      () => holdTourSeats(departureId, 2, second),
      (error: unknown) => {
        assert.ok(error instanceof InventoryUnavailableError);
        assert.equal(error.code, "AM001");
        assert.equal(error.guestMessage, "Ya no quedan lugares disponibles en esa salida.");
        return true;
      },
    );
    assert.equal(await tourSeatsLeft(departureId), 1, "el intento fallido no debe mover el contador");
  });

  it("valida el número de lugares sin ir a la base", async () => {
    await assert.rejects(() => holdTourSeats(departureId, 0, null), RangeError);
    await assert.rejects(() => holdTourSeats(departureId, 1.5, null), RangeError);
  });

  it("no confirma sin anticipo cobrado", async () => {
    const item = await newBookingItem("stay", { range: "[2028-09-01,2028-09-04)" });
    await holdStay(UNIT, { from: "2028-09-01", to: "2028-09-04" }, item);
    const rows = await db.execute<{ booking_id: string }>(sql`
      select booking_id from booking_items where id = ${item}::uuid
    `);

    await assert.rejects(
      () => confirmBooking(rows[0]!.booking_id, "test"),
      (error: unknown) => {
        assert.ok(error instanceof InventoryUnavailableError);
        assert.equal(error.code, "AM003");
        return true;
      },
    );
  });

  it("confirma con el anticipo cobrado y es idempotente", async () => {
    const item = await newBookingItem("stay", { range: "[2028-10-01,2028-10-05)" });
    await holdStay(UNIT, { from: "2028-10-01", to: "2028-10-05" }, item);

    const rows = await db.execute<{ booking_id: string; deposit_cents: number }>(sql`
      select b.id as booking_id, b.deposit_cents
        from bookings b
        join booking_items i on i.booking_id = b.id
       where i.id = ${item}::uuid
    `);
    const { booking_id, deposit_cents } = rows[0]!;

    await db.execute(sql`
      insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                            amount_cents, currency, paid_at)
      values (${booking_id}::uuid, 'deposit', 'succeeded', 'card', 'stripe',
              'pi_it_' || ${booking_id}, ${deposit_cents}, 'MXN', now())
    `);

    assert.equal(await confirmBooking(booking_id, "webhook:stripe"), "confirmed");
    assert.equal(await confirmBooking(booking_id, "webhook:stripe"), "confirmed");

    const avisos = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from outbox where booking_id = ${booking_id}::uuid
    `);
    assert.equal(avisos[0]!.n, 2, "el webhook repetido no debe duplicar avisos");
  });

  it("el reporte de expiración regresa las tres cuentas", async () => {
    const report = await expireHolds();
    assert.ok(typeof report.bookings_expired === "number");
    assert.ok(typeof report.orphan_holds_released === "number");
    assert.ok(typeof report.orphan_seats_returned === "number");
  });
});
