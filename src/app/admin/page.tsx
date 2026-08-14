import Link from "next/link";

import { requireStaff } from "@/modules/identity/session";
import { listBookings } from "@/modules/admin/queries";

import { AdminNav } from "./nav";
import { BookingList } from "./reservas/booking-list";

export const dynamic = "force-dynamic";

/** Cuántos apartados pendientes caben en la pantalla de inicio sin taparlo todo. */
const MAX_PENDIENTES = 8;

/**
 * Pantalla de inicio del panel: el día de hoy.
 *
 * Es la que recepción abre en el teléfono al llegar. Muestra lo que llega o sale
 * hoy y lo que espera pago, que es todo lo que hace falta para operar la mañana.
 */
export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff();
  const sp = await searchParams;

  const [hoy, esperandoPago] = await Promise.all([
    listBookings({ today: true }),
    listBookings({ status: "hold", payable: true }),
  ]);

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin" />

      {sp.sin_permiso ? (
        <p className="quote-warning">Tu rol no permite esa acción.</p>
      ) : null}

      <section className="stack-sm">
        <h1 className="page-title">Hoy</h1>
        {hoy.length === 0 ? (
          <p className="muted">No hay llegadas, salidas ni salidas de tour para hoy.</p>
        ) : (
          <BookingList rows={hoy} />
        )}
      </section>

      <section className="stack-sm">
        <h2 className="section-title">Esperando pago</h2>
        {esperandoPago.length === 0 ? (
          <p className="muted">Nada apartado con plazo vigente.</p>
        ) : (
          <>
            {/*
              Se muestran los primeros y se dice cuántos faltan. Una lista larga
              en la pantalla de inicio empuja las llegadas del día fuera de vista,
              que es justo lo que recepción abrió el panel a ver.
            */}
            <BookingList rows={esperandoPago.slice(0, MAX_PENDIENTES)} />
            {esperandoPago.length > MAX_PENDIENTES ? (
              <p className="muted">
                y {esperandoPago.length - MAX_PENDIENTES} más ·{" "}
                <Link href="/admin/reservas?estado=hold">verlos todos</Link>
              </p>
            ) : null}
          </>
        )}
      </section>

      <p>
        <Link href="/admin/reservas">Ver todas las reservas</Link>
      </p>
    </div>
  );
}
