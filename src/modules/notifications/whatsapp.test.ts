import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BookingNotification } from "./templates";
import { WHATSAPP_TEMPLATES, buildWhatsApp } from "./whatsapp";

/**
 * Plantillas de WhatsApp · S7-1
 *
 * Sin base de datos: lo que se prueba es la forma del mensaje, que es justo lo
 * que Meta valida y lo que no se puede corregir después de que el mensaje salió.
 */

const BASE: BookingNotification = {
  code: "AM-ABC123",
  locale: "es",
  productName: "Snorkel en cenotes",
  kind: "tour",
  currency: "MXN",
  totalCents: 556800,
  depositCents: 167040,
  balanceCents: 389760,
  holderName: "Ana Ruiz",
  lines: [],
  policyText: null,
  startsAt: "2027-03-04T15:00:00.000Z",
  timezone: "America/Cancun",
  meetingPoint: "Parque Dos Aguas",
  checkIn: null,
  checkOut: null,
  checkinTime: null,
  checkoutTime: null,
  securityDepositNote: null,
  guests: [],
};

describe("plantillas de WhatsApp", () => {
  it("rellena todos los huecos de la plantilla, sin dejar ninguno", () => {
    const message = buildWhatsApp("booking_confirmed_guest", BASE);
    assert.ok(message);

    // Un `{{n}}` sin sustituir significa que faltó un parámetro, y Meta rechaza
    // el mensaje en el momento del envío, no al registrar la plantilla.
    assert.doesNotMatch(message.preview, /\{\{\d+\}\}/, "quedó un hueco sin rellenar");

    const huecos = WHATSAPP_TEMPLATES.booking_confirmed_guest!.body.es.match(/\{\{\d+\}\}/g) ?? [];
    assert.equal(
      message.parameters.length,
      new Set(huecos).size,
      "hay que mandar exactamente un parámetro por hueco",
    );

    assert.match(message.preview, /AM-ABC123/);
    assert.match(message.preview, /SALDO A PAGAR EN DESTINO/);
    assert.equal(message.language, "es_MX");
    assert.equal(message.template, "reserva_confirmada");
  });

  it("un dato faltante no revienta el aviso: se sustituye por un guion", () => {
    // Un producto sin traducción deja el nombre en null. Antes eso lanzaba
    // `null.trim()` y el WhatsApp se reintentaba seis veces hasta morir,
    // mientras el correo salía bien. Se encontró ejecutando la bandeja.
    const sinNombre = { ...BASE, productName: null as unknown as string, meetingPoint: null };
    const message = buildWhatsApp("booking_reminder", sinNombre);

    assert.ok(message, "el aviso tiene que armarse igual");
    assert.doesNotMatch(message.preview, /\{\{\d+\}\}/);
    assert.ok(
      message.parameters.every((value) => value.trim().length > 0),
      "Meta rechaza el mensaje si un hueco va en blanco",
    );
  });

  it("el recordatorio dice la hora de presentación, no la de salida", () => {
    const message = buildWhatsApp("booking_reminder", BASE);
    assert.ok(message);
    // Salida 15:00 UTC = 10:00 en Cancún; presentación 9:45. El formato de
    // es-MX no lleva cero a la izquierda, así que se afirma como se escribe.
    assert.match(message.preview, /PRESÉNTATE A LAS 9:45/);
    assert.doesNotMatch(message.preview, /PRESÉNTATE A LAS 10:00/);
    // El saludo lleva el día sin la hora: repetirla contradecía la línea de
    // presentación y dejaba un "a.m.." con dos puntos.
    assert.match(message.preview, /te esperamos el jueves, 4 de marzo\./);
  });

  it("la cancelación del operador dice que no aplica la política", () => {
    const message = buildWhatsApp("booking_cancelled_by_operator", BASE, {
      refundCents: 167040,
      reason: "Cierre de puerto",
    });
    assert.ok(message);
    assert.match(message.preview, /Cierre de puerto/);
    assert.match(message.preview, /no aplica la política de cancelación/i);
    assert.match(message.preview, /lo sentimos/i);
  });

  it("en inglés usa el idioma registrado en Meta", () => {
    const message = buildWhatsApp("booking_confirmed_guest", { ...BASE, locale: "en" });
    assert.ok(message);
    assert.equal(message.language, "en_US");
    assert.match(message.preview, /BALANCE DUE ON ARRIVAL/);
  });

  it("una plantilla que no existe no inventa un mensaje", () => {
    assert.equal(buildWhatsApp("plantilla_inventada", BASE), null);
  });

  it("todas las plantillas son de utilidad y están en los dos idiomas", () => {
    for (const [clave, plantilla] of Object.entries(WHATSAPP_TEMPLATES)) {
      // Marketing exigiría consentimiento aparte y se puede bloquear por
      // volumen. Estas informan sobre una transacción que el huésped inició.
      assert.equal(plantilla.category, "utility", `${clave} no es de utilidad`);
      assert.ok(plantilla.body.es.length > 0, `${clave} sin texto en español`);
      assert.ok(plantilla.body.en.length > 0, `${clave} sin texto en inglés`);

      // Los mismos huecos en los dos idiomas: se registran por separado en Meta
      // pero reciben el mismo arreglo de parámetros.
      const es = new Set(plantilla.body.es.match(/\{\{\d+\}\}/g) ?? []);
      const en = new Set(plantilla.body.en.match(/\{\{\d+\}\}/g) ?? []);
      assert.deepEqual([...es].sort(), [...en].sort(), `${clave}: los huecos no coinciden`);
    }
  });
});
