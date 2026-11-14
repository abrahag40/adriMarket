import { randomUUID } from "node:crypto";

import { gatewayFeeCents, STRIPE_MX } from "@/modules/pricing/resale";

import { signPayload, verifySignature } from "./signature";
import type {
  ChargeDetails,
  CheckoutSession,
  DepositRequest,
  PaymentEventPayload,
  PaymentProvider,
  RefundRequest,
} from "./types";

/**
 * Pasarela local, para desarrollo y para el pipeline.
 *
 * **No es un doble de prueba que responda "sí" a todo.** Firma sus eventos con
 * el mismo mecanismo que la pasarela real y los manda por el mismo webhook, así
 * que el camino que se ejercita —verificación de firma, idempotencia por
 * identificador de evento, confirmación transaccional, avisos— es exactamente el
 * de producción. Lo único que no ocurre es el cobro.
 *
 * Existe porque la cuenta del cliente sigue en verificación y el sprint no podía
 * quedarse esperando. También resuelve un problema permanente: el pipeline no
 * debería depender de un servicio externo para verificar el flujo de reserva.
 */
export class LocalProvider implements PaymentProvider {
  readonly name = "local";

  constructor(private readonly webhookSecret: string) {}

  async createDepositSession(request: DepositRequest): Promise<CheckoutSession> {
    const providerRef = `local_${randomUUID()}`;
    const url = new URL(request.successUrl);
    // La "página de la pasarela" es la misma página de la reserva, con los datos
    // que necesita para simular el resultado del cobro.
    url.searchParams.set("simular", "1");
    url.searchParams.set("ref", providerRef);
    url.searchParams.set("monto", String(request.amountCents));
    return { providerRef, url: url.toString() };
  }

  /** Construye un evento firmado, como lo haría la pasarela real. */
  buildEvent(input: {
    type: "deposit.succeeded" | "deposit.failed";
    providerRef: string;
    amountCents: number;
    currency: string;
    bookingId: string;
  }): { body: string; signature: string } {
    const body = JSON.stringify({
      id: `evt_local_${randomUUID()}`,
      type: input.type,
      data: {
        object: {
          id: input.providerRef,
          amount_total: input.amountCents,
          currency: input.currency.toLowerCase(),
          payment_status: input.type === "deposit.succeeded" ? "paid" : "unpaid",
          metadata: { booking_id: input.bookingId },
        },
      },
    });

    return {
      body,
      signature: signPayload(body, this.webhookSecret, Math.floor(Date.now() / 1000)),
    };
  }

  /**
   * El simulador no tiene cargo que leer: responde lo que cobraría Stripe con
   * una tarjeta extranjera, la peor para el margen. Sirve para recorrer la
   * liquidación entera en local y en la vista previa; el panel marca estos
   * cobros como simulados (`payments.provider = 'local'`).
   */
  async chargeDetails(request: { providerRef: string; amountCents: number; currency: string }): Promise<ChargeDetails> {
    const feeCents = gatewayFeeCents(request.amountCents, STRIPE_MX.extranjera);
    return { cardCountry: "US", feeCents, netCents: request.amountCents - feeCents };
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null): PaymentEventPayload | null {
    if (!verifySignature(rawBody, signatureHeader, this.webhookSecret)) return null;

    let event: {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event.id) return null;

    const object = event.data?.object ?? {};
    return {
      eventId: event.id,
      type:
        event.type === "deposit.succeeded"
          ? "deposit.succeeded"
          : event.type === "deposit.failed"
            ? "deposit.failed"
            : "unknown",
      providerRef: typeof object.id === "string" ? object.id : null,
      amountCents: typeof object.amount_total === "number" ? object.amount_total : null,
      currency: typeof object.currency === "string" ? object.currency.toUpperCase() : null,
      raw: event,
    };
  }

  async refund(request: RefundRequest): Promise<{ providerRef: string }> {
    return { providerRef: `local_refund_${request.providerRef}` };
  }
}
