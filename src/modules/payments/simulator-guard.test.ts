import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { simulatePayment } from "@/app/[locale]/reserva/[code]/actions";

import { resetPaymentProvider } from "./index";

/**
 * El candado de la Server Action, probado por separado del de la página.
 *
 * Son dos capas y solo una es un permiso. Que la página no dibuje el botón es
 * cosmética: una Server Action se invoca por su identificador, sin pasar por la
 * página que la contiene. Si esta prueba desaparece, lo que queda es una
 * cerradura pintada.
 *
 * Se llama con un FormData vacío a propósito: si la acción llegara a mirar el
 * formulario, ya habría pasado el candado, y el fallo diría otra cosa —"no
 * existe la reserva"— en vez de negarse.
 */

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetPaymentProvider();
});

describe("candado del simulador de pagos", () => {
  it("se niega con la pasarela local si falta PAYMENT_SIMULATOR", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.PAYMENT_SIMULATOR;
    process.env.LOCAL_WEBHOOK_SECRET = "secreto_de_prueba";
    resetPaymentProvider();

    await assert.rejects(
      () => simulatePayment(new FormData()),
      /no está habilitada/,
      "es la forma de producción: sin el permiso explícito nadie confirma sin pagar",
    );
  });

  it("se niega también con llaves de Stripe presentes", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    process.env.PAYMENT_SIMULATOR = "si";
    resetPaymentProvider();

    await assert.rejects(
      () => simulatePayment(new FormData()),
      /no está habilitada/,
      "con dinero real de por medio, el simulador no existe ni pidiéndolo",
    );
  });
});
