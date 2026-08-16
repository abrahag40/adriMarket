import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { rethrowDomainError } from "@/modules/availability/holds";

/**
 * Cancelaciones y reembolsos · S5-1 y S5-2
 *
 * La regla de negocio vive en la base (ver `db/migrations/0011_cancellations.sql`)
 * y este módulo solo la invoca. No es purismo: el reembolso, la liberación del
 * inventario, el cierre del saldo y el aviso tienen que ocurrir **en la misma
 * transacción**. Repartir eso entre varias llamadas desde la aplicación es cómo
 * se termina con una reserva cancelada que nadie devolvió, o con un aviso de una
 * cancelación que no ocurrió.
 */

export type RefundQuote = {
  /** Lo que corresponde devolver si se cancela ahora. */
  refundCents: number;
  /** El porcentaje que aplicó, para poder explicarlo en el mostrador. */
  refundPct: number;
  /** Lo que efectivamente entró y todavía no se ha devuelto. */
  paidCents: number;
  /** Horas que faltan para el servicio. Negativas si ya ocurrió. */
  hoursBefore: number;
};

/**
 * Cuánto se devolvería si el huésped cancelara ahora.
 *
 * Se consulta antes de cancelar para poder decirle la cifra **antes** de que
 * decida. Anunciar el monto después de cancelar convierte una conversación en un
 * reclamo.
 */
export async function refundQuote(bookingId: string, at?: Date): Promise<RefundQuote> {
  const rows = await db.execute<{
    refund_cents: string;
    refund_pct: string;
    paid_cents: string;
    hours_before: string;
  }>(sql`
    select refund_cents::text, refund_pct::text, paid_cents::text, hours_before::text
      from booking_refund_quote(${bookingId}::uuid, ${at?.toISOString() ?? null}::timestamptz)
  `);

  const row = rows[0];
  if (!row) throw new Error(`No se pudo cotizar el reembolso de ${bookingId}`);

  return {
    refundCents: Number(row.refund_cents),
    refundPct: Number(row.refund_pct),
    paidCents: Number(row.paid_cents),
    hoursBefore: Number(row.hours_before),
  };
}

export type CancelInput = {
  bookingId: string;
  reason: string;
  /**
   * Verdadero cuando cancela el negocio y no el huésped.
   *
   * Es el parámetro más importante de la función: decide si aplica la política
   * de cancelación o se devuelve todo. Un cierre de puerto no es una
   * cancelación del huésped, y cobrarle una penalización por un huracán es el
   * error que este parámetro existe para impedir.
   */
  byOperator: boolean;
  staffId: string | null;
};

/** Cancela y devuelve lo reembolsado, en centavos. */
export async function cancelBooking(input: CancelInput): Promise<number> {
  try {
    const rows = await db.execute<{ refund: string }>(sql`
      select booking_cancel(
        ${input.bookingId}::uuid,
        ${input.reason},
        ${input.byOperator},
        'staff',
        ${input.staffId}
      )::text as refund
    `);
    return Number(rows[0]?.refund ?? 0);
  } catch (error) {
    rethrowDomainError(error);
  }
}

export type DepartureCancelResult = { bookingsCancelled: number; refundedCents: number };

/**
 * Cancela una salida completa: el caso del cierre de puerto.
 *
 * Lo que importa aquí no es cancelar sino que **no se quede nadie sin avisar**,
 * y por eso las reservas se cancelan en una sola transacción: dieciocho
 * pasajeros o ninguno. Un aviso a la mitad del grupo es peor que ninguno,
 * porque los que no supieron llegan al muelle.
 */
export async function cancelDeparture(
  departureId: string,
  reason: string,
  staffId: string | null,
): Promise<DepartureCancelResult> {
  try {
    const rows = await db.execute<{ bookings_cancelled: number; refunded_cents: string }>(sql`
      select bookings_cancelled, refunded_cents::text
        from departure_cancel(${departureId}::uuid, ${reason}, ${staffId}::uuid)
    `);
    const row = rows[0];
    return {
      bookingsCancelled: Number(row?.bookings_cancelled ?? 0),
      refundedCents: Number(row?.refunded_cents ?? 0),
    };
  } catch (error) {
    rethrowDomainError(error);
  }
}
