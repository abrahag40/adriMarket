import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

import { MEDIA_ROOT } from "@/modules/media/images";

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
 */

const TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // El nombre lo pone el servidor al subir, pero la URL la escribe quien pida:
  // se resuelve y se comprueba que el resultado siga dentro del almacén. Sin
  // esto, `/media/../../.env` es una ruta válida.
  const target = path.resolve(MEDIA_ROOT, ...segments);
  if (target !== MEDIA_ROOT && !target.startsWith(MEDIA_ROOT + path.sep)) {
    return new Response("no encontrado", { status: 404 });
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return new Response("no encontrado", { status: 404 });
  }
  if (!info.isFile()) return new Response("no encontrado", { status: 404 });

  const type = TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
  const stream = Readable.toWeb(createReadStream(target)) as WebReadableStream<Uint8Array>;

  return new Response(stream as unknown as BodyInit, {
    headers: {
      "content-type": type,
      "content-length": String(info.size),
      // El nombre del archivo lleva el identificador y el ancho, así que un
      // archivo dado nunca cambia de contenido: se puede cachear para siempre.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
