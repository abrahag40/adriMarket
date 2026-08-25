import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bookingVoucherQr, voucherUrl } from "./voucher";

/**
 * Comprobante QR · S7-6
 *
 * No se decodifica el QR aquí — sería probar la librería, no nuestro código.
 * Lo que sí es nuestro: que apunta a la página real de la reserva, en el
 * idioma correcto, y que nunca lleva datos del huésped adentro.
 */
describe("comprobante QR", () => {
  it("apunta a la página pública de la reserva, en el idioma de la reserva", () => {
    assert.match(voucherUrl("ABC123", "es"), /\/es\/reserva\/ABC123$/);
    assert.match(voucherUrl("ABC123", "en"), /\/en\/reserva\/ABC123$/);
  });

  it("nunca lleva el nombre, correo o monto del huésped", () => {
    const url = voucherUrl("ABC123", "es");
    assert.ok(!/[@]/.test(url), "no debe parecer un correo");
    assert.ok(url.length < 200, "solo lleva el código, no un payload de datos");
  });

  it("genera un PNG distinto por cada código de reserva", async () => {
    const a = await bookingVoucherQr("AAA111", "es");
    const b = await bookingVoucherQr("BBB222", "es");

    // Firma PNG: los primeros ocho bytes son siempre estos.
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(a.subarray(0, 8).equals(PNG_SIGNATURE));
    assert.ok(b.subarray(0, 8).equals(PNG_SIGNATURE));
    assert.ok(!a.equals(b), "dos reservas distintas no pueden compartir comprobante");
  });
});
