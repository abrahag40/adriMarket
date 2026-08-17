import Link from "next/link";

import { listUnits, occupancyMonth } from "@/modules/admin/queries";
import { requireStaff } from "@/modules/identity/session";
import { startOfMonth, startOfNextMonth, todayIn } from "@/time";

import { AdminNav } from "../nav";

export const dynamic = "force-dynamic";

/**
 * Calendario de ocupación · S4-3
 *
 * Una fila por unidad, una columna por día, **una sola consulta para todo el
 * mes**. La diferencia con el calendario de la vitrina es que aquí sí se dice
 * quién ocupa: el código de la reserva, o el motivo si es un bloqueo.
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;

  const raw = Array.isArray(sp.mes) ? sp.mes[0] : sp.mes;
  const month = startOfMonth(
    raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIn("America/Cancun"),
  );
  const next = startOfNextMonth(month);

  const previous = new Date(`${month}T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const prev = previous.toISOString().slice(0, 10);

  const [days, units] = await Promise.all([occupancyMonth(month, next), listUnits()]);

  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const numbers = Array.from({ length: daysInMonth }, (_, index) => index + 1);

  // Las filas salen del catálogo de unidades y no de lo que trajo la ocupación.
  // Si se armaran con la ocupación, una unidad sin vender ni bloquear en el mes
  // simplemente no aparecería —y un mes tranquilo se vería como un calendario
  // vacío—, que es justo lo contrario de lo que recepción necesita ver.
  const byUnit = new Map<
    string,
    { label: string; days: Map<number, { label: string; reason: string }> }
  >();
  for (const unit of units) {
    byUnit.set(unit.id, { label: unit.label, days: new Map() });
  }
  for (const day of days) {
    const entry = byUnit.get(day.unitId) ?? { label: day.unitLabel, days: new Map() };
    entry.days.set(Number(day.night.slice(8, 10)), { label: day.label, reason: day.reason });
    byUnit.set(day.unitId, entry);
  }

  const monthLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T00:00:00Z`));

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/calendario" />

      <div className="calendar-head">
        <h1 className="page-title">Ocupación</h1>
        <p className="calendar-nav">
          <Link href={`/admin/calendario?mes=${prev}`}>← Mes anterior</Link>
          <span className="calendar-month">{monthLabel}</span>
          <Link href={`/admin/calendario?mes=${next}`}>Mes siguiente →</Link>
        </p>
      </div>

      {byUnit.size === 0 ? (
        <p className="muted">No hay unidades activas.</p>
      ) : (
        // La región se puede enfocar y tiene nombre a propósito: se desplaza en
        // horizontal, y sin `tabIndex` nadie que use solo el teclado puede
        // moverla — la tabla del mes se le queda a medias. Lo detectó axe.
        <div
          className="scroll-x"
          tabIndex={0}
          role="region"
          aria-label={`Ocupación de ${monthLabel}`}
        >
          <table className="occupancy">
            <caption className="visually-hidden">Ocupación de {monthLabel}</caption>
            <thead>
              <tr>
                <th scope="col">Unidad</th>
                {numbers.map((number) => (
                  <th key={number} scope="col">
                    {number}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byUnit.values()].map((unit) => (
                <tr key={unit.label}>
                  <th scope="row" title={unit.label}>
                    {unit.label}
                  </th>
                  {numbers.map((number) => {
                    const occupied = unit.days.get(number);
                    if (!occupied) return <td key={number} className="occ-free" />;
                    const isBooking = occupied.reason === "booking" || occupied.reason === "hold";
                    return (
                      <td
                        key={number}
                        className={isBooking ? "occ-booked" : "occ-blocked"}
                        title={occupied.label}
                      >
                        <span className="visually-hidden">{occupied.label}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="calendar-legend">
        <span className="legend-booked">Reserva</span>
        <span className="legend-blocked">Bloqueo</span>
        <span className="legend-free-adm">Libre</span>
      </p>
    </div>
  );
}
