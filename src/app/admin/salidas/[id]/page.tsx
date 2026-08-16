import Link from "next/link";
import { notFound } from "next/navigation";

import { formatMoney } from "@/i18n/config";
import { departureManifest } from "@/modules/admin/queries";
import { requireStaff } from "@/modules/identity/session";

import { instantLabel } from "../../labels";
import { AdminNav } from "../../nav";

export const dynamic = "force-dynamic";

const PAX_LABEL: Record<string, string> = { adult: "Adulto", child: "Menor", infant: "Infante" };

/**
 * Manifiesto de la salida · S5-4
 *
 * La pantalla que el guía abre a las siete de la mañana, en el teléfono, sin
 * computadora y sin imprimir nada. Hoy eso es una captura de pantalla de un
 * grupo de WhatsApp.
 *
 * El orden de la información es el orden en que la usa: primero la hora de
 * presentación y el punto de encuentro, después la lista para pasar asistencia,
 * y hasta el final el dinero. **Las edades de los menores van visibles** porque
 * de ahí salen los chalecos.
 *
 * La ve cualquiera del equipo, incluido un guía: es su herramienta de trabajo.
 */
export default async function ManifiestoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("guide");
  const { id } = await params;

  const manifest = await departureManifest(id);
  if (!manifest) notFound();

  const { departure } = manifest;
  const money = (cents: number, currency: string) => formatMoney(cents, currency, "es");

  // La hora de presentación, no la de salida: es la regla del SME y es lo que
  // el guía le repite a los pasajeros.
  const report = new Date(new Date(departure.startsAt).getTime() - 15 * 60_000).toISOString();

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/salidas" />

      <p className="breadcrumb">
        <Link href="/admin/salidas">Salidas</Link>
      </p>

      <h1 className="page-title">{departure.productName}</h1>
      <p className="muted">{departure.optionName}</p>

      {departure.status === "cancelled" ? (
        <p className="quote-warning">Esta salida está cancelada.</p>
      ) : null}

      <section className="admin-panel">
        <h2 className="section-title">Presentación</h2>
        <p className="manifest-time">{instantLabel(report, departure.timezone)}</p>
        <p className="muted">
          Salida: {instantLabel(departure.startsAt, departure.timezone)} · 15 minutos antes
        </p>
        {departure.meetingPoint ? <p>{departure.meetingPoint}</p> : null}
      </section>

      <section className="stack-sm">
        <h2 className="section-title">
          Pasajeros · {manifest.totalPax} de {departure.capacity}
        </h2>

        {manifest.bookings.length === 0 ? (
          <p className="muted">Nadie confirmado en esta salida.</p>
        ) : (
          <ul className="admin-list">
            {manifest.bookings.map((booking) => (
              <li key={booking.code}>
                <div className="admin-card">
                  <span className="admin-card-head">
                    <span className="admin-code">{booking.holderName}</span>
                    <span className="admin-badge admin-badge-done">{booking.seats} pax</span>
                  </span>

                  {booking.holderPhone ? (
                    // Se toca para llamar: si alguien no llegó, el guía marca
                    // desde aquí sin salirse de la pantalla.
                    <a className="admin-card-meta" href={`tel:${booking.holderPhone}`}>
                      {booking.holderPhone}
                    </a>
                  ) : null}

                  {booking.pax.length > 0 ? (
                    <ul className="check-list">
                      {booking.pax.map((person, index) => (
                        <li key={index}>
                          {person.fullName} · {PAX_LABEL[person.paxType] ?? person.paxType}
                          {person.age !== null ? ` · ${person.age} años` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="admin-card-meta">{booking.code}</span>
                  )}

                  {booking.balanceDueCents > 0 ? (
                    <span className="admin-card-due">
                      Debe: {money(booking.balanceDueCents, booking.currency)}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manifest.totalDueCents > 0 ? (
        <section className="admin-panel">
          <h2 className="section-title">Por cobrar en la salida</h2>
          <p className="manifest-time">
            {money(manifest.totalDueCents, manifest.bookings[0]?.currency ?? "MXN")}
          </p>
        </section>
      ) : null}
    </div>
  );
}
