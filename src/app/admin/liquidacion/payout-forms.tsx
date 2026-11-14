"use client";

import { useActionState } from "react";

import { formatMoney } from "@/i18n/config";
import type { PayoutRow } from "@/modules/booking/payouts";

import { registerPayout, type ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };

const METHOD_LABEL: Record<string, string> = {
  spei: "SPEI",
  transfer: "transferencia",
  cash: "efectivo",
  other: "otra forma",
};

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="quote-warning">{state.error}</p>;
  if (state.ok) return <p className="notice">{state.ok}</p>;
  return null;
}

function fecha(iso: string | null): string {
  if (!iso) return "sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: "America/Cancun",
  }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

/** Hoy en Cancún, para el valor inicial de la fecha. */
function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cancun" }).format(new Date());
}

function PayoutItem({ row }: { row: PayoutRow }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerPayout, EMPTY);
  const money = (cents: number) => formatMoney(cents, row.currency, "es");
  // El piso de la decisión 0025: el sitio nunca debería quedar debajo del 2.5 %
  // de lo del proveedor. Si pasa —un cupón, una tarjeta que cobró más—, se ve.
  const debajoDelPiso = row.marginCents * 1000 < row.supplierCents * 25;

  const pasarela = row.simulated
    ? `${money(row.feeCents ?? row.estimatedFeeCents)} (cobro simulado)`
    : row.feeCents !== null
      ? `${money(row.feeCents)}${row.cardCountry ? ` · tarjeta de ${row.cardCountry}` : ""}`
      : `${money(row.estimatedFeeCents)} (estimado: todavía no se lee del cargo)`;

  return (
    <li className="admin-panel stack-sm">
      <div className="quote-split">
        <p>
          <span>
            {row.bookingCode} · {row.guestName}
          </span>
          <strong>{money(row.supplierCents)}</strong>
        </p>
      </div>
      <p className="muted small">
        {row.tourName} · {fecha(row.startsAt)}
      </p>

      <div className="stack-sm small">
        <div className="quote-split">
          <p>
            <span>Pagó el turista</span>
            <span>{money(row.chargedCents)}</span>
          </p>
        </div>
        <div className="quote-split">
          <p>
            <span>Se quedó la pasarela</span>
            <span>{pasarela}</span>
          </p>
        </div>
        <div className="quote-split">
          <p>
            <span>Para el proveedor</span>
            <span>{money(row.supplierCents)}</span>
          </p>
        </div>
        <div className="quote-split">
          <p>
            <span>Queda para el sitio{row.marginIsReal ? "" : " (estimado)"}</span>
            <strong>{money(row.marginCents)}</strong>
          </p>
        </div>
      </div>
      {debajoDelPiso ? (
        <p className="quote-warning">
          Esta venta dejó menos del 2.5 % de lo del proveedor. Revisa si llevó cupón o si la tarjeta
          cobró más de lo previsto.
        </p>
      ) : null}

      {row.payout ? (
        <p className="notice">
          Transferido el {fecha(row.payout.paidOn)} por {METHOD_LABEL[row.payout.method] ?? row.payout.method} ·
          referencia {row.payout.reference} · registró {row.payout.paidBy}
          {row.payout.notes ? ` · ${row.payout.notes}` : ""}
        </p>
      ) : (
        <>
          <Result state={state} />
          <form action={action} className="stack-sm">
            <input type="hidden" name="bookingId" value={row.bookingId} />

            <div className="field">
              <label htmlFor={`paidOn-${row.bookingId}`}>Fecha de la transferencia</label>
              <input id={`paidOn-${row.bookingId}`} name="paidOn" type="date" required defaultValue={hoy()} />
            </div>

            <div className="field">
              <label htmlFor={`method-${row.bookingId}`}>¿Cómo se le pagó?</label>
              <select id={`method-${row.bookingId}`} name="method" required defaultValue="spei">
                <option value="spei">Transferencia SPEI</option>
                <option value="transfer">Transferencia bancaria</option>
                <option value="cash">Efectivo</option>
                <option value="other">Otra</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor={`reference-${row.bookingId}`}>Clave de rastreo o folio</label>
              <input
                id={`reference-${row.bookingId}`}
                name="reference"
                type="text"
                required
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label htmlFor={`notes-${row.bookingId}`}>Notas</label>
              <textarea id={`notes-${row.bookingId}`} name="notes" rows={2} />
            </div>

            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Registrando…" : `Registrar la transferencia de ${money(row.supplierCents)}`}
            </button>
          </form>
        </>
      )}
    </li>
  );
}

export function PayoutList({ rows }: { rows: PayoutRow[] }) {
  if (rows.length === 0) {
    return <p className="notice">Todavía no hay reservas cobradas que liquidar.</p>;
  }
  return (
    <ul className="stack">
      {rows.map((row) => (
        <PayoutItem key={row.bookingId} row={row} />
      ))}
    </ul>
  );
}
