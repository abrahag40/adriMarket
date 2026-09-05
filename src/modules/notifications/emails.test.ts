import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderHtml } from "./html";
import type { BookingNotification } from "./templates";

/**
 * La confirmación en HTML · post-Sprint 7
 *
 * Sin base de datos: se prueba lo que el diseño no tiene permitido perder.
 *
 * Un correo con diseño se rompe distinto que uno de texto: no truena, se ve
 * bien y le falta un dato. Estas pruebas existen para que el día que alguien
 * reacomode la maqueta, se entere de que tiró la hora de presentación antes de
 * que un huésped llegue al muelle cuando el barco ya salió.
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
  lines: [
    { label: "2 adultos", cents: 480000 },
    { label: "IVA", cents: 76800 },
  ],
  policyText: "Cancelación sin costo hasta 7 días antes.",
  startsAt: "2027-03-04T15:00:00.000Z",
  timezone: "America/Cancun",
  meetingPoint: "Parque Dos Aguas",
  checkIn: null,
  checkOut: null,
  checkinTime: null,
  checkoutTime: null,
  securityDepositNote: null,
  guests: [{ fullName: "Ana Ruiz", paxType: "adult", age: 34 }],
};

const ESTANCIA: BookingNotification = {
  ...BASE,
  kind: "stay",
  productName: "Casa Akumal",
  startsAt: null,
  meetingPoint: null,
  checkIn: "2027-04-29",
  checkOut: "2027-05-02",
  checkinTime: "15:00:00",
  checkoutTime: "11:00:00",
  securityDepositNote: "Al llegar, el anfitrión puede pedir un depósito de garantía reembolsable en efectivo.",
};

describe("confirmación en HTML", () => {
  it("solo la confirmación al huésped tiene diseño", async () => {
    assert.equal(await renderHtml("booking_confirmed_admin", BASE), null);
    assert.equal(await renderHtml("booking_reminder", BASE), null);
  });

  it("un tour lleva la hora de PRESENTACIÓN, no la de salida", async () => {
    const html = await renderHtml("booking_confirmed_guest", BASE);
    assert.ok(html);
    // La salida de esta reserva es 10:00 en Cancún; la presentación, 9:45.
    assert.match(html, /9:45/, "falta la hora de presentación");
    assert.doesNotMatch(html, /Preséntate a las<[^>]*>\s*10:00/, "está mostrando la hora de salida como si fuera la de presentación");
    assert.match(html, /Parque Dos Aguas/);
  });

  it("una estancia lleva sus fechas y el depósito en efectivo", async () => {
    const html = await renderHtml("booking_confirmed_guest", ESTANCIA);
    assert.ok(html);
    assert.match(html, /29 de abril de 2027/);
    assert.match(html, /2 de mayo de 2027/);
    assert.match(html, /depósito de garantía reembolsable en efectivo/);
  });

  it("el saldo a pagar en destino va en el correo, y el código también", async () => {
    const html = await renderHtml("booking_confirmed_guest", BASE);
    assert.ok(html);
    assert.match(html, /AM-ABC123/);
    assert.match(html, /Saldo a pagar en destino/);
    // 389760 centavos, que formatMoney redondea a $3,898.
    assert.match(html, /3,898/, "falta el saldo");
    assert.match(html, /Cancelación sin costo/);
  });

  it("en inglés cambia el idioma, no los hechos", async () => {
    const html = await renderHtml("booking_confirmed_guest", { ...BASE, locale: "en" });
    assert.ok(html);
    assert.match(html, /Balance due on arrival/);
    assert.match(html, /Please arrive at/);
    assert.match(html, /AM-ABC123/);
  });

  it("no queda ninguna clase de Tailwind sin compilar", async () => {
    // La comprobación que más vale de todas. Tailwind en un correo **no
    // funciona**: Gmail descarta el `<style>` y Outlook renderiza con Word. El
    // componente `Tailwind` de react-email compila las clases a estilos en
    // línea, y si algún día deja de hacerlo —una versión nueva, un cambio de
    // API— el correo se seguiría renderizando sin error y llegaría sin ningún
    // estilo. Esto lo atrapa antes.
    const html = await renderHtml("booking_confirmed_guest", BASE);
    assert.ok(html);
    assert.doesNotMatch(html, /class="/, "quedaron clases sin convertir a estilos en línea");
    assert.match(html, /style="/, "no hay estilos en línea: algo no se aplicó");
  });

  it("no trae imágenes remotas, que los clientes bloquean", async () => {
    const html = await renderHtml("booking_confirmed_guest", BASE);
    assert.ok(html);
    assert.doesNotMatch(html, /<img/i, "una imagen remota llega bloqueada por omisión");
  });
});
