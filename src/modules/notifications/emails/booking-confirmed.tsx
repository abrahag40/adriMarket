// React en ámbito a propósito: el proyecto compila con el runtime automático
// de JSX (`"jsx": "preserve"` + Next), pero `tsx` —que corre las pruebas y la
// vista previa— usa el clásico y falla con "React is not defined". El import
// sobra en el build y hace que el archivo funcione en los dos.
import * as React from "react";

import {
  Body,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import { formatMoney } from "@/i18n/config";

import {
  formatDate,
  formatDateTime,
  reportTime,
  type BookingNotification,
} from "../templates";

/**
 * Confirmación al huésped, en HTML · post-Sprint 7
 *
 * **Acompaña al texto plano, no lo reemplaza.** El correo sale multiparte: el
 * cliente elige. Eso no es cortesía con los nostálgicos —es lo que hace que el
 * mensaje se lea en un reloj, en un lector de pantalla y en la vista previa de
 * la notificación, y es parte de por qué no cae en no deseado. Las pruebas
 * siguen afirmando sobre el texto: **si el diseño se rompe, los hechos siguen
 * llegando.**
 *
 * ## Por qué Tailwind aquí sí funciona
 *
 * En un correo, Tailwind tal cual no sirve: Gmail descarta `<link>` y casi todo
 * `<style>`, y Outlook de escritorio renderiza con el motor de Word. El
 * componente `Tailwind` de react-email **compila las clases a estilos en línea**
 * al renderizar, y el resto de componentes emiten tablas anidadas, que es lo
 * único que todos los clientes maquetan igual. O sea: se escribe con Tailwind y
 * viaja como HTML de 1999, que es exactamente lo que hace falta.
 *
 * ## Reglas de este diseño
 *
 * - **Cero imágenes.** Casi todos los clientes las bloquean por omisión, así
 *   que un correo que depende de ellas llega roto. Lo único visual que se
 *   manda es el comprobante QR, y va **adjunto** — ver la decisión 0003.
 * - **Los tres datos del SME sobreviven al diseño**: el saldo a pagar en
 *   destino en grande, la hora de presentación (no la de salida) y el depósito
 *   de garantía en efectivo. Si algo se cae por falta de espacio, no son estos.
 * - **Tipografías del sistema.** Gmail no carga fuentes externas; pedir DM Sans
 *   solo agrega peso para que la mayoría vea la de siempre. La serif del
 *   encabezado es una pila del sistema y evoca la del sitio sin depender de red.
 * - **Un solo acento**, el mismo del sitio (`#2f6fd6`).
 */

const COLOR = {
  texto: "#1e1e1e",
  cuerpo: "#565656",
  tenue: "#6b6b6b",
  acento: "#2f6fd6",
  acentoSuave: "#e8f0fd",
  superficie: "#f8f8f8",
  borde: "#e6e6e6",
} as const;

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Una etiqueta con su valor, apiladas. Es la unidad de todo el correo. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Section className="mb-[18px]">
      <Text
        className="m-0 text-[11px] uppercase tracking-[0.08em]"
        style={{ color: COLOR.tenue, fontFamily: SANS }}
      >
        {etiqueta}
      </Text>
      <Text
        className="m-0 mt-[2px] text-[15px] leading-[22px]"
        style={{ color: COLOR.texto, fontFamily: SANS }}
      >
        {valor}
      </Text>
    </Section>
  );
}

export function BookingConfirmedEmail({ data }: { data: BookingNotification }) {
  const es = data.locale === "es";
  const money = (cents: number) => formatMoney(cents, data.currency, data.locale);

  const t = {
    preview: es
      ? `Reserva confirmada · ${data.code}`
      : `Booking confirmed · ${data.code}`,
    saludo: es ? `Hola ${data.holderName},` : `Hi ${data.holderName},`,
    titulo: es ? "Tu reserva está confirmada" : "Your booking is confirmed",
    codigo: es ? "Código de reserva" : "Booking code",
    salida: es ? "Salida" : "Departure",
    presentate: es ? "Preséntate a las" : "Please arrive at",
    antes: es ? "15 minutos antes" : "15 minutes early",
    encuentro: es ? "Punto de encuentro" : "Meeting point",
    llegada: es ? "Llegada" : "Check-in",
    salidaEstancia: es ? "Salida" : "Check-out",
    desde: es ? "a partir de las" : "from",
    antesDe: es ? "antes de las" : "before",
    pasajeros: es ? "Pasajeros" : "Guests",
    anios: es ? "años" : "years",
    total: es ? "Total" : "Total",
    anticipo: es ? "Anticipo pagado" : "Deposit paid",
    saldo: es ? "Saldo a pagar en destino" : "Balance due on arrival",
    saldoNota: es
      ? "En efectivo o tarjeta al llegar. No se cobró en línea."
      : "Cash or card on arrival. Not charged online.",
    propinas: es
      ? "Las propinas no se cobran en línea y no están incluidas."
      : "Tips are not charged online and are not included.",
    comprobante: es
      ? "Tu comprobante con código QR va adjunto a este correo. Enséñalo al llegar."
      : "Your QR voucher is attached to this email. Show it on arrival.",
    politica: es ? "Política de cancelación" : "Cancellation policy",
  };

  return (
    <Html lang={data.locale}>
      <Head />
      {/* Lo que se lee en la lista de correos, antes de abrir. Sin esto, los
          clientes rellenan con las primeras palabras del cuerpo. */}
      <Preview>{t.preview}</Preview>
      <Tailwind>
        <Body style={{ backgroundColor: COLOR.superficie, margin: 0, padding: 0 }}>
          <Container
            className="mx-auto my-[32px] w-full max-w-[560px] rounded-[10px] p-[40px]"
            style={{ backgroundColor: "#ffffff", border: `1px solid ${COLOR.borde}` }}
          >
            <Text
              className="m-0 text-[12px] uppercase tracking-[0.14em]"
              style={{ color: COLOR.acento, fontFamily: SANS, fontWeight: 600 }}
            >
              adriMarket
            </Text>

            <Heading
              className="mb-0 mt-[24px] text-[26px] font-normal leading-[32px]"
              style={{ color: COLOR.texto, fontFamily: SERIF }}
            >
              {t.titulo}
            </Heading>

            <Text
              className="mb-0 mt-[12px] text-[15px] leading-[24px]"
              style={{ color: COLOR.cuerpo, fontFamily: SANS }}
            >
              {t.saludo}
            </Text>

            {/* El código, que es lo que el huésped busca cuando abre esto en el
                muelle con el sol de frente. */}
            <Section
              className="mt-[28px] rounded-[8px] px-[24px] py-[20px] text-center"
              style={{ backgroundColor: COLOR.acentoSuave }}
            >
              <Text
                className="m-0 text-[11px] uppercase tracking-[0.08em]"
                style={{ color: COLOR.acento, fontFamily: SANS }}
              >
                {t.codigo}
              </Text>
              <Text
                className="m-0 mt-[6px] text-[30px] leading-[36px] tracking-[0.06em]"
                style={{ color: COLOR.texto, fontFamily: SANS, fontWeight: 700 }}
              >
                {data.code}
              </Text>
            </Section>

            <Heading
              as="h2"
              className="mb-[24px] mt-[32px] text-[19px] font-normal leading-[26px]"
              style={{ color: COLOR.texto, fontFamily: SERIF }}
            >
              {data.productName}
            </Heading>

            {data.kind === "tour" && data.startsAt && (
              <>
                <Dato
                  etiqueta={t.salida}
                  valor={formatDateTime(data.startsAt, data.timezone, data.locale)}
                />
                {/* La hora de presentación va destacada porque es la que evita
                    que alguien llegue justo cuando el camión arranca. */}
                <Section
                  className="mb-[18px] rounded-[6px] px-[16px] py-[12px]"
                  style={{ borderLeft: `3px solid ${COLOR.acento}`, backgroundColor: COLOR.superficie }}
                >
                  <Text
                    className="m-0 text-[15px] leading-[22px]"
                    style={{ color: COLOR.texto, fontFamily: SANS, fontWeight: 700 }}
                  >
                    {t.presentate} {reportTime(data.startsAt, data.timezone, data.locale)}
                  </Text>
                  <Text
                    className="m-0 mt-[2px] text-[13px] leading-[20px]"
                    style={{ color: COLOR.cuerpo, fontFamily: SANS }}
                  >
                    {t.antes}
                  </Text>
                </Section>
                {data.meetingPoint && (
                  <Dato etiqueta={t.encuentro} valor={data.meetingPoint} />
                )}
              </>
            )}

            {data.kind === "stay" && data.checkIn && data.checkOut && (
              <>
                <Dato
                  etiqueta={t.llegada}
                  valor={`${formatDate(data.checkIn, data.locale)}${
                    data.checkinTime ? ` · ${t.desde} ${data.checkinTime.slice(0, 5)}` : ""
                  }`}
                />
                <Dato
                  etiqueta={t.salidaEstancia}
                  valor={`${formatDate(data.checkOut, data.locale)}${
                    data.checkoutTime ? ` · ${t.antesDe} ${data.checkoutTime.slice(0, 5)}` : ""
                  }`}
                />
              </>
            )}

            {data.guests.length > 0 && (
              <Dato
                etiqueta={t.pasajeros}
                valor={data.guests
                  .map(
                    (guest) =>
                      `${guest.fullName}${guest.age !== null ? ` (${guest.age} ${t.anios})` : ""}`,
                  )
                  .join(" · ")}
              />
            )}

            <Hr className="my-[28px]" style={{ borderColor: COLOR.borde }} />

            {data.lines.map((line) => (
              <Row key={line.label} className="mb-[8px]">
                <Column>
                  <Text
                    className="m-0 text-[14px] leading-[20px]"
                    style={{ color: COLOR.cuerpo, fontFamily: SANS }}
                  >
                    {line.label}
                  </Text>
                </Column>
                <Column align="right">
                  <Text
                    className="m-0 text-[14px] leading-[20px]"
                    style={{ color: COLOR.cuerpo, fontFamily: SANS }}
                  >
                    {money(line.cents)}
                  </Text>
                </Column>
              </Row>
            ))}

            <Row className="mt-[12px]">
              <Column>
                <Text
                  className="m-0 text-[14px] leading-[20px]"
                  style={{ color: COLOR.texto, fontFamily: SANS, fontWeight: 700 }}
                >
                  {t.total}
                </Text>
              </Column>
              <Column align="right">
                <Text
                  className="m-0 text-[14px] leading-[20px]"
                  style={{ color: COLOR.texto, fontFamily: SANS, fontWeight: 700 }}
                >
                  {money(data.totalCents)}
                </Text>
              </Column>
            </Row>

            <Row className="mt-[6px]">
              <Column>
                <Text
                  className="m-0 text-[14px] leading-[20px]"
                  style={{ color: COLOR.cuerpo, fontFamily: SANS }}
                >
                  {t.anticipo}
                </Text>
              </Column>
              <Column align="right">
                <Text
                  className="m-0 text-[14px] leading-[20px]"
                  style={{ color: COLOR.cuerpo, fontFamily: SANS }}
                >
                  −{money(data.depositCents)}
                </Text>
              </Column>
            </Row>

            {/* La mitad del dinero. Va en grande porque el huésped tiene que
                llegar sabiéndolo — regla del SME, no decisión de diseño. */}
            <Section
              className="mt-[20px] rounded-[8px] px-[24px] py-[20px]"
              style={{ backgroundColor: COLOR.texto }}
            >
              <Text
                className="m-0 text-[11px] uppercase tracking-[0.08em]"
                style={{ color: "#b9b9b9", fontFamily: SANS }}
              >
                {t.saldo}
              </Text>
              <Text
                className="m-0 mt-[4px] text-[26px] leading-[32px]"
                style={{ color: "#ffffff", fontFamily: SANS, fontWeight: 700 }}
              >
                {money(data.balanceCents)}
              </Text>
              <Text
                className="m-0 mt-[6px] text-[13px] leading-[19px]"
                style={{ color: "#c8c8c8", fontFamily: SANS }}
              >
                {t.saldoNota}
              </Text>
            </Section>

            {data.securityDepositNote && (
              <Text
                className="mb-0 mt-[16px] text-[13px] leading-[20px]"
                style={{ color: COLOR.cuerpo, fontFamily: SANS }}
              >
                {data.securityDepositNote}
              </Text>
            )}

            <Text
              className="mb-0 mt-[16px] text-[13px] leading-[20px]"
              style={{ color: COLOR.cuerpo, fontFamily: SANS }}
            >
              {t.propinas}
            </Text>

            <Hr className="my-[28px]" style={{ borderColor: COLOR.borde }} />

            <Text
              className="m-0 text-[14px] leading-[22px]"
              style={{ color: COLOR.cuerpo, fontFamily: SANS }}
            >
              {t.comprobante}
            </Text>

            {data.policyText && (
              <>
                <Text
                  className="mb-0 mt-[24px] text-[11px] uppercase tracking-[0.08em]"
                  style={{ color: COLOR.tenue, fontFamily: SANS }}
                >
                  {t.politica}
                </Text>
                <Text
                  className="mb-0 mt-[6px] text-[13px] leading-[20px]"
                  style={{ color: COLOR.cuerpo, fontFamily: SANS }}
                >
                  {data.policyText}
                </Text>
              </>
            )}

            <Hr className="my-[28px]" style={{ borderColor: COLOR.borde }} />

            <Text
              className="m-0 text-[12px] leading-[18px]"
              style={{ color: COLOR.tenue, fontFamily: SANS }}
            >
              adriMarket · {es ? "Tours y estancias en el Caribe mexicano" : "Tours and stays in the Mexican Caribbean"}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
