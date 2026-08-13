import Link from "next/link";

import { LOCALE_TAG, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { StayNight, TourDay } from "@/modules/availability/calendar";
import { isoDayOfWeek } from "@/time";

/**
 * Calendario de disponibilidad · S2-3
 *
 * Muestra si una noche se puede reservar, nunca por qué no. Un huésped no tiene
 * por qué saber que la casa está en mantenimiento o que la está usando el
 * propietario: eso es información de la operación.
 */

function monthLabel(month: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T00:00:00Z`));
}

function Grid({
  month,
  locale,
  days,
}: {
  month: string;
  locale: Locale;
  days: Map<string, { available: boolean; label?: string }>;
}) {
  const t = getMessages(locale);
  const first = `${month.slice(0, 7)}-01`;
  const leading = isoDayOfWeek(first) - 1;
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();

  return (
    <table className="calendar">
      <caption className="visually-hidden">{monthLabel(month, locale)}</caption>
      <thead>
        <tr>
          {t.weekdays.map((day, index) => (
            <th key={index} scope="col" abbr={day}>
              {day}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: Math.ceil((leading + daysInMonth) / 7) }, (_, week) => (
          <tr key={week}>
            {Array.from({ length: 7 }, (_, weekday) => {
              const dayNumber = week * 7 + weekday - leading + 1;
              if (dayNumber < 1 || dayNumber > daysInMonth) {
                return <td key={weekday} className="cal-empty" />;
              }
              const date = `${month.slice(0, 7)}-${String(dayNumber).padStart(2, "0")}`;
              const info = days.get(date);
              const state = info === undefined ? "unknown" : info.available ? "free" : "busy";

              return (
                <td key={weekday} className={`cal-day cal-${state}`}>
                  <span className="cal-number">{dayNumber}</span>
                  {info?.label ? <span className="cal-label">{info.label}</span> : null}
                  <span className="visually-hidden">
                    {state === "free" ? t.calendarFree : t.calendarBusy}
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StayCalendar({
  nights,
  month,
  locale,
  prevHref,
  nextHref,
}: {
  nights: StayNight[];
  month: string;
  locale: Locale;
  prevHref: string | null;
  nextHref: string;
}) {
  const t = getMessages(locale);
  const days = new Map(
    nights.map((night) => [night.night, { available: night.available }]),
  );

  return (
    <section className="calendar-block">
      <div className="calendar-head">
        <h2 className="section-title">{t.calendarHeading}</h2>
        <p className="calendar-nav">
          {prevHref ? (
            <Link href={prevHref} rel="prev">
              ← {t.calendarPrev}
            </Link>
          ) : (
            <span className="muted">← {t.calendarPrev}</span>
          )}
          <span className="calendar-month">{monthLabel(month, locale)}</span>
          <Link href={nextHref} rel="next">
            {t.calendarNext} →
          </Link>
        </p>
      </div>
      <Grid month={month} locale={locale} days={days} />
      <p className="calendar-legend">
        <span className="legend-free">{t.calendarFree}</span>
        <span className="legend-busy">{t.calendarBusy}</span>
      </p>
    </section>
  );
}

export function TourCalendar({
  departures,
  month,
  locale,
  prevHref,
  nextHref,
}: {
  departures: TourDay[];
  month: string;
  locale: Locale;
  prevHref: string | null;
  nextHref: string;
}) {
  const t = getMessages(locale);
  const days = new Map(
    departures.map((day) => [
      day.date,
      { available: day.seatsLeft > 0, label: day.seatsLeft > 0 ? String(day.seatsLeft) : "0" },
    ]),
  );

  return (
    <section className="calendar-block">
      <div className="calendar-head">
        <h2 className="section-title">{t.calendarHeading}</h2>
        <p className="calendar-nav">
          {prevHref ? (
            <Link href={prevHref} rel="prev">
              ← {t.calendarPrev}
            </Link>
          ) : (
            <span className="muted">← {t.calendarPrev}</span>
          )}
          <span className="calendar-month">{monthLabel(month, locale)}</span>
          <Link href={nextHref} rel="next">
            {t.calendarNext} →
          </Link>
        </p>
      </div>
      <Grid month={month} locale={locale} days={days} />
      <p className="calendar-legend">
        <span className="legend-free">{t.seatsLeft(1).replace("1 ", "")}</span>
        <span className="legend-busy">{t.calendarNoDeparture}</span>
      </p>
    </section>
  );
}
