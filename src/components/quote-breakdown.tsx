import { formatMoney, type Locale } from "@/i18n/config";
import { getMessages, type Messages } from "@/i18n/messages";
import { describeLine } from "@/modules/pricing/labels";
import type { CouponRejectReason, Quote, QuoteError } from "@/modules/pricing/types";

/**
 * Desglose de la cotización.
 *
 * Las líneas llegan del servidor con un concepto en clave (`occupancy:1x3`,
 * `pax:adult:2`, una fecha) y aquí se traducen. El motor de precios no arma
 * texto porque no sabe en qué idioma está leyendo el huésped, y porque el mismo
 * desglose se va a re-renderizar años después en un comprobante.
 */

/** Traduce un error de cotización al idioma de la página. */
export function describeQuoteError(error: QuoteError, t: Messages): string {
  const params = error.params;
  switch (error.code) {
    case "no_rate":
      return t.errNoRate;
    case "min_nights":
      return t.errMinNights(Number(params.min ?? 1));
    case "closed_to_arrival":
      return t.errClosedToArrival;
    case "closed_to_departure":
      return t.errClosedToDeparture;
    case "over_capacity":
      return t.errOverCapacity(Number(params.max ?? 0));
    case "past_dates":
      return t.errPastDates;
    case "invalid_range":
      return t.errInvalidRange;
    case "no_pax":
      return t.errNoPax;
    case "sold_out":
      return t.errSoldOut(Number(params.left ?? 0));
    case "departure_closed":
      return t.errDepartureClosed;
  }
}

/** Traduce por qué un código de cupón no se aplicó. */
export function describeCouponReason(reason: CouponRejectReason, t: Messages): string {
  switch (reason) {
    case "not_found":
      return t.couponNotFound;
    case "expired":
      return t.couponExpired;
    case "not_yet_valid":
      return t.couponNotYetValid;
    case "wrong_product":
      return t.couponWrongProduct;
    case "redeemed_out":
      return t.couponRedeemedOut;
    case "currency_mismatch":
      return t.couponCurrencyMismatch;
    case "min_total":
      return t.couponMinTotal;
  }
}

export function QuoteBreakdown({
  quote,
  locale,
  available,
}: {
  quote: Quote;
  locale: Locale;
  available?: boolean;
}) {
  const t = getMessages(locale);
  const nightly = quote.lines.filter((line) => line.kind === "nightly");

  return (
    <div className="quote">
      <h3 className="quote-heading">{t.quoteHeading}</h3>

      {available === false ? <p className="quote-warning">{t.quoteUnavailable}</p> : null}

      {quote.coupon && !quote.coupon.applied ? (
        <p className="quote-warning">{describeCouponReason(quote.coupon.reason, t)}</p>
      ) : null}

      <table className="quote-table">
        <caption className="visually-hidden">{t.quoteHeading}</caption>
        <tbody>
          {nightly.length > 1 ? (
            // Con varias noches se muestra el subtotal y el detalle queda en un
            // desplegable: el huésped quiere el número, no la contabilidad.
            <tr>
              <th scope="row">
                <details>
                  <summary>{t.quoteNights(nightly.length)}</summary>
                  <ul className="quote-nights">
                    {nightly.map((line) => (
                      <li key={line.concept}>
                        <span>{describeLine(line, locale, t)}</span>
                        <span>{formatMoney(line.cents, quote.currency, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </th>
              <td>
                {formatMoney(
                  nightly.reduce((total, line) => total + line.cents, 0),
                  quote.currency,
                  locale,
                )}
              </td>
            </tr>
          ) : null}

          {quote.lines
            .filter((line) => line.kind !== "nightly" || nightly.length === 1)
            .map((line, index) => (
              <tr key={`${line.kind}-${line.concept}-${index}`}>
                <th scope="row">{describeLine(line, locale, t)}</th>
                <td>{formatMoney(line.cents, quote.currency, locale)}</td>
              </tr>
            ))}

          <tr className="quote-total">
            <th scope="row">{t.quoteTotal}</th>
            <td>{formatMoney(quote.total_cents, quote.currency, locale)}</td>
          </tr>
        </tbody>
      </table>

      <div className="quote-split">
        <p className="quote-deposit">
          <span>{t.quoteDepositNow(quote.deposit_pct)}</span>
          <strong>{formatMoney(quote.deposit_cents, quote.currency, locale)}</strong>
        </p>
        <p className="quote-balance">
          <span>{t.quoteBalanceLater}</span>
          <strong>{formatMoney(quote.balance_cents, quote.currency, locale)}</strong>
        </p>
      </div>
    </div>
  );
}
