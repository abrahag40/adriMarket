import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { uploadImage } from "@/modules/media/images";

/**
 * Carga en lote las fotos que manda un cliente, cada una a su tour y con su texto
 * alternativo. Usa la misma `uploadImage` que el panel: mismas validaciones (800 px
 * mínimo), mismo almacenamiento y las variantes las genera el latido.
 *
 *   SITIO=conquest-tours ./scripts/produccion.sh run npx tsx scripts/subir-fotos.ts plan.json
 *
 * plan.json: [{ "slug": "sian-kaan", "files": [{ "path": "/ruta/foto.jpg", "alt_es": "…" }] }]
 *
 * Repetirlo no duplica: una foto con el mismo peso en bytes en ese tour se salta.
 * Sin BLOB_READ_WRITE_TOKEN se niega, porque guardaría en el disco de esta máquina
 * y producción apuntaría a archivos que no existen.
 */
type Plan = { slug: string; files: { path: string; alt_es: string }[] }[];

const archivo = process.argv[2];
if (!archivo || !process.env.DATABASE_URL) {
  console.error("Uso: subir-fotos.ts plan.json (con DATABASE_URL)");
  process.exit(2);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Falta BLOB_READ_WRITE_TOKEN: sin él las fotos se quedarían en este disco.");
  process.exit(2);
}

const plan = JSON.parse(readFileSync(archivo, "utf8")) as Plan;
try {
  for (const tour of plan) {
    const [producto] = await db.execute<{ id: string }>(
      sql`select id from products where slug = ${tour.slug}`,
    );
    if (!producto) {
      console.log(`✗ ${tour.slug}: no existe ese tour`);
      continue;
    }
    for (const f of tour.files) {
      const bytes = readFileSync(f.path);
      const [ya] = await db.execute<{ id: string }>(sql`
        select id from product_media
         where product_id = ${producto.id}::uuid and bytes = ${bytes.length}`);
      if (ya) {
        console.log(`· ${tour.slug} ← ${basename(f.path)}: ya estaba`);
        continue;
      }
      const { mediaId } = await uploadImage(producto.id, { name: basename(f.path), bytes }, null);
      await db.execute(sql`update product_media set alt_es = ${f.alt_es} where id = ${mediaId}::uuid`);
      console.log(`✓ ${tour.slug} ← ${basename(f.path)}`);
    }
  }
} finally {
  await sqlClient.end();
}
