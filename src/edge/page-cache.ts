import { isDestinationsSegment, isLocale, kindFromSegment } from "../i18n/config";

/**
 * Caché de páginas públicas en R2 · decisión 0024
 *
 * **Por qué existe.** En Cloudflare Workers, armar una página pública cuesta de
 * 27 a 45 ms de CPU (medido el 2026-11-13), y el plan gratuito da 10 ms por
 * petición: Cloudflare corta las que se pasan con `error code: 1102`. Servir una
 * página ya armada cuesta 1 o 2 ms. Es la diferencia entre pagar Workers Paid o
 * no, y además es lo que la decisión 0020 dejó abierto: que una visita no tenga
 * que despertar la base.
 *
 * **Qué se guarda.** Sólo lo que es igual para cualquier visitante y se pide con
 * GET: la portada y sus listados, la página de destinos y las fichas. Nunca el
 * checkout, los extras, una reserva, el panel, la API ni las fotos (las fotos ya
 * tienen su propia caché de un año, `IMMUTABLE`).
 *
 * **Cuándo deja de valer, y por qué no puede mentir sobre el cupo.** La ficha de
 * un tour enseña los lugares que quedan. Una caché por tiempo enseñaría lugares
 * que ya se vendieron. Por eso la llave lleva una **versión del catálogo** y
 * toda escritura —una reserva, un pago confirmado, una acción del panel, el
 * latido que libera apartados— la sube **antes de responder**. Ninguna página
 * guardada con la versión anterior se vuelve a servir. Y como alguien podría
 * cambiar la base a mano (`prod:sql`), que no pasa por aquí, ninguna copia se
 * sirve con más de `MAX_AGE_MS`.
 *
 * Aunque la caché fallara, el inventario no se rompe: la base sigue impidiendo
 * la sobreventa y el checkout no se guarda nunca.
 *
 * **Por qué R2 y no la caché de Cloudflare (`caches.default`).** Esa es por centro
 * de datos: con pocas visitas, cada visitante llega a un centro distinto y casi
 * nunca acierta. R2 es una sola y es fuertemente consistente, así que una
 * versión subida se ve en todo el mundo en la siguiente lectura.
 *
 * Este módulo es puro salvo `PageCache`: decide qué se guarda y con qué llave, y
 * eso se prueba en `page-cache.test.ts` sin Cloudflare.
 */

/** Ninguna copia se sirve con más de esto, pase lo que pase con la versión. */
export const MAX_AGE_MS = 10 * 60 * 1000;

/** Las cabeceras de Next por las que una respuesta cambia (su `Vary`). */
const VARY = ["rsc", "next-router-state-tree", "next-router-prefetch", "next-router-segment-prefetch"];

/** Cabeceras que nunca se guardan: son de esta respuesta, no de la página. */
const NO_GUARDAR = new Set([
  "set-cookie",
  "date",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "x-robots-tag",
]);

/** Lo que se le dice al navegador de una página servida de la caché: lo mismo que Next. */
const CACHE_CONTROL_NAVEGADOR = "private, no-cache, no-store, max-age=0, must-revalidate";

/** R2 limita los metadatos propios a 2 KiB; por encima de esto, no se guarda. */
const TOPE_METADATOS = 1800;

/**
 * ¿Esta petición puede servirse de la caché? Lista cerrada de rutas: lo que no
 * está aquí se arma siempre, y una ruta nueva no entra por accidente.
 */
export function isCacheable(request: Request): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization")) return false;

  const { pathname } = new URL(request.url);
  const partes = pathname.split("/").filter(Boolean);
  const [locale, segmento, slug, ...resto] = partes;
  if (!locale || !isLocale(locale) || resto.length > 0) return false;

  // /es, /en: la portada y todos sus listados (los filtros van en la consulta).
  if (!segmento) return true;
  // /es/destinos, /en/destinations
  if (!slug) return isDestinationsSegment(locale, segmento);
  // /es/tours/<slug>, /en/stays/<slug>…: sólo colecciones de verdad. Así
  // /es/reserva/<código> y cualquier ruta nueva quedan fuera.
  return kindFromSegment(locale, segmento) !== null;
}

/** ¿La petición escribe algo? Toda escritura sube la versión del catálogo. */
export function isWrite(request: Request): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(request.method);
}

/** ¿Esta respuesta se puede guardar? Sólo una página entera, igual para todos. */
export function isStorable(response: Response): boolean {
  if (response.status !== 200) return false;
  if (response.headers.has("set-cookie")) return false;
  const tipo = response.headers.get("content-type") ?? "";
  return tipo.startsWith("text/html") || tipo.startsWith("text/x-component");
}

async function sha256(texto: string): Promise<string> {
  const huella = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(huella)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * La llave: despliegue, versión del catálogo y la petición. La URL completa
 * —con su consulta— y las cabeceras por las que Next varía la respuesta: una
 * navegación del cliente (`rsc: 1`) recibe otra cosa que una carga completa.
 */
export async function cacheKey(request: Request, deploy: string, catalogo: string): Promise<string> {
  const url = new URL(request.url);
  const variantes = VARY.map((nombre) => `${nombre}:${request.headers.get(nombre) ?? ""}`).join("\n");
  return `paginas/${deploy}/${catalogo}/${await sha256(`${url.pathname}${url.search}\n${variantes}`)}`;
}

/** Las cabeceras que se guardan con la página, o null si no caben en R2. */
export function headersToStore(response: Response): string | null {
  const guardadas: Record<string, string> = {};
  response.headers.forEach((valor, nombre) => {
    if (!NO_GUARDAR.has(nombre.toLowerCase())) guardadas[nombre] = valor;
  });
  const json = JSON.stringify(guardadas);
  return json.length <= TOPE_METADATOS ? json : null;
}

/** Lo mínimo de R2 que usa la caché. */
type Bucket = {
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    customMetadata?: Record<string, string>;
    text(): Promise<string>;
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | string,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown>;
};

const LLAVE_VERSION = "paginas/version-del-catalogo";

export class PageCache {
  constructor(
    private readonly bucket: Bucket,
    private readonly deploy: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** La versión vigente. Se lee en cada petición: una copia en memoria podría estar vieja. */
  async catalogVersion(): Promise<string> {
    const objeto = await this.bucket.get(LLAVE_VERSION);
    return objeto ? await objeto.text() : "0";
  }

  /** Sube la versión: todo lo guardado antes deja de servirse. */
  async bump(): Promise<void> {
    await this.bucket.put(LLAVE_VERSION, `${this.now()}-${crypto.randomUUID()}`);
  }

  /**
   * Sirve la página de la caché o la arma con `render` y la guarda. La llave se
   * calcula ANTES de armar: si una escritura sube la versión mientras tanto, esta
   * copia queda guardada con la versión vieja y nunca se vuelve a servir.
   */
  async serve(request: Request, render: () => Promise<Response>, waitUntil: (p: Promise<unknown>) => void) {
    const llave = await cacheKey(request, this.deploy, await this.catalogVersion());

    const guardada = await this.bucket.get(llave);
    const meta = guardada?.customMetadata;
    if (guardada && meta?.guardado && this.now() - Number(meta.guardado) <= MAX_AGE_MS) {
      const headers = new Headers(JSON.parse(meta.cabeceras ?? "{}"));
      headers.set("cache-control", CACHE_CONTROL_NAVEGADOR);
      headers.set("x-cache", "HIT");
      return new Response(guardada.body, { status: 200, headers });
    }

    const respuesta = await render();
    const cabeceras = isStorable(respuesta) ? headersToStore(respuesta) : null;
    if (cabeceras === null) return respuesta;

    // R2 exige conocer el largo de lo que se guarda: se lee entero una vez.
    const cuerpo = await respuesta.arrayBuffer();
    waitUntil(
      this.bucket.put(llave, cuerpo, { customMetadata: { cabeceras, guardado: String(this.now()) } }),
    );
    const headers = new Headers(respuesta.headers);
    headers.set("x-cache", "MISS");
    return new Response(cuerpo, { status: respuesta.status, statusText: respuesta.statusText, headers });
  }
}
