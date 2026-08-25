"use client";

import { useActionState } from "react";

import { formatMoney } from "@/i18n/config";
import type { StayUnitDetail } from "@/modules/admin/authoring";

import type { ActionState } from "../../../actions";
import { addRatePlan, createStayUnit, toggleStayUnit } from "../../actions";

const EMPTY: ActionState = { error: null, ok: null };

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="quote-warning">{state.error}</p>;
  if (state.ok) return <p className="notice">{state.ok}</p>;
  return null;
}

/** Un plan y su botón de agregar tarifa, por unidad. Formulario aparte y
    chico: agregar un plan no debe obligar a repetir los datos de la unidad. */
function PlanForm({ productId, unitId }: { productId: string; unitId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addRatePlan, EMPTY);

  return (
    <form action={action} className="filters-row">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="unitId" value={unitId} />
      <div className="field">
        <label htmlFor={`plan-${unitId}`}>Nuevo plan de tarifas</label>
        <input id={`plan-${unitId}`} name="name" type="text" placeholder="Todo incluido" required />
      </div>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "…" : "Agregar plan"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function UnitForms({
  productId,
  units,
}: {
  productId: string;
  units: StayUnitDetail[];
}) {
  const [createState, create, creating] = useActionState<ActionState, FormData>(
    createStayUnit,
    EMPTY,
  );
  const [toggleState, toggle] = useActionState<ActionState, FormData>(toggleStayUnit, EMPTY);

  return (
    <>
      <Result state={createState} />
      <Result state={toggleState} />

      <form action={create} className="filters">
        <input type="hidden" name="productId" value={productId} />

        <div className="filters-row">
          <div className="field">
            <label htmlFor="unit-code">Código</label>
            <input id="unit-code" name="code" type="text" required placeholder="casa-principal" />
          </div>
          <div className="field field-wide">
            <label htmlFor="unit-plan">Nombre del primer plan de tarifas</label>
            <input id="unit-plan" name="planName" type="text" placeholder="Tarifa general" />
          </div>
        </div>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="unit-max">Capacidad máxima</label>
            <input id="unit-max" name="maxGuests" type="number" min="1" required placeholder="6" />
          </div>
          <div className="field">
            <label htmlFor="unit-base">Ocupación base</label>
            <input id="unit-base" name="baseGuests" type="number" min="1" required placeholder="4" />
          </div>
          <div className="field">
            <label htmlFor="unit-extra">Cuota por huésped extra</label>
            <input
              id="unit-extra"
              name="extraGuestFee"
              type="text"
              inputMode="decimal"
              placeholder="0"
            />
          </div>
          <div className="field">
            <label htmlFor="unit-cleaning">Cuota de limpieza</label>
            <input
              id="unit-cleaning"
              name="cleaningFee"
              type="text"
              inputMode="decimal"
              placeholder="0"
            />
          </div>
        </div>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="unit-bedrooms">Recámaras</label>
            <input id="unit-bedrooms" name="bedrooms" type="number" min="1" placeholder="2" />
          </div>
          <div className="field">
            <label htmlFor="unit-beds">Camas</label>
            <input id="unit-beds" name="beds" type="number" min="1" placeholder="3" />
          </div>
          <div className="field">
            <label htmlFor="unit-bathrooms">Baños</label>
            <input
              id="unit-bathrooms"
              name="bathrooms"
              type="text"
              inputMode="decimal"
              placeholder="2 o 2.5"
            />
          </div>
          <div className="field">
            <label htmlFor="unit-min-nights">Mínimo de noches</label>
            <input id="unit-min-nights" name="minNights" type="number" min="1" placeholder="2" />
          </div>
        </div>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="unit-checkin">Llegada</label>
            <input id="unit-checkin" name="checkinTime" type="time" defaultValue="15:00" />
          </div>
          <div className="field">
            <label htmlFor="unit-checkout">Salida</label>
            <input id="unit-checkout" name="checkoutTime" type="time" defaultValue="11:00" />
          </div>
          <button className="btn" type="submit" disabled={creating}>
            {creating ? "…" : "Agregar unidad"}
          </button>
        </div>
      </form>

      {units.length === 0 ? (
        <p className="muted">Sin unidades: este producto todavía no tiene nada que vender.</p>
      ) : (
        <ul className="admin-list">
          {units.map((unit) => (
            <li key={unit.id}>
              <div className="admin-card">
                <span className="admin-card-head">
                  <span className="admin-code">{unit.code}</span>
                  <span
                    className={
                      unit.active ? "admin-badge admin-badge-ok" : "admin-badge admin-badge-off"
                    }
                  >
                    {unit.active ? "activa" : "inactiva"}
                  </span>
                </span>
                <span className="admin-card-meta">
                  Hasta {unit.maxGuests} personas ({unit.baseGuests} base) · {unit.bedrooms} rec ·{" "}
                  {unit.beds} camas · {unit.bathrooms} baños · mínimo {unit.minNights} noches
                </span>
                <span className="admin-card-meta">
                  Llegada {unit.checkinTime.slice(0, 5)} · Salida {unit.checkoutTime.slice(0, 5)}
                  {unit.cleaningFeeCents > 0
                    ? ` · Limpieza ${formatMoney(unit.cleaningFeeCents, "MXN", "es")}`
                    : ""}
                  {unit.extraGuestFeeCents > 0
                    ? ` · Huésped extra ${formatMoney(unit.extraGuestFeeCents, "MXN", "es")}`
                    : ""}
                </span>

                {unit.plans.length === 0 ? (
                  <span className="admin-card-warn">Sin plan de tarifas — no se puede cotizar.</span>
                ) : (
                  <span className="admin-card-meta">
                    Planes:{" "}
                    {unit.plans
                      .map((plan) => `${plan.name} (${plan.rateCount} tarifa${plan.rateCount === 1 ? "" : "s"})`)
                      .join(" · ")}
                  </span>
                )}

                <PlanForm productId={productId} unitId={unit.id} />

                <form action={toggle}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="unitId" value={unit.id} />
                  <button className="btn btn-secondary" type="submit">
                    {unit.active ? "Desactivar" : "Activar"}
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
