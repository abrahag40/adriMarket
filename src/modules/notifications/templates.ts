import { formatMoney, LOCALE_TAG, type Locale } from "@/i18n/config";

/**
 * Plantillas de los avisos · S3-4
 *
 * Texto plano a propósito para el MVP: llega igual a cualquier cliente de
 * correo, no cae en spam por HTML mal formado y se lee bien en un teléfono con
 * mala señal. La versión con diseño entra cuando haya volumen que lo justifique.
 *
 * Tres cosas que están aquí porque las pidió el SME y no salen del esquema:
 *
 * - **El saldo a pagar en destino, en grande.** Es la mitad del dinero y el
 *   huésped tiene que llegar sabiéndolo.
 * - **La hora de presentación, no la hora de salida.** El guía pide 15 minutos
 *   antes; si el correo dice la hora de salida, el camión ya se fue.
 * - **El depósito de garantía en efectivo**, en estancias. No pasa por la
 *   pasarela, así que si no aparece aquí el huésped llega sin efectivo.
 */

export type BookingNotification = {
  code: string;
  locale: Locale;
  productName: string;
  kind: "tour" | "stay";
  currency: string;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  holderName: string;
  /** Líneas del desglose con su etiqueta ya traducida. */
  lines: { label: string; cents: number }[];
  policyText: string | null;
  /** Tours: instante de la salida y punto de encuentro. */
  startsAt: string | null;
  timezone: string;
  meetingPoint: string | null;
  /** Estancias: fechas, horas y depósito en efectivo. */
  checkIn: string | null;
  checkOut: string | null;
  checkinTime: string | null;
  checkoutTime: string | null;
  securityDepositNote: string | null;
  guests: { fullName: string; paxType: string; age: number | null }[];
};

/** Hora de presentación: 15 minutos antes de la salida (regla del SME). */
const REPORT_MINUTES_EARLY = 15;

function formatDateTime(instant: string, timezone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(instant));
}

function formatDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function reportTime(startsAt: string, timezone: string, locale: Locale): string {
  const instant = new Date(new Date(startsAt).getTime() - REPORT_MINUTES_EARLY * 60_000);
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    timeStyle: "short",
    timeZone: timezone,
  }).format(instant);
}

export function guestConfirmation(data: BookingNotification): { subject: string; text: string } {
  const es = data.locale === "es";
  const money = (cents: number) => formatMoney(cents, data.currency, data.locale);

  const lines: string[] = [];

  lines.push(es ? `Hola ${data.holderName},` : `Hi ${data.holderName},`);
  lines.push("");
  lines.push(
    es
      ? `Tu reserva está confirmada. Tu código es ${data.code}.`
      : `Your booking is confirmed. Your code is ${data.code}.`,
  );
  lines.push("");
  lines.push(data.productName);

  if (data.kind === "tour" && data.startsAt) {
    lines.push("");
    lines.push(
      es
        ? `Salida: ${formatDateTime(data.startsAt, data.timezone, data.locale)}`
        : `Departure: ${formatDateTime(data.startsAt, data.timezone, data.locale)}`,
    );
    // Lo que evita que alguien llegue justo cuando el camión arranca.
    lines.push(
      es
        ? `PRESÉNTATE A LAS ${reportTime(data.startsAt, data.timezone, data.locale)} (15 minutos antes).`
        : `PLEASE ARRIVE AT ${reportTime(data.startsAt, data.timezone, data.locale)} (15 minutes early).`,
    );
    if (data.meetingPoint) {
      lines.push(es ? `Punto de encuentro: ${data.meetingPoint}` : `Meeting point: ${data.meetingPoint}`);
    }
  }

  if (data.kind === "stay" && data.checkIn && data.checkOut) {
    lines.push("");
    lines.push(
      es
        ? `Llegada: ${formatDate(data.checkIn, data.locale)}${data.checkinTime ? ` a partir de las ${data.checkinTime.slice(0, 5)}` : ""}`
        : `Check-in: ${formatDate(data.checkIn, data.locale)}${data.checkinTime ? ` from ${data.checkinTime.slice(0, 5)}` : ""}`,
    );
    lines.push(
      es
        ? `Salida: ${formatDate(data.checkOut, data.locale)}${data.checkoutTime ? ` antes de las ${data.checkoutTime.slice(0, 5)}` : ""}`
        : `Check-out: ${formatDate(data.checkOut, data.locale)}${data.checkoutTime ? ` before ${data.checkoutTime.slice(0, 5)}` : ""}`,
    );
  }

  if (data.guests.length > 0) {
    lines.push("");
    lines.push(es ? "Pasajeros:" : "Guests:");
    for (const guest of data.guests) {
      const age = guest.age !== null ? ` (${guest.age} ${es ? "años" : "years"})` : "";
      lines.push(`  · ${guest.fullName}${age}`);
    }
  }

  lines.push("");
  lines.push(es ? "Desglose:" : "Breakdown:");
  for (const line of data.lines) {
    lines.push(`  ${line.label}: ${money(line.cents)}`);
  }
  lines.push(`  ${es ? "Total" : "Total"}: ${money(data.totalCents)}`);

  lines.push("");
  lines.push(es ? `Anticipo pagado: ${money(data.depositCents)}` : `Deposit paid: ${money(data.depositCents)}`);
  // El dato que más reclamos evita.
  lines.push(
    es
      ? `SALDO A PAGAR EN DESTINO: ${money(data.balanceCents)}`
      : `BALANCE TO PAY ON ARRIVAL: ${money(data.balanceCents)}`,
  );

  if (data.securityDepositNote) {
    lines.push("");
    lines.push(data.securityDepositNote);
  }

  if (data.policyText) {
    lines.push("");
    lines.push(es ? "Política de cancelación:" : "Cancellation policy:");
    lines.push(data.policyText);
  }

  lines.push("");
  lines.push(
    es
      ? "Las propinas no se cobran en línea: se dejan directamente al guía o al anfitrión."
      : "Gratuities are not charged online: they go directly to your guide or host.",
  );
  lines.push("");
  lines.push("adriMarket");

  return {
    subject: es
      ? `Reserva confirmada ${data.code} · ${data.productName}`
      : `Booking confirmed ${data.code} · ${data.productName}`,
    text: lines.join("\n"),
  };
}

export function adminNotification(data: BookingNotification): { subject: string; text: string } {
  const money = (cents: number) => formatMoney(cents, data.currency, "es");
  const lines: string[] = [];

  lines.push(`Reserva nueva: ${data.code}`);
  lines.push("");
  lines.push(`Producto: ${data.productName}`);
  lines.push(`Titular: ${data.holderName}`);

  if (data.startsAt) {
    lines.push(`Salida: ${formatDateTime(data.startsAt, data.timezone, "es")}`);
  }
  if (data.checkIn && data.checkOut) {
    lines.push(`Estancia: ${data.checkIn} → ${data.checkOut}`);
  }

  lines.push(`Pax: ${data.guests.length}`);
  for (const guest of data.guests) {
    const age = guest.age !== null ? ` (${guest.age} años)` : "";
    lines.push(`  · ${guest.fullName} — ${guest.paxType}${age}`);
  }

  lines.push("");
  lines.push(`Total: ${money(data.totalCents)}`);
  lines.push(`Anticipo cobrado: ${money(data.depositCents)}`);
  lines.push(`Por cobrar en destino: ${money(data.balanceCents)}`);

  return { subject: `Reserva ${data.code} · ${data.productName}`, text: lines.join("\n") };
}
