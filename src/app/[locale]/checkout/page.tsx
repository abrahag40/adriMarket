import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteBreakdown, describeQuoteError } from "@/components/quote-breakdown";
import { formatMoney, isLocale, productPath, type ProductKind } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getProductDetail } from "@/modules/catalog/queries";
import { quoteStay, quoteTour } from "@/modules/pricing/service";
import { QuoteError } from "@/modules/pricing/types";

import { CheckoutForm } from "./checkout-form";

/**
 * Página del checkout · S3-1
 *
 * Vuelve a cotizar en el servidor con los identificadores de la URL. No recibe
 * ni un solo monto del cliente: si alguien manipula la dirección, lo único que
 * logra es ver otro precio calculado por nosotros.
 */

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export const metadata: Metadata = { robots: { index: false } };

export default async function CheckoutPage({
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

  const kind = (single(sp.kind) === "tour" ? "tour" : "stay") as ProductKind;
  const slug = single(sp.slug);
  const product = await getProductDetail(locale, kind, slug);
  if (!product) notFound();

  const backHref = productPath(locale, kind, slug);

  let quoteNode: React.ReactNode = null;
  let formNode: React.ReactNode = null;

  try {
    if (kind === "stay") {
      const from = single(sp.from);
      const to = single(sp.to);
      const guests = Math.max(1, Number.parseInt(single(sp.guests), 10) || 2);
      const result = await quoteStay(product.id, { from, to }, guests);

      if (!result.available) throw new QuoteError("invalid_range");

      quoteNode = <QuoteBreakdown quote={result.quote} locale={locale} />;
      formNode = (
        <CheckoutForm
          locale={locale}
          hidden={{ kind, slug, productId: product.id, from, to, guests: String(guests) }}
          // En una estancia el titular es el único dato obligatorio; los demás
          // huéspedes no cambian el precio ni el cupo.
          paxSlots={[]}
          depositLabel={formatMoney(result.quote.deposit_cents, result.quote.currency, locale)}
          holdMinutes={15}
          policyText={product.kind === "stay" ? null : null}
        />
      );
    } else {
      const departure = single(sp.departure);
      const adults = Math.max(1, Number.parseInt(single(sp.adults), 10) || 2);
      const children = Math.max(0, Number.parseInt(single(sp.children), 10) || 0);
      const infants = Math.max(0, Number.parseInt(single(sp.infants), 10) || 0);
      const result = await quoteTour(product.id, departure, {
        adult: adults,
        child: children,
        infant: infants,
      });

      quoteNode = <QuoteBreakdown quote={result.quote} locale={locale} />;

      // Un pasajero por captura: en un tour hacen falta los nombres, y la edad
      // de los menores para chalecos y precio.
      const paxSlots = [
        ...Array.from({ length: adults - 1 }, () => ({ paxType: "adult" as const, label: t.paxAdult })),
        ...Array.from({ length: children }, () => ({ paxType: "child" as const, label: t.paxChild })),
        ...Array.from({ length: infants }, () => ({ paxType: "infant" as const, label: t.paxInfant })),
      ];

      formNode = (
        <CheckoutForm
          locale={locale}
          hidden={{
            kind,
            slug,
            productId: product.id,
            departure,
            adults: String(adults),
            children: String(children),
            infants: String(infants),
          }}
          paxSlots={paxSlots}
          depositLabel={formatMoney(result.quote.deposit_cents, result.quote.currency, locale)}
          holdMinutes={15}
          policyText={null}
        />
      );
    }
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
      <h1 className="page-title">{t.checkoutTitle}</h1>

      <div className="detail">
        <div className="stack">{formNode}</div>
        <aside className="detail-aside">{quoteNode}</aside>
      </div>
    </div>
  );
}
