"use client";

import { useActionState } from "react";

import { formatMoney } from "@/i18n/config";
import type { PendingRefund } from "@/modules/booking/refunds";

import { registerRefund, type ActionState } from "./actions";

const EMPTY: ActionState = { error: null, ok: null };

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="quote-warning">{state.error}</p>;
  if (state.ok) return <p className="notice">{state.ok}</p>;
  return null;
}

/**
 * Cuánto lleva esperando, en palabras.
 *
 * Las 24 horas no son decorativas: es el umbral en el que `/api/health` pasa a
 * `degraded`. Verlo aquí evita enterarse por el monitoreo.
 */
function waitLabel(hours: number): { text: string; late: boolean } {
  if (hours < 1) return { text: "recién registrada", late: false };
  if (hours < 24) return { text: `lleva ${hours} h esperando`, late: false };
  const days = Math.floor(hours / 24);
  return { text: `lleva ${days} día${days === 1 ? "" : "s"} esperando`, late: true };
}

function RefundRow({ refund }: { refund: PendingRefund }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerRefund, EMPTY);
  const wait = waitLabel(refund.hoursWaiting);

  return (
    <li className="admin-panel stack-sm">
      <div className="quote-split">
        <p>
          <span>{refund.bookingCode} · {refund.guestName}</span>
          <strong>{formatMoney(refund.amountCents, refund.currency, "es")}</strong>
        </p>
      </div>
      {refund.reason ? <p className="muted small">{refund.reason}</p> : null}
      <p className={wait.late ? "quote-warning" : "muted small"}>{wait.text}</p>

      <Result state={state} />

      <form action={action} className="stack-sm">
        <input type="hidden" name="refundId" value={refund.id} />

        <div className="field">
          <label htmlFor={`method-${refund.id}`}>¿Cómo se devolvió?</label>
          <select id={`method-${refund.id}`} name="method" required defaultValue="">
            <option value="" disabled>
              Elige una forma
            </option>
            <option value="spei">Transferencia SPEI</option>
            <option value="transfer">Transferencia bancaria</option>
            <option value="cash">Efectivo en el mostrador</option>
            <option value="card">Devolución a la tarjeta</option>
            <option value="other">Otra</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor={`ref-${refund.id}`}>Clave de rastreo o folio</label>
          <input
            id={`ref-${refund.id}`}
            name="providerRef"
            type="text"
            inputMode="text"
            autoComplete="off"
          />
          <p className="muted small">
            Obligatoria en transferencias: es con lo que se localiza el movimiento en el banco.
          </p>
        </div>

        <div className="field">
          <label htmlFor={`receipt-${refund.id}`}>Comprobante</label>
          <input
            id={`receipt-${refund.id}`}
            name="receipt"
            type="file"
            accept="image/*,application/pdf"
          />
          <p className="muted small">Foto o PDF, hasta 4 MB. Opcional, pero conviene.</p>
        </div>

        <div className="field">
          <label htmlFor={`notes-${refund.id}`}>Notas</label>
          <textarea id={`notes-${refund.id}`} name="notes" rows={2} />
        </div>

        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Registrar la devolución"}
        </button>
      </form>
    </li>
  );
}

export function PendingRefunds({ refunds }: { refunds: PendingRefund[] }) {
  if (refunds.length === 0) {
    return <p className="notice">No hay devoluciones pendientes.</p>;
  }

  return (
    <ul className="stack">
      {refunds.map((refund) => (
        <RefundRow key={refund.id} refund={refund} />
      ))}
    </ul>
  );
}
