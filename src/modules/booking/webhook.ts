import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { paymentProvider, type PaymentEventPayload } from "@/modules/payments";

/**
 * Procesamiento del webhook de la pasarela · S3-3
 *
 * La regla que gobierna todo este archivo: **la reserva se confirma cuando la
 * pasarela lo dice, no cuando el navegador vuelve.** El huésped puede cerrar la
 * pestaña, perder señal o pagar desde otro teléfono.
 *
 * Tres defensas, en este orden:
 *
 * 1. **Firma.** Se verifica antes de tocar nada. Quien no puede firmar no puede
 *    confirmar reservas.
 * 2. **Idempotencia.** El evento se guarda con su identificador único antes de
 *    actuar. El mismo evento diez veces produce una reserva, un saldo y dos
 *    avisos, porque el segundo intento choca con la restricción y se descarta.
 * 3. **Monto.** Si lo cobrado no es lo esperado, no se confirma: se marca para
 *    revisión. Un monto que no cuadra es un problema humano, y confirmar a ciegas
 *    es peor que no confirmar.
 */

export type WebhookOutcome =
  | { status: "invalid_signature" }
  | { status: "duplicate"; eventId: string }
  | { status: "ignored"; eventId: string }
  | { status: "unknown_booking"; eventId: string }
  | { status: "amount_mismatch"; eventId: string; bookingId: string; expected: number; received: number }
  | { status: "confirmed"; eventId: string; bookingId: string }
  | { status: "payment_failed"; eventId: string; bookingId: string };

function bookingIdFrom(event: PaymentEventPayload): string | null {
  const raw = event.raw as
    | { data?: { object?: { metadata?: Record<string, unknown>; client_reference_id?: unknown } } }
    | undefined;
  const object = raw?.data?.object;
  const fromMetadata = object?.metadata?.booking_id;
  if (typeof fromMetadata === "string") return fromMetadata;
  if (typeof object?.client_reference_id === "string") return object.client_reference_id;
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function processPaymentWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<WebhookOutcome> {
  const provider = paymentProvider();
  const event = provider.verifyWebhook(rawBody, signatureHeader);
  if (!event) return { status: "invalid_signature" };

  const bookingId = bookingIdFrom(event);
  const validBookingId = bookingId && UUID.test(bookingId) ? bookingId : null;

  try {
    return await db.transaction(async (tx) => {
      // Se registra el evento primero. Si ya existía, la restricción única aborta
      // la transacción y el reintento no produce efectos nuevos.
      await tx.execute(sql`
        insert into payment_events (provider, provider_event_id, type, payload,
                                    booking_id, signature_ok, processed_at)
        values (${provider.name}, ${event.eventId}, ${event.type},
                ${JSON.stringify(event.raw)}::jsonb, ${validBookingId}::uuid, true, now())
      `);

      if (event.type === "unknown") {
        // Se guarda para auditoría, pero no mueve ninguna reserva.
        return { status: "ignored", eventId: event.eventId } as const;
      }

      if (!validBookingId) {
        await tx.execute(sql`
          update payment_events
             set process_error = 'sin booking_id en el evento'
           where provider = ${provider.name} and provider_event_id = ${event.eventId}
        `);
        return { status: "unknown_booking", eventId: event.eventId } as const;
      }

      const bookings = await tx.execute<{
        id: string;
        status: string;
        deposit_cents: string;
        currency: string;
      }>(sql`
        select id, status::text as status, deposit_cents, currency
          from bookings where id = ${validBookingId}::uuid for update
      `);
      const booking = bookings[0];
      if (!booking) {
        await tx.execute(sql`
          update payment_events
             set process_error = 'la reserva del evento no existe'
           where provider = ${provider.name} and provider_event_id = ${event.eventId}
        `);
        return { status: "unknown_booking", eventId: event.eventId } as const;
      }

      if (event.type === "deposit.failed") {
        // El apartado sigue vigente hasta su vencimiento: el huésped puede
        // reintentar sin volver a capturar todo.
        await tx.execute(sql`
          insert into booking_events (booking_id, type, payload, actor_type, actor_id)
          values (${booking.id}::uuid, 'payment.failed',
                  ${JSON.stringify({ event_id: event.eventId })}::jsonb,
                  'provider', ${provider.name})
        `);
        return { status: "payment_failed", eventId: event.eventId, bookingId: booking.id } as const;
      }

      const expected = Number(booking.deposit_cents);
      const received = event.amountCents ?? 0;

      if (received !== expected || (event.currency && event.currency !== booking.currency)) {
        await tx.execute(sql`
          update payment_events
             set process_error = ${`monto o moneda no coinciden: esperado ${expected} ${booking.currency}, recibido ${received} ${event.currency ?? "?"}`}
           where provider = ${provider.name} and provider_event_id = ${event.eventId}
        `);
        await tx.execute(sql`
          insert into booking_events (booking_id, type, payload, actor_type, actor_id)
          values (${booking.id}::uuid, 'payment.amount_mismatch',
                  ${JSON.stringify({ expected, received, currency: event.currency })}::jsonb,
                  'provider', ${provider.name})
        `);
        return {
          status: "amount_mismatch",
          eventId: event.eventId,
          bookingId: booking.id,
          expected,
          received,
        } as const;
      }

      // El pago se registra con la referencia del proveedor, que es única: si el
      // mismo cobro llegara por dos eventos distintos, el índice lo impide.
      await tx.execute(sql`
        insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                              amount_cents, currency, paid_at)
        values (${booking.id}::uuid, 'deposit', 'succeeded', 'card', ${provider.name},
                ${event.providerRef}, ${received}, ${booking.currency}, now())
        on conflict (provider, provider_ref) where provider_ref is not null do nothing
      `);

      // Convierte los apartados en ocupación firme, registra el saldo por cobrar
      // y encola los avisos, todo en esta misma transacción.
      await tx.execute(sql`
        select booking_confirm(${booking.id}::uuid, ${`webhook:${provider.name}`})
      `);

      return { status: "confirmed", eventId: event.eventId, bookingId: booking.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Ya se había procesado. Es el caso normal cuando el proveedor reintenta.
      return { status: "duplicate", eventId: event.eventId };
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      if ((current as { code: unknown }).code === "23505") return true;
    }
    current =
      typeof current === "object" && "cause" in current ? (current as { cause: unknown }).cause : null;
  }
  return false;
}
