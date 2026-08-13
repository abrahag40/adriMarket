import { BookingSelector } from "@/components/booking-selector";
import { StayCalendar } from "@/components/availability-calendar";
import { QuoteBreakdown, describeQuoteError } from "@/components/quote-breakdown";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { primaryUnitId, stayAvailability } from "@/modules/availability/calendar";
import { quoteStay } from "@/modules/pricing/service";
import { QuoteError } from "@/modules/pricing/types";
import { startOfMonth, startOfNextMonth, todayIn } from "@/time";

/**
 * Selección de fechas y cotización de una estancia · S2-1, S2-3, S2-4
 *
 * Todo el trabajo ocurre en el servidor: se cotiza aquí y se manda el desglose
 * ya hecho. El navegador solo pinta y navega.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | undefined): string | null {
  return value !== undefined && ISO_DATE.test(value) ? value : null;
}

export async function StayBooking({
  productId,
  locale,
  basePath,
  timezone,
  maxGuests,
  params,
}: {
  productId: string;
  locale: Locale;
  basePath: string;
  timezone: string;
  maxGuests: number;
  params: { from?: string; to?: string; guests?: string; month?: string };
}) {
  const t = getMessages(locale);
  const today = todayIn(timezone);

  const from = validDate(params.from);
  const to = validDate(params.to);
  const guestsRaw = Number.parseInt(params.guests ?? "", 10);
  const guests =
    Number.isInteger(guestsRaw) && guestsRaw > 0 && guestsRaw <= maxGuests ? guestsRaw : 2;

  // El mes del calendario: el de las fechas elegidas, o el actual.
  const month = startOfMonth(validDate(params.month) ?? from ?? today);
  const nextMonth = startOfNextMonth(month);
  const prevMonthDate = new Date(`${month}T00:00:00Z`);
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 10);

  const unitId = await primaryUnitId(productId);
  const nights = unitId ? await stayAvailability(unitId, month, nextMonth) : [];

  function hrefWithMonth(target: string): string {
    const next = new URLSearchParams();
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    next.set("guests", String(guests));
    next.set("month", target);
    return `${basePath}?${next.toString()}`;
  }

  let quoteNode: React.ReactNode = <p className="notice">{t.priceNotice}</p>;

  if (from && to) {
    try {
      const result = await quoteStay(productId, { from, to }, guests);
      quoteNode = (
        <QuoteBreakdown quote={result.quote} locale={locale} available={result.available} />
      );
    } catch (error) {
      if (error instanceof QuoteError) {
        // Un error de cotización es información para el huésped, no una falla:
        // se explica en su idioma y la página sigue siendo usable.
        quoteNode = <p className="quote-warning">{describeQuoteError(error, t)}</p>;
      } else {
        throw error;
      }
    }
  }

  return (
    <>
      <BookingSelector action={basePath}>
        <div className="selector-row">
          <div className="field">
            <label htmlFor="from">{t.checkIn}</label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from ?? ""}
              min={today}
            />
          </div>
          <div className="field">
            <label htmlFor="to">{t.checkOut}</label>
            <input id="to" name="to" type="date" defaultValue={to ?? ""} min={today} />
          </div>
          <div className="field">
            <label htmlFor="guests">{t.guestsLabel}</label>
            <select id="guests" name="guests" defaultValue={String(guests)}>
              {Array.from({ length: maxGuests }, (_, index) => index + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit">
            {t.quoteRecalculate}
          </button>
        </div>
        {/* Se conserva el mes al recotizar, para no perder el calendario. */}
        <input type="hidden" name="month" value={month} />
      </BookingSelector>

      {quoteNode}

      <StayCalendar
        nights={nights}
        month={month}
        locale={locale}
        prevHref={month <= startOfMonth(today) ? null : hrefWithMonth(prevMonth)}
        nextHref={hrefWithMonth(nextMonth)}
      />
    </>
  );
}
