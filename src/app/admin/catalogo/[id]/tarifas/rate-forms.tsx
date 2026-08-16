"use client";

import { useActionState } from "react";

import { formatMoney } from "@/i18n/config";
import type { RatePlanOption, RateRow } from "@/modules/admin/authoring";

import type { ActionState } from "../../../actions";
import { deleteRate, saveRate } from "../../actions";

const EMPTY: ActionState = { error: null, ok: null };

const DOW = [
  { value: 1, label: "L" },
  { value: 2, label: "M" },
  { value: 3, label: "X" },
  { value: 4, label: "J" },
  { value: 5, label: "V" },
  { value: 6, label: "S" },
  { value: 7, label: "D" },
];

function dowLabel(dows: number[] | null): string {
  if (!dows || dows.length === 0) return "todos los días";
  return dows
    .map((value) => DOW.find((day) => day.value === value)?.label ?? String(value))
    .join(" ");
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function RateForms({
  productId,
  plans,
  rates,
}: {
  productId: string;
  plans: RatePlanOption[];
  rates: RateRow[];
}) {
  const [saveState, save, saving] = useActionState<ActionState, FormData>(saveRate, EMPTY);
  const [deleteState, remove] = useActionState<ActionState, FormData>(deleteRate, EMPTY);

  return (
    <>
      {saveState.error ? <p className="quote-warning">{saveState.error}</p> : null}
      {saveState.ok ? <p className="notice">{saveState.ok}</p> : null}
      {deleteState.error ? <p className="quote-warning">{deleteState.error}</p> : null}
      {deleteState.ok ? <p className="notice">{deleteState.ok}</p> : null}

      <form action={save} className="filters">
        <input type="hidden" name="productId" value={productId} />

        <div className="filters-row">
          <div className="field field-wide">
            <label htmlFor="planId">Unidad</label>
            <select id="planId" name="planId" required defaultValue={plans[0]?.id ?? ""}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rate-name">Nombre</label>
            <input id="rate-name" name="name" type="text" placeholder="Temporada alta" />
          </div>
        </div>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="rate-from">Desde</label>
            <input id="rate-from" name="from" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="rate-to">Hasta (no incluido)</label>
            <input id="rate-to" name="to" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="nightly">Por noche</label>
            <input id="nightly" name="nightly" type="text" inputMode="decimal" required placeholder="3200" />
          </div>
        </div>

        <fieldset className="field">
          <legend>Días de la semana</legend>
          <p className="muted">Sin marcar ninguno, aplica todos los días.</p>
          <span className="dow-row">
            {DOW.map((day) => (
              <label key={day.value} className="dow-check">
                <input type="checkbox" name="dows" value={day.value} />
                {day.label}
              </label>
            ))}
          </span>
        </fieldset>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="minNights">Mínimo de noches</label>
            <input id="minNights" name="minNights" type="number" min="1" placeholder="sin mínimo" />
          </div>
          <div className="field">
            <label htmlFor="priority">Prioridad</label>
            <input id="priority" name="priority" type="number" min="0" max="100" defaultValue="0" />
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "…" : "Agregar tarifa"}
          </button>
        </div>
      </form>

      {rates.length === 0 ? (
        <p className="muted">Sin tarifas: este producto todavía no se puede cotizar.</p>
      ) : (
        <ul className="admin-list">
          {rates.map((rate) => (
            <li key={rate.id}>
              <div className="admin-card">
                <span className="admin-card-head">
                  <span className="admin-code">{rate.name ?? "Tarifa"}</span>
                  <span className="admin-badge admin-badge-done">prioridad {rate.priority}</span>
                </span>
                <span className="admin-card-title">
                  {formatMoney(rate.nightlyCents, "MXN", "es")} por noche
                </span>
                <span className="admin-card-meta">
                  {rate.unitLabel} · {dateLabel(rate.from)} → {dateLabel(rate.to)} ·{" "}
                  {dowLabel(rate.dows)}
                  {rate.minNights ? ` · mínimo ${rate.minNights} noches` : ""}
                </span>
                <form action={remove}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="rateId" value={rate.id} />
                  <button className="btn btn-secondary" type="submit">
                    Quitar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
