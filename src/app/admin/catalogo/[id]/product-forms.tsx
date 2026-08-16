"use client";

import { useActionState } from "react";

import type { MediaRow, Translation } from "@/modules/admin/authoring";

import type { ActionState } from "../../actions";
import {
  addPhoto,
  removePhoto,
  saveTranslation,
  setProductDeposit,
  setProductStatus,
} from "../actions";

const EMPTY: ActionState = { error: null, ok: null };

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="quote-warning">{state.error}</p>;
  if (state.ok) return <p className="notice">{state.ok}</p>;
  return null;
}

/** Textos de un idioma. Uno por sección para poder guardar de a poco. */
export function TranslationForm({
  productId,
  locale,
  current,
}: {
  productId: string;
  locale: "es" | "en";
  current: Translation | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTranslation, EMPTY);
  const idioma = locale === "es" ? "Español" : "Inglés";

  return (
    <section className="admin-panel">
      <h2 className="section-title">{idioma}</h2>
      <Result state={state} />

      {locale === "en" && !current ? (
        // Se dice la consecuencia, no solo que falta: desde el Sprint 1 un
        // producto sin traducción responde 404 en ese idioma.
        <p className="muted">
          Sin este texto, la ficha no existe en inglés — y el tráfico orgánico en inglés es el que
          evita pagarle comisión a un intermediario.
        </p>
      ) : null}

      <form action={action} className="stack-sm">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="locale" value={locale} />

        <div className="field">
          <label htmlFor={`name-${locale}`}>Nombre</label>
          <input
            id={`name-${locale}`}
            name="name"
            type="text"
            required
            defaultValue={current?.name ?? ""}
          />
        </div>

        <div className="field">
          <label htmlFor={`summary-${locale}`}>Resumen</label>
          <input
            id={`summary-${locale}`}
            name="summary"
            type="text"
            defaultValue={current?.summary ?? ""}
          />
        </div>

        <div className="field">
          <label htmlFor={`description-${locale}`}>Descripción</label>
          <textarea
            id={`description-${locale}`}
            name="description"
            rows={4}
            defaultValue={current?.description ?? ""}
          />
        </div>

        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "…" : `Guardar ${idioma.toLowerCase()}`}
        </button>
      </form>
    </section>
  );
}

/** Galería: subir, ver el estado del procesamiento y quitar. */
export function PhotoManager({
  productId,
  media,
}: {
  productId: string;
  media: MediaRow[];
}) {
  const [addState, add, adding] = useActionState<ActionState, FormData>(addPhoto, EMPTY);
  const [removeState, remove] = useActionState<ActionState, FormData>(removePhoto, EMPTY);

  return (
    <section className="admin-panel">
      <h2 className="section-title">Fotos</h2>
      <Result state={addState} />
      <Result state={removeState} />

      <form action={add} className="stack-sm">
        <input type="hidden" name="productId" value={productId} />
        <div className="field">
          <label htmlFor="photo">Agregar una foto</label>
          <input id="photo" name="photo" type="file" accept="image/*" required />
        </div>
        <button className="btn btn-secondary" type="submit" disabled={adding}>
          {adding ? "Subiendo…" : "Subir"}
        </button>
      </form>

      {media.length === 0 ? (
        <p className="muted">Todavía no hay fotos. Hace falta al menos una para publicar.</p>
      ) : (
        <ul className="media-grid">
          {media.map((item) => (
            <li key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.altEs ?? ""}
                width={item.width ?? undefined}
                height={item.height ?? undefined}
                loading="lazy"
              />
              {/*
                Se dice si ya se generaron los tamaños para móvil. Mientras no,
                la foto se ve pero pesa lo que pesaba, y quien la subió merece
                saber que el trabajo sigue en curso en vez de suponer que falló.
              */}
              <span className={item.processed ? "media-ok" : "media-wait"}>
                {item.processed ? "lista" : "procesando…"}
              </span>
              <form action={remove}>
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="mediaId" value={item.id} />
                <button className="btn btn-secondary" type="submit">
                  Quitar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Anticipo propio del producto, o heredar el global. */
export function DepositForm({
  productId,
  current,
  globalPct,
}: {
  productId: string;
  current: number | null;
  globalPct: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setProductDeposit, EMPTY);

  return (
    <section className="admin-panel">
      <h2 className="section-title">Anticipo</h2>
      <Result state={state} />

      <form action={action} className="stack-sm">
        <input type="hidden" name="productId" value={productId} />
        <div className="field">
          <label htmlFor="pct">Porcentaje que se cobra en línea</label>
          <input
            id="pct"
            name="pct"
            type="number"
            min="1"
            max="100"
            step="1"
            defaultValue={current ?? ""}
            placeholder={`${globalPct} (el global)`}
          />
        </div>
        <p className="muted">
          Déjalo vacío para heredar el {globalPct}% global. Cambiarlo no altera las reservas ya
          tomadas: cada una se queda con el porcentaje que tenía al reservarse.
        </p>
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "…" : "Guardar anticipo"}
        </button>
      </form>
    </section>
  );
}

/** Publicar o volver a borrador, con las condiciones a la vista. */
export function PublishForm({
  productId,
  status,
  hasSpanish,
  hasPhotos,
}: {
  productId: string;
  status: string;
  hasSpanish: boolean;
  hasPhotos: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setProductStatus, EMPTY);
  const listo = hasSpanish && hasPhotos;

  return (
    <section className="admin-panel">
      <h2 className="section-title">Publicación</h2>
      <Result state={state} />

      {status !== "published" && !listo ? (
        // Las condiciones se dicen antes de intentar, no después de fallar.
        <ul className="check-list">
          {!hasSpanish ? <li>Falta el nombre en español</li> : null}
          {!hasPhotos ? <li>Falta al menos una foto</li> : null}
        </ul>
      ) : null}

      <form action={action}>
        <input type="hidden" name="productId" value={productId} />
        <input
          type="hidden"
          name="status"
          value={status === "published" ? "draft" : "published"}
        />
        <button
          className="btn btn-block"
          type="submit"
          disabled={pending || (status !== "published" && !listo)}
        >
          {pending
            ? "…"
            : status === "published"
              ? "Quitar del sitio (volver a borrador)"
              : "Publicar en el sitio"}
        </button>
      </form>
    </section>
  );
}
