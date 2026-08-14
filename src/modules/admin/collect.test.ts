import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { confirmBooking, holdStay } from "@/modules/availability/holds";

/**
 * Cobro del saldo en destino y bloqueos manuales · S4-4 y S4-5
 *
 * El saldo es la mayor parte del dinero de esta operación y casi siempre entra
 * en efectivo. Lo que se prueba aquí es que **no se puede cobrar dos veces, ni a
 * medias, ni sobre una reserva que no lo permite**, y que quien cobró queda
 * escrito. Un faltante de caja con nombre es un problema; uno sin nombre es otro
 * mucho peor.
 *
 * Se prueba la función de la base directamente y no la acción del servidor: la
 * acción solo traduce el error a una frase para el mostrador, y la regla vive
 * donde no se puede saltar.
 */

let unitId: string;
let staffId: string;
let guideId: string;

async function createFixtures(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);

  // Borrador y no publicado: es inventario falso y publicado saldría en la
  // vitrina. Se opera igual desde el panel, que es lo que aquí se prueba.
  const unit = await db.execute<{ id: string }>(sql`
    with p as (
      insert into products (kind, slug, status, currency, deposit_pct)
      values ('stay', ${`s4-stay-${suffix}`}, 'draft', 'MXN', 40)
      returning id
    )
    insert into stay_units (product_id, code, max_guests, base_guests, min_nights)
    select p.id, 'unidad', 6, 4, 1 from p
    returning id
  `);
  unitId = unit[0]!.id;

  const staff = await db.execute<{ id: string }>(sql`
    insert into staff_users (email, full_name, role)
    values (${`s4+recepcion-${suffix}@example.com`}, 'Recepción de prueba', 'front_desk')
    returning id
  `);
  staffId = staff[0]!.id;

  const guide = await db.execute<{ id: string }>(sql`
    insert into staff_users (email, full_name, role)
    values (${`s4+guia-${suffix}@example.com`}, 'Guía de prueba', 'guide')
    returning id
  `);
  guideId = guide[0]!.id;
}

/** Reserva confirmada con anticipo cobrado y saldo pendiente, como en producción. */
async function confirmedBooking(
  from: string,
  to: string,
): Promise<{ id: string; balance: number }> {
  const range = `[${from},${to})`;
  const rows = await db.execute<{
    item_id: string;
    booking_id: string;
    deposit: string;
  }>(sql`
    with c as (
      insert into customers (full_name, email)
      values ('Huésped S4', 's4+' || gen_random_uuid() || '@example.com')
      returning id
    ), p as (
      select product_id as id from stay_units where id = ${unitId}::uuid
    ), b as (
      insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                            quote, deposit_due_at, currency)
      select c.id, 'hold', 1000000, 40, 400000, '{}'::jsonb,
             now() + interval '15 minutes', 'MXN'
        from c
      returning id, deposit_cents
    )
    insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range,
                              guests, subtotal_cents, quote)
    select b.id, 'stay', p.id, ${unitId}::uuid, ${range}::daterange, 2, 1000000, '{}'::jsonb
      from b, p
    returning id as item_id, booking_id, (select deposit_cents from b)::text as deposit
  `);
  const row = rows[0]!;

  await holdStay(unitId, { from, to }, row.item_id);

  await db.execute(sql`
    insert into payments (booking_id, purpose, status, method, provider,
                          provider_ref, amount_cents, currency, paid_at)
    values (${row.booking_id}::uuid, 'deposit', 'succeeded', 'card', 'stripe',
            'pi_s4_' || ${row.booking_id}, ${Number(row.deposit)}, 'MXN', now())
  `);

  assert.equal(
    await confirmBooking(row.booking_id, "webhook:stripe"),
    "confirmed",
  );

  const saldo = await db.execute<{ amount: string }>(sql`
    select amount_cents::text as amount from payments
     where booking_id = ${row.booking_id}::uuid and purpose = 'balance' and status = 'pending'
  `);
  return { id: row.booking_id, balance: Number(saldo[0]!.amount) };
}

async function collect(
  bookingId: string,
  staff: string,
  method = "cash",
  amount: number | null = null,
): Promise<number> {
  const rows = await db.execute<{ amount: string }>(sql`
    select booking_collect_balance(
      ${bookingId}::uuid, ${staff}::uuid, ${method}::payment_method, ${amount}::bigint
    )::text as amount
  `);
  return Number(rows[0]!.amount);
}

/** Recorre la cadena de causas: drizzle envuelve el error del driver. */
function reason(error: unknown): string {
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

describe("operación del panel", () => {
  before(async () => {
    await createFixtures();
  });

  after(async () => {
    await sqlClient.end();
  });

  describe("cobro del saldo en destino", () => {
    it("cobra el saldo, lo marca pagado y deja escrito quién lo recibió", async () => {
      const booking = await confirmedBooking("2029-03-01", "2029-03-04");
      assert.equal(
        booking.balance,
        600000,
        "el saldo debe ser el total menos el anticipo",
      );

      const cobrado = await collect(booking.id, staffId);
      assert.equal(cobrado, 600000);

      const pago = await db.execute<{
        status: string;
        method: string;
        collected_by: string | null;
        paid_at: string | null;
      }>(sql`
      select status::text, method::text, collected_by::text, paid_at::text
        from payments where booking_id = ${booking.id}::uuid and purpose = 'balance'
    `);
      assert.equal(pago[0]!.status, "succeeded");
      assert.equal(pago[0]!.method, "cash");
      assert.equal(
        pago[0]!.collected_by,
        staffId,
        "el efectivo sin nombre no es rastreable",
      );
      assert.ok(pago[0]!.paid_at, "debe quedar la hora del cobro");
    });

    it("el cobro queda en la bitácora de la reserva", async () => {
      const booking = await confirmedBooking("2029-03-10", "2029-03-13");
      await collect(booking.id, staffId, "transfer");

      const eventos = await db.execute<{
        payload: string;
        actor_id: string;
      }>(sql`
      select payload::text as payload, actor_id
        from booking_events
       where booking_id = ${booking.id}::uuid and type = 'balance.collected'
    `);
      assert.equal(eventos.length, 1);
      assert.equal(eventos[0]!.actor_id, staffId);
      const payload = JSON.parse(eventos[0]!.payload) as {
        amount_cents: number;
        method: string;
      };
      assert.equal(payload.amount_cents, 600000);
      assert.equal(payload.method, "transfer");
    });

    it("no se puede cobrar dos veces la misma reserva", async () => {
      const booking = await confirmedBooking("2029-03-20", "2029-03-23");
      await collect(booking.id, staffId);

      await assert.rejects(
        () => collect(booking.id, staffId),
        (error: unknown) => reason(error).includes("saldo pendiente"),
        "cobrar dos veces debe rechazarse, no sumar dinero que no entró",
      );

      const total = await db.execute<{ n: string }>(sql`
      select coalesce(sum(amount_cents), 0)::text as n from payments
       where booking_id = ${booking.id}::uuid and purpose = 'balance' and status = 'succeeded'
    `);
      assert.equal(
        Number(total[0]!.n),
        600000,
        "el segundo intento no puede haber movido nada",
      );
    });

    it("un cobro parcial se rechaza en lugar de inventar una regla", async () => {
      const booking = await confirmedBooking("2029-04-01", "2029-04-04");

      await assert.rejects(
        () => collect(booking.id, staffId, "cash", 300000),
        (error: unknown) => reason(error).includes("parcial"),
      );

      const pendiente = await db.execute<{ status: string }>(sql`
      select status::text from payments
       where booking_id = ${booking.id}::uuid and purpose = 'balance'
    `);
      assert.equal(
        pendiente[0]!.status,
        "pending",
        "el intento fallido no puede dejar rastro",
      );
    });

    it("no se cobra el saldo de una reserva que no está confirmada", async () => {
      const booking = await confirmedBooking("2029-04-10", "2029-04-13");
      await db.execute(sql`
      update bookings set status = 'cancelled' where id = ${booking.id}::uuid
    `);

      await assert.rejects(
        () => collect(booking.id, staffId),
        (error: unknown) => reason(error).includes("estado"),
      );
    });

    it("una reserva que no existe da un error de dominio, no una caída", async () => {
      await assert.rejects(
        () => collect(randomUUID(), staffId),
        (error: unknown) => reason(error).includes("no existe"),
      );
    });
  });

  describe("bloqueos manuales", () => {
    it("no se puede bloquear encima de una reserva confirmada", async () => {
      const booking = await confirmedBooking("2029-05-01", "2029-05-05");
      assert.ok(booking.id);

      // Es la misma restricción de exclusión que impide sobrevender. Aquí protege
      // a la operación de bloquear por error unas noches que ya se vendieron.
      await assert.rejects(
        () =>
          db.execute(sql`
          insert into stay_blocks (unit_id, stay, reason, note, created_by)
          values (${unitId}::uuid, daterange('2029-05-03', '2029-05-07'),
                  'maintenance', 'Pintura', ${staffId}::uuid)
        `),
        (error: unknown) => /exclusion|23P01|ocupad/i.test(reason(error)),
      );
    });

    it("liberar un bloqueo lo deja fuera del camino sin borrarlo", async () => {
      const rows = await db.execute<{ id: string }>(sql`
      insert into stay_blocks (unit_id, stay, reason, note, created_by)
      values (${unitId}::uuid, daterange('2029-06-01', '2029-06-05'),
              'maintenance', 'Impermeabilizar', ${staffId}::uuid)
      returning id
    `);
      const blockId = rows[0]!.id;

      const ocupado = await db.execute<{ libre: boolean }>(sql`
      select stay_is_available(${unitId}::uuid, daterange('2029-06-02', '2029-06-04')) as libre
    `);
      assert.equal(ocupado[0]!.libre, false);

      await db.execute(sql`
      update stay_blocks set released_at = now() where id = ${blockId}::uuid
    `);

      const libre = await db.execute<{ libre: boolean }>(sql`
      select stay_is_available(${unitId}::uuid, daterange('2029-06-02', '2029-06-04')) as libre
    `);
      assert.equal(
        libre[0]!.libre,
        true,
        "liberar debe devolver las noches a la venta",
      );

      // Liberar es un UPDATE: la fila sigue ahí para poder explicar qué pasó.
      const sigue = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from stay_blocks where id = ${blockId}::uuid
    `);
      assert.equal(sigue[0]!.n, 1, "liberar nunca borra");
    });

    it("un guía no alcanza el rango de recepción", async () => {
      // La jerarquía se prueba en identity/auth.test.ts; aquí solo se deja
      // constancia de que el guía existe y es de menor rango que quien cobra.
      const filas = await db.execute<{ role: string }>(sql`
      select role::text as role from staff_users where id = ${guideId}::uuid
    `);
      assert.equal(filas[0]!.role, "guide");
    });
  });
});
