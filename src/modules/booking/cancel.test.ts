import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { InventoryUnavailableError, confirmBooking, holdStay } from "@/modules/availability/holds";
import { enqueueReminders, processOutbox, renderNotification } from "@/modules/notifications/send";

import { cancelBooking, cancelDeparture, refundQuote } from "./cancel";
import { rescheduleStay, rescheduleTour } from "./reschedule";

/**
 * Cancelaciones, cambios de fecha y recordatorios · Sprint 5
 *
 * Las garantías de la base ya están probadas en `db/tests/guarantees.sql`. Lo
 * que se prueba aquí es la capa que la operación toca de verdad: que el monto
 * que se muestra antes de cancelar sea el que después se devuelve, que un
 * cambio de fecha use el motor de precios y no un número escrito a mano, y que
 * **el correo diga lo correcto en cada caso** — sobre todo cuando cancela el
 * operador, donde el texto tiene que dejar claro que el huésped no hizo nada mal.
 */

const POLICY_FLEXIBLE = {
  name: "Prueba flexible",
  deposit_refundable: true,
  rules: [
    { hours_before: 168, refund_pct: 100 },
    { hours_before: 48, refund_pct: 50 },
  ],
  text_es: "Sin costo hasta 7 días antes. Entre 7 y 2 días, 50%.",
};

let productId: string;
let unitId: string;
let tourProductId: string;
let optionId: string;

async function createFixtures(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const location = "11111111-1111-1111-1111-111111111111";

  // Borrador, no publicado: es inventario de prueba y no puede llegar a la vitrina.
  const stay = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, location_id, currency, deposit_pct)
    values ('stay', ${`s5-stay-${suffix}`}, 'draft', ${location}::uuid, 'MXN', 40)
    returning id
  `);
  productId = stay[0]!.id;

  const unit = await db.execute<{ id: string }>(sql`
    insert into stay_units (product_id, code, max_guests, base_guests, min_nights)
    values (${productId}::uuid, 'unidad', 6, 4, 1)
    returning id
  `);
  unitId = unit[0]!.id;

  const plan = await db.execute<{ id: string }>(sql`
    insert into stay_rate_plans (unit_id, name) values (${unitId}::uuid, 'Prueba')
    returning id
  `);
  // Tarifa plana para que la diferencia al reprogramar sea comprobable a mano.
  await db.execute(sql`
    insert into stay_rates (rate_plan_id, name, season, nightly_cents, priority)
    values (${plan[0]!.id}::uuid, 'Base', daterange('2030-01-01', '2033-01-01'), 300000, 0)
  `);

  const tour = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, location_id, currency, deposit_pct)
    values ('tour', ${`s5-tour-${suffix}`}, 'draft', ${location}::uuid, 'MXN', 30)
    returning id
  `);
  tourProductId = tour[0]!.id;

  const option = await db.execute<{ id: string }>(sql`
    insert into tour_options (product_id, code, name_es, duration_minutes, meeting_point, default_capacity)
    values (${tourProductId}::uuid, 'shared', 'Compartido', 300, 'Muelle 3', 12)
    returning id
  `);
  optionId = option[0]!.id;

  await db.execute(sql`
    insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity)
    values (${optionId}::uuid, 'adult', 180000, true),
           (${optionId}::uuid, 'child', 120000, true),
           (${optionId}::uuid, 'infant', 0, false)
  `);
}

async function newDeparture(daysAhead: number, capacity = 12): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into tour_departures (tour_option_id, starts_at, capacity)
    values (${optionId}::uuid, now() + make_interval(days => ${daysAhead}), ${capacity})
    returning id
  `);
  return rows[0]!.id;
}

/** Reserva de estancia confirmada, con la política congelada y el anticipo cobrado. */
async function confirmedStay(
  from: string,
  to: string,
  policy: unknown = POLICY_FLEXIBLE,
): Promise<{ id: string; code: string }> {
  const rows = await db.execute<{ item_id: string; booking_id: string; code: string }>(sql`
    with c as (
      insert into customers (full_name, email)
      values ('Huésped S5', 's5+' || gen_random_uuid() || '@example.com')
      returning id
    ), b as (
      insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                            quote, deposit_due_at, currency, cancellation_policy_snapshot)
      select c.id, 'hold', 1000000, 40, 400000, '{}'::jsonb,
             now() + interval '15 minutes', 'MXN', ${JSON.stringify(policy)}::jsonb
        from c
      returning id, code
    )
    insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range,
                               guests, subtotal_cents, quote)
    select b.id, 'stay', ${productId}::uuid, ${unitId}::uuid,
           daterange(${from}, ${to}), 2, 1000000, '{}'::jsonb
      from b
    returning id as item_id, booking_id, (select code from b) as code
  `);
  const row = rows[0]!;

  await holdStay(unitId, { from, to }, row.item_id);
  await db.execute(sql`
    insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                          amount_cents, currency, paid_at)
    values (${row.booking_id}::uuid, 'deposit', 'succeeded', 'card', 'stripe',
            'pi_s5_' || gen_random_uuid(), 400000, 'MXN', now())
  `);
  await confirmBooking(row.booking_id, "prueba");

  return { id: row.booking_id, code: row.code };
}

async function confirmedTour(
  departureId: string,
  seats = 2,
): Promise<{ id: string; code: string }> {
  const rows = await db.execute<{ item_id: string; booking_id: string; code: string }>(sql`
    with c as (
      insert into customers (full_name, email)
      values ('Pasajero S5', 's5t+' || gen_random_uuid() || '@example.com')
      returning id
    ), b as (
      insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                            quote, deposit_due_at, currency, cancellation_policy_snapshot)
      select c.id, 'hold', 360000, 30, 108000, '{}'::jsonb,
             now() + interval '15 minutes', 'MXN', ${JSON.stringify(POLICY_FLEXIBLE)}::jsonb
        from c
      returning id, code
    )
    insert into booking_items (booking_id, kind, product_id, tour_departure_id, seats,
                               subtotal_cents, quote)
    select b.id, 'tour', ${tourProductId}::uuid, ${departureId}::uuid, ${seats}, 360000, '{}'::jsonb
      from b
    returning id as item_id, booking_id, (select code from b) as code
  `);
  const row = rows[0]!;

  await db.execute(sql`
    select tour_hold_create(${departureId}::uuid, ${seats}, ${row.item_id}::uuid)
  `);
  await db.execute(sql`
    insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                          amount_cents, currency, paid_at)
    values (${row.booking_id}::uuid, 'deposit', 'succeeded', 'card', 'stripe',
            'pi_s5t_' || gen_random_uuid(), 108000, 'MXN', now())
  `);
  await confirmBooking(row.booking_id, "prueba");
  return { id: row.booking_id, code: row.code };
}

/** Fechas de estancia a N días de hoy, sin chocar con otras pruebas. */
let dayCursor = 0;
function futureRange(nights = 3): { from: string; to: string } {
  dayCursor += 20;
  const from = new Date(Date.UTC(2031, 0, 1));
  from.setUTCDate(from.getUTCDate() + dayCursor);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + nights);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

describe("cancelaciones y cambios de fecha", () => {
  before(async () => {
    await createFixtures();
  });

  after(async () => {
    // Se recogen los reembolsos que deja esta prueba, y no es limpieza cosmética.
    //
    // Cancelar **registra** un reembolso que nadie ejecuta: es deuda declarada y
    // correcta. Lo que no es correcto es dejar la fila en la misma base que usa
    // el desarrollo, porque a las 24 h `/api/health` la cuenta como
    // `refunds: { ok: false, "N sin procesar por más de 24 h" }`, la salud pasa
    // a `degraded` y **tumba un criterio de `smoke.sh`**. Al día siguiente la
    // barra de verificación falla sola por basura de prueba, con la forma exacta
    // de un defecto de producción. La pista que lo delata: los reembolsos
    // atorados cuelgan de productos en borrador con slug `s5-…`, que solo esta
    // prueba crea; una reserva de verdad nunca compra un producto sin publicar.
    //
    // Se acota a los productos que creó *esta* corrida —el sufijo es aleatorio—,
    // nunca a la tabla entera: un `delete from refunds` a ciegas se llevaría los
    // de otra corrida o los de un ambiente compartido.
    //
    // Si `before` reventó no hay productos que nombrar —ni reservas que hayan
    // dejado nada—, y el borrado sin acotar es justo lo que no se quiere.
    if (productId && tourProductId) {
      await db.execute(sql`
        delete from refunds r
         using payments p, booking_items i
         where r.payment_id = p.id
           and p.booking_id = i.booking_id
           and i.product_id in (${productId}::uuid, ${tourProductId}::uuid)
      `);
    }
    await sqlClient.end();
  });

  describe("cotización del reembolso", () => {
    it("dice cuánto se devolvería antes de cancelar", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to);

      const quote = await refundQuote(booking.id);
      assert.equal(quote.paidCents, 400000, "solo cuenta lo que efectivamente entró");
      assert.equal(quote.refundPct, 100, "faltan años: aplica el escalón más generoso");
      assert.equal(quote.refundCents, 400000);
      assert.ok(quote.hoursBefore > 0, "el servicio todavía no ocurre");
    });

    it("el monto cotizado es exactamente el que después se devuelve", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to);

      // Es la propiedad que hace confiable mostrarlo en pantalla: si difiriera,
      // el mostrador prometería una cifra y la caja devolvería otra.
      const cotizado = (await refundQuote(booking.id)).refundCents;
      const devuelto = await cancelBooking({
        bookingId: booking.id,
        reason: "El huésped canceló",
        byOperator: false,
        staffId: null,
      });
      assert.equal(devuelto, cotizado);
    });

    it("una política no reembolsable no devuelve nada", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to, {
        name: "Estricta",
        deposit_refundable: false,
        rules: [{ hours_before: 24, refund_pct: 100 }],
        text_es: "No reembolsable.",
      });

      assert.equal((await refundQuote(booking.id)).refundCents, 0);
    });
  });

  describe("cancelación", () => {
    it("cancelar es idempotente: no devuelve dos veces", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to);

      const primera = await cancelBooking({
        bookingId: booking.id,
        reason: "Primera",
        byOperator: false,
        staffId: null,
      });
      const segunda = await cancelBooking({
        bookingId: booking.id,
        reason: "Segunda",
        byOperator: false,
        staffId: null,
      });

      assert.equal(primera, 400000);
      assert.equal(segunda, 0, "cancelar de nuevo no puede devolver otra vez");

      const total = await db.execute<{ n: string }>(sql`
        select coalesce(sum(r.amount_cents), 0)::text as n
          from refunds r join payments p on p.id = r.payment_id
         where p.booking_id = ${booking.id}::uuid
      `);
      assert.equal(Number(total[0]!.n), 400000);
    });

    it("cancelar el operador devuelve todo aunque la política diga que no", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to, {
        name: "Estricta",
        deposit_refundable: false,
        rules: [],
        text_es: "No reembolsable.",
      });

      assert.equal((await refundQuote(booking.id)).refundCents, 0, "la política no devuelve nada");

      const devuelto = await cancelBooking({
        bookingId: booking.id,
        reason: "Cierre de puerto",
        byOperator: true,
        staffId: null,
      });
      assert.equal(devuelto, 400000, "un huracán no es culpa del huésped");
    });

    it("cancelar una reserva que no existe da un error de dominio", async () => {
      await assert.rejects(
        () =>
          cancelBooking({
            bookingId: randomUUID(),
            reason: "x",
            byOperator: false,
            staffId: null,
          }),
        (error: unknown) => error instanceof InventoryUnavailableError && error.code === "AM003",
      );
    });

    it("cancelar una salida cancela y avisa a todos sus pasajeros", async () => {
      const departure = await newDeparture(40, 20);
      const pasajeros = [
        await confirmedTour(departure),
        await confirmedTour(departure),
        await confirmedTour(departure),
      ];

      const result = await cancelDeparture(departure, "Cierre de puerto", null);
      assert.equal(result.bookingsCancelled, 3);
      assert.equal(result.refundedCents, 108000 * 3, "se devuelve el anticipo completo de cada uno");

      for (const pasajero of pasajeros) {
        const avisos = await db.execute<{ n: number }>(sql`
          select count(*)::int as n from outbox
           where booking_id = ${pasajero.id}::uuid
             and template = 'booking_cancelled_by_operator'
        `);
        assert.equal(avisos[0]!.n, 1, `${pasajero.code} se habría quedado sin aviso`);
      }

      const seats = await db.execute<{ n: number }>(sql`
        select seats_taken as n from tour_departures where id = ${departure}::uuid
      `);
      assert.equal(seats[0]!.n, 0, "los lugares vuelven al cupo");
    });
  });

  describe("cambio de fecha", () => {
    it("mueve las noches, conserva el anticipo y ajusta el saldo", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to);
      const destino = futureRange(4); // una noche más a 3 000 la noche

      const result = await rescheduleStay(booking.id, destino, null);

      // El total nuevo lo calcula el motor de precios, no la prueba: 4 noches a
      // 300 000 más los impuestos configurados (IVA 16% + ISH 3% sobre hospedaje).
      // Se afirma contra el motor y no contra un número escrito a mano, que es
      // justo lo que el cambio de fecha no debe permitir.
      assert.equal(result.newTotalCents, Math.round(1200000 * 1.19));
      assert.equal(
        result.differenceCents,
        result.newTotalCents - 1000000,
        "la diferencia es contra el total original de la reserva",
      );

      const pagos = await db.execute<{ deposito: string; saldo: string }>(sql`
        select
          (select coalesce(sum(amount_cents), 0)::text from payments
            where booking_id = ${booking.id}::uuid and purpose = 'deposit' and status = 'succeeded') as deposito,
          (select coalesce(sum(amount_cents), 0)::text from payments
            where booking_id = ${booking.id}::uuid and purpose = 'balance' and status = 'pending') as saldo
      `);
      assert.equal(Number(pagos[0]!.deposito), 400000, "el anticipo cobrado no se toca");
      assert.equal(
        Number(pagos[0]!.saldo),
        600000 + result.differenceCents,
        "la diferencia se suma al saldo que se paga en destino",
      );

      const libre = await db.execute<{ libre: boolean }>(sql`
        select stay_is_available(${unitId}::uuid, daterange(${range.from}, ${range.to})) as libre
      `);
      assert.equal(libre[0]!.libre, true, "las noches viejas vuelven a la venta");
    });

    it("si las noches nuevas están ocupadas, la reserva queda como estaba", async () => {
      const original = futureRange();
      const booking = await confirmedStay(original.from, original.to);

      const ocupado = futureRange();
      await confirmedStay(ocupado.from, ocupado.to);

      await assert.rejects(
        () => rescheduleStay(booking.id, ocupado, null),
        (error: unknown) => error instanceof InventoryUnavailableError && error.code === "AM002",
      );

      // Lo que de verdad importa: el huésped no se quedó sin nada.
      const sigue = await db.execute<{ rango: string; estado: string }>(sql`
        select i.stay_range::text as rango, b.status::text as estado
          from booking_items i join bookings b on b.id = i.booking_id
         where i.booking_id = ${booking.id}::uuid
      `);
      assert.equal(sigue[0]!.rango, `[${original.from},${original.to})`);
      assert.equal(sigue[0]!.estado, "confirmed");
    });

    it("mueve un tour a otra salida conservando los lugares", async () => {
      const origen = await newDeparture(50);
      const destino = await newDeparture(60);
      const booking = await confirmedTour(origen, 2);

      await rescheduleTour(booking.id, destino, null);

      const counts = await db.execute<{ origen: number; destino: number }>(sql`
        select
          (select seats_taken from tour_departures where id = ${origen}::uuid) as origen,
          (select seats_taken from tour_departures where id = ${destino}::uuid) as destino
      `);
      assert.equal(counts[0]!.origen, 0, "los lugares se devolvieron a la salida vieja");
      assert.equal(counts[0]!.destino, 2, "y se apartaron en la nueva");
    });

    it("si la salida destino no tiene cupo, no se mueve nada", async () => {
      const origen = await newDeparture(70);
      const destino = await newDeparture(80, 2);
      await confirmedTour(destino, 2); // deja la salida destino llena

      const booking = await confirmedTour(origen, 2);

      // El motor de precios ve el cupo agotado antes de tocar el inventario, así
      // que el rechazo llega de ahí y no de la restricción de la base. Las dos
      // barreras existen: esta prueba fija cuál actúa primero.
      await assert.rejects(
        () => rescheduleTour(booking.id, destino, null),
        (error: unknown) => /sold_out/.test(String(error)),
      );

      const counts = await db.execute<{ origen: number }>(sql`
        select seats_taken as origen from tour_departures where id = ${origen}::uuid
      `);
      assert.equal(counts[0]!.origen, 2, "la reserva sigue en su salida original");
    });
  });

  describe("avisos", () => {
    it("el aviso de cancelación del operador dice que no fue culpa del huésped", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to);
      await cancelBooking({
        bookingId: booking.id,
        reason: "Cierre de puerto por mal tiempo",
        byOperator: true,
        staffId: null,
      });

      const message = await renderNotification(booking.id, "booking_cancelled_by_operator", {
        refund_cents: 400000,
        reason: "Cierre de puerto por mal tiempo",
      });
      assert.ok(message);
      assert.match(message.text, /lo sentimos/i);
      assert.match(message.text, /Cierre de puerto por mal tiempo/);
      assert.match(message.text, /DEVOLUCIÓN/);
      assert.match(
        message.text,
        /no aplica la política de cancelación/i,
        "hay que decirle por qué se le devuelve todo",
      );
    });

    it("el aviso al huésped que cancela cita la política que aplicó", async () => {
      const range = futureRange();
      const booking = await confirmedStay(range.from, range.to);

      const message = await renderNotification(booking.id, "booking_cancelled_by_guest", {
        refund_cents: 0,
      });
      assert.ok(message);
      assert.match(message.text, /no genera devolución/i);
      assert.match(message.text, /Sin costo hasta 7 días antes/, "se cita la política congelada");
      assert.doesNotMatch(message.text, /lo sentimos/i);
    });

    it("el recordatorio dice la hora de presentación, no la de salida", async () => {
      // Salida dentro de 20 horas: ya entró en la ventana de 24.
      const departure = await newDeparture(0);
      await db.execute(sql`
        update tour_departures set starts_at = now() + interval '20 hours'
         where id = ${departure}::uuid
      `);
      const booking = await confirmedTour(departure);

      const antes = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from outbox
         where booking_id = ${booking.id}::uuid and template = 'booking_reminder'
      `);
      assert.equal(antes[0]!.n, 0);

      await enqueueReminders();

      const rows = await db.execute<{ dedupe_key: string }>(sql`
        select dedupe_key from outbox
         where booking_id = ${booking.id}::uuid and template = 'booking_reminder'
      `);
      // Se confirmó a 20 horas de la salida: el umbral de 72 nunca existió para
      // esta reserva y mandarlo diría "te esperamos en tres días" a quien viaja
      // mañana.
      assert.equal(rows.length, 1, "solo el umbral de 24 h aplica a una salida a 20 horas");
      assert.match(rows[0]!.dedupe_key, /:reminder:24$/);

      const message = await renderNotification(booking.id, "booking_reminder", {
        hours_before: 24,
      });
      assert.ok(message);
      assert.match(message.text, /PRESÉNTATE A LAS/);
      assert.match(message.text, /15 minutos antes/);
      assert.match(message.text, /Muelle 3/, "el punto de encuentro va en el recordatorio");
      assert.match(message.text, /SALDO A PAGAR EN DESTINO/);
    });

    it("el latido despacha el recordatorio y no lo manda dos veces", async () => {
      const departure = await newDeparture(0);
      await db.execute(sql`
        update tour_departures set starts_at = now() + interval '10 hours'
         where id = ${departure}::uuid
      `);
      const booking = await confirmedTour(departure);

      await enqueueReminders();

      // Se insiste hasta vaciar lo de esta reserva: la bandeja es de todos y se
      // despacha por lotes.
      const pendientes = async (): Promise<number> => {
        const rows = await db.execute<{ n: number }>(sql`
          select count(*)::int as n from outbox
           where booking_id = ${booking.id}::uuid and status <> 'sent'
        `);
        return rows[0]!.n;
      };
      for (let vuelta = 0; vuelta < 20 && (await pendientes()) > 0; vuelta += 1) {
        await processOutbox();
      }

      const enviados = await db.execute<{ status: string; rendered: string | null }>(sql`
        select status::text as status, payload -> 'rendered' ->> 'text' as rendered
          from outbox
         where booking_id = ${booking.id}::uuid and template = 'booking_reminder'
      `);
      assert.equal(enviados.length, 1);
      assert.equal(enviados[0]!.status, "sent");
      assert.match(
        enviados[0]!.rendered ?? "",
        /PRESÉNTATE A LAS/,
        "se guarda el recordatorio exacto que recibió el huésped",
      );

      // El latido corre cada minuto: no puede reencolar lo mismo.
      await enqueueReminders();
      const total = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from outbox
         where booking_id = ${booking.id}::uuid and template = 'booking_reminder'
      `);
      assert.equal(total[0]!.n, 1);
    });
  });
});
