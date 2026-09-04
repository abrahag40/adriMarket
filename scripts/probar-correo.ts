#!/usr/bin/env tsx
/**
 * Entrega real por Resend · la comprobación que falta del §6 de la puesta en
 * producción.
 *
 * Todo el camino del aviso está probado —encolado en la misma transacción que
 * confirma, plantillas, reintentos, marcado— pero contra el transporte local,
 * que renderiza y guarda en lugar de mandar. Lo único que nadie ha ejercitado
 * es la última pulgada: que Resend acepte el mensaje y que llegue a una bandeja
 * de verdad.
 *
 *   RESEND_API_KEY=re_… MAIL_FROM=reservas@… \
 *     npm run probar:correo -- destinatario@ejemplo.com [CÓDIGO]
 *
 * Sin código de reserva toma la última confirmada. **No toca la bandeja de
 * salida ni escribe nada**: es una sonda, no un despacho. Y arma el correo con
 * las mismas funciones que usa el worker —`renderNotification` y el mismo
 * `transport()`— porque un probador que arma el mensaje por su cuenta deja de
 * parecerse al real en cuanto alguien toca uno de los dos.
 *
 * Se niega a correr sin llaves de Resend a propósito: con el transporte local
 * esto "pasaría" siempre, y una comprobación que no puede fallar no comprueba
 * nada.
 */

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { isLocale, type Locale } from "@/i18n/config";
import { renderNotification, transport } from "@/modules/notifications/send";
import { bookingVoucherQr } from "@/modules/notifications/voucher";

const destino = process.argv[2];
const codigo = process.argv[3] ?? null;

if (!destino || !destino.includes("@")) {
  console.error("Uso: npm run probar:correo -- destinatario@ejemplo.com [CÓDIGO]");
  process.exit(1);
}

if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) {
  console.error(
    "Faltan RESEND_API_KEY y MAIL_FROM.\n\n" +
      "Sin ellas se usaría el transporte local, que guarda el correo en lugar de\n" +
      "mandarlo: la prueba pasaría sin haber entregado nada. Se sacan de\n" +
      "resend.com → API keys, y MAIL_FROM tiene que estar en un dominio\n" +
      "verificado ahí (ver docs/puesta-en-produccion.md §6).",
  );
  process.exit(1);
}

const mail = transport();
if (mail.name !== "resend") {
  console.error(`El transporte elegido es "${mail.name}" y no Resend. Revisa la configuración.`);
  process.exit(1);
}

const reservas = await db.execute<{ id: string; code: string; locale: string; email: string | null }>(
  codigo
    ? sql`select b.id, b.code, b.locale, c.email
            from bookings b join customers c on c.id = b.customer_id
           where b.code = ${codigo} limit 1`
    : sql`select b.id, b.code, b.locale, c.email
            from bookings b join customers c on c.id = b.customer_id
           where b.status = 'confirmed'
           order by b.confirmed_at desc nulls last limit 1`,
);

const reserva = reservas[0];
if (!reserva) {
  console.error(
    codigo
      ? `No existe la reserva ${codigo}.`
      : "No hay ninguna reserva confirmada en esta base con la que armar el correo.",
  );
  await sqlClient.end();
  process.exit(1);
}

const locale: Locale = isLocale(reserva.locale) ? reserva.locale : "es";
const mensaje = await renderNotification(reserva.id, "booking_confirmed_guest");
if (!mensaje) {
  console.error(`No se pudo armar el aviso de ${reserva.code}.`);
  await sqlClient.end();
  process.exit(1);
}

console.log(`→ reserva:   ${reserva.code} (${locale})`);
console.log(`→ de:        ${process.env.MAIL_FROM}`);
console.log(`→ para:      ${destino}`);
console.log(`→ asunto:    ${mensaje.subject}`);
console.log(`→ adjunto:   comprobante-${reserva.code}.png`);
console.log();

try {
  const resultado = await mail.send({
    to: destino,
    subject: mensaje.subject,
    text: mensaje.text,
    attachments: [
      {
        filename: `comprobante-${reserva.code}.png`,
        content: await bookingVoucherQr(reserva.code, locale),
      },
    ],
  });
  console.log(`✔ Resend lo aceptó. id: ${resultado.providerRef}`);
  console.log("  Falta lo que ningún programa puede afirmar: que llegó a la bandeja");
  console.log("  de entrada y no a no deseado. Revísalo en Gmail, Outlook e iCloud.");
} catch (error) {
  const detalle = error instanceof Error ? error.message : String(error);
  console.error(`✘ Resend lo rechazó:\n  ${detalle}`);
  if (detalle.includes("403") || detalle.includes("testing emails")) {
    console.error(
      "\n  Es la restricción de la caja de arena: sin dominio verificado, Resend\n" +
        "  solo entrega a la dirección dueña de la cuenta. Un huésped real\n" +
        "  recibiría este mismo 403, el aviso se reintentaría seis veces y\n" +
        "  quedaría 'dead' — /api/health lo reportaría como degradado.",
    );
  }
  process.exitCode = 1;
}

await sqlClient.end();
