"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { processPaymentWebhook } from "@/modules/booking/webhook";
import { gatewayState, LocalProvider, paymentProvider } from "@/modules/payments";

/**
 * Simulación del resultado del cobro, solo con la pasarela local.
 *
 * Construye un evento firmado y lo procesa por el mismo camino que usaría el
 * webhook real: verificación de firma, registro idempotente y confirmación
 * transaccional. Es la única forma de ejercitar el flujo completo mientras la
 * cuenta del cliente sigue en verificación.
 *
 * **El candado está aquí, no en la página.** Antes la única condición era que la
 * pasarela fuera la local, y producción corre con la local: cualquiera podía
 * confirmar una reserva sin pagar. Ahora hace falta `PAYMENT_SIMULATOR=si`,
 * que producción no tiene.
 *
 * Que la página no dibuje el botón no cuenta como permiso —una Server Action se
 * puede invocar por su identificador sin pasar por la página—, y ese es
 * justamente el invariante que el proyecto ya tenía escrito: cada acción vuelve
 * a preguntar quién la pide.
 */
export async function simulatePayment(form: FormData): Promise<void> {
  const provider = paymentProvider();
  if (!(provider instanceof LocalProvider) || gatewayState() !== "simulator") {
    throw new Error(
      "La simulación de pago no está habilitada. Requiere la pasarela local y PAYMENT_SIMULATOR=si.",
    );
  }

  const code = String(form.get("code") ?? "");
  const outcome = String(form.get("outcome") ?? "success");
  const providerRef = String(form.get("ref") ?? "");

  const rows = await db.execute<{ id: string; deposit_cents: string; currency: string }>(sql`
    select id, deposit_cents, currency from bookings where code = ${code} limit 1
  `);
  const booking = rows[0];
  if (!booking) throw new Error(`no existe la reserva ${code}`);

  const event = provider.buildEvent({
    type: outcome === "success" ? "deposit.succeeded" : "deposit.failed",
    providerRef: providerRef || `local_${booking.id}`,
    amountCents: Number(booking.deposit_cents),
    currency: booking.currency,
    bookingId: booking.id,
  });

  await processPaymentWebhook(event.body, event.signature);

  revalidatePath(`/es/reserva/${code}`);
  revalidatePath(`/en/reserva/${code}`);
}
