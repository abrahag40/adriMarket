import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogFilters } from "@/components/catalog-filters";
import { ProductCard } from "@/components/product-card";
import { ResponsiveImage } from "@/components/responsive-image";
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

  /* La foto del hero sale del catálogo real, no de un banco de imágenes: es el
     primer producto publicado que ya tiene fotos. Sin fotos todavía, el hero
     se queda solo con el texto — nunca con una imagen que no es del negocio. */
  const heroItem = items.find((item) => item.coverUrl !== null);

  /* La sección de destinos reutiliza las fotos del catálogo: un destino sin
     ningún producto con foto todavía no aparece. No hay una foto de destino
     aparte que subir ni mantener — es la misma portada que ya se ve en la
     tarjeta del producto. El conteo de la insignia es el mismo dato que
     "N resultados" más abajo, contado por ubicación. */
  const countByLocation = new Map<string, number>();
  for (const item of items) {
    if (item.locationSlug === null) continue;
    countByLocation.set(item.locationSlug, (countByLocation.get(item.locationSlug) ?? 0) + 1);
  }

  const destinationsSeen = new Set<string>();
  const destinations = items
    .filter((item) => item.locationSlug !== null && item.coverUrl !== null)
    .filter((item) => {
      if (destinationsSeen.has(item.locationSlug!)) return false;
      destinationsSeen.add(item.locationSlug!);
      return true;
    })
    .slice(0, 6);

  return (
    <div className="stack">
      <section className={heroItem ? "hero" : "hero hero-no-media"}>
        <div className="hero-copy">
          <span className="hero-eyebrow">{t.heroEyebrow}</span>
          <h1 className="hero-title">
            {t.heroTitleStart} <span className="hero-title-accent">{t.heroTitleAccent}</span>
          </h1>
          <p className="hero-subtitle">{t.tagline}</p>
        </div>
        {heroItem ? (
          <div className="hero-media">
            <ResponsiveImage
              src={heroItem.coverUrl!}
              alt={heroItem.coverAlt ?? ""}
              width={heroItem.coverWidth ?? 1200}
              height={heroItem.coverHeight ?? 900}
              variants={heroItem.coverVariants}
              sizes="(min-width: 860px) 45vw, 100vw"
              priority
            />
          </div>
        ) : null}
      </section>

      <div className={heroItem ? "search-card search-card-overlap" : "search-card"}>
        <CatalogFilters locale={locale} locations={locations} selected={selected} />
      </div>

      {destinations.length > 0 ? (
        <section aria-labelledby="destinations-heading">
          <div className="section-head">
            <h2 id="destinations-heading" className="section-title">
              {t.destinationsHeading}
            </h2>
            <p className="muted">{t.destinationsSubtitle}</p>
          </div>
          <ul className="destinations-grid">
            {destinations.map((item) => (
              <li key={item.locationSlug}>
                <Link
                  className="destination-card"
                  href={`/${locale}?location=${item.locationSlug}`}
                >
                  <ResponsiveImage
                    src={item.coverUrl!}
                    alt=""
                    width={item.coverWidth ?? 600}
                    height={item.coverHeight ?? 600}
                    variants={item.coverVariants}
                    sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
                  />
                  <span className="destination-card-count">
                    {t.resultsCount(countByLocation.get(item.locationSlug!) ?? 1)}
                  </span>
                  <span className="destination-card-name">{item.locationName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

      <section className="cta-banner" aria-labelledby="cta-heading">
        <h2 id="cta-heading" className="cta-heading">
          {t.ctaHeading}
        </h2>
        <p className="cta-body">{t.ctaBody}</p>
        <Link className="btn" href={`/${locale}`}>
          {t.ctaButton}
        </Link>
      </section>
    </div>
  );
}
