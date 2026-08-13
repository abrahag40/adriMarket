import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { QuoteBreakdown } from "@/components/quote-breakdown";
import { formatMoney, isLocale, LOCALE_TAG } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { LocalProvider, paymentProvider } from "@/modules/payments";

import { simulatePayment } from "./actions";

/**
 * Estado de la reserva · S3-3
 *
 * Es la página a la que vuelve el huésped después de pagar, y la que puede
 * consultar después. Lee el estado de la base y no del regreso del navegador: si
 * cerró la pestaña justo después de pagar, aquí ve su reserva confirmada igual.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

type RouteParams = Promise<{ locale: string; code: string }>;

function formatBookingDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale as "es" | "en"], {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatDeparture(instant: string, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale as "es" | "en"], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(instant));
}

/** 15 minutos antes de la salida, igual que en el comprobante. */
function reportTime(instant: string, timezone: string, locale: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale as "es" | "en"], {
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(new Date(instant).getTime() - 15 * 60_000));
}

/** El desglose congelado, si tiene la forma esperada. */
function isQuote(value: unknown): value is Parameters<typeof QuoteBreakdown>[0]["quote"] {
  return (
    typeof value === "object" &&
    value !== null &&
    "lines" in value &&
    Array.isArray((value as { lines: unknown }).lines)
  );
}
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const t = getMessages(locale);
  const sp = await searchParams;

  const rows = await db.execute<{
    status: string;
    currency: string;
    total_cents: string;
    deposit_cents: string;
    balance_cents: string;
    product_name: string;
    deposit_paid: string;
    quote: unknown;
    kind: "tour" | "stay";
    check_in: string | null;
    check_out: string | null;
    starts_at: string | null;
    meeting_point: string | null;
    timezone: string;
  }>(sql`
    select b.status::text as status, b.currency, b.total_cents, b.deposit_cents, b.balance_cents,
           b.quote,
           i.kind,
           lower(i.stay_range)::text as check_in,
           upper(i.stay_range)::text as check_out,
           d.starts_at,
           o.meeting_point,
           coalesce(l.timezone, 'America/Cancun') as timezone,
           coalesce(t.name, tes.name) as product_name,
           (select coalesce(sum(p.amount_cents), 0) from payments p
             where p.booking_id = b.id and p.purpose = 'deposit' and p.status = 'succeeded') as deposit_paid
      from bookings b
      join booking_items i on i.booking_id = b.id
      join products pr on pr.id = i.product_id
      left join product_translations t on t.product_id = pr.id and t.locale = ${locale}
      left join product_translations tes on tes.product_id = pr.id and tes.locale = 'es'
      left join locations l on l.id = pr.location_id
      left join tour_departures d on d.id = i.tour_departure_id
      left join tour_options o on o.id = d.tour_option_id
     where b.code = ${code.toUpperCase()}
     limit 1
  `);

  const booking = rows[0];
  if (!booking) notFound();

  const money = (cents: string | number) => formatMoney(Number(cents), booking.currency, locale);

  const statusLabel =
    booking.status === "confirmed"
      ? t.bookingConfirmed
      : booking.status === "hold"
        ? t.bookingHold
        : booking.status === "expired"
          ? t.bookingExpired
          : booking.status === "cancelled"
            ? t.bookingCancelled
            : booking.status;

  // El panel de simulación solo aparece con la pasarela local y mientras la
  // reserva espera el pago.
  const isLocalGateway = paymentProvider() instanceof LocalProvider;
  const showSimulator = isLocalGateway && booking.status === "hold";
  const ref = typeof sp.ref === "string" ? sp.ref : "";

  return (
    <div className="stack">
      <h1 className="page-title">{t.bookingTitle(code.toUpperCase())}</h1>
      <p className="muted">{booking.product_name}</p>

      <p className={booking.status === "confirmed" ? "status-ok" : "status-wait"}>{statusLabel}</p>

      {/* Lo primero que quiere ver quien aterriza aquí son sus fechas. */}
      {booking.kind === "stay" && booking.check_in && booking.check_out ? (
        <p>
          <strong>
            {formatBookingDate(booking.check_in, locale)} → {formatBookingDate(booking.check_out, locale)}
          </strong>
        </p>
      ) : null}

      {booking.kind === "tour" && booking.starts_at ? (
        <div className="stack-sm">
          <p>
            <strong>{formatDeparture(booking.starts_at, booking.timezone, locale)}</strong>
          </p>
          {/* La hora de presentación, no la de salida: es la que evita que
              alguien llegue justo cuando el camión arranca. */}
          <p className="muted">
            {t.reportAt(reportTime(booking.starts_at, booking.timezone, locale))}
            {booking.meeting_point ? ` · ${booking.meeting_point}` : ""}
          </p>
        </div>
      ) : null}

      <div className="quote-split">
        <p>
          <span>{t.depositPaid}</span>
          <strong>{money(booking.deposit_paid)}</strong>
        </p>
        <p>
          <span>{t.balanceOnArrival}</span>
          <strong>{money(booking.balance_cents)}</strong>
        </p>
      </div>

      {isQuote(booking.quote) ? <QuoteBreakdown quote={booking.quote} locale={locale} /> : null}

      {showSimulator ? (
        <section className="simulator">
          <h2 className="section-title">{t.simulateHeading}</h2>
          <p className="muted small">{t.simulateNotice}</p>
          <div className="filters-row">
            <form action={simulatePayment}>
              <input type="hidden" name="code" value={code.toUpperCase()} />
              <input type="hidden" name="ref" value={ref} />
              <input type="hidden" name="outcome" value="success" />
              <button className="btn" type="submit">
                {t.simulateSuccess}
              </button>
            </form>
            <form action={simulatePayment}>
              <input type="hidden" name="code" value={code.toUpperCase()} />
              <input type="hidden" name="ref" value={ref} />
              <input type="hidden" name="outcome" value="failure" />
              <button className="btn btn-secondary" type="submit">
                {t.simulateFailure}
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <p>
        <Link href={`/${locale}`}>{t.backToCatalog}</Link>
      </p>
    </div>
  );
}
