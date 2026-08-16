"use client";

import { useActionState } from "react";

import { formatMoney } from "@/i18n/config";
import type { CouponRow, TourOptionRow } from "@/modules/admin/authoring";

import type { ActionState } from "../actions";
import {
  generateDepartures,
  saveCoupon,
  setGlobalDeposit,
  toggleCoupon,
} from "../catalogo/actions";

const EMPTY: ActionState = { error: null, ok: null };

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="quote-warning">{state.error}</p>;
  if (state.ok) return <p className="notice">{state.ok}</p>;
  return null;
}

const DOW = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

/** S6-4 · anticipo por omisión. */
export function GlobalDepositForm({ current }: { current: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setGlobalDeposit, EMPTY);

  return (
    <section className="admin-panel">
      <h2 className="section-title">Anticipo por omisión</h2>
      <Result state={state} />

      <form action={action} className="stack-sm">
        <div className="field">
          <label htmlFor="pct">Porcentaje que se cobra en línea</label>
          <input
            id="pct"
            name="pct"
            type="number"
            min="1"
            max="100"
            step="1"
            required
            defaultValue={current}
          />
        </div>
        <p className="muted">
          Lo heredan los productos que no tengan uno propio. Cambiarlo{" "}
          <strong>no altera ninguna reserva ya tomada</strong>: cada una guarda el porcentaje que
          tenía al reservarse.
        </p>
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
      </form>
    </section>
  );
}

/**
 * S6-3 · salidas en lote.
 *
 * "Todos los martes y jueves de marzo a junio, cupo 12" en un formulario. Volver
 * a generar el mismo periodo no duplica ni reescribe: las salidas que ya existen
 * se dejan como están, con sus pasajeros y su cupo.
 */
export function DepartureBatchForm({ options }: { options: TourOptionRow[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(generateDepartures, EMPTY);

  return (
    <section className="admin-panel">
      <h2 className="section-title">Generar salidas</h2>
      <Result state={state} />

      {options.length === 0 ? (
        <p className="muted">No hay tours con opciones activas todavía.</p>
      ) : (
        <form action={action} className="stack-sm">
          <div className="field">
            <label htmlFor="optionId">Tour</label>
            <select id="optionId" name="optionId" required defaultValue={options[0]?.id ?? ""}>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filters-row">
            <div className="field">
              <label htmlFor="batch-from">Desde</label>
              <input id="batch-from" name="from" type="date" required />
            </div>
            <div className="field">
              <label htmlFor="batch-to">Hasta</label>
              <input id="batch-to" name="to" type="date" required />
            </div>
          </div>

          <fieldset className="field">
            <legend>Días de la semana</legend>
            <span className="dow-row">
              {DOW.map((day) => (
                <label key={day.value} className="dow-check">
                  <input type="checkbox" name="dows" value={day.value} />
                  {day.label.slice(0, 3)}
                </label>
              ))}
            </span>
          </fieldset>

          <div className="filters-row">
            <div className="field">
              <label htmlFor="time">Hora de salida</label>
              <input id="time" name="time" type="time" defaultValue="09:00" required />
            </div>
            <div className="field">
              <label htmlFor="capacity">Cupo</label>
              <input id="capacity" name="capacity" type="number" min="1" defaultValue="12" required />
            </div>
          </div>

          <p className="muted">
            La hora es la del destino. Generar dos veces el mismo periodo no duplica nada: las
            salidas que ya existen se quedan como están, con sus pasajeros.
          </p>

          <button className="btn btn-secondary" type="submit" disabled={pending}>
            {pending ? "…" : "Generar"}
          </button>
        </form>
      )}
    </section>
  );
}

/** S6-4 · cupones. */
export function CouponForms({ coupons }: { coupons: CouponRow[] }) {
  const [saveState, save, saving] = useActionState<ActionState, FormData>(saveCoupon, EMPTY);
  const [toggleState, toggle] = useActionState<ActionState, FormData>(toggleCoupon, EMPTY);

  return (
    <section className="admin-panel">
      <h2 className="section-title">Cupones</h2>
      <Result state={saveState} />
      <Result state={toggleState} />

      <form action={save} className="stack-sm">
        <div className="filters-row">
          <div className="field">
            <label htmlFor="code">Código</label>
            <input id="code" name="code" type="text" required placeholder="VERANO25" />
          </div>
          <div className="field">
            <label htmlFor="kind">Tipo</label>
            <select id="kind" name="kind" defaultValue="percent">
              <option value="percent">Porcentaje</option>
              <option value="fixed">Monto fijo</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="value">Valor</label>
            <input id="value" name="value" type="text" inputMode="decimal" required />
          </div>
        </div>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="maxRedemptions">Usos máximos</label>
            <input id="maxRedemptions" name="maxRedemptions" type="number" min="1" placeholder="sin límite" />
          </div>
          <div className="field">
            <label htmlFor="validTo">Vence</label>
            <input id="validTo" name="validTo" type="date" />
          </div>
          <button className="btn btn-secondary" type="submit" disabled={saving}>
            {saving ? "…" : "Crear cupón"}
          </button>
        </div>
      </form>

      {coupons.length === 0 ? (
        <p className="muted">Todavía no hay cupones.</p>
      ) : (
        <ul className="admin-list">
          {coupons.map((coupon) => (
            <li key={coupon.id}>
              <div className="admin-card">
                <span className="admin-card-head">
                  <span className="admin-code">{coupon.code}</span>
                  <span
                    className={`admin-badge admin-badge-${coupon.active ? "ok" : "off"}`}
                  >
                    {coupon.active ? "Activo" : "Inactivo"}
                  </span>
                </span>
                <span className="admin-card-title">
                  {coupon.kind === "percent"
                    ? `${coupon.value}% de descuento`
                    : `${formatMoney(coupon.value, coupon.currency ?? "MXN", "es")} de descuento`}
                </span>
                <span className="admin-card-meta">
                  {coupon.redemptions} uso{coupon.redemptions === 1 ? "" : "s"}
                  {coupon.maxRedemptions ? ` de ${coupon.maxRedemptions}` : ""}
                  {coupon.validTo ? ` · vence ${coupon.validTo.slice(0, 10)}` : ""}
                </span>
                <form action={toggle}>
                  <input type="hidden" name="couponId" value={coupon.id} />
                  <button className="btn btn-secondary" type="submit">
                    {coupon.active ? "Desactivar" : "Activar"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
