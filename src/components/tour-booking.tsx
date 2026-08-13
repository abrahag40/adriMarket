import Link from "next/link";

import { BookingSelector } from "@/components/booking-selector";
import { TourCalendar } from "@/components/availability-calendar";
import { QuoteBreakdown, describeQuoteError } from "@/components/quote-breakdown";
import { LOCALE_TAG, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { tourDepartures } from "@/modules/availability/calendar";
import { quoteTour } from "@/modules/pricing/service";
import { QuoteError } from "@/modules/pricing/types";
import { startOfMonth, startOfNextMonth, todayIn } from "@/time";

/**
 * Selección de salida y pasajeros · S2-2, S2-3, S2-4
 *
 * La diferencia de fondo con una estancia: aquí no se elige un rango, se elige
 * una salida concreta, y el precio depende del tipo de pasajero.
 */

function count(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : fallback;
}

export async function TourBooking({
  productId,
  slug,
  locale,
  basePath,
  timezone,
  capacity,
  params,
}: {
  productId: string;
  slug: string;
  locale: Locale;
  basePath: string;
  timezone: string;
  capacity: number;
  params: { departure?: string; adults?: string; children?: string; infants?: string; month?: string };
}) {
  const t = getMessages(locale);
  const today = todayIn(timezone);

  const month = startOfMonth(params.month && /^\d{4}-\d{2}-\d{2}$/.test(params.month) ? params.month : today);
  const nextMonth = startOfNextMonth(month);

  // Dos consultas: las salidas del mes para el calendario, y las próximas para
  // el desplegable — que no debe quedarse vacío si el mes visible no tiene.
  const [monthDepartures, upcoming] = await Promise.all([
    tourDepartures(productId, month, nextMonth),
    tourDepartures(productId, today, startOfNextMonth(startOfNextMonth(today))),
  ]);

  const adults = count(params.adults, 2, capacity);
  const children = count(params.children, 0, capacity);
  const infants = count(params.infants, 0, capacity);

  const selected =
    upcoming.find((day) => day.departureId === params.departure) ??
    upcoming.find((day) => day.seatsLeft > 0) ??
    null;

  function hrefWithMonth(target: string): string {
    const next = new URLSearchParams({
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      month: target,
    });
    if (selected) next.set("departure", selected.departureId);
    return `${basePath}?${next.toString()}`;
  }

  let quoteNode: React.ReactNode = <p className="notice">{t.priceNotice}</p>;

  if (selected) {
    try {
      const result = await quoteTour(productId, selected.departureId, {
        adult: adults,
        child: children,
        infant: infants,
      });
      const checkoutHref =
        `/${locale}/checkout?kind=tour&slug=${encodeURIComponent(slug)}` +
        `&departure=${selected.departureId}&adults=${adults}&children=${children}&infants=${infants}`;
      quoteNode = (
        <>
          <QuoteBreakdown quote={result.quote} locale={locale} />
          <Link className="btn btn-block" href={checkoutHref}>
            {t.bookNow}
          </Link>
        </>
      );
    } catch (error) {
      if (error instanceof QuoteError) {
        quoteNode = <p className="quote-warning">{describeQuoteError(error, t)}</p>;
      } else {
        throw error;
      }
    }
  }

  const dateFormat = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  });

  return (
    <>
      <BookingSelector action={basePath}>
        <div className="selector-row">
          <div className="field field-wide">
            <label htmlFor="departure">{t.departureLabel}</label>
            <select id="departure" name="departure" defaultValue={selected?.departureId ?? ""}>
              {upcoming.map((day) => (
                <option key={day.departureId} value={day.departureId} disabled={day.seatsLeft === 0}>
                  {dateFormat.format(new Date(day.startsAt))} ·{" "}
                  {day.seatsLeft === 0 ? t.soldOut : t.seatsLeft(day.seatsLeft)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="selector-row">
          <div className="field">
            <label htmlFor="adults">{t.paxAdults}</label>
            <select id="adults" name="adults" defaultValue={String(adults)}>
              {Array.from({ length: capacity }, (_, index) => index + 1).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="children">{t.paxChildren}</label>
            <select id="children" name="children" defaultValue={String(children)}>
              {Array.from({ length: capacity + 1 }, (_, index) => index).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="infants">{t.paxInfants}</label>
            <select id="infants" name="infants" defaultValue={String(infants)}>
              {Array.from({ length: 5 }, (_, index) => index).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
            <span className="field-hint">{t.paxInfantsHint}</span>
          </div>
          <button className="btn" type="submit">
            {t.quoteRecalculate}
          </button>
        </div>
        <input type="hidden" name="month" value={month} />
      </BookingSelector>

      {quoteNode}

      <TourCalendar
        departures={monthDepartures}
        month={month}
        locale={locale}
        prevHref={month <= startOfMonth(today) ? null : hrefWithMonth(prevMonthOf(month))}
        nextHref={hrefWithMonth(nextMonth)}
      />
    </>
  );
}

function prevMonthOf(month: string): string {
  const date = new Date(`${month}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}
