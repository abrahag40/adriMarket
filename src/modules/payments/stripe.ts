import { verifySignature } from "./signature";
import {
  PaymentProviderError,
  type CheckoutSession,
  type DepositRequest,
  type PaymentEventPayload,
  type PaymentProvider,
  type RefundRequest,
} from "./types";

/**
 * Stripe, con sesiones de pago alojadas.
 *
 * Se usa Checkout —la página del proveedor— y no campos incrustados: los datos
 * de tarjeta nunca pasan por nuestro servidor y el cumplimiento PCI se queda en
 * su nivel más simple. Cuesta un redireccionamiento y ahorra una auditoría.
 *
 * Se habla con la API por HTTP directo en lugar del SDK. Son tres llamadas y el
 * formato es estable; una dependencia menos en el camino del dinero.
 *
 * ADVERTENCIA HONESTA: esta implementación está escrita contra la API
 * documentada pero **no se ha ejecutado contra Stripe**, porque la cuenta del
 * cliente sigue en verificación. Lo que sí está verificado es la parte que puede
 * verificarse sin cuenta: la firma del webhook (signature.test.ts) y todo el
 * flujo de reserva, confirmación y avisos, ejercitado con el proveedor local.
 * La primera prueba con llaves reales es tarea del día 1 del Sprint 4.
 */

const API = "https://api.stripe.com/v1";

export class StripeProvider implements PaymentProvider {
  readonly name = "stripe";

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  private async post(path: string, form: Record<string, string>): Promise<unknown> {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Sin esto, un reintento por timeout puede cobrar dos veces.
        "Idempotency-Key": form["metadata[idempotency_key]"] ?? crypto.randomUUID(),
      },
      body: new URLSearchParams(form).toString(),
    });

    const body: unknown = await response.json();
    if (!response.ok) {
      const detail =
        typeof body === "object" && body !== null && "error" in body
          ? JSON.stringify((body as { error: unknown }).error)
          : `HTTP ${response.status}`;
      throw new PaymentProviderError(
        `stripe ${path}: ${detail}`,
        "No pudimos iniciar el pago. Inténtalo de nuevo en un momento.",
      );
    }
    return body;
  }

  async createDepositSession(request: DepositRequest): Promise<CheckoutSession> {
    const form: Record<string, string> = {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": request.currency.toLowerCase(),
      // El monto va en centavos enteros, que es como se guarda en la base: no
      // hay conversión y por lo tanto no hay redondeo que perder.
      "line_items[0][price_data][unit_amount]": String(request.amountCents),
      "line_items[0][price_data][product_data][name]": request.description,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.bookingId,
      "metadata[booking_id]": request.bookingId,
      "metadata[booking_code]": request.bookingCode,
      "metadata[idempotency_key]": `deposit:${request.bookingId}`,
      // El anticipo expira con el apartado: una sesión que sobrevive al hold
      // permitiría pagar por fechas que ya se liberaron.
      expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
    };
    if (request.email) form.customer_email = request.email;

    const session = (await this.post("/checkout/sessions", form)) as {
      id?: string;
      url?: string;
    };

    if (!session.id || !session.url) {
      throw new PaymentProviderError(
        `stripe: respuesta sin id o url: ${JSON.stringify(session)}`,
        "No pudimos iniciar el pago. Inténtalo de nuevo en un momento.",
      );
    }

    return { providerRef: session.id, url: session.url };
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

    // Solo interesa el evento que confirma el cobro. Los demás se guardan para
    // auditoría pero no mueven ninguna reserva.
    const type =
      event.type === "checkout.session.completed" && object.payment_status === "paid"
        ? "deposit.succeeded"
        : event.type === "checkout.session.expired" ||
            event.type === "payment_intent.payment_failed"
          ? "deposit.failed"
          : "unknown";

    return {
      eventId: event.id,
      type,
      providerRef: typeof object.id === "string" ? object.id : null,
      amountCents: typeof object.amount_total === "number" ? object.amount_total : null,
      currency: typeof object.currency === "string" ? object.currency.toUpperCase() : null,
      raw: event,
    };
  }

  async refund(request: RefundRequest): Promise<{ providerRef: string }> {
    // La sesión de Checkout no se reembolsa: se reembolsa su intento de pago.
    const session = (await this.post(`/checkout/sessions/${request.providerRef}`, {})) as {
      payment_intent?: string;
    };
    if (!session.payment_intent) {
      throw new PaymentProviderError(
        `stripe: la sesión ${request.providerRef} no tiene intento de pago`,
        "No pudimos procesar el reembolso. La operación lo hará manualmente.",
      );
    }

    const refund = (await this.post("/refunds", {
      payment_intent: session.payment_intent,
      amount: String(request.amountCents),
      "metadata[reason]": request.reason,
    })) as { id?: string };

    return { providerRef: refund.id ?? "" };
  }
}
