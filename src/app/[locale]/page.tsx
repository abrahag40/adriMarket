import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogFilters } from "@/components/catalog-filters";
import { ProductCard } from "@/components/product-card";
import { isLocale, type ProductKind } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { listCatalog, listLocations, type CatalogFilters as Filters } from "@/modules/catalog/queries";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * El catálogo se renderiza en cada petición.
 *
 * Sin esto, Next hornea el listado en el build: el sitio seguiría mostrando
 * productos despublicados y precios viejos hasta el siguiente despliegue. Con
 * el volumen de este catálogo la consulta es de milisegundos, así que la
 * frescura vale más que el caché.
 *
 * Optimización posterior, cuando exista el panel (Sprint 5): volver a
 * generación estática e invalidar por evento al publicar o cambiar tarifas.
 */
export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Los filtros llegan de la URL, así que llegan de un desconocido: se validan
 * antes de tocar la consulta. Un valor inválido se ignora en lugar de reventar
 * la página — quien manipula la URL no merece un error 500, solo un listado sin
 * ese filtro.
 */
function parseFilters(searchParams: Record<string, string | string[] | undefined>): {
  filters: Filters;
  selected: { kind: string; location: string; guests: string };
} {
  const rawKind = single(searchParams.kind);
  const kind: ProductKind | undefined =
    rawKind === "tour" || rawKind === "stay" ? rawKind : undefined;

  const rawLocation = single(searchParams.location);
  const locationSlug = /^[a-z0-9-]{1,64}$/.test(rawLocation) ? rawLocation : undefined;

  const rawGuests = single(searchParams.guests);
  const parsedGuests = Number.parseInt(rawGuests, 10);
  const guests =
    Number.isInteger(parsedGuests) && parsedGuests > 0 && parsedGuests <= 50
      ? parsedGuests
      : undefined;

  return {
    filters: { kind, locationSlug, guests },
    selected: {
      kind: kind ?? "",
      location: locationSlug ?? "",
      guests: guests === undefined ? "" : String(guests),
    },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getMessages(locale);
  return {
    title: t.tagline,
    alternates: { canonical: `/${locale}`, languages: { es: "/es", en: "/en" } },
  };
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const { filters, selected } = parseFilters(await searchParams);

  const [items, locations] = await Promise.all([listCatalog(locale, filters), listLocations()]);

  return (
    <div className="stack">
      <h1 className="page-title">{t.tagline}</h1>

      <CatalogFilters locale={locale} locations={locations} selected={selected} />

      <div className="results-head">
        <h2 className="section-title">{t.resultsCount(items.length)}</h2>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <h3 className="section-title">{t.emptyTitle}</h3>
          <p className="muted">{t.emptyBody}</p>
        </div>
      ) : (
        <ul className="grid">
          {items.map((item) => (
            <ProductCard key={item.id} item={item} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}
