import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { type Locale } from "@/i18n/config";
import { rethrowDomainError } from "@/modules/availability/holds";
import { freezeQuoteLabels } from "@/modules/pricing/labels";
import { quoteStay, quoteTour } from "@/modules/pricing/service";

/**
 * Cambios de fecha · S5-3
 *
 * El SME lo puso por encima de las cancelaciones: **mover una reserva es más
 * frecuente que cancelarla**. Un vuelo que se recorre, un permiso que no salió.
 * Hoy se resuelve por WhatsApp y se anota en una libreta.
 *
 * Dos reglas que valen para los dos tipos de producto:
 *
 * - **El precio se vuelve a calcular en el servidor**, con el mismo motor que
 *   cotizó la reserva original. Nadie escribe un total a mano: si la tarifa de
 *   las fechas nuevas es otra, la diferencia sale del motor y queda registrada.
 * - **El anticipo ya cobrado se conserva.** La diferencia se suma o se resta del
 *   saldo que se paga en destino. Volver a cobrar obligaría a un segundo cargo
 *   por algo que el huésped ya pagó.
 *
 * Y una que solo aplica al mover: todo ocurre en una transacción, así que si las
 * fechas nuevas no están libres el huésped **no se queda sin las que tenía**.
 */

export type RescheduleResult = {
  /** Positiva si la reserva se encareció, negativa si bajó. */
  differenceCents: number;
  newTotalCents: number;
};

type BookingContext = {
  productId: string;
  guests: number;
  seats: number | null;
  locale: Locale;
  kind: "stay" | "tour";
};

async function contextOf(bookingId: string): Promise<BookingContext | null> {
  const rows = await db.execute<{
    product_id: string;
    guests: number | null;
    seats: number | null;
    locale: string;
    kind: "stay" | "tour";
  }>(sql`
    select i.product_id, i.guests, i.seats, b.locale, i.kind
      from booking_items i
      join bookings b on b.id = i.booking_id
     where i.booking_id = ${bookingId}::uuid
     limit 1
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    productId: row.product_id,
    guests: Number(row.guests ?? 2),
    seats: row.seats === null ? null : Number(row.seats),
    locale: row.locale === "en" ? "en" : "es",
    kind: row.kind,
  };
}

/** Mueve una estancia a otras noches. */
export async function rescheduleStay(
  bookingId: string,
  range: { from: string; to: string },
  staffId: string | null,
): Promise<RescheduleResult> {
  const context = await contextOf(bookingId);
  if (!context) throw new Error(`La reserva ${bookingId} no existe`);
  if (context.kind !== "stay") throw new Error("Esta reserva no es de estancia");

  const { quote } = await quoteStay(context.productId, range, context.guests);
  const frozen = freezeQuoteLabels(quote, context.locale);

  try {
    const rows = await db.execute<{ diff: string }>(sql`
      select booking_reschedule_stay(
        ${bookingId}::uuid,
        daterange(${range.from}, ${range.to}),
        ${quote.total_cents},
        ${JSON.stringify(frozen)}::jsonb,
        ${staffId}
      )::text as diff
    `);
    return {
      differenceCents: Number(rows[0]?.diff ?? 0),
      newTotalCents: quote.total_cents,
    };
  } catch (error) {
    rethrowDomainError(error);
  }
}

/** Mueve un tour a otra salida, con los mismos pasajeros. */
export async function rescheduleTour(
  bookingId: string,
  departureId: string,
  staffId: string | null,
): Promise<RescheduleResult> {
  const context = await contextOf(bookingId);
  if (!context) throw new Error(`La reserva ${bookingId} no existe`);
  if (context.kind !== "tour") throw new Error("Esta reserva no es de tour");

  // Los pasajeros no cambian al mover la fecha: se recuperan de la reserva y no
  // se vuelven a pedir. Pedirlos otra vez invita a capturarlos distinto.
  const pax = await db.execute<{ pax_type: string; n: number }>(sql`
    select pax_type::text as pax_type, count(*)::int as n
      from booking_guests where booking_id = ${bookingId}::uuid
     group by pax_type
  `);

  const counts = { adult: 0, child: 0, infant: 0 };
  for (const row of pax) {
    if (row.pax_type === "adult" || row.pax_type === "child" || row.pax_type === "infant") {
      counts[row.pax_type] = Number(row.n);
    }
  }
  // Una reserva vieja puede no tener pasajeros capturados uno por uno. En ese
  // caso el número de lugares apartados es el mejor dato disponible.
  if (counts.adult + counts.child + counts.infant === 0) {
    counts.adult = context.seats ?? 1;
  }

  const { quote } = await quoteTour(context.productId, departureId, counts);
  const frozen = freezeQuoteLabels(quote, context.locale);

  try {
    const rows = await db.execute<{ diff: string }>(sql`
      select booking_reschedule_tour(
        ${bookingId}::uuid,
        ${departureId}::uuid,
        ${quote.total_cents},
        ${JSON.stringify(frozen)}::jsonb,
        ${staffId}
      )::text as diff
    `);
    return {
      differenceCents: Number(rows[0]?.diff ?? 0),
      newTotalCents: quote.total_cents,
    };
  } catch (error) {
    rethrowDomainError(error);
  }
}
