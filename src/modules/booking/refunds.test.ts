import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";

import { cancelBooking } from "./cancel";
import { RefundError, listPendingRefunds, settleRefund } from "./refunds";

/**
 * Liquidación de reembolsos fuera del sistema.
 *
 * La restricción de la base ya está probada en `db/tests/guarantees.sql` (25).
 * Lo que se prueba aquí es la capa que gerencia toca: que la lista diga la
 * verdad, que registrar deje los tres datos que el informe necesita, y —el caso
 * que de verdad importa— que **dos personas apretando el botón a la vez no
 * produzcan dos liquidaciones**. El dinero ya salió una vez; marcarlo dos veces
 * hace que el informe mienta y que alguien lo mande otra vez.
 */

const POLICY = {
  name: "Prueba reembolsos",
  deposit_refundable: true,
  rules: [{ hours_before: 168, refund_pct: 100 }],
};

let productId = "";
let unitId = "";
let staffId = "";

async function createFixtures(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);

  // Borrador, igual que el resto de las pruebas: inventario de prueba no llega
  // a la vitrina, y el slug `s5-…` lo delata si alguna fila sobrevive.
  const stay = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, location_id, currency, deposit_pct)
    values ('stay', ${`s5-refund-${suffix}`}, 'draft',
            '11111111-1111-1111-1111-111111111111'::uuid, 'MXN', 40)
    returning id
  `);
  productId = stay[0]!.id;

  const unit = await db.execute<{ id: string }>(sql`
    insert into rental_units (product_id, code, max_guests, base_guests, min_nights)
    values (${productId}::uuid, 'unidad', 6, 4, 1)
    returning id
  `);

  const staff = await db.execute<{ id: string }>(sql`select id from staff_users limit 1`);
  staffId = staff[0]!.id;

  unitId = unit[0]!.id;
}

/** Reserva confirmada con anticipo cobrado, lista para cancelarse. */
async function cancelledBooking(): Promise<{ code: string; refundId: string }> {
  const start = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 43 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const rows = await db.execute<{ booking_id: string; code: string }>(sql`
    with c as (
      insert into customers (full_name, email)
      values ('Huésped devolución', 'refund+' || gen_random_uuid() || '@example.com')
      returning id
    ), b as (
      insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                            quote, deposit_due_at, currency, cancellation_policy_snapshot)
      select c.id, 'hold', 1000000, 40, 400000, '{}'::jsonb,
             now() + interval '15 minutes', 'MXN', ${JSON.stringify(POLICY)}::jsonb
        from c
      returning id, code
    ), i as (
      insert into booking_items (booking_id, kind, product_id, rental_unit_id, rental_range,
                                 guests, subtotal_cents, quote)
      select b.id, 'stay', ${productId}::uuid, ${unitId}::uuid,
             daterange(${start}::date, ${end}::date), 2, 1000000, '{}'::jsonb
        from b
      returning id, booking_id
    ), h as (
      select rental_hold_create(${unitId}::uuid,
                                daterange(${start}::date, ${end}::date), i.id) from i
    )
    insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                          amount_cents, currency, paid_at)
    select b.id, 'deposit', 'succeeded', 'card', 'stripe',
           'pi_r_' || gen_random_uuid(), 400000, 'MXN', now()
      from b, h
    returning booking_id, (select code from b) as code
  `);

  const bookingId = rows[0]!.booking_id;
  await db.execute(sql`select booking_confirm(${bookingId}::uuid, 'prueba')`);
  await cancelBooking({
    bookingId,
    reason: "Prueba de liquidación",
    byOperator: false,
    staffId: null,
  });

  const refund = await db.execute<{ id: string }>(sql`
    select r.id from refunds r
      join payments p on p.id = r.payment_id
     where p.booking_id = ${bookingId}::uuid
     limit 1
  `);

  return { code: rows[0]!.code, refundId: refund[0]!.id };
}

describe("liquidación de reembolsos", () => {
  before(async () => {
    await createFixtures();
  });

  after(async () => {
    // Misma disciplina que `cancel.test.ts`: esta prueba **crea** reembolsos, y
    // los que queden en `pending` ponen `/api/health` en `degraded` a las 24 h y
    // tumban un criterio de `smoke.sh` al día siguiente, con la forma exacta de
    // un defecto de producción. Acotado a los productos de esta corrida.
    if (productId) {
      await db.execute(sql`
        delete from refunds r
         using payments p, booking_items i
         where r.payment_id = p.id
           and p.booking_id = i.booking_id
           and i.product_id = ${productId}::uuid
      `);
    }
    await sqlClient.end();
  });

  it("la lista muestra lo que falta por pagar, con su antigüedad", async () => {
    const { code, refundId } = await cancelledBooking();

    const pending = await listPendingRefunds();
    const mine = pending.find((row) => row.id === refundId);

    assert.ok(mine, "la devolución recién registrada tiene que aparecer");
    assert.equal(mine.bookingCode, code);
    assert.equal(mine.amountCents, 400000, "se devuelve el anticipo que entró");
    assert.equal(mine.currency, "MXN");
    assert.ok(mine.hoursWaiting >= 0);
  });

  it("registrar deja cómo, cuándo y quién", async () => {
    const { refundId } = await cancelledBooking();

    await settleRefund({
      refundId,
      method: "spei",
      providerRef: "CLAVE-RASTREO-9",
      notes: "Transferencia desde la cuenta de la agencia",
      staffId,
      receipt: null,
    });

    const rows = await db.execute<{
      status: string;
      method: string;
      settled_by: string;
      provider_ref: string;
      tiene_fecha: boolean;
    }>(sql`
      select status::text, method::text, settled_by::text, provider_ref,
             (settled_at is not null) as tiene_fecha
        from refunds where id = ${refundId}::uuid
    `);

    const row = rows[0]!;
    assert.equal(row.status, "succeeded");
    assert.equal(row.method, "spei");
    assert.equal(row.settled_by, staffId, "el autor sale de la sesión, no del formulario");
    assert.equal(row.provider_ref, "CLAVE-RASTREO-9");
    assert.ok(row.tiene_fecha, "la fecha la pone el servidor");
  });

  it("y sale de la lista de pendientes", async () => {
    const { refundId } = await cancelledBooking();
    await settleRefund({
      refundId,
      method: "cash",
      providerRef: null,
      notes: null,
      staffId,
      receipt: null,
    });

    const pending = await listPendingRefunds();
    assert.equal(
      pending.find((row) => row.id === refundId),
      undefined,
      "una devolución pagada deja de estar pendiente, y con ella el 503 de /api/health",
    );
  });

  it("no se liquida dos veces", async () => {
    const { refundId } = await cancelledBooking();
    const settle = () =>
      settleRefund({
        refundId,
        method: "transfer",
        providerRef: "FOLIO-1",
        notes: null,
        staffId,
        receipt: null,
      });

    await settle();

    // El segundo intento —otra pestaña, otra persona, un doble clic— no
    // encuentra nada en `pending` y lo dice, en vez de sobrescribir en silencio
    // la fecha y el autor de la liquidación que sí ocurrió.
    await assert.rejects(settle, RefundError);
  });

  it("rechaza un comprobante que no es foto ni PDF", async () => {
    const { refundId } = await cancelledBooking();

    await assert.rejects(
      () =>
        settleRefund({
          refundId,
          method: "spei",
          providerRef: "CLAVE-RASTREO-X",
          notes: null,
          staffId,
          receipt: { name: "hoja.xlsx", mime: "application/vnd.ms-excel", bytes: Buffer.from("x") },
        }),
      /foto o un PDF/,
    );

    // Y la fila sigue pendiente: un comprobante inválido no liquida nada.
    const pending = await listPendingRefunds();
    assert.ok(
      pending.some((row) => row.id === refundId),
      "si el comprobante no sirve, la devolución no se dio por pagada",
    );
  });
});
