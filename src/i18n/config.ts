/**
 * Internacionalización.
 *
 * Se resuelve a mano en lugar de con una librería porque el contenido que
 * importa —nombres, descripciones, qué incluye— vive traducido en la base
 * (`product_translations`). Lo que queda en el código son etiquetas de
 * interfaz, y son pocas. Si el número de cadenas crece o hace falta
 * pluralización, la migración natural es next-intl; ver
 * docs/decisiones/0002-internacionalizacion.md.
 *
 * Las dos versiones viven en rutas distintas (/es y /en) a propósito: si
 * compartieran dirección, solo una posicionaría en buscadores, y el tráfico
 * orgánico en inglés es justo el que evita pagar comisión a un intermediario.
 */

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Etiqueta del idioma en su propio idioma, para el selector. */
export const LOCALE_LABEL: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

/** Etiqueta BCP 47 para formateo de números y fechas. */
export const LOCALE_TAG: Record<Locale, string> = {
  es: "es-MX",
  en: "en-US",
};

export type ProductKind = "tour" | "stay" | "vehicle";

/**
 * Los inventarios que se ocupan **por rango de fechas**: casas y vehículos.
 *
 * Existe para que nadie vuelva a escribir `kind === "stay"` cuando lo que
 * quiere decir es "esto se aparta entre dos fechas". Esa pregunta mal hecha es
 * lo que obliga a tocar veinte archivos cada vez que entra un inventario
 * nuevo; preguntando por el mecanismo, el cuarto inventario que se ocupe por
 * fechas se agrega aquí y en ningún otro lado.
 *
 * Un tour es lo contrario: vende lugares en una salida con hora, y su cupo se
 * agota contando asientos, no ocupando un calendario.
 */
export function isRental(kind: ProductKind): kind is "stay" | "vehicle" {
  return kind !== "tour";
}

/**
 * Segmentos de URL por idioma.
 *
 * El segmento es parte del contenido indexable, así que se traduce:
 * /es/estancias/casa-akumal y /en/stays/casa-akumal.
 */
const COLLECTIONS: Record<Locale, Record<string, ProductKind>> = {
  es: { tours: "tour", estancias: "stay", vehiculos: "vehicle" },
  en: { tours: "tour", stays: "stay", vehicles: "vehicle" },
};

const COLLECTION_SEGMENT: Record<Locale, Record<ProductKind, string>> = {
  es: { tour: "tours", stay: "estancias", vehicle: "vehiculos" },
  en: { tour: "tours", stay: "stays", vehicle: "vehicles" },
};

/** Traduce un segmento de URL al tipo de producto, o null si no existe. */
export function kindFromSegment(locale: Locale, segment: string): ProductKind | null {
  return COLLECTIONS[locale][segment] ?? null;
}

/** Segmento de URL para un tipo de producto en un idioma. */
export function segmentForKind(locale: Locale, kind: ProductKind): string {
  return COLLECTION_SEGMENT[locale][kind];
}

/** Ruta de la ficha de un producto. */
export function productPath(locale: Locale, kind: ProductKind, slug: string): string {
  return `/${locale}/${segmentForKind(locale, kind)}/${slug}`;
}

/** La misma ficha en el otro idioma, para la etiqueta de alternativa. */
export function alternatePath(locale: Locale, kind: ProductKind, slug: string): string {
  const other: Locale = locale === "es" ? "en" : "es";
  return productPath(other, kind, slug);
}

export function otherLocale(locale: Locale): Locale {
  return locale === "es" ? "en" : "es";
}

/**
 * Traduce la ruta actual a su equivalente en el otro idioma, incluido el
 * segmento de colección: /es/estancias/casa-akumal → /en/stays/casa-akumal.
 *
 * Es lo que hace útil al selector de idioma: mandar siempre a la portada
 * obliga al visitante a volver a buscar lo que ya había encontrado.
 */
export function alternateForPathname(locale: Locale, pathname: string): string {
  const other = otherLocale(locale);
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] !== locale) return `/${other}`;

  const rest = parts.slice(1);
  const first = rest[0];
  if (first === undefined) return `/${other}`;

  const kind = kindFromSegment(locale, first);
  if (kind) {
    return `/${[other, segmentForKind(other, kind), ...rest.slice(1)].join("/")}`;
  }
  return `/${[other, ...rest].join("/")}`;
}

/**
 * Elige el idioma a partir de la cabecera Accept-Language.
 * Ante la duda, español: es el idioma de la operación.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number.parseFloat(q.split("=")[1] ?? "0") : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0] ?? "";
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function formatMoney(cents: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
