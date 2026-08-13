import { LocalProvider } from "./local";
import { StripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export * from "./types";
export { LocalProvider } from "./local";
export { signPayload, verifySignature } from "./signature";

/**
 * Elige la pasarela según la configuración.
 *
 * Con llaves de Stripe presentes se usa Stripe; sin ellas, la local. La
 * selección es por configuración y no por bandera de "modo desarrollo": así no
 * existe la posibilidad de que producción caiga en la local por un booleano mal
 * puesto — sin llaves no hay nada que cobrar, y con llaves siempre se usa la
 * real.
 */
let cached: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (secretKey && stripeWebhookSecret) {
    cached = new StripeProvider(secretKey, stripeWebhookSecret);
    return cached;
  }

  const localSecret = process.env.LOCAL_WEBHOOK_SECRET;
  if (!localSecret) {
    throw new Error(
      "Falta configuración de pagos: define STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET, " +
        "o LOCAL_WEBHOOK_SECRET para desarrollo. Ver .env.example.",
    );
  }

  cached = new LocalProvider(localSecret);
  return cached;
}

/** Para las pruebas, que cambian de proveedor entre casos. */
export function resetPaymentProvider(): void {
  cached = null;
}
