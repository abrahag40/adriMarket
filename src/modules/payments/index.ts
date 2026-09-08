import { LocalProvider } from "./local";
import { StripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export * from "./types";
export { LocalProvider } from "./local";
// La pasarela real y su cálculo de vencimiento se exportan para `probar:stripe`:
// una sonda que arma la llamada por su cuenta deja de parecerse a la real en
// cuanto alguien toca una de las dos.
export { StripeProvider, stripeExpiresAt } from "./stripe";
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

/**
 * En qué estado está el cobro. Tres, y solo tres:
 *
 * - `stripe`   · hay llaves reales: el dinero se mueve.
 * - `simulator`· pasarela local **y** `PAYMENT_SIMULATOR=si`. Desarrollo y la
 *                barra de verificación, donde el botón que fabrica un evento de
 *                pago pagado es justamente lo que hay que ejercitar.
 * - `closed`   · pasarela local sin ese permiso explícito. Nadie puede cobrar y
 *                —esto es lo que importa— nadie puede fingir que pagó.
 *
 * Existe por un defecto real, no por prolijidad. Hasta el 2026-09-07 el
 * simulador se mostraba con la única condición de que la pasarela fuera la
 * local, y producción corre con la local porque las llaves de Stripe nunca
 * llegaron. Con `robots.txt` en `Allow: /` y 86 URLs en el sitemap, eso quería
 * decir que cualquiera que entrara al sitio podía apretar "Simular pago
 * exitoso" y salir con una reserva confirmada: inventario real consumido,
 * correo real enviado, cero pesos cobrados.
 *
 * El permiso es una variable que hay que **poner**, no una que haya que quitar.
 * Un despliegue que se olvida de algo se queda en `closed`, que es el estado
 * seguro; la alternativa —una bandera de "modo producción"— se rompe en la
 * dirección contraria y ese es exactamente el error que ya se cometió.
 */
export type GatewayState = "stripe" | "simulator" | "closed";

/**
 * **Esta función no lanza, nunca.** Lee la configuración; no construye la
 * pasarela.
 *
 * La primera versión preguntaba `paymentProvider().name === "stripe"`, y
 * `paymentProvider()` lanza a propósito cuando no hay ninguna configuración de
 * pagos —lo cual está bien para el checkout: sin pasarela no hay nada que
 * cobrar—. Pero `gatewayState()` la usa `/api/health`, y un chequeo de salud
 * que revienta cuando algo no está configurado no informa de nada: responde 500
 * y se lleva por delante el estado del worker, de los avisos y de los
 * reembolsos, que sí se sabían. Lo atrapó la CI, que corre sin llaves de pago.
 *
 * Un reporte describe la realidad; no exige que la realidad sea correcta.
 */
export function gatewayState(): GatewayState {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) return "stripe";

  // Simular exige dos cosas, no una: el permiso explícito **y** que la pasarela
  // local se pueda construir de verdad. Sin `LOCAL_WEBHOOK_SECRET` no hay con
  // qué firmar el evento, así que ofrecer el botón sería ofrecer un error.
  if (process.env.PAYMENT_SIMULATOR === "si" && process.env.LOCAL_WEBHOOK_SECRET) {
    return "simulator";
  }

  // Incluye el caso "no hay ninguna configuración de pagos". Nadie cobra y
  // nadie finge: es exactamente lo que `closed` significa.
  return "closed";
}

/** Para las pruebas, que cambian de proveedor entre casos. */
export function resetPaymentProvider(): void {
  cached = null;
}
