import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { gatewayState, resetPaymentProvider } from "./index";

/**
 * En qué estado está el cobro.
 *
 * Estas pruebas existen por un defecto que llegó a producción: el simulador de
 * pagos —el botón que fabrica un evento "pagado" sin que entre dinero— se
 * mostraba con la única condición de que la pasarela fuera la local, y
 * producción corre con la local porque las llaves de Stripe nunca llegaron.
 *
 * El caso que importa es el tercero: pasarela local **sin** el permiso
 * explícito. Es la forma de producción, y tiene que dar `closed`.
 */

const ORIGINAL = { ...process.env };

function conEntorno(vars: Record<string, string | undefined>): void {
  for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYMENT_SIMULATOR"]) {
    delete process.env[key];
  }
  process.env.LOCAL_WEBHOOK_SECRET = "secreto_de_prueba";
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetPaymentProvider();
}

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetPaymentProvider();
});

describe("estado de la pasarela", () => {
  it("con llaves de Stripe cobra de verdad", () => {
    conEntorno({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" });
    assert.equal(gatewayState(), "stripe");
  });

  it("las llaves de Stripe ganan aunque el simulador esté encendido", () => {
    conEntorno({
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      PAYMENT_SIMULATOR: "si",
    });
    assert.equal(gatewayState(), "stripe", "con dinero real no se simula nada");
  });

  it("la pasarela local con permiso explícito permite simular", () => {
    conEntorno({ PAYMENT_SIMULATOR: "si" });
    assert.equal(gatewayState(), "simulator");
  });

  it("la pasarela local SIN permiso cierra el checkout", () => {
    conEntorno({});
    assert.equal(
      gatewayState(),
      "closed",
      "es la forma de producción: sin llaves y sin simulador, nadie cobra y nadie finge",
    );
  });

  it("un valor que no es exactamente 'si' no habilita nada", () => {
    // Un `PAYMENT_SIMULATOR=false` o `=0` heredado de otro proyecto no debe
    // leerse como "encendido" por el simple hecho de estar definido.
    for (const valor of ["", "no", "false", "0", "true", "SI", "sí"]) {
      conEntorno({ PAYMENT_SIMULATOR: valor });
      assert.equal(gatewayState(), "closed", `"${valor}" no debería habilitar el simulador`);
    }
  });
});
