import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogFilters } from "@/components/catalog-filters";
import { Carousel } from "@/components/marketing/carousel";
import { DestinationCard } from "@/components/marketing/destination-card";
import { FeaturedCard } from "@/components/marketing/featured-card";
import { PromoBanner } from "@/components/marketing/promo-banner";
import { RoomCard } from "@/components/marketing/room-card";
import { ValueProps } from "@/components/marketing/value-props";
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

  /* Los carruseles de tours y la cuadrícula de estancias son vitrinas del
     inicio sin filtrar, no el resultado del buscador de arriba — pero solo
     tienen sentido en el inicio sin filtros: con un filtro activo, huésped
     ya pidió ver un subconjunto, y estas vitrinas seguirían mostrando todo
     lo demás junto a ese resultado, contradiciéndolo (una estancia de Tulum
     aparecería igual con `?location=playa-del-carmen`). */
  const noFilters = !filters.kind && !filters.locationSlug && !filters.guests;

  const [items, locations, allItems] = await Promise.all([
    listCatalog(locale, filters),
    listLocations(),
    noFilters ? listCatalog(locale, {}) : Promise.resolve([]),
  ]);

  /* Las vitrinas del inicio muestran una selección, no el catálogo entero:
     con veintiséis tours el carrusel mandaba veintiséis tarjetas de HTML que
     nadie va a recorrer, y el listado de abajo ya está para eso. */
  const featuredTours = allItems
    .filter((item) => item.kind === "tour" && item.coverUrl !== null)
    .slice(0, 8);
  const stays = allItems
    .filter((item) => item.kind === "stay" && item.coverUrl !== null)
    .slice(0, 6);

  /* Doce por página: cuatro filas de tres en escritorio. */
  const POR_PAGINA = 12;
  const sp = await searchParams;
  const pedida = Number.parseInt(String(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1"), 10);
  const totalPaginas = Math.max(1, Math.ceil(items.length / POR_PAGINA));
  const paginaActual = Number.isInteger(pedida) ? Math.min(Math.max(pedida, 1), totalPaginas) : 1;
  const pagina = items.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  /** Conserva los filtros al cambiar de página: solo cambia `page`. */
  function hrefPagina(n: number): string {
    const next = new URLSearchParams();
    if (filters.kind) next.set("kind", filters.kind);
    if (filters.locationSlug) next.set("location", filters.locationSlug);
    if (filters.guests) next.set("guests", String(filters.guests));
    if (n > 1) next.set("page", String(n));
    const query = next.toString();
    return query ? `/${locale}?${query}` : `/${locale}`;
  }

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
    });
  /* Sin tope: al quitar "Destinos" del menú, el inicio quedó como la única
     puerta a los destinos. Cortar a seis dejaba los demás alcanzables solo
     escribiendo la URL a mano. El carrusel absorbe los que haya. */

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
        <section className="home-section" aria-labelledby="destinations-heading">
          <div className="section-head">
            <h2 id="destinations-heading" className="section-title">
              {t.destinationsHeading}
            </h2>
            <p className="muted">{t.destinationsSubtitle}</p>
          </div>
          {/* Carrusel y no cuadrícula: con seis destinos una rejilla de tres
              obliga a dos filas y empuja los tours media pantalla hacia
              abajo. El carrusel los deja recorrer en su propia línea, igual
              que los tours de abajo, y usa el scroll-snap del navegador —sin
              librería— así que en el teléfono se arrastra con el dedo. */}
          <Carousel prevLabel={t.carouselPrev} nextLabel={t.carouselNext}>
            {destinations.map((item) => (
              <DestinationCard
                key={item.locationSlug}
                locale={locale}
                slug={item.locationSlug!}
                name={item.locationName!}
                count={countByLocation.get(item.locationSlug!) ?? 1}
                coverUrl={item.coverUrl!}
                coverWidth={item.coverWidth}
                coverHeight={item.coverHeight}
                coverVariants={item.coverVariants}
              />
            ))}
          </Carousel>
        </section>
      ) : null}

      {featuredTours.length > 0 ? (
        <section className="home-section" aria-labelledby="featured-tours-heading">
          <div className="section-head">
            <h2 id="featured-tours-heading" className="section-title">
              {t.featuredToursHeading}
            </h2>
            <p className="muted">{t.featuredToursSubtitle}</p>
          </div>
          <Carousel prevLabel={t.carouselPrev} nextLabel={t.carouselNext}>
            {featuredTours.map((item) => (
              <FeaturedCard key={item.id} item={item} locale={locale} />
            ))}
          </Carousel>
        </section>
      ) : null}

      {stays.length > 0 ? (
        <section className="home-section" aria-labelledby="stays-heading">
          <div className="section-head">
            <h2 id="stays-heading" className="section-title">
              {t.staysHeading}
            </h2>
            <p className="muted">{t.staysSubtitle}</p>
          </div>
          <ul className="rooms-grid">
            {stays.map((item) => (
              <li key={item.id}>
                <RoomCard item={item} locale={locale} />
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
        <>
          <ul className="grid">
            {pagina.map((item) => (
              <ProductCard key={item.id} item={item} locale={locale} />
            ))}
          </ul>

          {/* Paginación con enlaces, no con un botón de "cargar más": la
              página que se está viendo queda en la URL, se puede compartir y
              funciona sin JavaScript. Y es lo que mantiene la página dentro
              del presupuesto de bytes — con el catálogo completo el listado
              mandaba 28 tarjetas de HTML y se pasaba de los 200 kB que mide
              `npm run audit`. */}
          {totalPaginas > 1 ? (
            <nav className="pager" aria-label={t.resultsCount(items.length)}>
              {paginaActual > 1 ? (
                <Link className="btn btn-secondary" href={hrefPagina(paginaActual - 1)} rel="prev">
                  ← {t.pagePrev}
                </Link>
              ) : (
                <span />
              )}
              <p className="pager-state" aria-current="page">
                {t.pageOf(paginaActual, totalPaginas)}
              </p>
              {paginaActual < totalPaginas ? (
                <Link className="btn btn-secondary" href={hrefPagina(paginaActual + 1)} rel="next">
                  {t.pageNext} →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}

      <PromoBanner locale={locale} />

      <ValueProps
        items={[
          { icon: "wallet", heading: t.valuePropDepositHeading, body: t.valuePropDepositBody },
          { icon: "bolt", heading: t.valuePropInstantHeading, body: t.valuePropInstantBody },
          { icon: "shield", heading: t.valuePropCancelHeading, body: t.valuePropCancelBody },
        ]}
      />
    </div>
  );
}
