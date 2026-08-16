"use client";

import { useActionState, useState } from "react";

import type { LocationOption } from "@/modules/admin/authoring";

import type { ActionState } from "../actions";
import { createProduct } from "./actions";

/**
 * Alta de producto.
 *
 * Pide lo mínimo para existir —qué es, cómo se llama, en qué dirección vive— y
 * nada más. Todo lo demás se edita después, en la ficha.
 *
 * La dirección se propone a partir del nombre pero se puede corregir: es parte
 * de la URL pública y cambiarla después rompe los enlaces que ya circulan.
 */
export function NewProductForm({ locations }: { locations: LocationOption[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createProduct, {
    error: null,
    ok: null,
  });
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);

  function proposeSlug(name: string): void {
    if (touched) return;
    setSlug(
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    );
  }

  if (!open) {
    return (
      <>
        {state.ok ? <p className="notice">{state.ok}</p> : null}
        <p>
          <button className="btn" type="button" onClick={() => setOpen(true)}>
            Nuevo producto
          </button>
        </p>
      </>
    );
  }

  return (
    <form action={action} className="filters">
      {state.error ? <p className="quote-warning">{state.error}</p> : null}

      <div className="filters-row">
        <div className="field">
          <label htmlFor="kind">Qué es</label>
          <select id="kind" name="kind" defaultValue="tour">
            <option value="tour">Tour</option>
            <option value="stay">Estancia</option>
          </select>
        </div>
        <div className="field field-wide">
          <label htmlFor="name">Nombre en español</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            onChange={(event) => proposeSlug(event.target.value)}
          />
        </div>
      </div>

      <div className="filters-row">
        <div className="field field-wide">
          <label htmlFor="slug">Dirección en el sitio</label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            value={slug}
            onChange={(event) => {
              setTouched(true);
              setSlug(event.target.value);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="locationId">Ubicación</label>
          <select id="locationId" name="locationId" defaultValue="">
            <option value="">Sin ubicación</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="muted">
        Nace en borrador: no se ve en el sitio hasta que lo publiques, y para publicarlo hará falta
        al menos una foto.
      </p>

      <div className="admin-card-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "…" : "Crear"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
