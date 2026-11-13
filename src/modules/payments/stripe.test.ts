import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { parseChargeDetails, platformFeeCents, StripeProvider } from "./stripe";

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

/**
 * Liquidación de reventa (decisión 0026): qué se lee del cargo.
 *
 * La forma es la de la API de Stripe: sesión → `payment_intent` →
 * `latest_charge` → `payment_method_details.card.country` y
 * `balance_transaction.fee`, que ya suma la comisión y su IVA (`fee_details`).
 * https://docs.stripe.com/api/charges/object y /api/balance_transactions/object
 */
describe("lo que cobró Stripe de verdad, leído del cargo", () => {
  const sesion = (charge: unknown) => ({ id: "cs_1", payment_intent: { id: "pi_1", latest_charge: charge } });
  const cargo = {
    id: "ch_1",
    amount: 161_793,
    currency: "mxn",
    payment_method_details: { type: "card", card: { brand: "visa", country: "US" } },
    balance_transaction: {
      id: "txn_1",
      amount: 161_793,
      currency: "mxn",
      fee: 8_043,
      fee_details: [
        { amount: 6_934, currency: "mxn", type: "stripe_fee" },
        { amount: 1_109, currency: "mxn", type: "tax" },
      ],
      net: 153_750,
    },
  };

  it("pide la sesión con el cargo y su registro contable en una sola llamada", async () => {
    interceptar([sesion(cargo)]);
    const detalle = await new StripeProvider("sk", "whsec").chargeDetails({
      providerRef: "cs_1",
      amountCents: 161_793,
      currency: "MXN",
    });
    assert.match(llamadas[0]!.url, /\/checkout\/sessions\/cs_1\?expand\[\]=payment_intent\.latest_charge\.balance_transaction$/);
    assert.deepEqual(detalle, { cardCountry: "US", feeCents: 8_043, netCents: 153_750 });
  });

  it("si el registro contable no vino expandido, la comisión queda sin dato, no en cero", () => {
    assert.deepEqual(parseChargeDetails(sesion({ ...cargo, balance_transaction: "txn_1" }), "MXN"), {
      cardCountry: "US",
      feeCents: null,
      netCents: null,
    });
  });

  it("una comisión en otra moneda no se guarda: compararla mezclaría pesos con dólares", () => {
    const enDolares = { ...cargo, balance_transaction: { ...cargo.balance_transaction, currency: "usd" } };
    assert.equal(parseChargeDetails(sesion(enDolares), "MXN").feeCents, null);
  });

  it("sin cargo todavía, nada", () => {
    assert.deepEqual(parseChargeDetails(sesion(null), "MXN"), { cardCountry: null, feeCents: null, netCents: null });
    assert.deepEqual(parseChargeDetails({ id: "cs_1", payment_intent: "pi_1" }, "MXN").feeCents, null);
  });

  it("un país que no es código ISO no se guarda", () => {
    const raro = { ...cargo, payment_method_details: { card: { country: "usa" } } };
    assert.equal(parseChargeDetails(sesion(raro), "MXN").cardCountry, null);
  });
});
