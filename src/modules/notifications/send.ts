import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { isLocale, type Locale } from "@/i18n/config";
import { formatMoney } from "@/i18n/config";

import {
  adminNotification,
  cancellationNotice,
  guestConfirmation,
  reminderNotice,
  type BookingNotification,
} from "./templates";
import { buildWhatsApp } from "./whatsapp";

/**
 * Envío de la bandeja de salida · S3-4 y S3-5
 *
 * La confirmación ya está encolada dentro de la transacción que confirmó la
 * reserva (eso lo hace `booking_confirm` desde el Sprint 0). Este módulo es la
 * otra mitad: sacar los avisos de la cola y entregarlos.
 *
 * Reglas del worker:
 *
 * - **Un aviso que falla se reintenta con espera creciente**, y después de varios
 *   intentos queda marcado para revisión. Nunca falla en silencio.
 * - **Un aviso ya enviado no se envía dos veces**, porque solo se toman las filas
 *   pendientes y se marcan como enviadas en la misma pasada.
 * - **Varios workers pueden correr a la vez**: las filas se toman con
 *   `for update skip locked`.
 */

const MAX_ATTEMPTS = 6;

export type Transport = {
  name: string;
  send(message: { to: string; subject: string; text: string }): Promise<{ providerRef: string }>;
};

/**
 * Transporte de WhatsApp · S7-1
 *
 * Misma forma que el de correo y por la misma razón que la pasarela de pago: el
 * canal se elige por configuración, no por una bandera de "modo desarrollo". Sin
 * credenciales se usa el local, que **arma el mensaje exactamente igual** —misma
 * plantilla, mismos parámetros, mismo texto— y lo guarda en lugar de mandarlo.
 * Lo único que no ocurre es la entrega.
 */
export type WhatsAppTransport = {
  name: string;
  send(message: {
    to: string;
    template: string;
    language: string;
    parameters: string[];
  }): Promise<{ providerRef: string }>;
};

/**
 * API de nube de WhatsApp, por HTTP directo.
 *
 * No verificado contra el servicio: hace falta un número de empresa verificado y
 * **las plantillas aprobadas por Meta**, que es trámite del cliente y tarda de
 * horas a días. Lo que sí está verificado es todo lo demás del camino: elección
 * de plantilla, orden de los parámetros, normalización del número, encolado,
 * reintentos y marcado.
 */
class CloudApiTransport implements WhatsAppTransport {
  readonly name = "whatsapp";

  constructor(
    private readonly token: string,
    private readonly phoneId: string,
  ) {}

  async send(message: { to: string; template: string; language: string; parameters: string[] }) {
    const response = await fetch(`https://graph.facebook.com/v21.0/${this.phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: message.to,
        type: "template",
        template: {
          name: message.template,
          language: { code: message.language },
          components: [
            {
              type: "body",
              parameters: message.parameters.map((text) => ({ type: "text", text })),
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`whatsapp: HTTP ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { messages?: { id?: string }[] };
    return { providerRef: body.messages?.[0]?.id ?? "" };
  }
}

class LocalWhatsAppTransport implements WhatsAppTransport {
  readonly name = "whatsapp-local";

  async send(message: { to: string }) {
    return { providerRef: `local-wa:${message.to}` };
  }
}

export function whatsappTransport(): WhatsAppTransport {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId) return new CloudApiTransport(token, phoneId);
  return new LocalWhatsAppTransport();
}

/**
 * Resend, por HTTP directo.
 *
 * No verificado contra el servicio: hace falta dominio propio con SPF, DKIM y
 * DMARC, que es dependencia del PO. Lo que sí está verificado es todo lo demás
 * del camino —encolado, plantillas, reintentos, marcado— con el transporte local.
 */
class ResendTransport implements Transport {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: { to: string; subject: string; text: string }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!response.ok) {
      throw new Error(`resend: HTTP ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { id?: string };
    return { providerRef: body.id ?? "" };
  }
}

/**
 * Transporte local: guarda el mensaje renderizado en la propia fila de la
 * bandeja en lugar de mandarlo.
 *
 * Sirve para desarrollo y para el pipeline, y tiene una ventaja sobre un doble
 * de prueba que no hace nada: **el contenido queda inspeccionable**, así que las
 * pruebas pueden afirmar que el correo dice el saldo, la hora de presentación y
 * el depósito en efectivo. Eso es justo lo que el SME quería garantizado.
 */
class LocalTransport implements Transport {
  readonly name = "local";

  async send(message: { to: string; subject: string; text: string }) {
    return { providerRef: `local:${message.to}` };
  }
}

export function transport(): Transport {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (apiKey && from) return new ResendTransport(apiKey, from);
  return new LocalTransport();
}

// ---------------------------------------------------------------------------
// Datos del aviso
// ---------------------------------------------------------------------------

type QuoteLineWithLabel = { label?: string; concept: string; cents: number };

async function notificationData(bookingId: string): Promise<BookingNotification | null> {
  const rows = await db.execute<{
    code: string;
    locale: string;
    currency: string;
    total_cents: string;
    deposit_cents: string;
    balance_cents: string;
    quote: { lines?: QuoteLineWithLabel[] } | null;
    policy: { text_es?: string; text_en?: string } | null;
    holder_name: string;
    kind: "tour" | "stay";
    product_name: string;
    timezone: string;
    starts_at: string | null;
    meeting_point: string | null;
    check_in: string | null;
    check_out: string | null;
    checkin_time: string | null;
    checkout_time: string | null;
  }>(sql`
    select
      b.code, b.locale, b.currency, b.total_cents, b.deposit_cents, b.balance_cents,
      b.quote, b.cancellation_policy_snapshot as policy,
      c.full_name as holder_name,
      i.kind,
      coalesce(t.name, tes.name) as product_name,
      coalesce(l.timezone, 'America/Cancun') as timezone,
      d.starts_at,
      o.meeting_point,
      lower(i.stay_range)::text as check_in,
      upper(i.stay_range)::text as check_out,
      su.checkin_time::text as checkin_time,
      su.checkout_time::text as checkout_time
    from bookings b
    join customers c on c.id = b.customer_id
    join booking_items i on i.booking_id = b.id
    join products p on p.id = i.product_id
    left join product_translations t on t.product_id = p.id and t.locale = b.locale
    left join product_translations tes on tes.product_id = p.id and tes.locale = 'es'
    left join locations l on l.id = p.location_id
    left join tour_departures d on d.id = i.tour_departure_id
    left join tour_options o on o.id = d.tour_option_id
    left join stay_units su on su.id = i.stay_unit_id
    where b.id = ${bookingId}::uuid
    limit 1
  `);

  const row = rows[0];
  if (!row) return null;

  const guests = await db.execute<{ full_name: string; pax_type: string; age: number | null }>(sql`
    select full_name, pax_type::text as pax_type,
           case when birthdate is null then null
                else extract(year from age(birthdate))::int end as age
      from booking_guests
     where booking_id = ${bookingId}::uuid
     order by is_lead desc, full_name
  `);

  const locale: Locale = isLocale(row.locale) ? row.locale : "es";
  const lines = (row.quote?.lines ?? []).map((line) => ({
    label: line.label ?? line.concept,
    cents: line.cents,
  }));

  const balanceCents = Number(row.balance_cents);

  return {
    code: row.code,
    locale,
    productName: row.product_name,
    kind: row.kind,
    currency: row.currency,
    totalCents: Number(row.total_cents),
    depositCents: Number(row.deposit_cents),
    balanceCents,
    holderName: row.holder_name,
    lines,
    policyText: locale === "en" ? (row.policy?.text_en ?? row.policy?.text_es ?? null) : (row.policy?.text_es ?? null),
    startsAt: row.starts_at,
    timezone: row.timezone,
    meetingPoint: row.meeting_point,
    checkIn: row.check_in,
    checkOut: row.check_out,
    checkinTime: row.checkin_time,
    checkoutTime: row.checkout_time,
    // El depósito de garantía no pasa por la pasarela: si no se menciona aquí,
    // el huésped llega sin efectivo (regla del SME).
    securityDepositNote:
      row.kind === "stay"
        ? locale === "en"
          ? `On arrival the host may request a refundable cash damage deposit. It is not part of the ${formatMoney(balanceCents, row.currency, locale)} balance above.`
          : `Al llegar, el anfitrión puede pedir un depósito de garantía reembolsable en efectivo. No forma parte del saldo de ${formatMoney(balanceCents, row.currency, locale)}.`
        : null,
    guests: guests.map((guest) => ({
      fullName: guest.full_name,
      paxType: guest.pax_type,
      age: guest.age === null ? null : Number(guest.age),
    })),
  };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export type OutboxReport = { sent: number; failed: number; dead: number };

/**
 * Elige la plantilla y le pasa lo que la fila trae encima.
 *
 * Los datos de la reserva se leen frescos, pero **lo que dependía del momento en
 * que se encoló viaja en el payload**: cuánto se devolvió y por qué, o de qué
 * umbral es el recordatorio. Recalcularlo al enviar daría otro número si algo
 * cambió en el intervalo, y el correo tiene que decir lo que se decidió.
 *
 * Una plantilla desconocida es un error y no un correo genérico: mandar algo
 * distinto de lo que se encoló es peor que no mandar nada.
 */
function renderTemplate(
  template: string,
  data: BookingNotification,
  payload: { refund_cents?: number; reason?: string | null; hours_before?: number } | null,
): { subject: string; text: string } {
  switch (template) {
    case "booking_confirmed_guest":
      return guestConfirmation(data);
    case "booking_confirmed_admin":
      return adminNotification(data);
    case "booking_cancelled_by_operator":
    case "booking_cancelled_by_guest":
      return cancellationNotice({
        ...data,
        refundCents: Number(payload?.refund_cents ?? 0),
        reason: payload?.reason ?? null,
        byOperator: template === "booking_cancelled_by_operator",
      });
    case "booking_reminder":
      return reminderNotice({ ...data, hoursBefore: Number(payload?.hours_before ?? 24) });
    default:
      throw new Error(`plantilla desconocida: ${template}`);
  }
}

export async function processOutbox(limit = 25): Promise<OutboxReport> {
  const report: OutboxReport = { sent: 0, failed: 0, dead: 0 };
  const mail = transport();
  const wa = whatsappTransport();

  const pending = await db.execute<{
    id: string;
    channel: string;
    template: string;
    to_address: string;
    booking_id: string | null;
    attempts: number;
    payload: {
      refund_cents?: number;
      reason?: string | null;
      hours_before?: number;
      rendered?: { subject?: string; text?: string };
    } | null;
  }>(sql`
    select id, channel::text as channel, template, to_address, booking_id, attempts, payload
      from outbox
     where status in ('pending', 'failed')
       and next_attempt_at <= now()
     order by next_attempt_at
     limit ${limit}
     for update skip locked
  `);

  for (const row of pending) {
    try {
      if (!row.to_address) throw new Error("aviso sin destinatario");

      // Un aviso sin reserva es legítimo: el enlace de acceso del staff no
      // pertenece a ninguna. Antes se rechazaba con "aviso sin reserva
      // asociada", así que **ningún enlace de acceso se entregó nunca** — el
      // panel funcionaba en desarrollo solo porque los recorridos leen la URL
      // directamente de la bandeja. En producción, con el correo configurado,
      // nadie del equipo habría podido entrar.
      //
      // Estos avisos traen su texto ya armado en el payload, porque se arman en
      // el momento de encolar y no dependen de nada que se pueda releer después.
      if (!row.booking_id) {
        const listo = row.payload?.rendered;
        if (!listo?.subject || !listo?.text) {
          throw new Error(`aviso sin reserva y sin texto: ${row.template}`);
        }

        const result = await mail.send({
          to: row.to_address,
          subject: listo.subject,
          text: listo.text,
        });

        await db.execute(sql`
          update outbox
             set status = 'sent', sent_at = now(), attempts = attempts + 1,
                 provider_ref = ${result.providerRef}, last_error = null,
                 payload = payload || ${JSON.stringify({ transport: mail.name })}::jsonb
           where id = ${row.id}::uuid
        `);
        report.sent += 1;
        continue;
      }

      const data = await notificationData(row.booking_id);
      if (!data) throw new Error(`no se encontró la reserva ${row.booking_id}`);

      let rendered: { subject: string; text: string };
      let providerRef: string;
      let usado: string;

      if (row.channel === "whatsapp") {
        const message = buildWhatsApp(row.template, data, row.payload ?? {});
        if (!message) throw new Error(`sin plantilla de WhatsApp para ${row.template}`);

        const result = await wa.send({
          to: row.to_address,
          template: message.template,
          language: message.language,
          parameters: message.parameters,
        });
        providerRef = result.providerRef;
        usado = wa.name;
        // Se guarda el texto ya armado, no solo los parámetros: un reclamo se
        // resuelve enseñando el mensaje exacto que le llegó al huésped.
        rendered = { subject: message.template, text: message.preview };
      } else {
        const message = renderTemplate(row.template, data, row.payload);
        const result = await mail.send({
          to: row.to_address,
          subject: message.subject,
          text: message.text,
        });
        providerRef = result.providerRef;
        usado = mail.name;
        rendered = message;
      }

      await db.execute(sql`
        update outbox
           set status = 'sent',
               sent_at = now(),
               attempts = attempts + 1,
               provider_ref = ${providerRef},
               last_error = null,
               -- Se guarda lo enviado, no solo que se envió: un reclamo se
               -- resuelve mostrando el mensaje exacto que recibió el huésped.
               payload = payload || ${JSON.stringify({ rendered, transport: usado })}::jsonb
         where id = ${row.id}::uuid
      `);
      report.sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      // Espera creciente: 1, 2, 4, 8… minutos. Un proveedor caído no se arregla
      // reintentando cada segundo.
      const backoffMinutes = Math.min(2 ** (attempts - 1), 60);

      await db.execute(sql`
        update outbox
           set status = ${dead ? "dead" : "failed"},
               attempts = ${attempts},
               last_error = ${error instanceof Error ? error.message : String(error)},
               next_attempt_at = now() + make_interval(mins => ${backoffMinutes})
         where id = ${row.id}::uuid
      `);

      if (dead) report.dead += 1;
      else report.failed += 1;
    }
  }

  return report;
}

/**
 * Render sin enviar, para pruebas y para previsualizar en el panel.
 *
 * Toma el mismo camino que el despacho —la misma función de selección— para que
 * lo que se previsualiza sea lo que se manda. Una previsualización que se arma
 * aparte deja de parecerse al correo real en cuanto alguien toca uno de los dos.
 */
export async function renderNotification(
  bookingId: string,
  template: string,
  payload: { refund_cents?: number; reason?: string | null; hours_before?: number } = {},
): Promise<{ subject: string; text: string } | null> {
  const data = await notificationData(bookingId);
  if (!data) return null;
  return renderTemplate(template, data, payload);
}

/**
 * Encola los recordatorios de 72 y 24 horas · S5-5
 *
 * La decisión de a quién le toca vive en la base, junto a la clave que impide el
 * duplicado. Aquí solo se dispara desde el latido.
 */
export async function enqueueReminders(): Promise<{ queued: number }> {
  const rows = await db.execute<{ reminders_queued: number }>(sql`
    select reminders_queued from notifications_enqueue_reminders()
  `);
  return { queued: Number(rows[0]?.reminders_queued ?? 0) };
}
