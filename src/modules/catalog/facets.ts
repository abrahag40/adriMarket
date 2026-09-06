import type { ProductKind } from "@/i18n/config";
import type { CatalogCard } from "./queries";

/**
 * Facetas del listado · el filtro lateral
 *
 * ## Por qué se filtra aquí y no en SQL
 *
 * `listCatalog` sabe filtrar por tipo, ubicación y huéspedes, y hasta ahora el
 * listado usaba eso. Un filtro lateral con cuentas —"Tulum (6)", "Hasta $1,500
 * (11)"— no puede: **cada faceta se cuenta sobre el resultado sin esa faceta**
 * y con las demás aplicadas, así que serían cuatro consultas más por página, y
 * cuatro oportunidades de que la cuenta y el resultado se contradigan. Una
 * faceta que dice "(6)" y devuelve 4 es peor que no tener cuentas.
 *
 * Con una sola consulta —el catálogo del tipo pedido, que hoy son 53 tours en
 * el peor caso— las cuentas y los resultados salen del mismo arreglo y no
 * pueden discrepar. El precio y la capacidad ya vienen calculados por el
 * servidor en cada tarjeta; aquí solo se comparan.
 *
 * **Esto no mueve la frontera de "el SQL manda".** Lo que el SQL sigue
 * decidiendo es qué se publica, qué precio tiene y con qué impuesto — lo que
 * se hace aquí es recortar una lista que ya llegó decidida. El día que el
 * catálogo tenga miles de productos, esto vuelve a SQL con una consulta de
 * agregados por faceta; el corte está en que la consulta ya trae todo.
 */

export type PriceRange = {
  /** Inclusivo. `null` es "sin mínimo". */
  minCents: number | null;
  /** Exclusivo, para que dos cubetas contiguas no cuenten dos veces el borde. */
  maxCents: number | null;
};

export type Facets = {
  kind?: ProductKind;
  locationSlug?: string;
  guests?: number;
  price?: PriceRange;
};

/** Las capacidades que ofrece la faceta de personas. */
export const GUEST_OPTIONS = [1, 2, 4, 6, 8, 10] as const;

function matchesPrice(item: CatalogCard, range: PriceRange): boolean {
  /* Un producto sin precio publicado no entra en ninguna cubeta: decir que
     cuesta cero sería mentir, y ponerlo en todas lo haría aparecer en las tres
     a la vez. Se le ve sin filtro de precio, que es donde está. */
  if (item.fromCents === null) return false;
  if (range.minCents !== null && item.fromCents < range.minCents) return false;
  if (range.maxCents !== null && item.fromCents >= range.maxCents) return false;
  return true;
}

export function matches(item: CatalogCard, facets: Facets): boolean {
  if (facets.kind !== undefined && item.kind !== facets.kind) return false;
  if (facets.locationSlug !== undefined && item.locationSlug !== facets.locationSlug) return false;
  if (facets.guests !== undefined && (item.capacity === null || item.capacity < facets.guests)) {
    return false;
  }
  if (facets.price !== undefined && !matchesPrice(item, facets.price)) return false;
  return true;
}

export function applyFacets(items: CatalogCard[], facets: Facets): CatalogCard[] {
  return items.filter((item) => matches(item, facets));
}

/**
 * Cuántos resultados daría una faceta **si se aplicara ahora**, con las demás
 * como están. Es la cuenta que enseña Mercado Libre junto a cada opción, y la
 * que evita el callejón sin salida: una opción que llevaría a cero no se
 * ofrece.
 */
export function countWith(items: CatalogCard[], facets: Facets, override: Facets): number {
  const combined = { ...facets, ...override };
  return items.reduce((total, item) => (matches(item, combined) ? total + 1 : total), 0);
}

/**
 * Redondea hacia arriba a una cifra "de precio": 1 723 → 1 800, 12 400 →
 * 13 000. Un corte en $1 723 se lee como un error del sistema; uno en $1 800
 * se lee como una decisión.
 */
function niceCeil(cents: number): number {
  if (cents <= 0) return 0;
  const pesos = cents / 100;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(pesos)) - 1);
  return Math.ceil(pesos / magnitude) * magnitude * 100;
}

/**
 * Tres cubetas de precio sacadas del propio catálogo, no de una tabla fija.
 *
 * Una escalera escrita a mano ("hasta $1 000, $1 000–$5 000, más de $5 000")
 * envejece con los precios y deja cubetas vacías o una sola con todo dentro.
 * Estas salen de los percentiles 33 y 66 de lo que hay, así que cada una
 * siempre tiene algo y las tres reparten parejo.
 *
 * Devuelve `[]` cuando no hay dos precios distintos que separar: una faceta de
 * precio con una sola opción no filtra nada y solo ocupa lugar.
 */
export function priceBuckets(items: CatalogCard[]): PriceRange[] {
  const prices = items
    .map((item) => item.fromCents)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (prices.length < 2) return [];

  const at = (fraction: number) => prices[Math.floor((prices.length - 1) * fraction)]!;
  const cuts = [niceCeil(at(1 / 3)), niceCeil(at(2 / 3))]
    .filter((cut) => cut > prices[0]! && cut <= prices[prices.length - 1]!)
    .filter((cut, index, all) => all.indexOf(cut) === index);

  if (cuts.length === 0) return [];

  const buckets: PriceRange[] = [{ minCents: null, maxCents: cuts[0]! }];
  for (let i = 1; i < cuts.length; i += 1) {
    buckets.push({ minCents: cuts[i - 1]!, maxCents: cuts[i]! });
  }
  buckets.push({ minCents: cuts[cuts.length - 1]!, maxCents: null });
  return buckets;
}

/** `1500-4000`, `-1500` o `4000-`, en centavos. Cualquier otra cosa se ignora. */
export function parsePriceRange(raw: string): PriceRange | undefined {
  const match = /^(\d{0,9})-(\d{0,9})$/.exec(raw);
  if (!match) return undefined;
  const [, rawMin = "", rawMax = ""] = match;
  if (rawMin === "" && rawMax === "") return undefined;
  const minCents = rawMin === "" ? null : Number.parseInt(rawMin, 10);
  const maxCents = rawMax === "" ? null : Number.parseInt(rawMax, 10);
  if (minCents !== null && maxCents !== null && minCents >= maxCents) return undefined;
  return { minCents, maxCents };
}

export function serializePriceRange(range: PriceRange): string {
  return `${range.minCents ?? ""}-${range.maxCents ?? ""}`;
}

export function samePriceRange(a: PriceRange, b: PriceRange): boolean {
  return a.minCents === b.minCents && a.maxCents === b.maxCents;
}
