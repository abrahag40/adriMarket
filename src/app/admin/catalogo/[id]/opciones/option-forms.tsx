"use client";

import { useActionState } from "react";

import { formatMoney } from "@/i18n/config";
import type { TourOptionDetail, TourOptionPaxPrice } from "@/modules/admin/authoring";

import type { ActionState } from "../../../actions";
import { createItineraryStep, createTourOption, deleteItineraryStep, toggleTourOption } from "../../actions";

const EMPTY: ActionState = { error: null, ok: null };

/**
 * Horario del día de una opción — "8:00 recolección, 9:00 primer cenote…".
 * Vive aparte de `OptionForms` porque cada opción necesita su propio par de
 * `useActionState` (agregar/borrar paso), y un hook no puede vivir dentro de
 * un `.map()`.
 */
function ItineraryEditor({
  productId,
  option,
}: {
  productId: string;
  option: TourOptionDetail;
}) {
  const [createState, create, creating] = useActionState<ActionState, FormData>(
    createItineraryStep,
    EMPTY,
  );
  const [deleteState, remove] = useActionState<ActionState, FormData>(deleteItineraryStep, EMPTY);

  return (
    <div className="admin-itinerary">
      {createState.error ? <p className="quote-warning">{createState.error}</p> : null}
      {deleteState.error ? <p className="quote-warning">{deleteState.error}</p> : null}

      {option.itinerary.length === 0 ? (
        <p className="muted">Sin horario todavía — este tour se muestra sin itinerario.</p>
      ) : (
        <ol className="admin-itinerary-list">
          {option.itinerary.map((step) => (
            <li key={step.id}>
              <span className="admin-itinerary-time">{step.timeLabel || "—"}</span>
              <span className="admin-itinerary-title">{step.titleEs}</span>
              <form action={remove}>
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="stepId" value={step.id} />
                <button className="btn btn-secondary" type="submit">
                  Quitar
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}

      <form action={create} className="filters">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="optionId" value={option.id} />
        <div className="filters-row">
          <div className="field">
            <label htmlFor={`step-time-${option.id}`}>Hora</label>
            <input
              id={`step-time-${option.id}`}
              name="timeLabel"
              type="text"
              placeholder="8:00"
            />
          </div>
          <div className="field field-wide">
            <label htmlFor={`step-title-es-${option.id}`}>Paso (español)</label>
            <input
              id={`step-title-es-${option.id}`}
              name="titleEs"
              type="text"
              required
              placeholder="Recolección en el hotel"
            />
          </div>
          <div className="field field-wide">
            <label htmlFor={`step-title-en-${option.id}`}>Paso (inglés)</label>
            <input
              id={`step-title-en-${option.id}`}
              name="titleEn"
              type="text"
              placeholder="opcional"
            />
          </div>
        </div>
        <button className="btn btn-secondary" type="submit" disabled={creating}>
          {creating ? "…" : "Agregar paso"}
        </button>
      </form>
    </div>
  );
}

function priceFor(
  option: TourOptionDetail,
  paxType: "adult" | "child" | "infant",
): TourOptionPaxPrice | null {
  return option.prices.find((price) => price.paxType === paxType) ?? null;
}

export function OptionForms({
  productId,
  options,
}: {
  productId: string;
  options: TourOptionDetail[];
}) {
  const [createState, create, creating] = useActionState<ActionState, FormData>(
    createTourOption,
    EMPTY,
  );
  const [toggleState, toggle] = useActionState<ActionState, FormData>(toggleTourOption, EMPTY);

  return (
    <>
      {createState.error ? <p className="quote-warning">{createState.error}</p> : null}
      {createState.ok ? <p className="notice">{createState.ok}</p> : null}
      {toggleState.error ? <p className="quote-warning">{toggleState.error}</p> : null}
      {toggleState.ok ? <p className="notice">{toggleState.ok}</p> : null}

      <form action={create} className="filters">
        <input type="hidden" name="productId" value={productId} />

        <div className="filters-row">
          <div className="field">
            <label htmlFor="opt-code">Código</label>
            <input id="opt-code" name="code" type="text" required placeholder="shared-am" />
          </div>
          <div className="field field-wide">
            <label htmlFor="opt-name-es">Nombre (español)</label>
            <input
              id="opt-name-es"
              name="nameEs"
              type="text"
              required
              placeholder="Compartido 9:00"
            />
          </div>
          <div className="field field-wide">
            <label htmlFor="opt-name-en">Nombre (inglés)</label>
            <input id="opt-name-en" name="nameEn" type="text" placeholder="opcional" />
          </div>
        </div>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="opt-duration">Duración (minutos)</label>
            <input id="opt-duration" name="duration" type="number" min="1" placeholder="300" />
          </div>
          <div className="field">
            <label htmlFor="opt-capacity">Cupo</label>
            <input id="opt-capacity" name="capacity" type="number" min="1" required placeholder="12" />
          </div>
          <div className="field field-wide">
            <label htmlFor="opt-meeting">Punto de encuentro</label>
            <input
              id="opt-meeting"
              name="meetingPoint"
              type="text"
              placeholder="Parque Dos Aguas, Tulum centro"
            />
          </div>
        </div>

        <fieldset className="field">
          <legend>Precio por pasajero, en pesos</legend>
          <div className="filters-row">
            <div className="field">
              <label htmlFor="opt-adult">Adulto</label>
              <input
                id="opt-adult"
                name="adultPrice"
                type="text"
                inputMode="decimal"
                required
                placeholder="1800"
              />
            </div>
            <div className="field">
              <label htmlFor="opt-child">Menor</label>
              <input
                id="opt-child"
                name="childPrice"
                type="text"
                inputMode="decimal"
                placeholder="opcional"
              />
            </div>
            <div className="field">
              <label htmlFor="opt-infant">Infante</label>
              <input
                id="opt-infant"
                name="infantPrice"
                type="text"
                inputMode="decimal"
                placeholder="opcional, 0 = sin costo"
              />
            </div>
          </div>
          <p className="muted">
            Deja vacío un tipo de pasajero si esta opción no lo vende. El infante no ocupa lugar
            del cupo; adulto y menor sí.
          </p>
        </fieldset>

        <button className="btn" type="submit" disabled={creating}>
          {creating ? "…" : "Agregar opción"}
        </button>
      </form>

      {options.length === 0 ? (
        <p className="muted">Sin opciones: este tour todavía no tiene nada que vender.</p>
      ) : (
        <ul className="admin-list">
          {options.map((option) => {
            const adult = priceFor(option, "adult");
            const child = priceFor(option, "child");
            const infant = priceFor(option, "infant");
            return (
              <li key={option.id}>
                <div className="admin-card">
                  <span className="admin-card-head">
                    <span className="admin-code">{option.nameEs}</span>
                    <span
                      className={
                        option.active ? "admin-badge admin-badge-ok" : "admin-badge admin-badge-off"
                      }
                    >
                      {option.active ? "activa" : "inactiva"}
                    </span>
                  </span>
                  <span className="admin-card-meta">
                    {option.code}
                    {option.durationMinutes ? ` · ${Math.round(option.durationMinutes / 60)} h` : ""}
                    {` · cupo ${option.defaultCapacity}`}
                    {option.meetingPoint ? ` · ${option.meetingPoint}` : ""}
                  </span>
                  <span className="admin-card-meta">
                    Adulto {adult ? formatMoney(adult.priceCents, "MXN", "es") : "—"}
                    {child ? ` · Menor ${formatMoney(child.priceCents, "MXN", "es")}` : ""}
                    {infant ? ` · Infante ${formatMoney(infant.priceCents, "MXN", "es")}` : ""}
                  </span>
                  <form action={toggle}>
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="optionId" value={option.id} />
                    <button className="btn btn-secondary" type="submit">
                      {option.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                  <details>
                    <summary>Horario del día ({option.itinerary.length})</summary>
                    <ItineraryEditor productId={productId} option={option} />
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
