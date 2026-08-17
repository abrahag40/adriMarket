import { formatMoney, LOCALE_TAG, type Locale } from "@/i18n/config";

import type { BookingNotification } from "./templates";

/**
 * WhatsApp · S7-1
 *
 * Es el canal por el que este negocio ya se comunica: el huésped que reserva por
 * WhatsApp espera la confirmación por WhatsApp, y un correo se le pierde entre
 * las promociones. El SME lo pidió y el plan lo puso en el último sprint por una
 * razón administrativa, no técnica.
 *
 * **Las plantillas las tiene que aprobar Meta antes de poder enviarlas.** No es
 * un detalle de configuración: fuera de la ventana de 24 horas desde el último
 * mensaje del usuario, WhatsApp solo entrega mensajes con plantilla aprobada, y
 * la aprobación tarda de horas a días. Por eso este módulo separa dos cosas:
 *
 * - **La plantilla**, que es texto con huecos numerados y va escrita aquí en el
 *   formato exacto que Meta pide para registrarla. Es lo que se manda a aprobar.
 * - **Los parámetros**, que son los valores que rellenan esos huecos en cada
 *   envío.
 *
 * Escribirlas así no es ceremonia: el trámite se hace copiando el `body` de aquí
 * a la consola de Meta, y si el texto enviado no coincide **carácter por
 * carácter** con el aprobado, el mensaje se rechaza en producción.
 *
 * Las tres son de categoría "utilidad" y no "marketing" a propósito: informan
 * sobre una transacción que el huésped inició. Una plantilla de marketing exige
 * consentimiento aparte, se puede bloquear por volumen, y aquí no aplica —nadie
 * está promocionando nada, se le está diciendo a alguien que su reserva existe.
 */

export type WhatsAppTemplate = {
  /** Nombre con el que se registra en Meta. Minúsculas y guion bajo, como exige. */
  name: string;
  category: "utility";
  languages: Record<Locale, string>;
  /** Texto con `{{1}}`, `{{2}}`… tal como se registra. */
  body: Record<Locale, string>;
};

/**
 * Catálogo de plantillas, listo para el trámite.
 *
 * Se escriben cortas a propósito. WhatsApp se lee en la pantalla de bloqueo y en
 * un hilo con otros veinte chats: lo que no se entiende en dos líneas no se lee.
 * El desglose completo sigue viviendo en el correo.
 */
export const WHATSAPP_TEMPLATES: Record<string, WhatsAppTemplate> = {
  booking_confirmed_guest: {
    name: "reserva_confirmada",
    category: "utility",
    languages: { es: "es_MX", en: "en_US" },
    body: {
      es:
        "Hola {{1}}, tu reserva {{2}} está confirmada.\n\n" +
        "{{3}}\n{{4}}\n\n" +
        "Anticipo pagado: {{5}}\n" +
        "SALDO A PAGAR EN DESTINO: {{6}}\n\n" +
        "Te mandamos el detalle completo por correo.",
      en:
        "Hi {{1}}, your booking {{2}} is confirmed.\n\n" +
        "{{3}}\n{{4}}\n\n" +
        "Deposit paid: {{5}}\n" +
        "BALANCE DUE ON ARRIVAL: {{6}}\n\n" +
        "We've emailed you the full details.",
    },
  },

  booking_reminder: {
    name: "recordatorio_reserva",
    category: "utility",
    languages: { es: "es_MX", en: "en_US" },
    body: {
      es:
        "Hola {{1}}, te esperamos el {{2}}.\n\n" +
        "{{3}}\n" +
        "PRESÉNTATE A LAS {{4}}\n" +
        "{{5}}\n\n" +
        "Reserva {{6}}.",
      en:
        "Hi {{1}}, see you on {{2}}.\n\n" +
        "{{3}}\n" +
        "PLEASE ARRIVE AT {{4}}\n" +
        "{{5}}\n\n" +
        "Booking {{6}}.",
    },
  },

  booking_cancelled_by_operator: {
    name: "reserva_cancelada_operador",
    category: "utility",
    languages: { es: "es_MX", en: "en_US" },
    body: {
      es:
        "Hola {{1}}, tuvimos que cancelar tu reserva {{2}} y lo sentimos mucho.\n\n" +
        "Motivo: {{3}}\n\n" +
        "Te devolvemos {{4}}, el total de lo que pagaste. " +
        "Cuando cancelamos nosotros no aplica la política de cancelación.",
      en:
        "Hi {{1}}, we had to cancel your booking {{2}} and we're sorry.\n\n" +
        "Reason: {{3}}\n\n" +
        "We're refunding {{4}}, everything you paid. " +
        "When we cancel, the cancellation policy does not apply.",
    },
  },
};

/** Hora de presentación: 15 minutos antes de la salida (regla del SME). */
const REPORT_MINUTES_EARLY = 15;

function serviceLine(data: BookingNotification): string {
  if (data.startsAt) {
    return new Intl.DateTimeFormat(LOCALE_TAG[data.locale], {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: data.timezone,
    }).format(new Date(data.startsAt));
  }
  if (data.checkIn) {
    return new Intl.DateTimeFormat(LOCALE_TAG[data.locale], {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(`${data.checkIn}T00:00:00Z`));
  }
  return "";
}

/**
 * Solo el día, sin la hora.
 *
 * El recordatorio saluda con "te esperamos el {{2}}." y la hora ya va abajo, en
 * la línea de presentación que es la que importa. Meter aquí la hora completa
 * producía "…10:00 a.m.." —con dos puntos— y repetía un dato que enseguida se
 * contradice con el de presentación.
 */
function serviceDay(data: BookingNotification): string {
  const fuente = data.startsAt
    ? new Date(data.startsAt)
    : data.checkIn
      ? new Date(`${data.checkIn}T00:00:00Z`)
      : null;
  if (!fuente) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[data.locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: data.startsAt ? data.timezone : "UTC",
  }).format(fuente);
}

function reportTime(data: BookingNotification): string {
  if (!data.startsAt) return data.checkinTime?.slice(0, 5) ?? "";
  return new Intl.DateTimeFormat(LOCALE_TAG[data.locale], {
    timeStyle: "short",
    timeZone: data.timezone,
  }).format(new Date(new Date(data.startsAt).getTime() - REPORT_MINUTES_EARLY * 60_000));
}

export type WhatsAppMessage = {
  template: string;
  language: string;
  /** Valores de `{{1}}`, `{{2}}`… en orden. */
  parameters: string[];
  /** El texto ya armado. Se guarda para poder mostrar qué se mandó. */
  preview: string;
};

/**
 * Arma los parámetros de una plantilla a partir de la reserva.
 *
 * Ningún parámetro puede ir vacío: Meta rechaza el mensaje si un hueco queda en
 * blanco, y lo hace en el momento del envío, no al registrar la plantilla. Se
 * sustituye por un guion antes que perder el aviso.
 */
export function buildWhatsApp(
  template: string,
  data: BookingNotification,
  extra: { refundCents?: number; reason?: string | null } = {},
): WhatsAppMessage | null {
  const spec = WHATSAPP_TEMPLATES[template];
  if (!spec) return null;

  const money = (cents: number) => formatMoney(cents, data.currency, data.locale);
  let parameters: string[];

  switch (template) {
    case "booking_confirmed_guest":
      parameters = [
        data.holderName,
        data.code,
        data.productName,
        serviceLine(data),
        money(data.depositCents),
        money(data.balanceCents),
      ];
      break;
    case "booking_reminder":
      parameters = [
        data.holderName,
        serviceDay(data),
        data.productName,
        reportTime(data),
        data.meetingPoint ?? "",
        data.code,
      ];
      break;
    case "booking_cancelled_by_operator":
      parameters = [
        data.holderName,
        data.code,
        extra.reason ?? "",
        money(extra.refundCents ?? 0),
      ];
      break;
    default:
      return null;
  }

  // Se normaliza a texto antes de mirar si está vacío. Cualquiera de estos
  // valores puede llegar nulo —un producto sin traducción deja el nombre en
  // null— y `null.trim()` revienta el aviso entero: el correo salía y el
  // WhatsApp se reintentaba seis veces hasta morir. Meta además rechaza el
  // mensaje si un hueco queda en blanco, así que se sustituye por un guion
  // antes que perder el aviso.
  parameters = parameters.map((value) => {
    const texto = String(value ?? "").trim();
    return texto === "" ? "—" : texto;
  });

  const body = spec.body[data.locale];
  const preview = parameters.reduce(
    (text, value, index) => text.replaceAll(`{{${index + 1}}}`, value),
    body,
  );

  return { template: spec.name, language: spec.languages[data.locale], parameters, preview };
}
