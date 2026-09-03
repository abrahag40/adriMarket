import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  alternatePath,
  formatMoney,
  isLocale,
  kindFromSegment,
  productPath,
  type Locale,
  type ProductKind,
} from "@/i18n/config";
import { getMessages, type Messages } from "@/i18n/messages";
import { absoluteUrl } from "@/site";
import { getProductDetail, listCatalog, type ProductDetail } from "@/modules/catalog/queries";
import { DetailTabs } from "@/components/detail-tabs";
import { Gallery } from "@/components/gallery";
import { ProductCard } from "@/components/product-card";
import { SpecIcon } from "@/components/spec-icon";
import { StayBooking } from "@/components/stay-booking";
import { TourBooking } from "@/components/tour-booking";
import { ValueProps } from "@/components/marketing/value-props";

type RouteParams = Promise<{ locale: string; collection: string; slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/** Igual que el listado: la ficha refleja el estado real del catálogo. */
export const dynamic = "force-dynamic";

/**
 * Ficha de producto · S1-5
 *
 * Cualquiera de estas tres condiciones termina en 404, y las tres son
 * deliberadas: el producto no existe, no está publicado, o no tiene traducción
 * al idioma pedido. La última es la menos obvia y la más importante — mostrar
 * una página en inglés con el texto en español es peor que no tener la página.
 */
async function load(params: RouteParams): Promise<{
  locale: Locale;
  kind: ProductKind;
  product: ProductDetail;
}> {
  const { locale, collection, slug } = await params;
  if (!isLocale(locale)) notFound();

  const kind = kindFromSegment(locale, collection);
  if (!kind) notFound();

  const product = await getProductDetail(locale, kind, slug);
  if (!product) notFound();

  return { locale, kind, product };
}

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { locale, kind, product } = await load(params);

  return {
    title: product.metaTitle ?? product.name,
    description: product.metaDescription ?? product.summary ?? undefined,
    alternates: {
      canonical: absoluteUrl(productPath(locale, kind, product.slug)),
      languages: {
        [locale]: absoluteUrl(productPath(locale, kind, product.slug)),
        [locale === "es" ? "en" : "es"]: absoluteUrl(alternatePath(locale, kind, product.slug)),
      },
    },
  };
}

/**
 * Las dos marcas de las listas de "qué incluye" / "qué no incluye". La
 * referencia usa dos PNG de 32px (`icon_check.png`, su gemelo tachado)
 * dibujados a 18px; aquí son trazos propios al mismo tamaño, igual que el
 * resto del set de `SpecIcon` — mismo lenguaje visual, sin copiar el activo
 * de un tema de pago.
 */
function CheckMark() {
  return (
    <svg
      className="icon-list-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 12.5 5.5 5.5L20 6" />
    </svg>
  );
}

function CrossMark() {
  return (
    <svg
      className="icon-list-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m5 5 14 14M19 5 5 19" />
    </svg>
  );
}

/**
 * Fila de datos rápidos — ícono + cifra, directo bajo el título, antes de la
 * galería. Es lo primero que la referencia muestra del producto (duración,
 * huéspedes…), y aquí vivía enterrada dentro de la pestaña "Detalles", varias
 * pantallas más abajo. `StaySpecs`/`TourSpecs` conservan lo que no cabe en una
 * fila corta (política de entrada/salida, punto de encuentro, precios).
 */
function QuickFacts({ product, kind, t }: { product: ProductDetail; kind: ProductKind; t: Messages }) {
  if (kind === "stay") {
    const stay = product.stay;
    if (!stay) return null;
    return (
      <ul className="spec-list">
        <li>
          <SpecIcon name="users" />
          <span className="spec-value">{t.guestsCount(stay.maxGuests)}</span>
        </li>
        <li>
          <SpecIcon name="door" />
          <span className="spec-value">{t.bedroomsCount(stay.bedrooms)}</span>
        </li>
        <li>
          <SpecIcon name="bed" />
          <span className="spec-value">{t.bedsCount(stay.beds)}</span>
        </li>
        <li>
          <SpecIcon name="bath" />
          <span className="spec-value">{t.bathroomsCount(stay.bathrooms)}</span>
        </li>
      </ul>
    );
  }

  const tour = product.tour;
  if (!tour) return null;
  return (
    <ul className="spec-list">
      {tour.durationMinutes !== null ? (
        <li>
          <SpecIcon name="clock" />
          <span className="spec-value">{t.minutes(tour.durationMinutes)}</span>
        </li>
      ) : null}
      <li>
        <SpecIcon name="users" />
        <span className="spec-value">{t.upToGuests(tour.capacity)}</span>
      </li>
    </ul>
  );
}

function StaySpecs({ product, t }: { product: ProductDetail; t: Messages }) {
  const stay = product.stay;
  if (!stay) return null;

  return (
    <p className="muted">
      {t.minNights(stay.minNights)} · {t.checkInOut}: {stay.checkinTime.slice(0, 5)} /{" "}
      {stay.checkoutTime.slice(0, 5)}
    </p>
  );
}

function TourSpecs({ product, t, locale }: { product: ProductDetail; t: Messages; locale: Locale }) {
  const tour = product.tour;
  if (!tour) return null;

  const paxLabel: Record<string, string> = {
    adult: t.paxAdult,
    child: t.paxChild,
    infant: t.paxInfant,
  };

  return (
    <>
      {tour.meetingPoint ? (
        <p className="muted spec-inline">
          <SpecIcon name="pin" />
          {/* El ícono ya lo dice visualmente; sin texto, un lector de pantalla
              solo anunciaría el nombre del lugar, sin decir qué es. */}
          <span className="visually-hidden">{t.meetingPoint}: </span>
          {tour.meetingPoint}
        </p>
      ) : null}

      {tour.prices.length > 0 ? (
        <table className="price-table">
          <caption className="visually-hidden">{t.prices}</caption>
          <tbody>
            {tour.prices.map((price) => (
              <tr key={price.paxType}>
                <th scope="row">{paxLabel[price.paxType] ?? price.paxType}</th>
                <td>
                  {price.priceCents === 0
                    ? t.paxFree
                    : formatMoney(price.priceCents, product.currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const { locale, kind, product } = await load(params);
  const t = getMessages(locale);
  const sp = await searchParams;
  const basePath = productPath(locale, kind, product.slug);

  const unit = kind === "stay" ? t.perNight : t.perPerson;

  /* "También te puede interesar": mismo tipo de producto, sin el que ya se
     está viendo. Reutiliza el listado del catálogo — no hay una consulta de
     "relacionados" aparte, y con el tamaño actual del catálogo no la
     necesita. */
  const related = (await listCatalog(locale, { kind }))
    .filter((item) => item.slug !== product.slug)
    .slice(0, 4);

  const itinerary = product.tour?.itinerary ?? [];

  /* Pestañas gruesas, como la referencia: ahí son cinco —Detail, Itinerary,
     Map, FAQ, Reviews— y "Detail" cubre de un golpe la descripción, lo que
     incluye, lo que no, y qué esperar. Antes había una pestaña por sección
     (seis) y la fila se leía como un índice, no como la navegación de la
     plantilla. Lo que incluye y lo que no ya viven dentro del bloque de
     descripción, así que no necesitan ancla propia. */
  const tabs = [
    { id: "overview", label: t.detailNavOverview, show: true },
    { id: "details", label: t.details, show: true },
    { id: "itinerary", label: t.itinerary, show: itinerary.length > 0 },
  ].filter((tab) => tab.show);

  return (
    <article className="stack">
      {tabs.length > 1 ? <DetailTabs tabs={tabs} /> : null}

      <div className="stack-sm">
        <h1 className="page-title product-title">{product.name}</h1>
        {product.locationName ? (
          <p className="muted">
            {t.location}: {product.locationName}
            {product.state ? `, ${product.state}` : ""}
          </p>
        ) : null}
        {product.summary ? <p className="prose">{product.summary}</p> : null}
        <QuickFacts product={product} kind={kind} t={t} />
      </div>

      <Gallery
        photos={product.media}
        productName={product.name}
        labels={{
          open: t.galleryOpen,
          close: t.galleryClose,
          prev: t.carouselPrev,
          next: t.carouselNext,
          photoCount: t.galleryPhotoCount(product.media.length),
          /* Resueltos aquí, uno por foto: el diccionario vive en el
             servidor y una función no cruza al componente de cliente. */
          openPhoto: product.media.map((_, index) => t.galleryOpenPhoto(index + 1)),
          counter: product.media.map((_, index) =>
            t.galleryCounter(index + 1, product.media.length),
          ),
        }}
      />

      {/* Arquitectura del bloque de descripción, copiada de la referencia:
          un solo hilo de bloques separados por una línea de 1px, no seis
          secciones apiladas con el mismo peso.

            Detalle          título + párrafos a 18px
            Qué incluye      etiqueta a la izquierda, lista a la derecha
            Qué no incluye   igual, con la marca de tachado
            ─────────────    divisor
            Lo mejor         título + lista de viñetas redondas
            ─────────────
            Detalles         título + ficha técnica
            ─────────────
            Itinerario       título + pasos con divisor entre uno y otro

          Lo que incluye y lo que no van en dos columnas al 50 % porque así
          están en la referencia (`gdlr-core-column-30` + `gdlr-core-column-30`),
          y porque una etiqueta corta al lado de una lista corta llena el
          ancho que una sección apilada desperdicia. */}
      <div className="detail">
        <div className="detail-body">
          <section id="overview" className="detail-block">
            <h2 className="section-title">{t.detailNavOverview}</h2>
            {product.description ? (
              <div className="detail-prose">
                {product.description.split(/\n{2,}/).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            ) : null}
          </section>

          {product.included.length > 0 ? (
            <div className="detail-split">
              <p className="detail-split-label">{t.included}</p>
              <ul className="icon-list">
                {product.included.map((item) => (
                  <li key={item}>
                    <CheckMark />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {product.excluded.length > 0 ? (
            <div className="detail-split">
              <p className="detail-split-label">{t.notIncluded}</p>
              <ul className="icon-list icon-list-excluded">
                {product.excluded.map((item) => (
                  <li key={item}>
                    <CrossMark />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {product.highlights.length > 0 ? (
            <section id="highlights" className="detail-block detail-block-divided">
              <h2 className="section-title">{t.highlights}</h2>
              <ul className="dot-list">
                {product.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section id="details" className="detail-block detail-block-divided">
            <h2 className="section-title">{t.details}</h2>
            {kind === "stay" ? (
              <StaySpecs product={product} t={t} />
            ) : (
              <TourSpecs product={product} t={t} locale={locale} />
            )}
          </section>

          {itinerary.length > 0 ? (
            <section id="itinerary" className="detail-block detail-block-divided">
              <h2 className="section-title">{t.itinerary}</h2>
              {/* La referencia esconde cada día detrás de un acordeón; aquí
                  los pasos son las horas de un mismo día y son tres, no seis
                  días. Se queda la tipografía y el divisor de la referencia
                  —título en serif de 18px, línea entre paso y paso— con el
                  contenido siempre a la vista. */}
              <ol className="itinerary-list">
                {itinerary.map((step, index) => (
                  <li key={index}>
                    <p className="itinerary-title">
                      {step.timeLabel ? <span className="itinerary-time">{step.timeLabel}</span> : null}
                      {step.title}
                    </p>
                    {step.description ? <p className="itinerary-body">{step.description}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <aside className="detail-aside">
          {product.fromCents !== null ? (
            <p className="price">
              <span className="price-label">{t.fromPrice}</span>
              <span className="price-amount">
                {formatMoney(product.fromCents, product.currency, locale)}
              </span>
              <span className="price-unit">{unit}</span>
            </p>
          ) : null}

          {kind === "stay" ? (
            <StayBooking
              productId={product.id}
              slug={product.slug}
              locale={locale}
              basePath={basePath}
              timezone={product.timezone}
              maxGuests={product.stay?.maxGuests ?? 2}
              params={{
                from: single(sp.from),
                to: single(sp.to),
                guests: single(sp.guests),
                month: single(sp.month),
              }}
            />
          ) : (
            <TourBooking
              productId={product.id}
              slug={product.slug}
              locale={locale}
              basePath={basePath}
              timezone={product.timezone}
              capacity={product.tour?.capacity ?? 1}
              params={{
                departure: single(sp.departure),
                adults: single(sp.adults),
                children: single(sp.children),
                infants: single(sp.infants),
                month: single(sp.month),
              }}
            />
          )}

          <p className="detail-aside-trust">{t.trustBadgeText}</p>

          <div className="detail-aside-confidence">
            <h2 className="detail-aside-confidence-heading">{t.confidenceHeading}</h2>
            <ValueProps
              items={[
                {
                  icon: "wallet",
                  heading: t.valuePropDepositHeading,
                  body: t.valuePropDepositBody,
                },
                {
                  icon: "bolt",
                  heading: t.valuePropInstantHeading,
                  body: t.valuePropInstantBody,
                },
                {
                  icon: "shield",
                  heading: t.valuePropCancelHeading,
                  body: t.valuePropCancelBody,
                },
              ]}
            />
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="stack-sm" aria-labelledby="related-heading">
          <h2 id="related-heading" className="section-title">
            {t.relatedHeading}
          </h2>
          <ul className="grid">
            {related.map((item) => (
              <ProductCard key={item.id} item={item} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
