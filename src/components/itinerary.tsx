"use client";

import { useRef } from "react";

export type ItineraryStep = {
  timeLabel: string | null;
  title: string;
  description: string | null;
};

const ABRIR = 260;
const CERRAR = 200;

/**
 * Itinerario desplegable · la caja de días de la referencia
 *
 * La referencia esconde cada día detrás de un acordeón y anima la altura.
 * Aquí es un `<details>` por paso, no un `<div>` con `aria-expanded`: **sin
 * JavaScript se abre y se cierra igual**, con el teclado que ya trae el
 * navegador. El componente de cliente solo agrega la animación, y si no
 * carga, lo único que se pierde es el deslizamiento.
 *
 * Se permite tener varios abiertos a la vez. La referencia cierra el
 * anterior al abrir otro; comparar dos paradas del mismo día es un gesto
 * razonable y cerrar lo que el huésped acaba de leer no ayuda.
 *
 * El primer paso llega abierto: un itinerario que arranca todo cerrado
 * parece vacío.
 */
export function Itinerary({ steps }: { steps: ItineraryStep[] }) {
  const lista = useRef<HTMLOListElement>(null);

  function alternar(evento: React.MouseEvent<HTMLElement>) {
    const summary = (evento.target as HTMLElement).closest("summary");
    if (!summary) return;

    const details = summary.parentElement as HTMLDetailsElement | null;
    const panel = details?.querySelector<HTMLElement>(".itinerary-panel");
    if (!details || !panel) return;

    // Quien pidió menos movimiento no recibe animación, solo el salto nativo.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof panel.animate !== "function") return;

    evento.preventDefault();
    const alto = panel.scrollHeight;

    if (details.open) {
      const anim = panel.animate(
        [
          { height: `${alto}px`, opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration: CERRAR, easing: "ease-in" },
      );
      /* El `open` se quita **al terminar**: quitarlo antes hace que el panel
         desaparezca de golpe y no haya nada que animar.
         La red de seguridad no sobra: en una pestaña que no se está pintando
         la línea de tiempo de la animación no avanza —se queda en 0 y nunca
         emite `finish`— y sin esto el paso se quedaría abierto para siempre. */
      const cerrar = () => {
        details.open = false;
      };
      anim.onfinish = cerrar;
      anim.oncancel = cerrar;
      window.setTimeout(cerrar, CERRAR + 150);
    } else {
      details.open = true;
      const anim = panel.animate(
        [
          { height: "0px", opacity: 0 },
          { height: `${alto}px`, opacity: 1 },
        ],
        { duration: ABRIR, easing: "ease-out" },
      );
      /* Misma red que al cerrar, por la razón contraria: mientras la
         animación esté corriendo manda su primer fotograma, y si la línea de
         tiempo no avanza el panel se queda clavado en altura cero con el
         texto dentro. Cancelarla devuelve la altura natural. */
      window.setTimeout(() => {
        if (anim.playState !== "finished") anim.cancel();
      }, ABRIR + 150);
    }
  }

  return (
    <ol className="itinerary-list" ref={lista} onClick={alternar}>
      {steps.map((step, index) => (
        <li key={index}>
          <details open={index === 0}>
            <summary className="itinerary-title">
              {step.timeLabel ? <span className="itinerary-time">{step.timeLabel}</span> : null}
              <span className="itinerary-step-name">{step.title}</span>
              <span className="itinerary-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </summary>
            {step.description ? (
              <div className="itinerary-panel">
                <p className="itinerary-body">{step.description}</p>
              </div>
            ) : null}
          </details>
        </li>
      ))}
    </ol>
  );
}
