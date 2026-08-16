import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";
import sharp from "sharp";

import { db, sqlClient } from "@/db/index";
import {
  MEDIA_ROOT,
  MediaError,
  deleteImage,
  processMediaJobs,
  uploadImage,
} from "@/modules/media/images";

/**
 * Publicar y ajustar desde el panel · Sprint 6
 *
 * Lo que se prueba aquí es lo que distingue un panel usable de uno peligroso:
 *
 * - **Generar salidas dos veces no duplica ni reescribe.** Es la operación que
 *   más se va a repetir y la que más daño haría: reescribir el cupo de una
 *   salida que ya tiene pasajeros es sobreventa creada desde el panel.
 * - **Cambiar el anticipo no toca reservas ya tomadas.** Es la promesa que se le
 *   hace al cliente en la propia pantalla.
 * - **La foto que se sube se procesa de verdad**, en los anchos de la decisión
 *   0001 y sin agrandar más allá del original.
 */

let optionId: string;
let productId: string;

async function createFixtures(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);

  const product = await db.execute<{ id: string }>(sql`
    insert into products (kind, slug, status, currency, deposit_pct)
    values ('tour', ${`s6-tour-${suffix}`}, 'draft', 'MXN', null)
    returning id
  `);
  productId = product[0]!.id;

  const option = await db.execute<{ id: string }>(sql`
    insert into tour_options (product_id, code, name_es, duration_minutes, default_capacity)
    values (${productId}::uuid, 'shared', 'Compartido', 300, 12)
    returning id
  `);
  optionId = option[0]!.id;
}

async function generate(
  from: string,
  to: string,
  dows: number[],
  time = "09:00",
  capacity = 12,
): Promise<{ created: number; skipped: number }> {
  const rows = await db.execute<{ created: number; skipped: number }>(sql`
    select created, skipped from departures_generate(
      ${optionId}::uuid, ${from}::date, ${to}::date,
      ${`{${dows.join(",")}}`}::smallint[], ${time}::time, ${capacity}
    )
  `);
  return { created: Number(rows[0]!.created), skipped: Number(rows[0]!.skipped) };
}

/**
 * Texto de un error recorriendo la cadena de causas.
 *
 * Drizzle envuelve la excepción del driver, así que el mensaje de Postgres no
 * está en el error que se atrapa. Es la misma trampa del Sprint 2 y sigue
 * mereciendo un ayudante en cada archivo que afirme sobre mensajes del dominio.
 */
function reason(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (typeof current !== "object") break;
    const candidate = current as { message?: unknown; cause?: unknown };
    if (typeof candidate.message === "string") parts.push(candidate.message);
    current = candidate.cause;
  }
  return parts.join(" | ");
}

/** Imagen sintética del ancho pedido, para no depender de archivos en el repo. */
async function fakePhoto(width: number, height = Math.round((width * 3) / 4)): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 90 } },
  })
    .jpeg()
    .toBuffer();
}

describe("publicar y ajustar desde el panel", () => {
  before(async () => {
    await createFixtures();
  });

  after(async () => {
    await sqlClient.end();
  });

  describe("salidas en lote", () => {
    it("crea solo los días de la semana pedidos, a la hora del destino", async () => {
      // Marzo de 2032: martes y jueves.
      const result = await generate("2032-03-01", "2032-03-31", [2, 4]);
      assert.equal(result.created, 9);
      assert.equal(result.skipped, 0);

      const rows = await db.execute<{ dow: number; hora: string }>(sql`
        select extract(isodow from starts_at at time zone 'America/Cancun')::int as dow,
               to_char(starts_at at time zone 'America/Cancun', 'HH24:MI') as hora
          from tour_departures
         where tour_option_id = ${optionId}::uuid
           and starts_at >= '2032-03-01' and starts_at < '2032-04-01'
      `);
      assert.equal(rows.length, 9);
      for (const row of rows) {
        assert.ok([2, 4].includes(Number(row.dow)), "solo martes y jueves");
        // La hora es local. Guardarla en UTC la correría cinco horas y el guía
        // llegaría a las cuatro de la mañana.
        assert.equal(row.hora, "09:00");
      }
    });

    it("generar dos veces no duplica ni reescribe lo que ya existe", async () => {
      // Se le cambia el cupo a una salida, como si ya tuviera pasajeros.
      await db.execute(sql`
        update tour_departures set capacity = 4, seats_taken = 4
         where tour_option_id = ${optionId}::uuid
           and starts_at >= '2032-03-01' and starts_at < '2032-04-01'
           and starts_at = (select min(starts_at) from tour_departures
                             where tour_option_id = ${optionId}::uuid
                               and starts_at >= '2032-03-01' and starts_at < '2032-04-01')
      `);

      const result = await generate("2032-03-01", "2032-03-31", [2, 4]);
      assert.equal(result.created, 0);
      assert.equal(result.skipped, 9);

      const llena = await db.execute<{ capacity: number; seats_taken: number }>(sql`
        select capacity, seats_taken from tour_departures
         where tour_option_id = ${optionId}::uuid
           and starts_at >= '2032-03-01' and starts_at < '2032-04-01'
         order by starts_at limit 1
      `);
      assert.equal(
        llena[0]!.capacity,
        4,
        "regenerar no puede devolverle el cupo original a una salida vendida",
      );
      assert.equal(llena[0]!.seats_taken, 4);
    });

    it("ampliar el periodo agrega solo lo que falta", async () => {
      const result = await generate("2032-03-01", "2032-04-30", [2, 4]);
      assert.equal(result.skipped, 9, "las de marzo ya existían");
      assert.ok(result.created > 0, "las de abril se crearon");
    });

    it("rechaza un rango invertido y un cupo imposible", async () => {
      await assert.rejects(
        () => generate("2032-06-30", "2032-06-01", [1]),
        (error: unknown) => /invertido/.test(reason(error)),
      );
      await assert.rejects(
        () => generate("2032-07-01", "2032-07-31", [1], "09:00", 0),
        (error: unknown) => /mayor que cero/.test(reason(error)),
      );
      await assert.rejects(
        () => generate("2032-08-01", "2032-08-31", []),
        (error: unknown) => /día de la semana/.test(reason(error)),
      );
    });

    it("deja constancia en la bitácora", async () => {
      const rows = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from audit_log
         where action = 'departures.generate' and entity_id = ${optionId}
      `);
      assert.ok(rows[0]!.n >= 3, "cada generación se registra, incluidas las que no crearon nada");
    });
  });

  describe("anticipo", () => {
    it("cambiar el global no altera las reservas ya tomadas", async () => {
      // Una reserva tomada con el anticipo vigente hoy.
      const booking = await db.execute<{ id: string; pct: string }>(sql`
        with c as (
          insert into customers (full_name, email)
          values ('Huésped S6', 's6+' || gen_random_uuid() || '@example.com')
          returning id
        )
        insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                              quote, deposit_due_at, currency)
        select c.id, 'hold', 1000000, resolve_deposit_pct(${productId}::uuid),
               round(1000000 * resolve_deposit_pct(${productId}::uuid) / 100),
               '{}'::jsonb, now() + interval '15 minutes', 'MXN'
          from c
        returning id, deposit_pct::text as pct
      `);
      const antes = Number(booking[0]!.pct);

      await db.execute(sql`select settings_set_deposit_pct(${antes + 20})`);

      const despues = await db.execute<{ pct: string; cents: string }>(sql`
        select deposit_pct::text as pct, deposit_cents::text as cents
          from bookings where id = ${booking[0]!.id}::uuid
      `);
      assert.equal(
        Number(despues[0]!.pct),
        antes,
        "el porcentaje se congela al reservar: subirlo después sería cobrarle de más a quien ya reservó",
      );
      assert.equal(Number(despues[0]!.cents), Math.round((1000000 * antes) / 100));

      // Y una reserva nueva sí toma el nuevo.
      const nuevo = await db.execute<{ pct: string }>(sql`
        select resolve_deposit_pct(${productId}::uuid)::text as pct
      `);
      assert.equal(Number(nuevo[0]!.pct), antes + 20);

      await db.execute(sql`select settings_set_deposit_pct(${antes})`);
    });

    it("un anticipo propio del producto gana sobre el global", async () => {
      await db.execute(sql`update products set deposit_pct = 55 where id = ${productId}::uuid`);
      const rows = await db.execute<{ pct: string }>(sql`
        select resolve_deposit_pct(${productId}::uuid)::text as pct
      `);
      assert.equal(Number(rows[0]!.pct), 55);

      await db.execute(sql`update products set deposit_pct = null where id = ${productId}::uuid`);
      const heredado = await db.execute<{ pct: string }>(sql`
        select resolve_deposit_pct(${productId}::uuid)::text as pct
      `);
      assert.notEqual(Number(heredado[0]!.pct), 55, "vacío significa heredar, no conservar");
    });

    it("rechaza porcentajes imposibles", async () => {
      for (const pct of [0, -5, 101]) {
        await assert.rejects(
          () => db.execute(sql`select settings_set_deposit_pct(${pct})`),
          (error: unknown) => /entre 1 y 100/.test(reason(error)),
        );
      }
    });

    it("queda escrito quién lo cambió", async () => {
      const rows = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from audit_log where action = 'settings.deposit_pct'
      `);
      assert.ok(rows[0]!.n >= 2, "cambiar el anticipo global siempre deja rastro");
    });
  });

  describe("fotos", () => {
    it("rechaza lo que no es una imagen y lo que se vería borroso", async () => {
      await assert.rejects(
        () => uploadImage(productId, { name: "x.jpg", bytes: Buffer.from("esto no es una foto") }, null),
        (error: unknown) => error instanceof MediaError && /no es una imagen/.test(error.message),
      );

      const chica = await fakePhoto(320);
      await assert.rejects(
        () => uploadImage(productId, { name: "chica.jpg", bytes: chica }, null),
        (error: unknown) => error instanceof MediaError && /800 px/.test(error.message),
      );
    });

    it("guarda el original, encola, y el latido genera los anchos", async () => {
      const { mediaId, url } = await uploadImage(
        productId,
        { name: "casa.jpg", bytes: await fakePhoto(2000) },
        null,
      );

      // La petición termina con la foto visible y el trabajo pendiente: es lo
      // que evita que subir quince fotos cuelgue la pantalla.
      const recien = await db.execute<{ variants: string; status: string }>(sql`
        select m.variants::text as variants, j.status
          from product_media m join media_jobs j on j.media_id = m.id
         where m.id = ${mediaId}::uuid
      `);
      assert.equal(recien[0]!.variants, "{}", "todavía no hay variantes");
      assert.equal(recien[0]!.status, "pending");
      assert.match(url, /^\/media\/.+-original\.jpg$/);

      const report = await processMediaJobs();
      assert.ok(report.processed >= 1);

      const rows = await db.execute<{ variants: string; url: string }>(sql`
        select variants::text as variants, url from product_media where id = ${mediaId}::uuid
      `);
      const variants = JSON.parse(rows[0]!.variants) as Record<string, Record<string, string>>;

      assert.deepEqual(
        Object.keys(variants).sort(),
        ["avif", "webp"],
        "AVIF por peso, WebP de respaldo (decisión 0001)",
      );
      assert.deepEqual(
        Object.keys(variants.webp!).map(Number).sort((a, b) => a - b),
        [400, 800, 1600],
        "no se generan anchos por encima del original: agrandar solo agrega peso",
      );
      assert.match(rows[0]!.url, /-800\.webp$/, "la vitrina pasa a servir la variante mediana");

      // Y el trabajo queda cerrado, no se repite en el siguiente latido.
      const job = await db.execute<{ status: string }>(sql`
        select status from media_jobs where media_id = ${mediaId}::uuid
      `);
      assert.equal(job[0]!.status, "done");

      await deleteImage(mediaId);
    });

    it("una foto chica no se agranda: se sirve en su propio ancho", async () => {
      const { mediaId } = await uploadImage(
        productId,
        { name: "mediana.jpg", bytes: await fakePhoto(900) },
        null,
      );
      await processMediaJobs();

      const rows = await db.execute<{ variants: string }>(sql`
        select variants::text as variants from product_media where id = ${mediaId}::uuid
      `);
      const variants = JSON.parse(rows[0]!.variants) as Record<string, Record<string, string>>;
      assert.deepEqual(
        Object.keys(variants.avif!).map(Number).sort((a, b) => a - b),
        [400, 800],
      );

      await deleteImage(mediaId);
    });

    it("borrar la foto se lleva sus archivos", async () => {
      const { mediaId } = await uploadImage(
        productId,
        { name: "borrar.jpg", bytes: await fakePhoto(1000) },
        null,
      );
      await processMediaJobs();

      const rows = await db.execute<{ variants: string; original_url: string }>(sql`
        select variants::text as variants, original_url from product_media
         where id = ${mediaId}::uuid
      `);
      const variants = JSON.parse(rows[0]!.variants) as Record<string, Record<string, string>>;
      const archivos = [
        rows[0]!.original_url,
        ...Object.values(variants).flatMap((byWidth) => Object.values(byWidth)),
      ];

      await deleteImage(mediaId);

      // Dejar archivos huérfanos en el disco es una factura que crece sola.
      const presentes = new Set(await readdir(MEDIA_ROOT));
      for (const archivo of archivos) {
        assert.ok(
          !presentes.has(path.basename(archivo)),
          `quedó huérfano en el disco: ${archivo}`,
        );
      }

      const fila = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from product_media where id = ${mediaId}::uuid
      `);
      assert.equal(fila[0]!.n, 0);
    });
  });

  describe("bitácora", () => {
    it("registra el antes y el después de un cambio", async () => {
      await db.execute(sql`
        select audit_record(null, 'prueba.cambio', 'product', ${productId},
                            '{"pct": 30}'::jsonb, '{"pct": 50}'::jsonb)
      `);

      const rows = await db.execute<{ before: string; after: string; actor: string | null }>(sql`
        select before::text as before, after::text as after, actor_label as actor
          from audit_log where action = 'prueba.cambio' and entity_id = ${productId}
         order by created_at desc limit 1
      `);
      assert.equal(JSON.parse(rows[0]!.before).pct, 30);
      assert.equal(JSON.parse(rows[0]!.after).pct, 50);
    });
  });
});
