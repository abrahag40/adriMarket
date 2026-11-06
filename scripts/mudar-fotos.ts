import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { uploadImage } from "@/modules/media/images";

/**
 * Sube al Blob de ESTE sitio las fotos que se siguen sirviendo desde el Blob de
 * otro. Pasa después de clonar un catálogo (scripts/clonar-catalogo.sh), que
 * copia las fotos como direcciones: sin esto, el sitio nuevo depende del Blob del
 * sitio de origen, y el día que ahí se borre una foto, desaparece en los dos.
 *
 *   BLOB_READ_WRITE_TOKEN=… SITIO=martours ./scripts/produccion.sh run npx tsx scripts/mudar-fotos.ts
 *
 * El token va en el ambiente, no como argumento: un argumento lo enseña `ps`.
 *
 * Cada foto se baja de su original y entra por la misma `uploadImage` que el
 * panel; el latido genera las variantes. Conserva su texto alternativo y su
 * posición, y la fila vieja se borra. Repetirlo solo toca las que falten. Las
 * fotos que no están en un Blob (Unsplash) no se tocan.
 */
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token || !process.env.DATABASE_URL) {
  console.error("Hacen falta DATABASE_URL y BLOB_READ_WRITE_TOKEN del sitio destino.");
  process.exit(2);
}
// vercel_blob_rw_<tienda>_<secreto>: el servidor público es <tienda>.public.blob…
const tienda = token.split("_")[3]?.toLowerCase();
if (!tienda) {
  console.error("BLOB_READ_WRITE_TOKEN no tiene la forma esperada.");
  process.exit(2);
}
const propio = `https://${tienda}.public.blob.vercel-storage.com/`;

type Foto = {
  id: string;
  product_id: string;
  url: string;
  original_url: string | null;
  alt_es: string | null;
  alt_en: string | null;
  position: number;
};

let movidas = 0;
let fallidas = 0;
try {
  const fotos = await db.execute<Foto>(sql`
    select id, product_id, url, original_url, alt_es, alt_en, position
      from product_media
     where url like 'https://%.blob.vercel-storage.com/%'
       and url not like ${propio + "%"}
     order by product_id, position`);

  for (const f of fotos) {
    const fuente = f.original_url ?? f.url;
    try {
      const respuesta = await fetch(fuente);
      if (!respuesta.ok) throw new Error(`${respuesta.status} al bajar ${fuente}`);
      const bytes = Buffer.from(await respuesta.arrayBuffer());
      const nombre = new URL(fuente).pathname.split("/").pop() ?? "foto.jpg";
      const { mediaId } = await uploadImage(f.product_id, { name: nombre, bytes }, null);
      await db.transaction(async (tx) => {
        await tx.execute(sql`delete from product_media where id = ${f.id}::uuid`);
        await tx.execute(sql`
          update product_media
             set alt_es = ${f.alt_es}, alt_en = ${f.alt_en}, position = ${f.position}
           where id = ${mediaId}::uuid`);
      });
      movidas++;
      console.log(`✓ ${nombre}`);
    } catch (e) {
      fallidas++;
      console.log(`✗ ${fuente}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n${movidas} movidas, ${fallidas} con error. Las variantes las genera el latido.`);
} finally {
  await sqlClient.end();
}
process.exit(fallidas ? 1 : 0);
