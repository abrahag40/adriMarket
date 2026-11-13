// Una sola conexión y todo dentro de una transacción que se deshace al final,
// igual que pricing/resale.test.ts: las reservas de esta prueba no deben verse
// desde las pruebas de al lado, que corren en paralelo.
process.env.DATABASE_POOL_MAX = "1";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { gatewayFeeCents, STRIPE_MX } from "@/modules/pricing/resale";

import { captureChargeDetails, listPayouts, PayoutError, recordPayout } from "./payouts";

/**
 * Liquidación al proveedor · decisión 0026.
 *
 * Una reserva de reventa de dos adultos con la entrada de MXN 1,500 de Alexis:
 * el turista pagó 2 × 1,618 y a Alexis se le deben 3,000. Lo que se
 * comprueba es el camino completo del panel:
 *
 *   - se lee del cargo el país de la tarjeta y lo que se quedó la pasarela;
 *   - la lista dice cuánto transferir y cuánto quedó para ZaharDev;
 *   - la transferencia se registra una vez, por el monto que se debe, con su
 *     referencia y su autor;
 *   - lo cancelado y lo que no es de reventa no aparecen.
 */

const TOUR = "33333333-3333-3333-3333-333333333333";
const COBRADO = 2 * 161_800;
const ALEXIS = 300_000;

let staffId: string;

async function reserva(opciones: { status: string; supplierCents: number | null }): Promise<string> {
  const clientes = await db.execute<{ id: string }>(sql`
    insert into customers (full_name, email)
    values ('Turista de liquidación', ${`liquidacion+${randomUUID()}@example.com`})
    returning id
  `);
  const reservas = await db.execute<{ id: string }>(sql`
    insert into bookings (customer_id, status, currency, total_cents, deposit_pct, deposit_cents,
                          quote, deposit_due_at, supplier_cents)
    values (${clientes[0]!.id}::uuid, ${opciones.status}::booking_status, 'MXN', ${COBRADO}, 100,
            ${COBRADO}, '{}'::jsonb, now() + interval '15 minutes', ${opciones.supplierCents}::bigint)
    returning id
  `);
  const bookingId = reservas[0]!.id;
  await db.execute(sql`
    insert into booking_items (booking_id, kind, product_id, tour_departure_id, seats, subtotal_cents, quote)
    select ${bookingId}::uuid, 'tour', ${TOUR}::uuid, d.id, 2, ${COBRADO}, '{}'::jsonb
      from tour_departures d join tour_options o on o.id = d.tour_option_id
     where o.product_id = ${TOUR}::uuid and d.starts_at > now()
     order by d.starts_at limit 1
  `);
  await db.execute(sql`
    insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                          amount_cents, currency, paid_at)
    values (${bookingId}::uuid, 'deposit', 'succeeded', 'card', 'local', ${`local_${randomUUID()}`},
            ${COBRADO}, 'MXN', now())
  `);
  return bookingId;
}

/**
 * Un intento que debe fallar, dentro de un punto de guardado. En Postgres un
 * error aborta la transacción entera, y esta prueba vive dentro de una: sin el
 * punto de guardado, el primer «no» esperado tumbaría todo lo que sigue.
 */
async function intento<T>(fn: () => Promise<T>): Promise<T> {
  await sqlClient.unsafe("savepoint intento");
  try {
    const resultado = await fn();
    await sqlClient.unsafe("release savepoint intento");
    return resultado;
  } catch (error) {
    await sqlClient.unsafe("rollback to savepoint intento");
    throw error;
  }
}

before(async () => {
  await sqlClient.unsafe("begin");
  const staff = await db.execute<{ id: string }>(sql`select id from staff_users order by created_at limit 1`);
  staffId = staff[0]!.id;
});

after(async () => {
  await sqlClient.unsafe("rollback");
  await sqlClient.end();
});

describe("liquidación al proveedor", () => {
  it("lee del cargo el país de la tarjeta y lo que se quedó la pasarela", async () => {
    const bookingId = await reserva({ status: "confirmed", supplierCents: ALEXIS });

    const { read } = await captureChargeDetails({ bookingId });
    assert.equal(read, 1);

    const pagos = await db.execute<{ card_country: string; fee_cents: string; net_cents: string }>(sql`
      select card_country, fee_cents::text, net_cents::text from payments where booking_id = ${bookingId}::uuid
    `);
    const comision = gatewayFeeCents(COBRADO, STRIPE_MX.extranjera);
    assert.deepEqual(pagos[0], {
      card_country: "US",
      fee_cents: String(comision),
      net_cents: String(COBRADO - comision),
    });

    // Leído una vez, no se vuelve a pedir: el latido no le pregunta a Stripe
    // en cada vuelta por lo que ya sabe.
    assert.equal((await captureChargeDetails({ bookingId })).read, 0);
  });

  it("la lista dice cuánto transferir y cuánto quedó para el sitio", async () => {
    const bookingId = await reserva({ status: "confirmed", supplierCents: ALEXIS });
    const antes = (await listPayouts()).find((row) => row.bookingId === bookingId);
    assert.ok(antes, "una reserva de reventa cobrada aparece");
    assert.equal(antes.feeCents, null, "sin leer el cargo, la comisión no se inventa");
    assert.equal(antes.marginIsReal, false);

    await captureChargeDetails({ bookingId });
    const fila = (await listPayouts()).find((row) => row.bookingId === bookingId)!;

    const comision = gatewayFeeCents(COBRADO, STRIPE_MX.extranjera);
    assert.equal(fila.chargedCents, COBRADO);
    assert.equal(fila.supplierCents, ALEXIS);
    assert.equal(fila.feeCents, comision);
    assert.equal(fila.marginCents, COBRADO - comision - ALEXIS);
    assert.ok(fila.marginCents * 1000 >= ALEXIS * 25, "el piso del 2.5 % de la decisión 0025");
    assert.equal(fila.simulated, true, "el cobro fue del simulador y se dice");
    assert.equal(fila.payout, null);
  });

  it("la transferencia se registra una vez, por lo que se debe, con su referencia y su autor", async () => {
    const bookingId = await reserva({ status: "confirmed", supplierCents: ALEXIS });

    await assert.rejects(
      intento(() => recordPayout({ bookingId, paidOn: "2026-11-13", method: "spei", reference: "  ", notes: null, staffId })),
      PayoutError,
      "sin clave de rastreo no se registra",
    );

    await recordPayout({
      bookingId,
      paidOn: "2026-11-13",
      method: "spei",
      reference: "MBAN01002611130001",
      notes: null,
      staffId,
    });
    const fila = (await listPayouts()).find((row) => row.bookingId === bookingId)!;
    assert.equal(fila.payout?.amountCents, ALEXIS, "el monto lo pone la base: lo que se congeló al reservar");
    assert.equal(fila.payout?.reference, "MBAN01002611130001");
    assert.equal(fila.payout?.paidOn, "2026-11-13");

    await assert.rejects(
      intento(() => recordPayout({ bookingId, paidOn: "2026-11-13", method: "spei", reference: "OTRA", notes: null, staffId })),
      /ya tiene su transferencia registrada/,
    );
  });

  it("lo cancelado y lo que no es de reventa no aparecen ni se liquidan", async () => {
    const cancelada = await reserva({ status: "cancelled", supplierCents: ALEXIS });
    const ajena = await reserva({ status: "confirmed", supplierCents: null });
    const ids = new Set((await listPayouts()).map((row) => row.bookingId));
    assert.equal(ids.has(cancelada), false);
    assert.equal(ids.has(ajena), false);

    await assert.rejects(
      intento(() => recordPayout({ bookingId: cancelada, paidOn: "2026-11-13", method: "spei", reference: "X", notes: null, staffId })),
      /sólo se le transfiere al proveedor lo cobrado/,
    );
    await assert.rejects(
      intento(() => recordPayout({ bookingId: ajena, paidOn: "2026-11-13", method: "spei", reference: "X", notes: null, staffId })),
      /no es de reventa/,
    );
  });
});
