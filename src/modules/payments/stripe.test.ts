import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { platformFeeCents, StripeProvider } from "./stripe";

/**
 * Stripe Connect · cargo directo en la cuenta del cliente con la comisión de la
 * plataforma.
 *
 * No habla con Stripe: intercepta `fetch` y revisa lo que se le mandaría. Lo que
 * se comprueba aquí es lo que mueve dinero de lugar —a nombre de quién se cobra y
 * cuánto se queda la plataforma—; que Stripe lo acepte se comprueba en sandbox.
 */

type Llamada = { url: string; headers: Record<string, string>; body: URLSearchParams };
const original = globalThis.fetch;
let llamadas: Llamada[] = [];

function interceptar(respuestas: unknown[]) {
  llamadas = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    llamadas.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: new URLSearchParams(String(init?.body ?? "")),
    });
    return new Response(JSON.stringify(respuestas.shift() ?? {}), { status: 200 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = original;
});

const pedido = {
  bookingId: "b1",
  bookingCode: "CT-0001",
  amountCents: 85_000,
  totalCents: 85_000,
  currency: "MXN",
  email: null,
  description: "Reserva CT-0001",
  successUrl: "https://x/ok",
  cancelUrl: "https://x/no",
  holdExpiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
};

describe("comisión de la plataforma", () => {
  it("2.5% del total, en centavos enteros", () => {
    assert.equal(platformFeeCents(85_000, 85_000, 250), 2_125);
  });
  it("con anticipo se calcula sobre el total y se cobra del anticipo", () => {
    assert.equal(platformFeeCents(25_500, 85_000, 250), 2_125);
  });
  it("nunca más que lo que pasa por la pasarela", () => {
    assert.equal(platformFeeCents(1_000, 85_000, 250), 1_000);
  });
  it("sin porcentaje no hay comisión", () => {
    assert.equal(platformFeeCents(85_000, 85_000, 0), 0);
    assert.equal(platformFeeCents(85_000, 85_000, Number.NaN), 0);
  });
});

describe("Stripe sin Connect: el sitio cobra en su propia cuenta, como antes", () => {
  it("no manda Stripe-Account ni comisión", async () => {
    interceptar([{ id: "cs_1", url: "https://checkout" }]);
    await new StripeProvider("sk_test_x", "whsec_x").createDepositSession(pedido);
    assert.equal(llamadas[0]!.headers["Stripe-Account"], undefined);
    assert.equal(llamadas[0]!.body.get("payment_intent_data[application_fee_amount]"), null);
  });
});

describe("Stripe con Connect: cargo directo en la cuenta del cliente", () => {
  const conectado = () =>
    new StripeProvider("sk_test_plataforma", "whsec_x", { connectedAccount: "acct_abel", platformFeeBps: 250 });

  it("el cobro va a nombre de la cuenta del cliente, con la comisión de la plataforma", async () => {
    interceptar([{ id: "cs_1", url: "https://checkout" }]);
    await conectado().createDepositSession(pedido);
    const [c] = llamadas;
    assert.equal(c!.headers["Stripe-Account"], "acct_abel");
    assert.equal(c!.body.get("payment_intent_data[application_fee_amount]"), "2125");
    assert.equal(c!.body.get("line_items[0][price_data][unit_amount]"), "85000");
    assert.equal(c!.headers["Idempotency-Key"], "deposit:b1");
  });

  it("el reembolso se pide sobre la misma cuenta y, por omisión, no devuelve la comisión", async () => {
    interceptar([{ payment_intent: "pi_1" }, { id: "re_1" }]);
    await conectado().refund({ providerRef: "cs_1", amountCents: 85_000, reason: "operador", refundId: "r1" });
    assert.ok(llamadas.every((l) => l.headers["Stripe-Account"] === "acct_abel"));
    assert.equal(llamadas[1]!.body.get("refund_application_fee"), null);
  });

  it("si se configura, el reembolso también devuelve la comisión", async () => {
    interceptar([{ payment_intent: "pi_1" }, { id: "re_1" }]);
    await new StripeProvider("sk", "whsec", {
      connectedAccount: "acct_abel",
      platformFeeBps: 250,
      refundPlatformFee: true,
    }).refund({ providerRef: "cs_1", amountCents: 85_000, reason: "operador", refundId: "r1" });
    assert.equal(llamadas[1]!.body.get("refund_application_fee"), "true");
  });
});
