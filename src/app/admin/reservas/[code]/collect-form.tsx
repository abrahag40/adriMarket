"use client";

import { useActionState } from "react";

import { collectBalance, type ActionState } from "../../actions";

/**
 * Cobro del saldo en el mostrador.
 *
 * La forma de pago es obligatoria y explícita: el efectivo sin rastro es la
 * diferencia entre un faltante explicable y uno que no lo es.
 */
export function CollectForm({ code, amount }: { code: string; amount: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(collectBalance, {
    error: null,
    ok: null,
  });

  return (
    <form action={action} className="stack-sm">
      <input type="hidden" name="code" value={code} />
      {state.error ? <p className="quote-warning">{state.error}</p> : null}
      {state.ok ? <p className="notice">Saldo cobrado.</p> : null}

      <div className="field">
        <label htmlFor="method">Forma de pago</label>
        <select id="method" name="method" defaultValue="cash">
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta en terminal</option>
          <option value="transfer">Transferencia</option>
          <option value="spei">SPEI</option>
          <option value="other">Otra</option>
        </select>
      </div>

      <button className="btn btn-block" type="submit" disabled={pending}>
        {pending ? "…" : `Registrar cobro de ${amount}`}
      </button>
    </form>
  );
}
