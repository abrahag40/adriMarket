import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Dónde corre el sistema, y las piezas de Cloudflare cuando corre ahí.
 *
 * El mismo código sirve en Node (desarrollo, pruebas, Vercel) y en Cloudflare
 * Workers (decisión 0023). Lo que cambia entre los dos no se decide con una
 * bandera de "modo": se decide por **dónde está corriendo** y por **qué piezas
 * tiene conectadas**, igual que Stripe, Resend y Blob se eligen por sus llaves.
 *
 * - `navigator.userAgent` vale `"Cloudflare-Workers"` en workerd —en producción
 *   y en `opennextjs-cloudflare preview`— y otra cosa en Node. Es síncrono y no
 *   depende de que OpenNext haya puesto todavía su contexto.
 * - Los *bindings* (Hyperdrive, R2, Images) solo existen dentro de una petición:
 *   OpenNext los guarda en un AsyncLocalStorage, así que dos peticiones
 *   simultáneas ven cada una los suyos y `ctx` es distinto por petición. Eso es
 *   lo que permite usar `ctx` como llave del cliente de base de cada petición
 *   (`src/db/index.ts`).
 */

/** Lo mínimo de un objeto de R2 que este sistema usa. */
export type R2ObjectLike = {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
};

/** Lo mínimo de un bucket de R2 que este sistema usa. */
export type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
};

/** Lo mínimo del binding de Images que este sistema usa. */
export type ImagesBindingLike = {
  info(stream: ReadableStream<Uint8Array>): Promise<{
    format: string;
    fileSize?: number;
    width?: number;
    height?: number;
  }>;
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width?: number; height?: number; fit?: string }): ReturnType<
      ImagesBindingLike["input"]
    >;
    output(options: { format: string; quality?: number }): Promise<{ response(): Response }>;
  };
};

export type CloudflareBindings = {
  /** Hyperdrive hacia el PostgreSQL del sitio (Neon). */
  HYPERDRIVE?: { connectionString: string };
  /** Bucket de R2 donde viven las fotos. */
  MEDIA?: R2BucketLike;
  /** Transformación de imágenes de Cloudflare: reemplaza a `sharp` en Workers. */
  IMAGES?: ImagesBindingLike;
};

export type CloudflareRequest = {
  env: CloudflareBindings;
  ctx: { waitUntil(promise: Promise<unknown>): void };
};

/** ¿Estamos dentro de workerd? */
export function onCloudflare(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

/**
 * El entorno y el contexto de la petición en curso, o `null` fuera de Workers.
 *
 * Llamarla fuera de una petición dentro de Workers (al cargar un módulo, por
 * ejemplo) es un error de programación y truena: no hay petición de la cual
 * tomar los bindings.
 */
export function cloudflare(): CloudflareRequest | null {
  if (!onCloudflare()) return null;
  const { env, ctx } = getCloudflareContext();
  return { env: env as CloudflareBindings, ctx };
}
