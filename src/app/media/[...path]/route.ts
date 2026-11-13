import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

import { IMMUTABLE, MEDIA_ROOT, mediaBucket, mediaContentType } from "@/modules/media/images";

/**
 * Entrega de las fotos subidas desde el panel · S6-1
 *
 * Existe por un defecto que solo apareció ejecutándolo: **Next resuelve el
 * contenido de `public/` durante la compilación.** Un archivo escrito ahí
 * después del build no se sirve nunca, responde 404. Con las fotos en `public/`,
 * el cliente subía una foto y no la veía hasta el siguiente despliegue — que es
 * exactamente lo contrario del objetivo de este sprint.
 *
 * Así que las fotos viven fuera de `public/` y se sirven por aquí. No hay
 * transformación en el momento de leer: se abre un archivo ya generado y se
 * manda. En producción esta ruta la reemplaza el CDN sobre el mismo almacén, tal
 * como dice la decisión 0001; lo que se conserva es la forma de las URL.
 *
 * **En Cloudflare Workers** (decisión 0023) el almacén es R2: la misma URL
 * `/media/<archivo>` se lee del bucket en lugar del disco.
 */

const NOT_FOUND = () => new Response("no encontrado", { status: 404 });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  const bucket = mediaBucket();
  if (bucket) {
    // En R2 la llave es el nombre del archivo, sin carpetas: todo lo que no sea
    // un solo nombre limpio no puede existir, y así no hay ruta que escape.
    const [name, ...rest] = segments;
    if (!name || rest.length > 0 || !/^[\w.-]+$/.test(name) || name.startsWith(".")) {
      return NOT_FOUND();
    }
    const object = await bucket.get(name);
    if (!object) return NOT_FOUND();
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? mediaContentType(name),
        "content-length": String(object.size),
        etag: object.httpEtag,
        "cache-control": IMMUTABLE,
      },
    });
  }

  // El nombre lo pone el servidor al subir, pero la URL la escribe quien pida:
  // se resuelve y se comprueba que el resultado siga dentro del almacén. Sin
  // esto, `/media/../../.env` es una ruta válida.
  const target = path.resolve(MEDIA_ROOT, ...segments);
  if (target !== MEDIA_ROOT && !target.startsWith(MEDIA_ROOT + path.sep)) {
    return NOT_FOUND();
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return NOT_FOUND();
  }
  if (!info.isFile()) return NOT_FOUND();

  const stream = Readable.toWeb(createReadStream(target)) as WebReadableStream<Uint8Array>;

  return new Response(stream as unknown as BodyInit, {
    headers: {
      "content-type": mediaContentType(target),
      "content-length": String(info.size),
      // El nombre del archivo lleva el identificador y el ancho, así que un
      // archivo dado nunca cambia de contenido: se puede cachear para siempre.
      "cache-control": IMMUTABLE,
    },
  });
}
