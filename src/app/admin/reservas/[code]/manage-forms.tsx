"use client";

import { useActionState, useState } from "react";

import { cancelBookingAction, rescheduleAction, type ActionState } from "../../actions";

/**
 * Cambio de fecha y cancelación · S5-2 y S5-3
 *
 * Las dos van plegadas detrás de un botón, y no por estética: son las dos
 * acciones destructivas de la ficha, y una lista de campos siempre abiertos
 * junto al botón de cobrar invita al toque equivocado en un teléfono.
 *
 * La cancelación muestra **el monto antes de decidir**. Anunciarle al huésped lo
 * que se le devuelve después de haber cancelado convierte una conversación en un
 * reclamo.
 */
export function ManageForms({
  code,
  kind,
  refund,
  canCancel,
  departures,
}: {
  code: string;
  kind: "stay" | "tour";
  refund: { refundCents: number; refundPct: number; label: string; hoursBefore: number };
  canCancel: boolean;
  departures: { id: string; label: string }[];
}) {
  const [moveState, move, moving] = useActionState<ActionState, FormData>(rescheduleAction, {
    error: null,
    ok: null,
  });
  const [cancelState, cancel, cancelling] = useActionState<ActionState, FormData>(
    cancelBookingAction,
    { error: null, ok: null },
  );
  const [open, setOpen] = useState<"none" | "move" | "cancel">("none");

  return (
    <section className="admin-panel">
      <h2 className="section-title">Cambios</h2>

      {moveState.error ? <p className="quote-warning">{moveState.error}</p> : null}
      {moveState.ok ? <p className="notice">{moveState.ok}</p> : null}
      {cancelState.error ? <p className="quote-warning">{cancelState.error}</p> : null}
      {cancelState.ok ? <p className="notice">{cancelState.ok}</p> : null}

      {open === "none" ? (
        <span className="admin-card-actions">
          <button className="btn btn-secondary" type="button" onClick={() => setOpen("move")}>
            Cambiar fecha
          </button>
          {canCancel ? (
            <button className="btn btn-secondary" type="button" onClick={() => setOpen("cancel")}>
              Cancelar reserva
            </button>
          ) : null}
        </span>
      ) : null}

      {open === "move" ? (
        <form action={move} className="stack-sm">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="kind" value={kind} />

          {kind === "stay" ? (
            <div className="filters-row">
              <div className="field">
                <label htmlFor="new-from">Nueva llegada</label>
                <input id="new-from" name="from" type="date" required />
              </div>
              <div className="field">
                <label htmlFor="new-to">Nueva salida</label>
                <input id="new-to" name="to" type="date" required />
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="new-departure">Nueva salida</label>
              <select id="new-departure" name="departureId" required defaultValue="">
                <option value="" disabled>
                  Elige una
                </option>
                {departures.map((departure) => (
                  <option key={departure.id} value={departure.id}>
                    {departure.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="muted">
            El anticipo ya cobrado se conserva. Si la tarifa cambió, la diferencia se ajusta en el
            saldo que se paga en destino.
          </p>
          <button className="btn btn-block" type="submit" disabled={moving}>
            {moving ? "…" : "Mover la reserva"}
          </button>
          <button
            className="btn btn-secondary btn-block"
            type="button"
            onClick={() => setOpen("none")}
          >
            Mejor no
          </button>
        </form>
      ) : null}

      {open === "cancel" ? (
        <form action={cancel} className="stack-sm">
          <input type="hidden" name="code" value={code} />

          <div className="field">
            <label htmlFor="cancel-reason">Motivo</label>
            <input id="cancel-reason" name="reason" type="text" required />
          </div>

          <div className="field field-check">
            <label htmlFor="by-operator">
              <input id="by-operator" name="byOperator" type="checkbox" value="1" />
              Cancelamos nosotros (mal tiempo, cierre de puerto, imprevisto del operador)
            </label>
          </div>

          <p className="muted">
            Si cancela el huésped, según la política congelada en esta reserva le corresponden{" "}
            <strong>{refund.label}</strong>
            {refund.refundPct > 0 ? ` (${refund.refundPct}% de lo pagado)` : ""}
            {refund.hoursBefore > 0
              ? `, faltando ${Math.floor(refund.hoursBefore)} horas para el servicio`
              : ", con el servicio ya iniciado"}
            . Si cancelamos nosotros se devuelve todo.
          </p>

          <button className="btn btn-block" type="submit" disabled={cancelling}>
            {cancelling ? "…" : "Confirmar cancelación"}
          </button>
          <button
            className="btn btn-secondary btn-block"
            type="button"
            onClick={() => setOpen("none")}
          >
            Mejor no
          </button>
        </form>
      ) : null}
    </section>
  );
}
