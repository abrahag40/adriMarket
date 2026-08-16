import Link from "next/link";
import { notFound } from "next/navigation";

import { formatMoney } from "@/i18n/config";
import { bookingDetail, listDepartures } from "@/modules/admin/queries";
import { refundQuote } from "@/modules/booking/cancel";
import { hasRole } from "@/modules/identity/auth";
import { requireStaff } from "@/modules/identity/session";

import { instantLabel, nightLabel, statusOf } from "../../labels";
import { AdminNav } from "../../nav";
import { CollectForm } from "./collect-form";
import { ManageForms } from "./manage-forms";

export const dynamic = "force-dynamic";

const PAX_LABEL: Record<string, string> = { adult: "Adulto", child: "Menor", infant: "Infante" };

/** Estados en los que la reserva todavía se puede mover o cancelar. */
const ACTIVE = ["hold", "confirmed", "in_progress"];

/**
 * Ficha de la reserva · S4-2 y S4-5
 *
 * Lo que recepción necesita con el huésped enfrente: quién es, qué reservó, qué
 * pagó, qué falta cobrar y qué le ha pasado a la reserva.
 */
export default async function ReservaPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireStaff();
  const { code } = await params;

  const booking = await bookingDetail(code);
  if (!booking) notFound();

  const money = (cents: number) => formatMoney(cents, booking.currency, "es");

  // Se cotiza el reembolso al abrir la ficha, no al cancelar: quien atiende
  // tiene que poder decir la cifra antes de que el huésped decida.
  const refund = ACTIVE.includes(booking.status)
    ? await refundQuote(booking.id)
    : { refundCents: 0, refundPct: 0, paidCents: 0, hoursBefore: 0 };

  // Para mover un tour hace falta la lista de salidas a las que se puede ir.
  const departures =
    booking.kind === "tour" && ACTIVE.includes(booking.status)
      ? (await listDepartures(new Date().toISOString(), "infinity"))
          .filter((row) => row.status === "open" && row.seatsTaken < row.capacity)
          .slice(0, 60)
          .map((row) => ({
            id: row.id,
            label: `${instantLabel(row.startsAt, row.timezone)} · ${row.capacity - row.seatsTaken} libres`,
          }))
      : [];

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/reservas" />

      <p className="breadcrumb">
        <Link href="/admin/reservas">Reservas</Link>
      </p>

      <h1 className="page-title">{booking.code}</h1>
      <p className="muted">
        {booking.productName} ·{" "}
        <span className={`admin-badge admin-badge-${statusOf(booking.status).tone}`}>
          {statusOf(booking.status).label}
        </span>
      </p>

      <section className="admin-panel">
        <h2 className="section-title">Contacto</h2>
        <p>
          <strong>{booking.holderName}</strong>
        </p>
        {booking.holderPhone ? (
          // Se toca para llamar: recepción está en el teléfono, no en un escritorio.
          <p>
            <a href={`tel:${booking.holderPhone}`}>{booking.holderPhone}</a>
          </p>
        ) : null}
        {booking.holderEmail ? (
          <p>
            <a href={`mailto:${booking.holderEmail}`}>{booking.holderEmail}</a>
          </p>
        ) : null}
      </section>

      <section className="admin-panel">
        <h2 className="section-title">Servicio</h2>
        {booking.kind === "stay" && booking.checkIn && booking.checkOut ? (
          <p>
            {nightLabel(booking.checkIn)} → {nightLabel(booking.checkOut)}
          </p>
        ) : null}
        {booking.kind === "tour" && booking.when ? (
          <p>{instantLabel(booking.when, booking.timezone, true)}</p>
        ) : null}
        {booking.meetingPoint ? <p className="muted">{booking.meetingPoint}</p> : null}

        {/*
          Una estancia se reserva a nombre del titular y no siempre se captura al
          resto: el encabezado solo aparece si hay a quién nombrar. Un título
          seguido de nada le dice a recepción que algo se perdió.
        */}
        {booking.guests.length > 0 ? (
          <>
            <h3>Pasajeros</h3>
            <ul className="check-list">
              {booking.guests.map((guest, index) => (
                <li key={index}>
                  {guest.fullName}
                  {guest.isLead ? " (titular)" : ""} · {PAX_LABEL[guest.paxType] ?? guest.paxType}
                  {guest.age !== null ? ` · ${guest.age} años` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="admin-panel">
        <h2 className="section-title">Dinero</h2>
        <table className="quote-table">
          <tbody>
            <tr>
              <th scope="row">Total</th>
              <td>{money(booking.totalCents)}</td>
            </tr>
            <tr>
              <th scope="row">Anticipo cobrado</th>
              <td>{money(booking.depositPaidCents)}</td>
            </tr>
            <tr>
              <th scope="row">Saldo cobrado en destino</th>
              <td>{money(booking.balancePaidCents)}</td>
            </tr>
            <tr className="quote-total">
              <th scope="row">Por cobrar</th>
              <td>{money(booking.balanceDueCents)}</td>
            </tr>
          </tbody>
        </table>

        {booking.balanceDueCents > 0 && hasRole(user, "front_desk") ? (
          <CollectForm code={booking.code} amount={money(booking.balanceDueCents)} />
        ) : null}

        {booking.balanceDueCents > 0 && !hasRole(user, "front_desk") ? (
          <p className="muted">Tu rol no permite registrar cobros.</p>
        ) : null}
      </section>

      {ACTIVE.includes(booking.status) ? (
        <ManageForms
          code={booking.code}
          kind={booking.kind}
          refund={{
            refundCents: refund.refundCents,
            refundPct: refund.refundPct,
            label: money(refund.refundCents),
            hoursBefore: refund.hoursBefore,
          }}
          canCancel={hasRole(user, "manager")}
          departures={departures}
        />
      ) : null}

      <section className="admin-panel">
        <h2 className="section-title">Bitácora</h2>
        <ul className="admin-log">
          {booking.events.map((event, index) => (
            <li key={index}>
              <span className="admin-log-type">{event.type}</span>
              <span className="admin-log-meta">
                {new Intl.DateTimeFormat("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: booking.timezone,
                }).format(new Date(event.createdAt))}{" "}
                · {event.actor}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
