import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { QuoteBreakdown, describeQuoteError } from "@/components/quote-breakdown";
import { formatMoney, isLocale, productPath } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getProductDetail } from "@/modules/catalog/queries";
import { listTourExtras, quoteTour } from "@/modules/pricing/service";
import { QuoteError } from "@/modules/pricing/types";

import { ExtrasSelector } from "./extras-selector";

/**
 * Paso de extras · S8
 *
 * Va entre la ficha del tour y el checkout, y solo existe si el tour tiene algo
 * que ofrecer: `TourBooking` enlaza aquí o directo al checkout según eso, y si
 * alguien llega con una dirección a mano a un tour sin extras, se le manda al
 * checkout en vez de enseñarle una lista vacía.
 *
 * **Es un paso con su propia dirección, no un modal**, y esa es la decisión de
 * interfaz: el botón "atrás" del navegador conserva la selección, el enlace se
 * puede mandar por WhatsApp, y funciona sin JavaScript. Todo el estado del
 * sitio ya vive en la URL (`?kind=`, `?adults=`, `?departure=`); esto no
 * estrena un mecanismo.
 *
 * Y como todo lo demás: **el total lo calcula el servidor**. Marcar una casilla
 * cambia la URL y vuelve a cotizar. Aquí no se suma nada.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function many(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

export default async function ExtrasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getMessages(locale);
  const sp = await searchParams;

  const slug = single(sp.slug);
  const departure = single(sp.departure);
  const adults = Math.max(1, Number.parseInt(single(sp.adults), 10) || 2);
  const children = Math.max(0, Number.parseInt(single(sp.children), 10) || 0);
  const infants = Math.max(0, Number.parseInt(single(sp.infants), 10) || 0);
  const coupon = single(sp.coupon).trim();
  const elegidos = many(sp.extras);

  const product = await getProductDetail(locale, "tour", slug);
  if (!product) notFound();

  /* Lo que se lleva al checkout es exactamente lo que trae esta dirección. Se
     arma una sola vez y se usa para los dos botones: el de continuar con lo
     marcado y el de seguir sin nada. */
  const comunes = new URLSearchParams({
    kind: "tour",
    slug,
    departure,
    adults: String(adults),
    children: String(children),
    infants: String(infants),
  });
  if (coupon) comunes.set("coupon", coupon);

  const catalogo = await listTourExtras(product.id, locale);
  // Un tour sin extras no tiene paso que enseñar. Pasa con una dirección
  // escrita a mano o guardada de cuando el tour sí los tenía.
  if (catalogo.length === 0) redirect(`/${locale}/checkout?${comunes.toString()}`);

  const conExtras = new URLSearchParams(comunes);
  for (const code of elegidos) conExtras.append("extras", code);

  const marcados = new Set(elegidos);
  const backHref = productPath(locale, "tour", slug);

  let quoteNode: React.ReactNode = null;
  try {
    const result = await quoteTour(
      product.id,
      departure,
      { adult: adults, child: children, infant: infants },
      new Date(),
      coupon,
      { codes: elegidos, locale },
    );
    quoteNode = <QuoteBreakdown quote={result.quote} locale={locale} />;
  } catch (error) {
    if (error instanceof QuoteError) {
      return (
        <div className="empty">
          <h1 className="page-title">{t.checkoutError}</h1>
          <p className="muted">{describeQuoteError(error, t)}</p>
          <Link className="btn" href={backHref}>
            {product.name}
          </Link>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="stack">
      <p className="breadcrumb">
        <Link href={backHref}>{product.name}</Link>
      </p>
      <h1 className="page-title">{t.extrasTitle}</h1>
      <p className="muted">{t.extrasIntro}</p>

      <div className="detail">
        <div className="stack">
          <Suspense fallback={null}>
            <ExtrasSelector action={`/${locale}/extras`}>
              {/* El formulario tiene que poder viajar solo: sin JavaScript, lo
                  único que llega al servidor es lo que va aquí dentro. */}
              <input type="hidden" name="kind" value="tour" />
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="departure" value={departure} />
              <input type="hidden" name="adults" value={String(adults)} />
              <input type="hidden" name="children" value={String(children)} />
              <input type="hidden" name="infants" value={String(infants)} />
              {coupon ? <input type="hidden" name="coupon" value={coupon} /> : null}

              <ul className="extras-list">
                {catalogo.map((extra) => (
                  <li key={extra.code}>
                    <label className="extra-option">
                      <input
                        type="checkbox"
                        name="extras"
                        value={extra.code}
                        defaultChecked={marcados.has(extra.code)}
                      />
                      <span className="extra-text">
                        <span className="extra-name">{extra.name}</span>
                        {extra.note ? <span className="extra-note">{extra.note}</span> : null}
                      </span>
                      <span className="extra-price">
                        {t.extrasPerPerson(formatMoney(extra.priceCents, product.currency, locale))}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              {/* Con JavaScript sobra —marcar ya recotiza— y sin él es la única
                  forma de ver el total nuevo. Se queda visible en los dos
                  casos: también es el camino del teclado. */}
              <button className="btn btn-secondary" type="submit">
                {t.extrasUpdate}
              </button>
            </ExtrasSelector>

            {/* La advertencia va ANTES de marcar, no en la letra chica del
                comprobante. La decisión 0019 mantiene la regla —el cupón sale
                del tour, que es donde está el margen— y quita el silencio, que
                es lo que de verdad dolió en la 0014. */}
            {coupon ? <p className="notice">{t.extrasNoCoupon}</p> : null}
          </Suspense>

          <div className="extras-actions">
            <Link className="btn btn-block" href={`/${locale}/checkout?${conExtras.toString()}`}>
              {t.extrasContinue}
            </Link>
            <Link className="btn btn-secondary" href={`/${locale}/checkout?${comunes.toString()}`}>
              {t.extrasSkip}
            </Link>
          </div>
        </div>
        <aside className="detail-aside">{quoteNode}</aside>
      </div>
    </div>
  );
}
