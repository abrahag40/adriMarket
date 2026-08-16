"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { DepartureRow } from "@/modules/admin/queries";

import { cancelDepartureAction, type ActionState } from "../actions";

const STATUS: Record<string, string> = {
  open: "Abierta",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

function hour(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeStyle: "short", timeZone: timezone }).format(
    new Date(startsAt),
  );
}

/**
 * Salidas del día, con el manifiesto a un toque y la cancelación detrás de una
 * confirmación escrita.
 *
 * Cancelar una salida manda dieciocho correos y devuelve dieciocho anticipos:
 * es la acción menos reversible del panel, así que **pide el motivo antes** y no
 * después. El motivo no es burocracia — se le manda tal cual a cada pasajero.
 */
export function DepartureList({
  departures,
  canCancel,
}: {
  departures: DepartureRow[];
  canCancel: boolean;
}) {
  const [state, cancel, pending] = useActionState<ActionState, FormData>(cancelDepartureAction, {
    error: null,
    ok: null,
  });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      {state.error ? <p className="quote-warning">{state.error}</p> : null}
      {state.ok ? <p className="notice">{state.ok}</p> : null}

      <ul className="admin-list">
        {departures.map((departure) => (
          <li key={departure.id}>
            <div className="admin-card">
              <span className="admin-card-head">
                <span className="admin-code">{hour(departure.startsAt, departure.timezone)}</span>
                <span
                  className={`admin-badge admin-badge-${departure.status === "cancelled" ? "off" : "ok"}`}
                >
                  {STATUS[departure.status] ?? departure.status}
                </span>
              </span>
              <span className="admin-card-title">{departure.productName}</span>
              <span className="admin-card-meta">
                {departure.optionName} · {departure.seatsTaken} de {departure.capacity} lugares
              </span>
              {departure.meetingPoint ? (
                <span className="admin-card-meta">{departure.meetingPoint}</span>
              ) : null}

              <span className="admin-card-actions">
                <Link className="btn btn-secondary" href={`/admin/salidas/${departure.id}`}>
                  Manifiesto
                </Link>
                {canCancel && departure.status !== "cancelled" ? (
                  openId === departure.id ? null : (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setOpenId(departure.id)}
                    >
                      Cancelar salida
                    </button>
                  )
                ) : null}
              </span>

              {openId === departure.id ? (
                <form action={cancel} className="stack-sm">
                  <input type="hidden" name="departureId" value={departure.id} />
                  <div className="field">
                    <label htmlFor={`reason-${departure.id}`}>
                      Motivo (se lo decimos a cada pasajero)
                    </label>
                    <input
                      id={`reason-${departure.id}`}
                      name="reason"
                      type="text"
                      required
                      placeholder="Cierre de puerto por mal tiempo"
                    />
                  </div>
                  <p className="muted">
                    Se cancelan las {departure.seatsTaken} plazas vendidas, se devuelve el anticipo
                    completo y se avisa a cada titular. No aplica la política de cancelación.
                  </p>
                  <button className="btn btn-block" type="submit" disabled={pending}>
                    {pending ? "…" : "Confirmar cancelación de la salida"}
                  </button>
                  <button
                    className="btn btn-secondary btn-block"
                    type="button"
                    onClick={() => setOpenId(null)}
                  >
                    Mejor no
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
