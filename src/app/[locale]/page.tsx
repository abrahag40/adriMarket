import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogFilters } from "@/components/catalog-filters";
import {
  ActiveFacets,
  CatalogSidebar,
  type FacetGroup,
} from "@/components/catalog-sidebar";
import { DestinationCard } from "@/components/marketing/destination-card";
import { FeaturedCard } from "@/components/marketing/featured-card";
import { HomeSection } from "@/components/marketing/home-section";
import { PromoBanner } from "@/components/marketing/promo-banner";
import { RoomCard } from "@/components/marketing/room-card";
import { ValueProps } from "@/components/marketing/value-props";
import { ProductCard } from "@/components/product-card";
import { ResponsiveImage } from "@/components/responsive-image";
import { destinationsPath, formatMoney, isLocale, type ProductKind } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import {
  applyFacets,
  countWith,
  GUEST_OPTIONS,
  parsePriceRange,
  priceBuckets,
  samePriceRange,
  serializePriceRange,
  type Facets,
  type PriceRange,
} from "@/modules/catalog/facets";
import { listCatalog, listLocations } from "@/modules/catalog/queries";

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
  filters: Facets;
  selected: { kind: string; location: string; guests: string };
} {
  const rawKind = single(searchParams.kind);
  const kind: ProductKind | undefined =
    rawKind === "tour" || rawKind === "stay" || rawKind === "vehicle" ? rawKind : undefined;

  const rawLocation = single(searchParams.location);
  const locationSlug = /^[a-z0-9-]{1,64}$/.test(rawLocation) ? rawLocation : undefined;

  const rawGuests = single(searchParams.guests);
  const parsedGuests = Number.parseInt(rawGuests, 10);
  const guests =
    Number.isInteger(parsedGuests) && parsedGuests > 0 && parsedGuests <= 50
      ? parsedGuests
      : undefined;

  const price = parsePriceRange(single(searchParams.price));

  return {
    filters: { kind, locationSlug, guests, price },
    selected: {
      kind: kind ?? "",
      location: locationSlug ?? "",
      guests: guests === undefined ? "" : String(guests),
    },
  };
}

/**
 * El listado por tipo es una **página de categoría**, no una búsqueda: tiene
 * su propio título ("Tours") y su propio canonical, que es lo que hace que
 * `/es?kind=tour` pueda posicionar por sí misma. Cualquier otra combinación de
 * filtros —ubicación, personas, precio— sí es el resultado de una búsqueda, y
 * su canonical apunta al inicio: sin eso, cada cruce de facetas sería una URL
 * distinta con el mismo catálogo dentro, y el buscador gastaría su
 * presupuesto de rastreo en recorrer combinaciones en vez de fichas.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getMessages(locale);
  const { filters } = parseFilters(await searchParams);

  const soloTipo =
    filters.kind !== undefined &&
    filters.locationSlug === undefined &&
    filters.guests === undefined &&
    filters.price === undefined;

  if (soloTipo) {
    const heading = { tour: t.filterKindTour, stay: t.filterKindStay, vehicle: t.filterKindVehicle }[
      filters.kind!
    ];
    return {
      title: heading,
      alternates: {
        canonical: `/${locale}?kind=${filters.kind}`,
        languages: { es: `/es?kind=${filters.kind}`, en: `/en?kind=${filters.kind}` },
      },
    };
  }

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

  /* Las vitrinas del inicio no son el resultado del buscador: solo tienen
     sentido en el inicio sin filtros. Con un filtro activo, el huésped ya
     pidió ver un subconjunto, y estas vitrinas seguirían mostrando todo lo
     demás junto a ese resultado, contradiciéndolo (una estancia de Tulum
     aparecería igual con `?location=playa-del-carmen`). */
  const noFilters =
    !filters.kind && !filters.locationSlug && !filters.guests && !filters.price;

  /* **Una sola consulta, sin filtrar.** Antes eran dos —el catálogo entero
     para las vitrinas y el filtrado para el listado— y el listado filtraba en
     SQL. El filtro lateral no puede trabajar así: cada faceta enseña cuántos
     resultados daría, y esa cuenta se saca del resultado **sin** esa faceta.
     Con SQL serían cuatro consultas más por página y cuatro oportunidades de
     que la cuenta y la lista se contradigan. Ver `modules/catalog/facets.ts`
     para dónde está el límite de esto. */
  const [allItems, locations] = await Promise.all([listCatalog(locale, {}), listLocations()]);
  const items = applyFacets(allItems, filters);

  /* Las vitrinas del inicio muestran una selección, no el catálogo entero:
     con veintiséis tours el carrusel mandaba veintiséis tarjetas de HTML que
     nadie va a recorrer, y el listado de abajo ya está para eso.

     Tres tours y no ocho: en una cuadrícula de tres columnas, tres son una
     fila entera y cada foto ocupa un tercio del ancho —el tamaño con el que
     una foto de destino vende—. Ocho en esa cuadrícula serían tres filas, la
     última coja, y la portada volvería a parecerse a un listado. Los otros
     veintitantos están a un clic, en la salida de abajo. */
  /* `showcase` está vacío en cuanto hay un filtro, y de ahí cuelgan las
     cuatro vitrinas. Antes lo conseguía la consulta —el catálogo completo
     solo se pedía sin filtros—, pero ahora esa consulta es la única que hay y
     trae todo siempre. Sin este corte, filtrar "Tours" enseñaba las tres
     vitrinas del inicio **encima** del listado filtrado: la portada entera
     colgada de una búsqueda. */
  const showcase = noFilters ? allItems : [];

  const featuredTours = showcase
    .filter((item) => item.kind === "tour" && item.coverUrl !== null)
    .slice(0, 3);
  const stays = showcase
    .filter((item) => item.kind === "stay" && item.coverUrl !== null)
    .slice(0, 6);
  const vehicles = showcase
    .filter((item) => item.kind === "vehicle" && item.coverUrl !== null)
    .slice(0, 6);

  /* El número que va en la salida de cada vitrina sale del catálogo entero,
     no de la muestra: "Ver los 27 tours" cuando arriba se ven ocho es
     justamente lo que hace que valga la pena pulsarlo. */
  const totalTours = allItems.filter((item) => item.kind === "tour").length;
  const totalEstancias = allItems.filter((item) => item.kind === "stay").length;
  const totalVehiculos = allItems.filter((item) => item.kind === "vehicle").length;

  /* Seis por página: dos filas de tres en escritorio. El inicio lleva arriba
     el hero, el buscador, los destinos y los tours destacados; debajo de todo
     eso, dos filas se leen como una muestra y no como el catálogo entero
     pegado a la portada. Quien quiere ver todo pagina o filtra. */
  const POR_PAGINA = 6;
  const sp = await searchParams;
  const pedida = Number.parseInt(String(Array.isArray(sp.page) ? sp.page[0] : sp.page ?? "1"), 10);
  const totalPaginas = Math.max(1, Math.ceil(items.length / POR_PAGINA));
  const paginaActual = Number.isInteger(pedida) ? Math.min(Math.max(pedida, 1), totalPaginas) : 1;
  const pagina = items.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);

  /**
   * La URL de esta misma vista con una faceta cambiada.
   *
   * Es el corazón del filtro lateral: cada opción, cada ficha que se quita y
   * cada página son esta función con un `override` distinto. `null` en un
   * campo lo borra de la URL — es lo que hace que una opción ya elegida se
   * pueda desmarcar pulsándola otra vez.
   *
   * **Cambiar cualquier faceta vuelve a la página 1.** Sin esto, filtrar
   * "Tulum" desde la página 4 de tours dejaba `page=4` con seis resultados
   * totales: una página vacía que parece un error del sitio.
   */
  function hrefCon(
    override: Partial<{
      kind: ProductKind | null;
      location: string | null;
      guests: number | null;
      price: PriceRange | null;
      page: number;
    }> = {},
  ): string {
    const next = new URLSearchParams();

    const kind = override.kind === undefined ? filters.kind : (override.kind ?? undefined);
    const location =
      override.location === undefined ? filters.locationSlug : (override.location ?? undefined);
    const guests = override.guests === undefined ? filters.guests : (override.guests ?? undefined);
    const price = override.price === undefined ? filters.price : (override.price ?? undefined);

    if (kind) next.set("kind", kind);
    if (location) next.set("location", location);
    if (guests) next.set("guests", String(guests));
    if (price) next.set("price", serializePriceRange(price));
    if (override.page !== undefined && override.page > 1) next.set("page", String(override.page));

    const query = next.toString();
    /* El ancla no es decorativa: sin ella, cambiar de página o de faceta
       recarga la vista arriba del todo y el huésped ve exactamente lo mismo
       que antes de pulsar. La paginación funcionaba y parecía rota. */
    return `/${locale}${query ? `?${query}` : ""}#resultados`;
  }

  /** Solo para el paginador: conserva las facetas y cambia la página. */
  const hrefPagina = (n: number) => hrefCon({ page: n });

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
  const allDestinations = items
    .filter((item) => item.locationSlug !== null && item.coverUrl !== null)
    .filter((item) => {
      if (destinationsSeen.has(item.locationSlug!)) return false;
      destinationsSeen.add(item.locationSlug!);
      return true;
    });

  /* Seis, en dos filas de tres. La vez pasada no había tope porque el inicio
     era la única puerta a los destinos: cortar dejaba los demás alcanzables
     solo escribiendo la URL a mano. Ahora la salida de abajo lleva a
     `/es/destinos`, que los lista todos, así que la portada puede hacer lo
     que hace una portada —enseñar una muestra— sin esconder nada. */
  const destinations = allDestinations.slice(0, 6);

  /* ---------------------------------------------------------------------
     Las facetas del filtro lateral.

     Cada grupo se cuenta **sobre el resultado sin ese grupo**: las cuentas de
     "Ubicación" salen del catálogo con el tipo, las personas y el precio
     aplicados, pero sin ubicación. Contarlas con la ubicación puesta daría el
     resultado actual en la opción elegida y cero en todas las demás, que es la
     forma más rápida de convertir un filtro en un callejón.

     Una opción que daría cero no se ofrece — no se listan destinos donde no
     hay nada del tipo que se está viendo. */
  const kindLabels: Record<ProductKind, string> = {
    tour: t.filterKindTour,
    stay: t.filterKindStay,
    vehicle: t.filterKindVehicle,
  };

  /* El nombre del destino filtrado: lo usan el título de la vista y su ficha. */
  const nombreUbicacion = filters.locationSlug
    ? (locations.find((location) => location.slug === filters.locationSlug)?.name ??
      filters.locationSlug)
    : null;

  const facetGroups: FacetGroup[] = [];

  /**
   * Arma un grupo, o no lo arma.
   *
   * Se descarta una opción que daría **cero** —el callejón— y también una que
   * daría **todo**, porque no filtra nada y solo alarga la lista: en tours,
   * "1 o más personas", "2 o más" y "4 o más" daban los 31 resultados los
   * tres, y quien los leía tenía que probarlos para descubrir que no hacían
   * nada. Lo que ya está elegido nunca se descarta: desaparecería la opción
   * que hay que volver a pulsar para quitarla.
   *
   * Y si queda una sola opción, el grupo entero se va: un filtro con una
   * alternativa no es un filtro.
   *
   * ## La fila de "Todo" desaparece cuando vaciaría la vista entera
   *
   * Estando en tours, "Tipo · Todo" apuntaba a `/es` —sin ningún parámetro— y
   * `/es` **no es un listado**: es la portada, que desde la decisión 0008 no
   * lleva catálogo dentro. La opción prometía "48" y entregaba el hero, los
   * destinos y las cuatro vitrinas, sin una sola de esas 48 tarjetas.
   *
   * Se quita la fila en vez de quitarle la cuenta: relabelar el problema lo
   * deja ahí. Desde una vista con dos filtros la fila sigue —"Todo" desde
   * `?kind=tour&location=tulum` lleva a `?location=tulum`, que sí es un
   * listado y sí tiene esas cuentas—; vaciarlo todo es lo que hacen las
   * fichas de arriba y su "Quitar filtros", que están junto a los resultados
   * y dicen exactamente eso.
   */
  function agregarGrupo(
    id: string,
    heading: string,
    anyLabel: string,
    anyHref: string,
    anySelected: boolean,
    total: number,
    options: { label: string; href: string; count: number; selected: boolean }[],
  ): void {
    const utiles = options.filter(
      (option) => option.selected || (option.count > 0 && option.count < total),
    );
    if (utiles.length < 2) return;

    const llevaAlListado = anyHref.includes("?");

    facetGroups.push({
      id,
      heading,
      any: llevaAlListado
        ? { label: anyLabel, href: anyHref, count: total, selected: anySelected }
        : null,
      options: utiles,
    });
  }

  /* El tipo también es una faceta, y sigue aquí aunque la vista ya sea "de un
     tipo": el buscador de arriba desaparece en cuanto hay filtros —volver a
     pedir el tipo que ya se eligió era justamente la queja—, así que sin esto
     no habría forma de pasar de tours a estancias sin volver al inicio.
     Enseñar dónde estoy y ofrecer el salto no es lo mismo que preguntármelo
     otra vez en un formulario. */
  const sinTipo: Facets = { ...filters, kind: undefined };
  agregarGrupo(
    "facet-kind",
    t.filterKind,
    t.filterKindAll,
    hrefCon({ kind: null, page: 1 }),
    filters.kind === undefined,
    countWith(allItems, sinTipo, {}),
    (["tour", "stay", "vehicle"] as const).map((kind) => ({
      label: kindLabels[kind],
      href: hrefCon({ kind, page: 1 }),
      count: countWith(allItems, sinTipo, { kind }),
      selected: filters.kind === kind,
    })),
  );

  const sinUbicacion: Facets = { ...filters, locationSlug: undefined };
  agregarGrupo(
    "facet-location",
    t.filterLocation,
    t.filterLocationAll,
    hrefCon({ location: null, page: 1 }),
    filters.locationSlug === undefined,
    countWith(allItems, sinUbicacion, {}),
    locations.map((location) => ({
      label: location.name,
      href: hrefCon({ location: location.slug, page: 1 }),
      count: countWith(allItems, sinUbicacion, { locationSlug: location.slug }),
      selected: filters.locationSlug === location.slug,
    })),
  );

  const sinPersonas: Facets = { ...filters, guests: undefined };
  agregarGrupo(
    "facet-guests",
    t.filterGuests,
    t.filterGuestsAny,
    hrefCon({ guests: null, page: 1 }),
    filters.guests === undefined,
    countWith(allItems, sinPersonas, {}),
    GUEST_OPTIONS.map((n) => ({
      label: t.filterGuestsOption(n),
      href: hrefCon({ guests: n, page: 1 }),
      count: countWith(allItems, sinPersonas, { guests: n }),
      selected: filters.guests === n,
    })),
  );

  /* Las cubetas de precio salen del catálogo que se está viendo, no de una
     escalera escrita a mano: un tour parte de $650 y una casa de $1,450, así
     que un corte fijo dejaría cubetas vacías en una de las dos secciones. */
  const sinPrecio: Facets = { ...filters, price: undefined };
  const cubetas = priceBuckets(applyFacets(allItems, sinPrecio));

  /* La moneda sale del catálogo, no de una constante: el modelo la guarda por
     producto y todo el catálogo de hoy es MXN, pero escribirlo aquí sería
     inventar un supuesto que la base no hace. */
  const moneda = allItems[0]?.currency ?? "MXN";

  /** El texto de una cubeta: "Hasta $1,500", "$1,500 a $2,600", "Más de $2,600". */
  /* Función flecha y no declaración: TypeScript no conserva el estrechamiento
     de `locale` —de `string` a `"es" | "en"`, que hizo `isLocale` arriba—
     dentro de una declaración de función, porque está izada y podría llamarse
     antes de la comprobación. */
  const etiquetaPrecio = (range: PriceRange): string => {
    const min = range.minCents === null ? "" : formatMoney(range.minCents, moneda, locale);
    const max = range.maxCents === null ? "" : formatMoney(range.maxCents, moneda, locale);
    if (range.minCents === null) return t.filterPriceUpTo(max);
    if (range.maxCents === null) return t.filterPriceOver(min);
    return t.filterPriceBetween(min, max);
  };

  agregarGrupo(
    "facet-price",
    t.filterPrice,
    t.filterPriceAny,
    hrefCon({ price: null, page: 1 }),
    filters.price === undefined,
    countWith(allItems, sinPrecio, {}),
    cubetas.map((range) => ({
      label: etiquetaPrecio(range),
      href: hrefCon({ price: range, page: 1 }),
      count: countWith(allItems, sinPrecio, { price: range }),
      selected: filters.price !== undefined && samePriceRange(filters.price, range),
    })),
  );

  /* Las fichas de lo puesto, para quitarlo de una en una. En el teléfono la
     barra lateral está cerrada, así que sin esto los filtros activos serían
     invisibles justo donde más confunde ver pocos resultados. */
  const chips: { label: string; removeHref: string }[] = [];
  if (filters.kind) {
    chips.push({ label: kindLabels[filters.kind], removeHref: hrefCon({ kind: null, page: 1 }) });
  }
  if (filters.locationSlug && nombreUbicacion) {
    chips.push({ label: nombreUbicacion, removeHref: hrefCon({ location: null, page: 1 }) });
  }
  if (filters.guests) {
    chips.push({
      label: t.filterGuestsOption(filters.guests),
      removeHref: hrefCon({ guests: null, page: 1 }),
    });
  }
  if (filters.price) {
    chips.push({
      label: etiquetaPrecio(filters.price),
      removeHref: hrefCon({ price: null, page: 1 }),
    });
  }

  /* El título de la vista filtrada. El tipo deja de ser un campo del buscador
     y pasa a ser el nombre de la página, que es lo que hace cualquier tienda:
     "Tours", no "Tipo: Tours". Sin tipo manda el destino —a `/es?location=tulum`
     se llega desde una tarjeta que decía "Tulum", y encontrarse "Todo el
     catálogo" hace dudar de si el clic funcionó—. El resto de lo filtrado está
     en las fichas de abajo, que además se pueden quitar. */
  const listingTitle = filters.kind
    ? kindLabels[filters.kind]
    : (nombreUbicacion ?? t.listingAllHeading);

  return (
    <div className="stack home-stack">
      {/* El hero es la portada del inicio, no de un resultado de búsqueda.
          Con un filtro aplicado, quien busca ya sabe a qué vino: media
          pantalla de portada antes de los resultados solo lo aleja de ellos.
          Es lo que hace la plantilla de referencia en su página de rejilla. */}
      {noFilters ? (
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
      ) : null}

      {/* **El buscador horizontal es del inicio, no del listado.** Con un
          filtro puesto volvía a preguntar el tipo que el huésped acababa de
          elegir —"Tipo: Tours" en la vista de tours— y repetía, en forma de
          formulario con botón de Aplicar, exactamente lo que la barra lateral
          hace en un clic. Dos filtros para lo mismo en la misma pantalla no
          es redundancia: es la duda de cuál manda. */}
      {noFilters ? (
        <div className={heroItem ? "search-card search-card-overlap" : "search-card"}>
          <CatalogFilters locale={locale} locations={locations} selected={selected} />
        </div>
      ) : null}

      {/* Los tres hechos que distinguen cómo cobra este negocio, donde se
          toma la decisión. Estaban al final: **arrancaban en el píxel 7,686
          de una página de 8,692** en un teléfono —el 88%—, así que
          prácticamente nadie los leía. Un argumento de venta al 88% de la
          página no es un argumento, es una nota al pie. El detalle sigue
          donde ya estaba, en la ficha junto al botón de reservar. */}
      {noFilters ? (
        <ValueProps
          compact
          items={[
            { icon: "wallet", heading: t.valuePropDepositHeading, body: t.valuePropDepositBody },
            { icon: "bolt", heading: t.valuePropInstantHeading, body: t.valuePropInstantBody },
            { icon: "shield", heading: t.valuePropCancelHeading, body: t.valuePropCancelBody },
          ]}
        />
      ) : null}

      {/* Solo en el inicio sin filtrar. Al entrar a un destino —que es un
          filtro `?location=`— volver a enseñar "Destinos populares" contradice
          lo que el huésped acaba de pedir y le ofrece salirse de donde entró.
          Tours y estancias ya se ocultaban por venir de `allItems`, que queda
          vacío al filtrar; destinos se calcula sobre `items` y por eso seguía
          apareciendo. */}
      {noFilters && destinations.length > 0 ? (
        <HomeSection
          id="destinations-heading"
          title={t.destinationsHeading}
          subtitle={t.destinationsSubtitle}
          action={{
            href: destinationsPath(locale),
            label: t.viewAllDestinations(allDestinations.length),
          }}
        >
          {/* Cuadrícula y no riel: seis destinos son dos filas de tres, que
              es como se ven todos de un vistazo y se comparan. Un riel los
              deja en una línea que hay que arrastrar para descubrir que
              sigue —y aquí no sigue, son seis contados—. */}
          <ul className="destinations-grid">
            {destinations.map((item) => (
              <li key={item.locationSlug}>
                <DestinationCard
                  locale={locale}
                  slug={item.locationSlug!}
                  name={item.locationName!}
                  count={countByLocation.get(item.locationSlug!) ?? 1}
                  coverUrl={item.coverUrl!}
                  coverWidth={item.coverWidth}
                  coverHeight={item.coverHeight}
                  coverVariants={item.coverVariants}
                />
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}

      {featuredTours.length > 0 ? (
        <HomeSection
          id="featured-tours-heading"
          title={t.featuredToursHeading}
          subtitle={t.featuredToursSubtitle}
          action={{ href: `/${locale}?kind=tour`, label: t.viewAllTours(totalTours) }}
        >
          {/* Tres tarjetas altas en una fila, no un riel: es la composición
              de la referencia y la que le da a la foto el alto con el que
              vende. Un riel de tres no tiene a dónde desplazarse. */}
          <ul className="featured-grid">
            {featuredTours.map((item) => (
              <li key={item.id}>
                <FeaturedCard item={item} locale={locale} />
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}

      {stays.length > 0 ? (
        <HomeSection
          id="stays-heading"
          title={t.staysHeading}
          subtitle={t.staysSubtitle}
          action={{ href: `/${locale}?kind=stay`, label: t.viewAllStays(totalEstancias) }}
        >
          {/* Cuadrícula de tres, dos filas, igual que los destinos. Estuvo en
              riel desde la decisión 0008 —seis tarjetas apiladas medían 2 693
              px en un teléfono— y vuelve con el corte que faltaba entonces:
              dos columnas en el teléfono, no una. */}
          <ul className="rooms-grid">
            {stays.map((item) => (
              <li key={item.id}>
                <RoomCard item={item} locale={locale} />
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}

      {/* Misma cuadrícula y misma tarjeta que las estancias: los dos son
          unidades que se rentan por fechas, y lo que cambia es el texto. */}
      {vehicles.length > 0 ? (
        <HomeSection
          id="vehicles-heading"
          title={t.vehiclesHeading}
          subtitle={t.vehiclesSubtitle}
          action={{ href: `/${locale}?kind=vehicle`, label: t.viewAllVehicles(totalVehiculos) }}
        >
          <ul className="rooms-grid">
            {vehicles.map((item) => (
              <li key={item.id}>
                <RoomCard item={item} locale={locale} />
              </li>
            ))}
          </ul>
        </HomeSection>
      ) : null}

      {/* El listado completo **solo aparece cuando alguien busca**.
          
          En el inicio ocupaba 3,198px de los 12,099 que medía la página en un
          teléfono —una cuarta parte— para enseñar un catálogo que ya está
          resumido arriba en cuatro vitrinas. Amazon y Mercado Libre tampoco
          listan su catálogo en la portada: la portada dice qué se vende y
          encamina; el listado es la respuesta a una pregunta. */}
      {noFilters ? null : (
        <div className="listing" id="resultados">
          <CatalogSidebar
            locale={locale}
            groups={facetGroups}
            activeCount={chips.length}
            clearHref={`/${locale}`}
          />

          <div className="listing-results">
            <div className="results-head">
              {/* `h1` y no `h2`: en la vista filtrada este es el título de la
                  página. El inicio tiene el suyo en el hero, y el hero no
                  aparece aquí. */}
              <h1 className="section-title">{listingTitle}</h1>
              <p className="muted">{t.resultsCount(items.length)}</p>
            </div>

            <ActiveFacets locale={locale} chips={chips} clearHref={`/${locale}`} />

            {items.length === 0 ? (
              <div className="empty">
                <h2 className="section-title">{t.emptyTitle}</h2>
                <p className="muted">{t.emptyBody}</p>
              </div>
            ) : (
              <>
                <ul className="grid listing-grid">
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
                      <Link
                        className="btn btn-secondary"
                        href={hrefPagina(paginaActual - 1)}
                        rel="prev"
                      >
                        ← {t.pagePrev}
                      </Link>
                    ) : (
                      <span />
                    )}
                    <p className="pager-state" aria-current="page">
                      {t.pageOf(paginaActual, totalPaginas)}
                    </p>
                    {paginaActual < totalPaginas ? (
                      <Link
                        className="btn btn-secondary"
                        href={hrefPagina(paginaActual + 1)}
                        rel="next"
                      >
                        {t.pageNext} →
                      </Link>
                    ) : (
                      <span />
                    )}
                  </nav>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      <PromoBanner locale={locale} />

    </div>
  );
}
