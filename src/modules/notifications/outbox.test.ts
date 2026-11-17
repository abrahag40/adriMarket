import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";

import { processOutbox } from "./send";

/**
 * Despachar un solo aviso, en el acto.
 *
 * Es lo que usa el enlace de acceso al panel: caduca en 15 minutos y el latido
 * corre cada 15, así que esperar al latido podía entregarlo ya vencido. Lo que
 * importa probar es que "manda este" manda ESE y nada más: una pasada completa
 * dentro de una petición de acceso despacharía la bandeja entera de otros.
 */

const creados: string[] = [];

async function encolar(): Promise<string> {
  const destino = `prueba+${randomUUID()}@example.com`;
  const rows = await db.execute<{ id: string }>(sql`
    insert into outbox (channel, template, locale, to_address, payload, dedupe_key)
    values ('email', 'staff_login_link', 'es', ${destino},
            ${JSON.stringify({ rendered: { subject: "Acceso de prueba", text: "Enlace de prueba" } })}::jsonb,
            ${`prueba-outbox:${randomUUID()}`})
    returning id
  `);
  const id = rows[0]!.id;
  creados.push(id);
  return id;
}

async function estado(id: string): Promise<string> {
  const rows = await db.execute<{ status: string }>(sql`
    select status::text as status from outbox where id = ${id}::uuid
  `);
  return rows[0]!.status;
}

after(async () => {
  // Las filas de la prueba se recogen: un aviso pendiente que nadie va a mandar
  // aparecería en /api/health como atrasado y parecería un defecto real.
  if (creados.length) {
    await db.execute(sql`delete from outbox where id = any(string_to_array(${creados.join(",")}, ',')::uuid[])`);
  }
  await sqlClient.end();
});

describe("despachar un solo aviso", () => {
  it("manda el aviso pedido y deja los demás pendientes", async () => {
    const primero = await encolar();
    const segundo = await encolar();

    const report = await processOutbox(25, { id: segundo });

    assert.equal(report.sent, 1, "se manda exactamente uno");
    assert.equal(await estado(segundo), "sent", "el pedido sale en el acto");
    assert.equal(await estado(primero), "pending", "el otro espera al latido, intacto");
  });

  it("uno ya enviado no se reenvía al volver a pedirlo", async () => {
    const id = await encolar();
    await processOutbox(1, { id });

    const otra = await processOutbox(1, { id });

    assert.equal(otra.sent, 0);
    assert.equal(await estado(id), "sent");
  });
});
