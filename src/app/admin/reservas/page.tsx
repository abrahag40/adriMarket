import { requireStaff } from "@/modules/identity/session";
import { listBookings } from "@/modules/admin/queries";

import { AdminNav } from "../nav";
import { BookingList } from "./booking-list";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Bandeja de reservas · S4-2
 *
 * La búsqueda acepta el código que el huésped dice por teléfono, y también su
 * nombre, correo o teléfono: quien llama no siempre tiene el código a la mano.
 */
export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;

  const search = single(sp.q).trim();
  const status = single(sp.estado);
  const kind = single(sp.tipo);

  const rows = await listBookings({
    search: search || undefined,
    status: ["hold", "confirmed", "cancelled", "expired", "completed"].includes(status)
      ? status
      : undefined,
    kind: kind === "tour" || kind === "stay" ? kind : undefined,
  });

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/reservas" />
      <h1 className="page-title">Reservas</h1>

      <form className="filters" method="get" action="/admin/reservas">
        <div className="filters-row">
          <div className="field">
            <label htmlFor="q">Buscar</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Código, nombre, correo o teléfono"
            />
          </div>
          <div className="field">
            <label htmlFor="estado">Estado</label>
            <select id="estado" name="estado" defaultValue={status}>
              <option value="">Todos</option>
              <option value="hold">Esperando pago</option>
              <option value="confirmed">Confirmadas</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
              <option value="expired">Expiradas</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" name="tipo" defaultValue={kind}>
              <option value="">Todo</option>
              <option value="tour">Tours</option>
              <option value="stay">Estancias</option>
            </select>
          </div>
          <button className="btn" type="submit">
            Buscar
          </button>
        </div>
      </form>

      <p className="muted">{rows.length === 1 ? "1 reserva" : `${rows.length} reservas`}</p>

      {rows.length === 0 ? (
        <div className="empty">
          <p>No hay reservas con esos filtros.</p>
        </div>
      ) : (
        <BookingList rows={rows} />
      )}
    </div>
  );
}
