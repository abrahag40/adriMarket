/**
 * Frontera con las pasarelas de pago.
 *
 * Existe por dos razones. La primera es la del plan: agregar Mercado Pago en el
 * Release 2 debe ser escribir una clase, no tocar el checkout. La segunda
 * apareció al construir este sprint y resultó más valiosa — permite ejercitar el
 * flujo completo, incluido el webhook firmado, sin depender de que la cuenta del
 * cliente esté aprobada. El proveedor local no es un doble de prueba: firma y
 * verifica con el mismo mecanismo que el real.
 */

export type CheckoutSession = {
  /** Referencia del proveedor. Se guarda en `payments.provider_ref`. */
  providerRef: string;
  /** A dónde se manda al huésped para pagar. */
  url: string;
};

export type DepositRequest = {
  bookingId: string;
  bookingCode: string;
  amountCents: number;
  currency: string;
  /** Correo del titular, para que la pasarela mande su propio recibo. */
  email: string | null;
  description: string;
  successUrl: string;
  cancelUrl: string;
};

/** Lo que el proveedor nos dice que pasó, ya normalizado. */
export type PaymentEventPayload = {
  /** Identificador del evento en el proveedor. Es la llave de idempotencia. */
  eventId: string;
  type: "deposit.succeeded" | "deposit.failed" | "unknown";
  providerRef: string | null;
  amountCents: number | null;
  currency: string | null;
  /** Lo que el proveedor mandó, tal cual, para poder auditar después. */
  raw: unknown;
};

export type RefundRequest = {
  providerRef: string;
  amountCents: number;
  reason: string;
};

export interface PaymentProvider {
  readonly name: string;

  /** Crea la sesión de cobro del anticipo. No confía en ningún monto del cliente. */
  createDepositSession(request: DepositRequest): Promise<CheckoutSession>;

  /**
   * Verifica la firma y normaliza el evento. Devuelve null si la firma no es
   * válida: quien no puede firmar no puede confirmar reservas.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null): PaymentEventPayload | null;

  refund(request: RefundRequest): Promise<{ providerRef: string }>;
}

/** Error de la pasarela que sí se le puede contar al huésped. */
export class PaymentProviderError extends Error {
  readonly guestMessage: string;

  constructor(detail: string, guestMessage: string) {
    super(detail);
    this.name = "PaymentProviderError";
    this.guestMessage = guestMessage;
  }
}
