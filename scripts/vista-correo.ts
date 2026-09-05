#!/usr/bin/env tsx
/**
 * Vista previa del correo, sin mandarlo.
 *
 *   npm run correo:vista            > /tmp/correo.html   # última confirmada
 *   npm run correo:vista -- AM-XXXX > /tmp/correo.html
 *
 * Escribe el HTML a la salida estándar para no tener que decidir dónde dejar
 * un archivo. Toma una reserva de verdad, con sus importes, sus fechas y su
 * política congelada: una vista previa con datos inventados enseña un diseño
 * que nunca existió —columnas que no se desbordan, nombres que caben, un
 * desglose de tres líneas cuando el real tiene siete—.
 *
 * Usa la MISMA función que el despacho, así que lo que se ve aquí es lo que
 * recibe el huésped.
 */

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { renderHtml } from "@/modules/notifications/html";
import { notificationData } from "@/modules/notifications/send";

const codigo = process.argv[2] ?? null;

const filas = await db.execute<{ id: string; code: string }>(
  codigo
    ? sql`select id, code from bookings where code = ${codigo} limit 1`
    : sql`select id, code from bookings where status = 'confirmed'
           order by confirmed_at desc nulls last limit 1`,
);

const reserva = filas[0];
if (!reserva) {
  console.error(codigo ? `No existe la reserva ${codigo}.` : "No hay reservas confirmadas.");
  await sqlClient.end();
  process.exit(1);
}

const datos = await notificationData(reserva.id);
if (!datos) {
  console.error(`No se pudieron leer los datos de ${reserva.code}.`);
  await sqlClient.end();
  process.exit(1);
}

const html = await renderHtml("booking_confirmed_guest", datos);
if (!html) {
  console.error("El renderizado devolvió null.");
  await sqlClient.end();
  process.exit(1);
}

console.error(`→ reserva: ${reserva.code} (${datos.kind}, ${datos.locale})`);
process.stdout.write(html);

await sqlClient.end();
