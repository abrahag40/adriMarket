import Link from "next/link";

import { BookingSelector } from "@/components/booking-selector";
import { DeparturePicker } from "@/components/departure-picker";
import { QuoteBreakdown, describeQuoteError } from "@/components/quote-breakdown";
import { LOCALE_TAG, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { tourDepartures } from "@/modules/availability/calendar";
import { quoteTour } from "@/modules/pricing/service";
import { QuoteError } from "@/modules/pricing/types";
import { startOfMonth, todayIn } from "@/time";

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

  /* Una sola consulta, con un horizonte largo: el calendario desplegable
     navega entre meses **sin tocar el servidor**, igual que la referencia,
     que manda todas las fechas vendibles en el HTML (`data-tour-date`). Doce
     meses de salidas diarias son ~360 filas de tres campos: cabe de sobra en
     el presupuesto de bytes de la página. */
  const upcoming = await tourDepartures(productId, today, addMonths(today, 12));

  const adults = count(params.adults, 2, capacity);
  const children = count(params.children, 0, capacity);
  const infants = count(params.infants, 0, capacity);

  const selected =
    upcoming.find((day) => day.departureId === params.departure) ??
    upcoming.find((day) => day.seatsLeft > 0) ??
    null;

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
          <DeparturePicker
            locale={LOCALE_TAG[locale]}
            selectedId={selected?.departureId ?? null}
            departures={upcoming.map((day) => ({
              id: day.departureId,
              date: day.date,
              label: dateFormat.format(new Date(day.startsAt)),
              seats: day.seatsLeft,
              seatsLabel: day.seatsLeft === 0 ? t.soldOut : t.seatsLeft(day.seatsLeft),
            }))}
            labels={{
              field: t.departureLabel,
              placeholder: t.calendarNoDeparture,
              open: t.calendarHeading,
              prevMonth: t.calendarPrev,
              nextMonth: t.calendarNext,
              weekdays: t.weekdays,
              noDeparture: t.calendarNoDeparture,
            }}
            fallback={
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
            }
          />
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
          {/* Sin campo de infantes: para quien reserva es lo mismo que un
              menor, y dos casillas que se leen igual hacen dudar en el peor
              momento. El parámetro sigue existiendo del lado del servidor
              —una URL con `infants=1` se cotiza igual que siempre— así que
              esto es una decisión de interfaz, no un cambio de precios. */}
          <button className="btn" type="submit">
            {t.quoteRecalculate}
          </button>
        </div>
        <input type="hidden" name="month" value={month} />
      </BookingSelector>

      {quoteNode}
    </>
  );
}

/** Horizonte del calendario desplegable. */
function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
