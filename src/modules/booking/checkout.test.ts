import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { InventoryUnavailableError } from "@/modules/availability/holds";
import { expireHolds } from "@/modules/availability/holds";
import { processOutbox, renderNotification } from "@/modules/notifications/send";
import { LocalProvider, resetPaymentProvider } from "@/modules/payments";

import { createBookingWithHold } from "./create";
import { processPaymentWebhook } from "./webhook";

/**
 * Pruebas del checkout completo · Sprint 3
 *
 * Se ejercita el camino real con la pasarela local, que firma sus eventos con el
 * mismo mecanismo que la real: verificación de firma, idempotencia, confirmación
 * transaccional y avisos. Lo único que no ocurre es el cobro.
 *
 * Requiere DATABASE_URL con esquema y seed:
 *   npm run db:reset && npm run test:integration
 */

const SECRET = "prueba_webhook_secret";

/**
 * Inventario propio de la corrida.
 *
 * Se crea aquí en lugar de usar el del seed por la lección del Sprint 2: una
 * prueba atada a fechas y bloqueos sembrados se rompe cuando el seed cambia, y
 * eso ya pasó una vez. Las tarifas cubren 2027 y 2028, así que ningún caso
 * depende de qué día es hoy.
 */
let CASA = "";
let TOUR = "";

process.env.LOCAL_WEBHOOK_SECRET = SECRET;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
resetPaymentProvider();

const gateway = new LocalProvider(SECRET);

const holder = {
  fullName: "Ana Ruiz",
  email: "ana.ruiz@example.com",
  phone: "+529981234567",
  locale: "es" as const,
  privacyVersion: "2026-08",
};

/** Rango propio de cada caso, dentro de la ventana tarifada del inventario de prueba. */
let offset = 0;
function freshRange(nights = 3): { from: string; to: string } {
  offset += nights + 2;
  const from = new Date(Date.UTC(2027, 0, 10 + offset));
  const to = new Date(Date.UTC(2027, 0, 10 + offset + nights));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function createFixtures(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const location = "11111111-1111-1111-1111-111111111111";
  const policy = "22222222-2222-2222-2222-222222222222";

  const stay = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, location_id, cancellation_policy_id, currency, deposit_pct)
    values ('stay', ${`it3-stay-${suffix}`}, 'published', ${location}::uuid, ${policy}::uuid, 'MXN', 40)
    returning id
  `);
  CASA = stay[0]!.id;

  const unit = await db.execute<{ id: string }>(sql`
    insert into stay_units (product_id, code, max_guests, base_guests, extra_guest_fee_cents,
                            cleaning_fee_cents, bedrooms, beds, bathrooms, min_nights)
    values (${CASA}::uuid, 'casa', 6, 4, 60000, 80000, 2, 3, 2, 1)
    returning id
  `);

  const plan = await db.execute<{ id: string }>(sql`
    insert into stay_rate_plans (unit_id, name) values (${unit[0]!.id}::uuid, 'Prueba')
    returning id
  `);

  await db.execute(sql`
    insert into stay_rates (rate_plan_id, name, season, nightly_cents, priority)
    values (${plan[0]!.id}::uuid, 'Base', daterange('2027-01-01', '2029-01-01'), 320000, 0)
  `);

  const tour = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, location_id, cancellation_policy_id, currency)
    values ('tour', ${`it3-tour-${suffix}`}, 'published', ${location}::uuid, ${policy}::uuid, 'MXN')
    returning id
  `);
  TOUR = tour[0]!.id;

  const option = await db.execute<{ id: string }>(sql`
    insert into tour_options (product_id, code, name_es, duration_minutes, meeting_point, default_capacity)
    values (${TOUR}::uuid, 'shared', 'Compartido', 300, 'Parque Dos Aguas, Tulum centro', 12)
    returning id
  `);

  await db.execute(sql`
    insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity)
    values (${option[0]!.id}::uuid, 'adult', 180000, true),
           (${option[0]!.id}::uuid, 'child', 120000, true),
           (${option[0]!.id}::uuid, 'infant', 0, false)
  `);

  // Salidas a las 09:00 de Cancún, para que la hora de presentación sea 08:45.
  await db.execute(sql`
    insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
    select ${option[0]!.id}::uuid,
           (d::date + time '09:00') at time zone 'America/Cancun',
           (d::date + time '14:00') at time zone 'America/Cancun',
           12
      from generate_series('2027-03-01'::date, '2027-03-25'::date, interval '1 day') d
  `);
}

async function nextDeparture(): Promise<{ id: string; seatsLeft: number }> {
  const rows = await db.execute<{ id: string; seats_left: number }>(sql`
    select d.id, (d.capacity - d.seats_taken) as seats_left
      from tour_departures d
      join tour_options o on o.id = d.tour_option_id
     where o.product_id = ${TOUR}::uuid
       and d.status = 'open'
       and d.capacity - d.seats_taken > 0
     order by d.starts_at
     limit 1
  `);
  const row = rows[0]!;
  return { id: row.id, seatsLeft: Number(row.seats_left) };
}

async function payDeposit(booking: { bookingId: string; depositCents: number; currency: string }) {
  const session = await gateway.createDepositSession({
    bookingId: booking.bookingId,
    bookingCode: "test",
    amountCents: booking.depositCents,
    currency: booking.currency,
    email: holder.email,
    description: "anticipo",
    successUrl: "https://example.com/ok",
    cancelUrl: "https://example.com/no",
  });

  return gateway.buildEvent({
    type: "deposit.succeeded",
    providerRef: session.providerRef,
    amountCents: booking.depositCents,
    currency: booking.currency,
    bookingId: booking.bookingId,
  });
}

before(async () => {
  await createFixtures();
});

after(async () => {
  await sqlClient.end();
});

describe("crear la reserva con apartado", () => {
  it("aparta el inventario y congela el precio y la política", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);

    assert.match(booking.code, /^AM-[2-9A-HJ-NP-Z]{6}$/, "el código es legible por teléfono");
    assert.equal(booking.depositCents, Math.round((booking.quote.total_cents * 40) / 100));

    const rows = await db.execute<{
      status: string;
      quote: { lines?: { label?: string }[] } | null;
      policy: { text_es?: string } | null;
      pax: number;
      due_in_minutes: number;
    }>(sql`
      select b.status::text as status, b.quote, b.cancellation_policy_snapshot as policy,
             (select count(*)::int from booking_guests g where g.booking_id = b.id) as pax,
             extract(epoch from (b.deposit_due_at - now()))::int / 60 as due_in_minutes
        from bookings b where b.id = ${booking.bookingId}::uuid
    `);
    const row = rows[0]!;

    assert.equal(row.status, "hold");
    assert.ok(row.due_in_minutes >= 13 && row.due_in_minutes <= 15, "el apartado vence en 15 minutos");
    assert.equal(row.pax, 1, "el titular se guarda como pax con bandera");

    // El desglose se congela con las etiquetas ya traducidas: un comprobante que
    // se relee en dos años no debe depender del código de entonces.
    const labels = (row.quote?.lines ?? []).map((line) => line.label);
    assert.ok(labels.every((label) => typeof label === "string" && label.length > 0));
    assert.ok(labels.some((label) => label === "Limpieza"), `etiquetas: ${labels.join(" | ")}`);

    assert.ok(row.policy?.text_es, "la política queda congelada, no referenciada");

    // Y el inventario quedó apartado de verdad.
    const blocks = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from stay_blocks sb
      join booking_items i on i.id = sb.booking_item_id
      where i.booking_id = ${booking.bookingId}::uuid and sb.released_at is null and sb.reason = 'hold'
    `);
    assert.equal(blocks[0]?.n, 1);
  });

  it("no deja rastro cuando el apartado falla", async () => {
    const range = freshRange();
    await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);

    // Se cuenta solo lo de estas fechas y no la tabla entera: contar global
    // hace que la prueba mida lo que hacen las demás pruebas al mismo tiempo.
    const cuenta = async (): Promise<number> => {
      const rows = await db.execute<{ n: number }>(sql`
        select count(distinct b.id)::int as n
          from bookings b
          join booking_items i on i.booking_id = b.id
         where i.product_id = ${CASA}::uuid
           and i.stay_range = daterange(${range.from}, ${range.to})
      `);
      return rows[0]!.n;
    };

    const antes = await cuenta();

    await assert.rejects(
      () => createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []),
      (error: unknown) => {
        assert.ok(error instanceof InventoryUnavailableError);
        assert.equal(error.code, "AM002");
        return true;
      },
    );

    assert.equal(
      await cuenta(),
      antes,
      "una reserva a medias esperando un pago imposible es peor que ninguna",
    );
  });

  it("guarda la edad de los menores y no su documento", async () => {
    const departure = await nextDeparture();
    const booking = await createBookingWithHold(
      { kind: "tour", productId: TOUR, departureId: departure.id, pax: { adult: 2, child: 1, infant: 1 } },
      holder,
      [
        { fullName: "Luis Ruiz", paxType: "adult", age: null },
        { fullName: "Mia Ruiz", paxType: "child", age: 8 },
        { fullName: "Beto Ruiz", paxType: "infant", age: 1 },
      ],
    );

    const guests = await db.execute<{ full_name: string; age: number | null; doc: string | null }>(sql`
      select full_name,
             case when birthdate is null then null else extract(year from age(birthdate))::int end as age,
             doc_last4 as doc
        from booking_guests where booking_id = ${booking.bookingId}::uuid order by full_name
    `);

    const mia = guests.find((guest) => guest.full_name === "Mia Ruiz");
    assert.equal(Number(mia?.age), 8);
    assert.ok(guests.every((guest) => guest.doc === null), "no se guarda documento");

    // Cuatro personas, tres lugares: el infante no ocupa asiento.
    const items = await db.execute<{ seats: number }>(sql`
      select seats from booking_items where booking_id = ${booking.bookingId}::uuid
    `);
    assert.equal(Number(items[0]?.seats), 3);
  });

  it("dos huéspedes por el último lugar: uno confirma y el otro recibe un no honesto", async () => {
    const departure = await nextDeparture();
    // Se deja la salida con exactamente un lugar libre.
    await db.execute(sql`
      update tour_departures set capacity = seats_taken + 1 where id = ${departure.id}::uuid
    `);

    const intentar = () =>
      createBookingWithHold(
        { kind: "tour", productId: TOUR, departureId: departure.id, pax: { adult: 1, child: 0, infant: 0 } },
        holder,
        [],
      );

    const resultados = await Promise.allSettled([intentar(), intentar()]);
    const ok = resultados.filter((result) => result.status === "fulfilled");
    const fallidos = resultados.filter((result) => result.status === "rejected");

    assert.equal(ok.length, 1, "solo uno se queda con el lugar");
    assert.equal(fallidos.length, 1);
    const razon = (fallidos[0] as PromiseRejectedResult).reason;
    assert.ok(razon instanceof InventoryUnavailableError);
    assert.equal(razon.code, "AM001");

    const left = await db.execute<{ left: number }>(sql`
      select (capacity - seats_taken) as left from tour_departures where id = ${departure.id}::uuid
    `);
    assert.equal(Number(left[0]?.left), 0, "y nunca se vende más allá del cupo");
  });
});

describe("webhook de la pasarela", () => {
  it("confirma la reserva, registra el saldo y encola los avisos", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);
    const event = await payDeposit(booking);

    const outcome = await processPaymentWebhook(event.body, event.signature);
    assert.equal(outcome.status, "confirmed");

    const rows = await db.execute<{
      status: string;
      deposit_paid: string;
      balance_due: string;
      correos: number;
      whatsapps: number;
      reason: string;
    }>(sql`
      select b.status::text as status,
             (select coalesce(sum(amount_cents),0) from payments p
               where p.booking_id = b.id and p.purpose = 'deposit' and p.status = 'succeeded') as deposit_paid,
             (select coalesce(sum(amount_cents),0) from payments p
               where p.booking_id = b.id and p.purpose = 'balance' and p.status = 'pending') as balance_due,
             (select count(*)::int from outbox o
               where o.booking_id = b.id and o.channel = 'email') as correos,
             (select count(*)::int from outbox o
               where o.booking_id = b.id and o.channel = 'whatsapp') as whatsapps,
             (select sb.reason::text from stay_blocks sb
                join booking_items i on i.id = sb.booking_item_id
               where i.booking_id = b.id and sb.released_at is null) as reason
        from bookings b where b.id = ${booking.bookingId}::uuid
    `);
    const row = rows[0]!;

    assert.equal(row.status, "confirmed");
    assert.equal(Number(row.deposit_paid), booking.depositCents);
    assert.equal(Number(row.balance_due), booking.quote.balance_cents, "el saldo queda por cobrar");
    assert.equal(row.correos, 2, "correo al huésped y al administrador");
    // El titular dejó teléfono, así que también sale por WhatsApp. Va **además**
    // del correo y no en su lugar: el correo lleva el desglose, la política y el
    // depósito en efectivo; WhatsApp lleva lo que se lee en la pantalla de
    // bloqueo. Si un canal falla, el otro sigue.
    assert.equal(row.whatsapps, 1, "y WhatsApp al huésped, que dejó teléfono");
    assert.equal(row.reason, "booking", "el apartado pasó a ocupación firme");
  });

  it("rechaza una firma inválida sin tocar la reserva", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);
    const event = await payDeposit(booking);

    const outcome = await processPaymentWebhook(event.body, "t=1,v1=falso");
    assert.equal(outcome.status, "invalid_signature");

    const rows = await db.execute<{ status: string; eventos: number }>(sql`
      select b.status::text as status,
             (select count(*)::int from payment_events e where e.booking_id = b.id) as eventos
        from bookings b where b.id = ${booking.bookingId}::uuid
    `);
    assert.equal(rows[0]?.status, "hold", "sigue en hold");
    assert.equal(rows[0]?.eventos, 0, "no se guarda un evento sin firma válida");
  });

  it("el mismo evento diez veces produce una sola reserva", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);
    const event = await payDeposit(booking);

    const outcomes: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      outcomes.push((await processPaymentWebhook(event.body, event.signature)).status);
    }

    assert.equal(outcomes[0], "confirmed");
    assert.ok(
      outcomes.slice(1).every((status) => status === "duplicate"),
      `los reintentos deben ser duplicados: ${outcomes.join(",")}`,
    );

    const rows = await db.execute<{ pagos: number; saldos: number; avisos: number; eventos: number }>(sql`
      select
        (select count(*)::int from payments where booking_id = ${booking.bookingId}::uuid and purpose = 'deposit') as pagos,
        (select count(*)::int from payments where booking_id = ${booking.bookingId}::uuid and purpose = 'balance') as saldos,
        (select count(*)::int from outbox where booking_id = ${booking.bookingId}::uuid) as avisos,
        (select count(*)::int from payment_events where booking_id = ${booking.bookingId}::uuid) as eventos
    `);
    assert.deepEqual(
      { ...rows[0] },
      // Dos correos y un WhatsApp: diez webhooks iguales no los multiplican.
      { pagos: 1, saldos: 1, avisos: 3, eventos: 1 },
      "un pago, un saldo, dos avisos, un evento",
    );
  });

  it("no confirma cuando el monto no corresponde al anticipo", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);

    const event = gateway.buildEvent({
      type: "deposit.succeeded",
      providerRef: `local_manipulado_${booking.bookingId}`,
      amountCents: 100, // un peso en lugar del anticipo
      currency: booking.currency,
      bookingId: booking.bookingId,
    });

    const outcome = await processPaymentWebhook(event.body, event.signature);
    assert.equal(outcome.status, "amount_mismatch");
    if (outcome.status === "amount_mismatch") {
      assert.equal(outcome.expected, booking.depositCents);
      assert.equal(outcome.received, 100);
    }

    const rows = await db.execute<{ status: string; marcado: string | null; evento: string | null }>(sql`
      select b.status::text as status,
             (select e.process_error from payment_events e where e.booking_id = b.id limit 1) as marcado,
             (select ev.type from booking_events ev
               where ev.booking_id = b.id and ev.type = 'payment.amount_mismatch' limit 1) as evento
        from bookings b where b.id = ${booking.bookingId}::uuid
    `);
    assert.equal(rows[0]?.status, "hold", "no se confirma con un monto que no cuadra");
    assert.ok(rows[0]?.marcado, "queda marcado para revisión de la operación");
    assert.equal(rows[0]?.evento, "payment.amount_mismatch", "y con rastro en la bitácora");
  });

  it("un pago fallido deja el apartado vivo para reintentar", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);

    const event = gateway.buildEvent({
      type: "deposit.failed",
      providerRef: `local_fallido_${booking.bookingId}`,
      amountCents: booking.depositCents,
      currency: booking.currency,
      bookingId: booking.bookingId,
    });

    const outcome = await processPaymentWebhook(event.body, event.signature);
    assert.equal(outcome.status, "payment_failed");

    const rows = await db.execute<{ status: string; bloqueos: number }>(sql`
      select b.status::text as status,
             (select count(*)::int from stay_blocks sb
                join booking_items i on i.id = sb.booking_item_id
               where i.booking_id = b.id and sb.released_at is null) as bloqueos
        from bookings b where b.id = ${booking.bookingId}::uuid
    `);
    assert.equal(rows[0]?.status, "hold");
    assert.equal(rows[0]?.bloqueos, 1, "el apartado sigue vigente hasta su vencimiento");
  });
});

describe("avisos", () => {
  it("el comprobante dice el saldo, la política y el depósito en efectivo", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);
    const event = await payDeposit(booking);
    await processPaymentWebhook(event.body, event.signature);

    const message = await renderNotification(booking.bookingId, "booking_confirmed_guest");
    assert.ok(message);
    assert.ok(message.subject.includes(booking.code), "el asunto lleva el código");
    assert.match(message.text, /SALDO A PAGAR EN DESTINO/, "el saldo va en grande");
    assert.match(message.text, /Política de cancelación/);
    assert.match(message.text, /depósito de garantía reembolsable en efectivo/);
    assert.match(message.text, /Las propinas no se cobran en línea/);
    assert.match(message.text, /Llegada:/);
    assert.match(message.text, /Limpieza/, "el desglose usa las etiquetas congeladas");
  });

  it("el comprobante de un tour dice la hora de presentación, no la de salida", async () => {
    const departure = await nextDeparture();
    const booking = await createBookingWithHold(
      { kind: "tour", productId: TOUR, departureId: departure.id, pax: { adult: 2, child: 0, infant: 0 } },
      holder,
      [],
    );
    const event = await payDeposit(booking);
    await processPaymentWebhook(event.body, event.signature);

    const message = await renderNotification(booking.bookingId, "booking_confirmed_guest");
    assert.ok(message);
    // La salida es 09:00 en Cancún; la presentación, 08:45.
    assert.match(message.text, /PRESÉNTATE A LAS 8:45/, message.text.slice(0, 400));
    assert.match(message.text, /Punto de encuentro: Parque Dos Aguas/);
  });

  it("el aviso al administrador lleva los pax y lo que falta cobrar", async () => {
    const departure = await nextDeparture();
    const booking = await createBookingWithHold(
      { kind: "tour", productId: TOUR, departureId: departure.id, pax: { adult: 1, child: 1, infant: 0 } },
      holder,
      [{ fullName: "Mia Ruiz", paxType: "child", age: 8 }],
    );
    const event = await payDeposit(booking);
    await processPaymentWebhook(event.body, event.signature);

    const message = await renderNotification(booking.bookingId, "booking_confirmed_admin");
    assert.ok(message);
    assert.match(message.text, /Mia Ruiz — child \(8 años\)/);
    assert.match(message.text, /Por cobrar en destino/);
  });

  it("despacha la bandeja, guarda lo enviado y no lo manda dos veces", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);
    const event = await payDeposit(booking);
    await processPaymentWebhook(event.body, event.signature);

    // La bandeja se despacha por lotes, así que se insiste hasta que no quede
    // nada pendiente de ESTA reserva: si se llamara una sola vez, la prueba
    // dependería de cuánta cola dejaron las demás.
    const pendientes = async (): Promise<number> => {
      const rows = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from outbox
         where booking_id = ${booking.bookingId}::uuid and status <> 'sent'
      `);
      return rows[0]!.n;
    };

    let enviados = 0;
    for (let vuelta = 0; vuelta < 20 && (await pendientes()) > 0; vuelta += 1) {
      enviados += (await processOutbox()).sent;
    }
    assert.ok(enviados >= 2, `se esperaban al menos 2 envíos, hubo ${enviados}`);

    const rows = await db.execute<{ status: string; rendered: string | null }>(sql`
      select status::text as status, payload -> 'rendered' ->> 'text' as rendered
        from outbox where booking_id = ${booking.bookingId}::uuid
    `);
    assert.ok(rows.every((row) => row.status === "sent"));
    assert.ok(
      rows.every((row) => (row.rendered ?? "").length > 50),
      "se guarda el correo exacto que recibió el huésped, no solo que se envió",
    );

    // Otra pasada no puede tocar lo ya enviado. Se mide sobre esta reserva y no
    // sobre el total de la pasada: la bandeja es de todos.
    await processOutbox();
    const deEstaReserva = await db.execute<{ n: number; enviados: number }>(sql`
      select count(*)::int as n,
             count(*) filter (where status = 'sent')::int as enviados
        from outbox where booking_id = ${booking.bookingId}::uuid
    `);
    assert.equal(deEstaReserva[0]?.n, rows.length, "la segunda pasada no encoló nada nuevo");
    assert.equal(deEstaReserva[0]?.enviados, rows.length, "la segunda pasada no reenvía nada");
  });

  it("un aviso que falla se reintenta con espera creciente y no en silencio", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);
    const event = await payDeposit(booking);
    await processPaymentWebhook(event.body, event.signature);

    // Se rompe el destinatario para forzar el fallo.
    await db.execute(sql`
      update outbox set to_address = '' where booking_id = ${booking.bookingId}::uuid
    `);

    const report = await processOutbox();
    assert.ok(report.failed >= 2, `se esperaban fallos, hubo ${JSON.stringify(report)}`);

    const rows = await db.execute<{ status: string; attempts: number; error: string | null; espera: number }>(sql`
      select status::text as status, attempts, last_error as error,
             extract(epoch from (next_attempt_at - now()))::int as espera
        from outbox where booking_id = ${booking.bookingId}::uuid
    `);
    for (const row of rows) {
      assert.equal(row.status, "failed");
      assert.equal(row.attempts, 1);
      assert.ok(row.error, "el error queda registrado");
      assert.ok(row.espera > 0, "se reprograma en el futuro, no de inmediato");
    }

    // Se recogen los avisos rotos antes de salir, y no es limpieza cosmética.
    //
    // Esta prueba escribe en la misma base que usa el desarrollo, y deja tres
    // filas con destinatario vacío que **son idénticas a un defecto real**. Al
    // cierre del Sprint 7 costaron una investigación entera: `/api/health`
    // reportaba avisos muertos, la causa no aparecía por ningún lado —una fila
    // de WhatsApp sin destinatario es imposible desde `outbox_enqueue_whatsapp`,
    // que solo inserta con número válido— y la explicación era este `update`.
    //
    // Un dato de prueba que no se distingue de un síntoma de producción hace
    // que el monitoreo mienta. La prueba se lleva lo suyo.
    await db.execute(sql`
      delete from outbox where booking_id = ${booking.bookingId}::uuid
    `);
  });
});

describe("expiración del apartado", () => {
  it("libera el inventario cuando el anticipo no llega", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);

    await db.execute(sql`
      update bookings set deposit_due_at = now() - interval '1 minute'
       where id = ${booking.bookingId}::uuid
    `);

    const report = await expireHolds();
    assert.ok(report.bookings_expired >= 1);

    const rows = await db.execute<{ status: string; libre: boolean }>(sql`
      select b.status::text as status,
             stay_is_available(
               (select stay_unit_id from booking_items where booking_id = b.id),
               daterange(${range.from}, ${range.to})
             ) as libre
        from bookings b where b.id = ${booking.bookingId}::uuid
    `);
    assert.equal(rows[0]?.status, "expired");
    assert.equal(rows[0]?.libre, true, "las fechas vuelven a estar a la venta");
  });

  it("una reserva expirada ya no se puede confirmar con un pago tardío", async () => {
    const range = freshRange();
    const booking = await createBookingWithHold({ kind: "stay", productId: CASA, range, guests: 5 }, holder, []);
    await db.execute(sql`
      update bookings set deposit_due_at = now() - interval '1 minute'
       where id = ${booking.bookingId}::uuid
    `);
    await expireHolds();

    const event = await payDeposit(booking);
    // El pago llega tarde: la transición es inválida y debe fallar ruidosamente
    // en lugar de resucitar una reserva cuyo inventario ya se revendió.
    await assert.rejects(() => processPaymentWebhook(event.body, event.signature), () => true);

    const rows = await db.execute<{ status: string }>(sql`
      select status::text as status from bookings where id = ${booking.bookingId}::uuid
    `);
    assert.equal(rows[0]?.status, "expired");
  });
});
