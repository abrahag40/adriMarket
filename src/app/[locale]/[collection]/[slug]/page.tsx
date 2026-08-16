import type { Metadata } from "next";
import Link from "next/link";
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
import { getProductDetail, type ProductDetail } from "@/modules/catalog/queries";
import { ResponsiveImage } from "@/components/responsive-image";
import { StayBooking } from "@/components/stay-booking";
import { TourBooking } from "@/components/tour-booking";

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

function StaySpecs({ product, t }: { product: ProductDetail; t: Messages }) {
  const stay = product.stay;
  if (!stay) return null;

  return (
    <>
      <ul className="spec-list">
        <li>
          <div className="spec-term">{t.guests}</div>
          <div className="spec-value">{stay.maxGuests}</div>
        </li>
        <li>
          <div className="spec-term">{t.bedrooms}</div>
          <div className="spec-value">{stay.bedrooms}</div>
        </li>
        <li>
          <div className="spec-term">{t.beds}</div>
          <div className="spec-value">{stay.beds}</div>
        </li>
        <li>
          <div className="spec-term">{t.bathrooms}</div>
          <div className="spec-value">{stay.bathrooms}</div>
        </li>
      </ul>
      <p className="muted">
        {t.minNights(stay.minNights)} · {t.checkInOut}: {stay.checkinTime.slice(0, 5)} /{" "}
        {stay.checkoutTime.slice(0, 5)}
      </p>
    </>
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
      <ul className="spec-list">
        {tour.durationMinutes !== null ? (
          <li>
            <div className="spec-term">{t.duration}</div>
            <div className="spec-value">{t.minutes(tour.durationMinutes)}</div>
          </li>
        ) : null}
        <li>
          <div className="spec-term">{t.guests}</div>
          <div className="spec-value">{tour.capacity}</div>
        </li>
      </ul>

      {tour.meetingPoint ? (
        <p className="muted">
          {t.meetingPoint}: {tour.meetingPoint}
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

  const [cover, ...rest] = product.media;
  const secondary = rest.slice(0, 2);
  const unit = kind === "stay" ? t.perNight : t.perPerson;

  return (
    <article className="stack">
      <p className="breadcrumb">
        <Link href={`/${locale}`}>{t.siteName}</Link> ·{" "}
        {kind === "tour" ? t.filterKindTour : t.filterKindStay}
      </p>

      {cover ? (
        <div className="gallery">
          <figure className="gallery-main">
            {/* La principal se carga de inmediato: es lo que el huésped vino a
                ver, y diferirla retrasa justo eso. */}
            <ResponsiveImage
              src={cover.url}
              alt={cover.alt ?? product.name}
              width={cover.width ?? 1200}
              height={cover.height ?? 800}
              variants={cover.variants}
              sizes="(min-width: 900px) 66vw, 100vw"
              priority
            />
          </figure>
          {secondary.map((item) => (
            <figure key={item.url}>
              <ResponsiveImage
                src={item.url}
                alt={item.alt ?? ""}
                width={item.width ?? 800}
                height={item.height ?? 600}
                variants={item.variants}
                sizes="(min-width: 900px) 33vw, 50vw"
              />
            </figure>
          ))}
        </div>
      ) : null}

      <div className="stack-sm">
        <h1 className="page-title">{product.name}</h1>
        {product.locationName ? (
          <p className="muted">
            {t.location}: {product.locationName}
            {product.state ? `, ${product.state}` : ""}
          </p>
        ) : null}
        {product.summary ? <p className="prose">{product.summary}</p> : null}
      </div>

      <div className="detail">
        <div className="stack">
          {product.description ? (
            <p className="prose muted">{product.description}</p>
          ) : null}

          {product.highlights.length > 0 ? (
            <section className="stack-sm">
              <h2 className="section-title">{t.highlights}</h2>
              <ul className="check-list">
                {product.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="stack-sm">
            <h2 className="section-title">{t.details}</h2>
            {kind === "stay" ? (
              <StaySpecs product={product} t={t} />
            ) : (
              <TourSpecs product={product} t={t} locale={locale} />
            )}
          </section>

          {product.included.length > 0 ? (
            <section className="stack-sm">
              <h2 className="section-title">{t.included}</h2>
              <ul className="check-list">
                {product.included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {product.excluded.length > 0 ? (
            <section className="stack-sm">
              <h2 className="section-title">{t.notIncluded}</h2>
              <ul className="check-list excluded">
                {product.excluded.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
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
        </aside>
      </div>
    </article>
  );
}
