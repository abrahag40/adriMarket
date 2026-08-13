import { formatMoney, LOCALE_TAG, type Locale } from "@/i18n/config";
import { getMessages, type Messages } from "@/i18n/messages";
import type { Quote, QuoteError, QuoteLine } from "@/modules/pricing/types";

/**
 * Desglose de la cotización.
 *
 * Las líneas llegan del servidor con un concepto en clave (`occupancy:1x3`,
 * `pax:adult:2`, una fecha) y aquí se traducen. El motor de precios no arma
 * texto porque no sabe en qué idioma está leyendo el huésped, y porque el mismo
 * desglose se va a re-renderizar años después en un comprobante.
 */

function formatNight(night: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${night}T00:00:00Z`));
}

function describeLine(line: QuoteLine, locale: Locale, t: Messages): string {
  switch (line.kind) {
    case "nightly":
      return formatNight(line.concept, locale);

    case "occupancy": {
      // occupancy:<huéspedes extra>x<noches>
      const [, detail = ""] = line.concept.split(":");
      const [guests = "0", nights = "0"] = detail.split("x");
      return t.quoteExtraGuests(Number(guests), Number(nights));
    }

    case "pax": {
      // pax:<tipo>:<cantidad>
      const [, type = "", count = "0"] = line.concept.split(":");
      const label =
        type === "adult" ? t.paxAdult : type === "child" ? t.paxChild : t.paxInfant;
      return `${label} × ${count}`;
    }

    case "fee":
      return line.concept === "cleaning" ? t.quoteCleaning : line.concept;

    case "discount":
    case "tax":
      // El nombre del impuesto o del cupón viene configurado, ya legible.
      return line.concept;
  }
}

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
