"use client";

import { useActionState } from "react";

import type { ManualBlock, UnitOption } from "@/modules/admin/queries";

import { createBlock, releaseBlock, type ActionState } from "../actions";
import { nightLabel } from "../labels";

const REASON: Record<string, string> = {
  maintenance: "Mantenimiento",
  owner_use: "Uso del propietario",
  other: "Otro",
};

export function BlockForms({ units, blocks }: { units: UnitOption[]; blocks: ManualBlock[] }) {
  const [createState, create, creating] = useActionState<ActionState, FormData>(createBlock, {
    error: null,
    ok: null,
  });
  const [releaseState, release] = useActionState<ActionState, FormData>(releaseBlock, {
    error: null,
    ok: null,
  });

  return (
    <>
      <form action={create} className="filters">
        {createState.error ? <p className="quote-warning">{createState.error}</p> : null}
        {createState.ok ? <p className="notice">{createState.ok}</p> : null}

        <div className="filters-row">
          <div className="field field-wide">
            <label htmlFor="unitId">Unidad</label>
            <select id="unitId" name="unitId" required>
              <option value="">Elige una</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filters-row">
          <div className="field">
            <label htmlFor="from">Desde</label>
            <input id="from" name="from" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="to">Hasta (no incluida)</label>
            <input id="to" name="to" type="date" required />
          </div>
          <div className="field">
            <label htmlFor="reason">Motivo</label>
            <select id="reason" name="reason" defaultValue="maintenance">
              <option value="maintenance">Mantenimiento</option>
              <option value="owner_use">Uso del propietario</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="note">Nota</label>
            <input id="note" name="note" type="text" placeholder="Opcional" />
          </div>
          <button className="btn" type="submit" disabled={creating}>
            {creating ? "…" : "Bloquear"}
          </button>
        </div>
      </form>

      {releaseState.error ? <p className="quote-warning">{releaseState.error}</p> : null}

      <ul className="admin-list">
        {blocks.map((block) => (
          <li key={block.id}>
            <div className="admin-card">
              <span className="admin-card-head">
                <span className="admin-code">{block.unitLabel}</span>
                <span className="admin-badge admin-badge-off">
                  {REASON[block.reason] ?? block.reason}
                </span>
              </span>
              <span className="admin-card-meta">
                {nightLabel(block.from)} → {nightLabel(block.to)}
                {block.note ? ` · ${block.note}` : ""}
              </span>
              <form action={release}>
                <input type="hidden" name="id" value={block.id} />
                <button className="btn btn-secondary" type="submit">
                  Liberar
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
