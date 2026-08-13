import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signPayload, verifySignature } from "./signature";

/**
 * Pruebas de la verificación de firma.
 *
 * Es la única parte de la integración de pagos que se puede verificar de verdad
 * sin cuenta del proveedor, y da la casualidad de que es la más importante:
 * quien logre pasar esta función confirma reservas gratis.
 */

const SECRET = "whsec_prueba_1234567890";
const BODY = '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{}}}';
const NOW = new Date("2026-11-10T12:00:00Z");
const TS = Math.floor(NOW.getTime() / 1000);

describe("firma de webhooks", () => {
  it("acepta una firma legítima", () => {
    const header = signPayload(BODY, SECRET, TS);
    assert.equal(verifySignature(BODY, header, SECRET, { now: NOW }), true);
  });

  it("rechaza un cuerpo alterado", () => {
    const header = signPayload(BODY, SECRET, TS);
    const alterado = BODY.replace('"evt_1"', '"evt_2"');
    assert.equal(verifySignature(alterado, header, SECRET, { now: NOW }), false);
  });

  it("rechaza un secreto distinto", () => {
    const header = signPayload(BODY, "otro_secreto", TS);
    assert.equal(verifySignature(BODY, header, SECRET, { now: NOW }), false);
  });

  it("rechaza una firma vieja aunque sea válida", () => {
    // Un webhook legítimo capturado hace una hora no debe servir para siempre.
    const viejo = TS - 3600;
    const header = signPayload(BODY, SECRET, viejo);
    assert.equal(verifySignature(BODY, header, SECRET, { now: NOW }), false);
    // Con tolerancia amplia, la misma firma sí pasa: lo que falla es la edad.
    assert.equal(
      verifySignature(BODY, header, SECRET, { now: NOW, toleranceSeconds: 7200 }),
      true,
    );
  });

  it("rechaza una marca de tiempo del futuro", () => {
    const header = signPayload(BODY, SECRET, TS + 3600);
    assert.equal(verifySignature(BODY, header, SECRET, { now: NOW }), false);
  });

  it("acepta varios digests, para poder rotar el secreto", () => {
    const nuevo = signPayload(BODY, SECRET, TS).split(",")[1] ?? "";
    const viejo = signPayload(BODY, "secreto_anterior", TS).split(",")[1] ?? "";
    // El proveedor firma con los dos durante la rotación.
    const header = `t=${TS},${viejo},${nuevo}`;
    assert.equal(verifySignature(BODY, header, SECRET, { now: NOW }), true);
  });

  it("rechaza cabeceras ausentes o mal formadas", () => {
    for (const header of [null, "", "basura", `t=${TS}`, "v1=abc", `t=abc,v1=${"0".repeat(64)}`]) {
      assert.equal(
        verifySignature(BODY, header, SECRET, { now: NOW }),
        false,
        `debió rechazar: ${String(header)}`,
      );
    }
  });

  it("no se salta la verificación cuando falta el secreto", () => {
    const header = signPayload(BODY, SECRET, TS);
    assert.equal(verifySignature(BODY, header, "", { now: NOW }), false);
  });
});
