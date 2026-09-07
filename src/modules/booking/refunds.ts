import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { mediaStorage } from "@/modules/media/images";

/**
 * Reembolsos · liquidación fuera del sistema
 *
 * Cancelar registra la devolución en la misma transacción que cancela —eso ya
 * lo hace `booking_cancel` y no se toca—. Lo que faltaba era el otro extremo:
 * **decir que el dinero salió**, y decirlo con lo suficiente para auditarlo
 * después.
 *
 * Sale fuera del sistema a propósito, no por falta de Stripe. El negocio cobra
 * el anticipo en línea y **el saldo en destino, en efectivo**: parte del dinero
 * nunca pasa por la pasarela y no puede devolverse por ella. Cuando Stripe
 * llegue será un `method` más, no un camino aparte.
 *
 * Hasta ahora esto se hacía con un `UPDATE` a mano contra Neon —documentado en
 * `docs/operacion.md` §4—, y quien opera el panel es recepción desde un
 * teléfono. Un procedimiento que exige una consola SQL es un procedimiento que
 * no se ejecuta: la reserva se quedaba en `pending`, `/api/health` pasaba a
 * `degraded` a las 24 h y ahí se quedaba.
 */

/** Formatos que un comprobante de transferencia puede tener de verdad. */
const RECEIPT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

/**
 * 4 MB, que es el límite de cuerpo de una Server Action configurado en
 * `next.config.ts` — no una preferencia. Rechazarlo aquí da un mensaje que se
 * entiende; dejarlo pasar da un error de plataforma que no dice nada.
 */
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

export class RefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundError";
  }
}

export type PendingRefund = {
  id: string;
  bookingCode: string;
  guestName: string;
  amountCents: number;
  currency: string;
  reason: string | null;
  createdAt: string;
  /** Horas que lleva esperando. Es lo que vuelve rojo `/api/health` a las 24. */
  hoursWaiting: number;
};

/**
 * Lo que falta por pagar, lo más viejo primero.
 *
 * El orden no es estético: un reembolso que envejece es un huésped que ya sabe
 * que le toca devolución —se le avisó al cancelar— y no la ha visto.
 */
export async function listPendingRefunds(): Promise<PendingRefund[]> {
  const rows = await db.execute<{
    id: string;
    booking_code: string;
    guest_name: string;
    amount_cents: string;
    currency: string;
    reason: string | null;
    created_at: string;
    hours_waiting: string;
  }>(sql`
    select r.id,
           b.code                                        as booking_code,
           coalesce(c.full_name, 'sin nombre')           as guest_name,
           r.amount_cents::text,
           r.currency,
           r.reason,
           r.created_at::text,
           (extract(epoch from (now() - r.created_at)) / 3600)::int::text as hours_waiting
      from refunds r
      join payments  p on p.id = r.payment_id
      join bookings  b on b.id = p.booking_id
      left join customers c on c.id = b.customer_id
     where r.status = 'pending'
     order by r.created_at
  `);

  return rows.map((row) => ({
    id: row.id,
    bookingCode: row.booking_code,
    guestName: row.guest_name,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    reason: row.reason,
    createdAt: row.created_at,
    hoursWaiting: Number(row.hours_waiting),
  }));
}

export type SettleRefundInput = {
  refundId: string;
  /** Cómo salió el dinero. El enum es el mismo que el de `payments`. */
  method: "card" | "cash" | "transfer" | "oxxo" | "spei" | "other";
  /** Clave de rastreo del SPEI, folio de la transferencia, id de Stripe. */
  providerRef: string | null;
  notes: string | null;
  /** Quién lo ejecutó. Lo resuelve el servidor, nunca el formulario. */
  staffId: string;
  receipt: { name: string; mime: string; bytes: Buffer } | null;
};

/**
 * Marca una devolución como pagada.
 *
 * Lo que hace que esto sea un registro y no una casilla:
 *
 * - **Solo mueve filas en `pending`.** El `where` lo garantiza, así que dos
 *   personas que aprieten el botón a la vez no producen dos liquidaciones: la
 *   segunda no encuentra nada que actualizar y se le dice.
 * - **`settled_at` es del servidor** (`now()`), no del formulario. Una fecha
 *   que el usuario escribe es una fecha que el usuario se equivoca.
 * - **`settled_by` sale de la sesión**, no de un campo. Quien firma es quien
 *   entró.
 *
 * La restricción `refunds_succeeded_esta_explicado` respalda las tres desde la
 * base: aunque alguien escribiera el `UPDATE` a mano, no puede dejar un
 * `succeeded` sin cómo, cuándo y quién.
 */
export async function settleRefund(input: SettleRefundInput): Promise<void> {
  let receiptUrl: string | null = null;
  let receiptMime: string | null = null;

  if (input.receipt) {
    if (input.receipt.bytes.length === 0) {
      throw new RefundError("El comprobante llegó vacío.");
    }
    if (input.receipt.bytes.length > MAX_RECEIPT_BYTES) {
      throw new RefundError(
        "El comprobante pesa más de 4 MB. Es el límite de una petición; mándalo en menor resolución.",
      );
    }
    if (!RECEIPT_MIMES.has(input.receipt.mime)) {
      throw new RefundError("El comprobante tiene que ser una foto o un PDF.");
    }

    // El archivo se guarda **antes** del UPDATE. Si la subida falla, la fila
    // sigue en `pending` y se puede reintentar; al revés quedaría una
    // devolución liquidada apuntando a un comprobante que no existe.
    const extension = input.receipt.mime === "application/pdf" ? "pdf" : "img";
    receiptUrl = await mediaStorage().save(
      `reembolso-${randomUUID()}.${extension}`,
      input.receipt.bytes,
    );
    receiptMime = input.receipt.mime;
  }

  const rows = await db.execute<{ id: string }>(sql`
    update refunds
       set status       = 'succeeded',
           method       = ${input.method}::payment_method,
           settled_at   = now(),
           settled_by   = ${input.staffId}::uuid,
           provider_ref = ${input.providerRef},
           notes        = ${input.notes},
           receipt_url  = coalesce(${receiptUrl}, receipt_url),
           receipt_mime = coalesce(${receiptMime}, receipt_mime)
     where id = ${input.refundId}::uuid
       and status = 'pending'
    returning id
  `);

  if (rows.length === 0) {
    throw new RefundError(
      "Esa devolución ya no estaba pendiente. Vuelve a cargar la lista: puede que alguien más la haya registrado.",
    );
  }
}
