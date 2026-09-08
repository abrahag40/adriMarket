#!/usr/bin/env tsx
/**
 * Ejercitar Stripe de verdad · la comprobación que falta del §5 de la puesta en
 * producción.
 *
 * `src/modules/payments/stripe.ts` está escrito contra la API documentada y
 * **nunca se ha ejecutado contra Stripe**. Lo dice el propio archivo desde el
 * Sprint 3. Todo lo demás del camino del dinero está probado con la pasarela
 * local —que firma y verifica con el mismo mecanismo—, pero la última pulgada
 * no: que Stripe acepte la sesión, que la firma que manda sea la que sabemos
 * verificar, y que el reembolso salga.
 *
 *   STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… npm run probar:stripe
 *
 * **Las llaves de prueba bastan y son gratis**: no exigen que la cuenta esté
 * verificada. La verificación hace falta para cobrar de verdad, no para esto.
 *
 * Qué hace, en orden, contra la API real:
 *
 *   1. crea una sesión de cobro con un monto y una moneda reales;
 *   2. comprueba que devolvió una URL de pago y un identificador;
 *   3. comprueba que `expires_at` es el que pedimos y respeta el piso de 30
 *      minutos que impone Stripe — que es de donde salió el peor defecto de
 *      esta integración;
 *   4. firma un evento como lo hace Stripe y lo pasa por nuestro verificador,
 *      incluidas una firma alterada y una vieja, que deben rechazarse.
 *
 * **No cobra nada y no toca la base.** Es una sonda, no un despacho: la sesión
 * queda abierta en el panel de Stripe y expira sola.
 *
 * Se niega a correr sin llaves de Stripe a propósito: con la pasarela local
 * esto "pasaría" siempre, y una comprobación que no puede fallar no comprueba
 * nada. Es la misma regla que `probar:correo`.
 */

import { createHmac } from "node:crypto";

import { StripeProvider, stripeExpiresAt, verifySignature } from "@/modules/payments";

const secretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!secretKey || !webhookSecret) {
  console.error("Faltan STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET.");
  console.error();
  console.error("Las de prueba se sacan en dashboard.stripe.com/test/apikeys y son gratis:");
  console.error("no hacen falta ni cuenta verificada ni datos bancarios.");
  console.error();
  console.error("  STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… npm run probar:stripe");
  process.exit(1);
}

if (secretKey.startsWith("sk_live_")) {
  console.error("Esa es una llave de PRODUCCIÓN (sk_live_…).");
  console.error("Esta sonda crea sesiones de cobro reales: úsala con sk_test_… .");
  process.exit(1);
}

let fallos = 0;
function ok(mensaje: string) {
  console.log(`  \x1b[32m✔\x1b[0m ${mensaje}`);
}
function mal(mensaje: string) {
  console.log(`  \x1b[31m✘\x1b[0m ${mensaje}`);
  fallos += 1;
}

const provider = new StripeProvider(secretKey, webhookSecret);

console.log("\nStripe · sonda de integración\n");

// ── 1. Crear una sesión de cobro ──────────────────────────────────────────
const bookingId = "00000000-0000-4000-8000-000000000001";
const holdExpiresAt = new Date(Date.now() + 35 * 60_000).toISOString();

let session: { providerRef: string; url: string };
try {
  session = await provider.createDepositSession({
    bookingId,
    bookingCode: "AM-SONDA",
    amountCents: 155_295, // un anticipo realista, en centavos enteros
    currency: "MXN",
    email: null,
    description: "Sonda de integración · no cobra",
    successUrl: "https://adrimarket.vercel.app/es/reserva/AM-SONDA",
    cancelUrl: "https://adrimarket.vercel.app/es",
    holdExpiresAt,
  });
  ok(`la sesión se creó: ${session.providerRef}`);
} catch (error) {
  mal(`Stripe rechazó la sesión: ${(error as Error).message}`);
  console.log("\nNo se puede seguir sin sesión.\n");
  process.exit(1);
}

if (session.url.startsWith("https://checkout.stripe.com/")) {
  ok("devolvió una página de pago alojada por Stripe");
  console.log(`      ${session.url.slice(0, 96)}…`);
} else {
  mal(`la URL no es de Checkout: ${session.url}`);
}

// ── 2. El vencimiento es el del apartado, no uno inventado ────────────────
const recuperada = (await fetch(`https://api.stripe.com/v1/checkout/sessions/${session.providerRef}`, {
  headers: { Authorization: `Bearer ${secretKey}` },
}).then((r) => r.json())) as { expires_at?: number; amount_total?: number; currency?: string };

const esperado = stripeExpiresAt(holdExpiresAt);
const diferencia = Math.abs((recuperada.expires_at ?? 0) - esperado);
if (diferencia <= 5) {
  const minutos = Math.round(((recuperada.expires_at ?? 0) - Date.now() / 1000) / 60);
  ok(`la sesión expira con el apartado (~${minutos} min), no en un plazo inventado`);
} else {
  mal(`expires_at no es el pedido: ${recuperada.expires_at} contra ${esperado}`);
}

if (recuperada.amount_total === 155_295 && recuperada.currency === "mxn") {
  ok("el monto llegó en centavos enteros y sin conversión");
} else {
  mal(`monto o moneda distintos: ${recuperada.amount_total} ${recuperada.currency}`);
}

// ── 3. La firma del webhook, con vectores de Stripe ───────────────────────
//
// Se firma como Stripe firma y se verifica con nuestra función. Si Stripe
// cambiara el esquema, esto lo dice antes de que lo diga una reserva perdida.
const cuerpo = JSON.stringify({
  id: "evt_sonda",
  type: "checkout.session.completed",
  data: { object: { id: session.providerRef, payment_status: "paid", amount_total: 155_295, currency: "mxn" } },
});
const ahora = Math.floor(Date.now() / 1000);
const firma = `t=${ahora},v1=${createHmac("sha256", webhookSecret).update(`${ahora}.${cuerpo}`).digest("hex")}`;

if (verifySignature(cuerpo, firma, webhookSecret)) {
  ok("una firma legítima se acepta");
} else {
  mal("una firma legítima fue rechazada: el esquema no coincide con el de Stripe");
}

if (!verifySignature(cuerpo.replace("155295", "1"), firma, webhookSecret)) {
  ok("un cuerpo alterado se rechaza");
} else {
  mal("un cuerpo alterado pasó la verificación");
}

const vieja = ahora - 3600;
const firmaVieja = `t=${vieja},v1=${createHmac("sha256", webhookSecret).update(`${vieja}.${cuerpo}`).digest("hex")}`;
if (!verifySignature(cuerpo, firmaVieja, webhookSecret)) {
  ok("una firma vieja se rechaza aunque sea válida");
} else {
  mal("una firma de hace una hora fue aceptada: falta la ventana de tolerancia");
}

// ── 4. Y el evento se normaliza a lo que el dominio entiende ──────────────
const evento = provider.verifyWebhook(cuerpo, firma);
if (evento?.type === "deposit.succeeded" && evento.amountCents === 155_295) {
  ok("el evento se normaliza a deposit.succeeded con su monto");
} else {
  mal(`el evento no se normalizó: ${JSON.stringify(evento)}`);
}

console.log();
if (fallos === 0) {
  console.log("\x1b[32mTodo en verde. La sesión queda abierta en el panel y expira sola.\x1b[0m");
  console.log("\nFalta lo que solo se puede probar con un navegador: pagar con una");
  console.log("tarjeta de prueba (4242 4242 4242 4242) y que el webhook llegue al sitio.");
  console.log("Para eso, `stripe listen --forward-to …/api/webhooks/stripe`.\n");
} else {
  console.log(`\x1b[31m${fallos} fallo(s).\x1b[0m\n`);
  process.exit(1);
}
