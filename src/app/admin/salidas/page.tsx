import Link from "next/link";

import { listDepartures } from "@/modules/admin/queries";
import { hasRole } from "@/modules/identity/auth";
import { requireStaff } from "@/modules/identity/session";
import { todayIn } from "@/time";

import { instantLabel } from "../labels";
import { AdminNav } from "../nav";
import { DepartureList } from "./departure-list";

export const dynamic = "force-dynamic";

/**
 * Salidas de tour · S5-1 y S5-4
 *
 * Dos cosas se hacen desde aquí y las dos ocurren a primera hora: abrir el
 * manifiesto del día y cancelar una salida cuando cierran el puerto.
 *
 * Se abre en el día de hoy, no en un mes completo: la operación viene a resolver
 * la salida de esta mañana, no a navegar un calendario.
 */
export default async function SalidasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;

  const raw = Array.isArray(sp.dia) ? sp.dia[0] : sp.dia;
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIn("America/Cancun");

  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const previous = new Date(`${day}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);

  // El día se acota en la zona del destino: una salida de las 9:00 de Cancún es
  // de las 14:00 UTC, y partir el día en UTC la movería de fecha.
  const departures = await listDepartures(
    `${day} 00:00 America/Cancun`,
    `${next.toISOString().slice(0, 10)} 00:00 America/Cancun`,
  );

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/salidas" />

      <div className="calendar-head">
        <h1 className="page-title">Salidas</h1>
        <p className="calendar-nav">
          <Link href={`/admin/salidas?dia=${previous.toISOString().slice(0, 10)}`}>← Día anterior</Link>
          <span className="calendar-month">
            {instantLabel(`${day}T12:00:00Z`, "UTC").split(",")[0]}
          </span>
          <Link href={`/admin/salidas?dia=${next.toISOString().slice(0, 10)}`}>Día siguiente →</Link>
        </p>
      </div>

      {departures.length === 0 ? (
        <p className="muted">No hay salidas programadas para este día.</p>
      ) : (
        <DepartureList departures={departures} canCancel={hasRole(user, "manager")} />
      )}
    </div>
  );
}
