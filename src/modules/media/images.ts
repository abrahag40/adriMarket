import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { cloudflare, type ImagesBindingLike, type R2BucketLike } from "@/runtime";

/**
 * Subida y procesamiento de fotos · S6-1, y Vercel Blob después del Sprint 7
 *
 * Implementa la [decisión 0001](../../../docs/decisiones/0001-entrega-de-imagenes.md):
 * generar los anchos **al subir**, guardarlos como archivos y servirlos
 * estáticos. No hay transformación en el momento de leer, así que la galería no
 * puede fallar por un proveedor caído ni encarecerse cuando el negocio va bien.
 *
 * El reparto de trabajo entre la petición y el latido es deliberado:
 *
 * - **La petición** valida, guarda el original y encola. Termina en milisegundos
 *   y la foto ya se ve.
 * - **El latido** genera las variantes. Codificar AVIF tarda segundos por
 *   imagen; hacerlo en la petición deja la pantalla colgada mientras el cliente
 *   sube quince fotos de una casa.
 *
 * **Dónde se guarda es una decisión por configuración, igual que Stripe, Resend
 * y WhatsApp** ([decisión 0005](../../../docs/decisiones/0005-vercel-y-blob.md)):
 * con `BLOB_READ_WRITE_TOKEN` se usa Vercel Blob; sin él, disco local. No es una
 * bandera de "modo desarrollo" — es lo que hace falta para correr en Vercel, cuyo
 * sistema de archivos es efímero y no se comparte entre invocaciones.
 *
 * **En Cloudflare Workers** ([decisión 0023](../../../docs/decisiones/0023-cloudflare-workers.md))
 * las fotos van a R2 (binding `MEDIA`) y se procesan con el binding `IMAGES` en
 * lugar de `sharp`, que es un binario nativo y no existe en workerd. Por eso
 * `sharp` y `@vercel/blob` se cargan **al usarse** y no al importar este módulo:
 * con un `import` estático, cualquier ruta que lo tocara —la entrega de fotos, el
 * panel— tronaría en el Worker antes de hacer nada.
 */

/** Tipo de contenido por extensión: lo usan el almacén al guardar y la ruta al servir. */
const TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function mediaContentType(filename: string): string {
  return TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Un archivo del almacén nunca cambia de contenido —su nombre lleva el
 * identificador y el ancho—, así que se puede cachear para siempre.
 */
export const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Dónde se guardan los archivos: local o Vercel Blob, resuelto por configuración.
 *
 * `read()` existe porque `processMediaJobs` necesita los bytes del original para
 * generar variantes, y en Blob eso significa una descarga por HTTP, no abrir un
 * archivo.
 */
export type MediaStorage = {
  name: string;
  save(filename: string, bytes: Buffer): Promise<string>;
  read(url: string): Promise<Buffer>;
  remove(url: string): Promise<void>;
};

class LocalStorage implements MediaStorage {
  readonly name = "local";

  async save(filename: string, bytes: Buffer): Promise<string> {
    await mkdir(MEDIA_ROOT, { recursive: true });
    await writeFile(path.join(MEDIA_ROOT, filename), bytes);
    return `/media/${filename}`;
  }

  async read(url: string): Promise<Buffer> {
    return readFile(path.join(MEDIA_ROOT, path.basename(url)));
  }

  async remove(url: string): Promise<void> {
    await unlink(path.join(MEDIA_ROOT, path.basename(url))).catch(() => {
      // Si el archivo ya no está, el objetivo se cumplió igual.
    });
  }
}

class BlobStorage implements MediaStorage {
  readonly name = "vercel-blob";

  async save(filename: string, bytes: Buffer): Promise<string> {
    // `addRandomSuffix: false` porque el nombre ya lleva un uuid (al subir) o el
    // identificador y el ancho (variantes): es único de por sí, y así la URL
    // guardada en la base es la misma que Blob va a servir después.
    //
    // `allowOverwrite: true` porque una variante se llama igual en cada intento:
    // si un intento escribió la mitad y falló —o dos latidos tomaron la misma
    // foto—, el reintento chocaba con "this blob already exists" y no terminaba
    // nunca. Pasó el 2026-10-23 con las primeras fotos de Conquest Tours.
    // Sobrescribir es seguro: el mismo nombre siempre lleva los mismos bytes.
    const { put } = await import("@vercel/blob");
    const blob = await put(filename, bytes, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  async read(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`blob: HTTP ${response.status} leyendo ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(url: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    await del(url).catch(() => {
      // Igual que en local: si ya no está, el objetivo se cumplió igual.
    });
  }
}

/**
 * R2, en Cloudflare Workers. La URL que se guarda en la base es la misma que en
 * disco —`/media/<archivo>`— y la sirve la misma ruta, que en el Worker lee del
 * bucket: así una base puede mudarse entre disco y R2 sin reescribir URLs.
 */
class R2Storage implements MediaStorage {
  readonly name = "r2";

  constructor(private readonly bucket: R2BucketLike) {}

  async save(filename: string, bytes: Buffer): Promise<string> {
    // Mismo nombre, mismos bytes (ver BlobStorage): sobrescribir es seguro.
    await this.bucket.put(filename, bytes, {
      httpMetadata: { contentType: mediaContentType(filename), cacheControl: IMMUTABLE },
    });
    return `/media/${filename}`;
  }

  async read(url: string): Promise<Buffer> {
    const object = await this.bucket.get(path.basename(url));
    if (!object) throw new Error(`r2: no existe ${url}`);
    return Buffer.from(await object.arrayBuffer());
  }

  async remove(url: string): Promise<void> {
    await this.bucket.delete(path.basename(url));
  }
}

export function mediaStorage(): MediaStorage {
  const cf = cloudflare();
  if (cf) {
    // En el Worker no hay disco que sirva de respaldo: sin bucket, la foto se
    // "guardaría" en un sistema de archivos que desaparece con la petición.
    if (!cf.env.MEDIA) throw new Error("Falta el binding MEDIA (R2) en el Worker.");
    return new R2Storage(cf.env.MEDIA);
  }
  return process.env.BLOB_READ_WRITE_TOKEN ? new BlobStorage() : new LocalStorage();
}

/** El bucket de fotos si el sistema corre en Workers, para la ruta que las sirve. */
export function mediaBucket(): R2BucketLike | null {
  return cloudflare()?.env.MEDIA ?? null;
}

/**
 * Leer y recodificar imágenes. Dos implementaciones con el mismo contrato:
 * `sharp` en Node e Images en Cloudflare. Lo que cambia entre ellas es quién
 * hace el trabajo, no qué se le pide: los mismos anchos, formatos y calidades.
 */
type Encoder = (width: number, format: (typeof FORMATS)[number], quality: number) => Promise<Buffer>;

type ImageCodec = {
  probe(bytes: Buffer): Promise<{ width?: number; height?: number; format: string }>;
  /** Abre el original una vez; cada variante sale del mismo original abierto. */
  open(bytes: Buffer): Promise<Encoder>;
};

const sharpCodec: ImageCodec = {
  async probe(bytes) {
    const { default: sharp } = await import("sharp");
    const meta = await sharp(bytes).metadata();
    return { width: meta.width, height: meta.height, format: meta.format ?? "" };
  },
  async open(bytes) {
    const { default: sharp } = await import("sharp");
    const image = sharp(bytes);
    return (width, format, quality) =>
      image.clone().resize({ width, withoutEnlargement: true }).toFormat(format, { quality }).toBuffer();
  },
};

function imagesCodec(images: ImagesBindingLike): ImageCodec {
  // El binding consume un flujo por llamada: no hay original "abierto" que
  // reutilizar, así que cada variante vuelve a leer los mismos bytes en memoria.
  const stream = (bytes: Buffer) => new Blob([new Uint8Array(bytes)]).stream();
  return {
    async probe(bytes) {
      const info = await images.info(stream(bytes));
      // Images responde el tipo MIME ("image/png"); sharp, el nombre ("png").
      return { width: info.width, height: info.height, format: info.format.replace(/^image\//, "") };
    },
    async open(bytes) {
      return async (width, format, quality) => {
        // Los anchos ya vienen filtrados por debajo del original: aquí nunca se agranda.
        const result = await images
          .input(stream(bytes))
          .transform({ width })
          .output({ format: `image/${format}`, quality });
        return Buffer.from(await result.response().arrayBuffer());
      };
    },
  };
}

function imageCodec(): ImageCodec {
  const cf = cloudflare();
  if (cf) {
    if (!cf.env.IMAGES) throw new Error("Falta el binding IMAGES en el Worker.");
    return imagesCodec(cf.env.IMAGES);
  }
  return sharpCodec;
}

/** Anchos de la decisión 0001. */
const WIDTHS = [400, 800, 1600, 2400];

/** AVIF primero por peso; WebP como respaldo para navegadores viejos. */
const FORMATS = ["avif", "webp"] as const;

/**
 * Dónde viven las fotos.
 *
 * **Fuera de `public/` a propósito.** Next resuelve el contenido de `public/`
 * durante la compilación, así que un archivo escrito ahí después del build no se
 * sirve: responde 404 hasta el siguiente despliegue. Como aquí las fotos las
 * sube el cliente en cualquier momento, guardarlas ahí rompía justamente lo que
 * este sprint viene a resolver.
 *
 * Se sirven por `src/app/media/[...path]/route.ts`. En producción esa ruta la
 * reemplaza el CDN sobre el mismo almacén (decisión 0001) sin cambiar las URL.
 */
export const MEDIA_ROOT = process.env.MEDIA_ROOT
  ? path.resolve(process.env.MEDIA_ROOT)
  : path.join(process.cwd(), "var", "media");

const MAX_BYTES = 25 * 1024 * 1024;

export type UploadResult = { mediaId: string; url: string };

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

/**
 * Guarda el original y encola su procesamiento.
 *
 * Se valida el contenido con sharp y no el nombre ni el tipo declarado: quien
 * sube puede llamarle `.jpg` a cualquier cosa, y el tipo que manda el navegador
 * lo elige el navegador. Lo único que prueba que es una imagen es abrirla.
 */
export async function uploadImage(
  productId: string,
  file: { name: string; bytes: Buffer },
  staffId: string | null,
): Promise<UploadResult> {
  if (file.bytes.length === 0) throw new MediaError("El archivo llegó vacío.");
  if (file.bytes.length > MAX_BYTES) {
    throw new MediaError("La foto pesa más de 25 MB. Bájale la resolución antes de subirla.");
  }

  let meta: Awaited<ReturnType<ImageCodec["probe"]>>;
  try {
    meta = await imageCodec().probe(file.bytes);
  } catch {
    throw new MediaError("Ese archivo no es una imagen que se pueda procesar.");
  }

  if (!meta.width || !meta.height) {
    throw new MediaError("No se pudieron leer las dimensiones de la imagen.");
  }
  if (meta.width < 800) {
    // Menos de 800 px se ve mal en un teléfono moderno y no hay forma de
    // arreglarlo después: es mejor decirlo ahora que publicarlo borroso.
    throw new MediaError(
      `La foto mide ${meta.width} px de ancho. Se necesitan al menos 800 px para que se vea bien.`,
    );
  }

  const slug = randomUUID();
  const extension = meta.format === "png" ? "png" : "jpg";
  const originalName = `${slug}-original.${extension}`;
  const url = await mediaStorage().save(originalName, file.bytes);

  const rows = await db.execute<{ id: string }>(sql`
    insert into product_media (product_id, url, original_url, kind, width, height, bytes,
                               uploaded_by, position)
    values (
      ${productId}::uuid,
      ${url},
      ${url},
      'image',
      ${meta.width}, ${meta.height}, ${file.bytes.length},
      ${staffId}::uuid,
      coalesce((select max(position) + 1 from product_media where product_id = ${productId}::uuid), 0)
    )
    returning id
  `);

  const mediaId = rows[0]!.id;
  await db.execute(sql`insert into media_jobs (media_id) values (${mediaId}::uuid)`);

  return { mediaId, url };
}

export type MediaReport = { processed: number; failed: number };

/**
 * Genera las variantes pendientes. Lo llama el mismo latido que despacha avisos.
 *
 * No se generan anchos mayores que el original: agrandar una foto no agrega
 * información, solo peso. Una foto de 1200 px produce 400, 800 y 1200; pedirle
 * 2400 sería servir el doble de bytes por la misma imagen borrosa.
 */
export async function processMediaJobs(limit = 4): Promise<MediaReport> {
  const report: MediaReport = { processed: 0, failed: 0 };

  const jobs = await db.execute<{
    id: string;
    media_id: string;
    original_url: string;
    width: number;
    attempts: number;
  }>(sql`
    select j.id, j.media_id, m.original_url, m.width, j.attempts
      from media_jobs j
      join product_media m on m.id = j.media_id
     where j.status = 'pending'
     order by j.created_at
     limit ${limit}
     for update of j skip locked
  `);

  const storage = mediaStorage();
  const codec = imageCodec();

  for (const job of jobs) {
    try {
      // En Blob esto es una descarga por HTTP, no abrir un archivo — el mismo
      // latido puede correr en una instancia distinta a la que recibió la
      // subida, así que nunca se puede asumir que el original sigue en disco.
      const original = await storage.read(job.original_url);
      const encode = await codec.open(original);
      const variants: Record<string, Record<string, string>> = {};

      // Nunca por encima del ancho original.
      const widths = WIDTHS.filter((width) => width <= job.width);
      if (widths.length === 0) widths.push(job.width);

      for (const format of FORMATS) {
        variants[format] = {};
        for (const width of widths) {
          const name = `${path.basename(job.original_url).replace(/-original\.\w+$/, "")}-${width}.${format}`;
          const buffer = await encode(width, format, format === "avif" ? 50 : 72);
          variants[format]![String(width)] = await storage.save(name, buffer);
        }
      }

      // La URL que sirve la vitrina pasa a ser la variante mediana; el original
      // se conserva para poder reprocesar si algún día se agrega un ancho.
      const preferred =
        variants.webp?.["800"] ?? variants.webp?.[String(widths[0])] ?? job.original_url;

      await db.execute(sql`
        update product_media
           set variants = ${JSON.stringify(variants)}::jsonb,
               url = ${preferred}
         where id = ${job.media_id}::uuid
      `);
      await db.execute(sql`
        update media_jobs set status = 'done', attempts = attempts + 1, updated_at = now()
         where id = ${job.id}::uuid
      `);
      report.processed += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      await db.execute(sql`
        update media_jobs
           set status = ${attempts >= 3 ? "failed" : "pending"},
               attempts = ${attempts},
               last_error = ${error instanceof Error ? error.message : String(error)},
               updated_at = now()
         where id = ${job.id}::uuid
      `);
      report.failed += 1;
    }
  }

  return report;
}

/**
 * Borra una foto del producto y sus archivos.
 *
 * Aquí sí se borra de verdad, a diferencia del inventario: una foto retirada no
 * tiene historia que conservar, y dejar archivos huérfanos en el disco es una
 * factura que crece sola.
 */
export async function deleteImage(mediaId: string): Promise<void> {
  const rows = await db.execute<{ original_url: string | null; variants: unknown }>(sql`
    delete from product_media where id = ${mediaId}::uuid
    returning original_url, variants
  `);

  const row = rows[0];
  if (!row) return;

  const urls: string[] = [];
  if (row.original_url) urls.push(row.original_url);
  const variants = (row.variants ?? {}) as Record<string, Record<string, string>>;
  for (const byWidth of Object.values(variants)) {
    urls.push(...Object.values(byWidth));
  }

  const storage = mediaStorage();
  await Promise.all(urls.map((url) => storage.remove(url)));
}
