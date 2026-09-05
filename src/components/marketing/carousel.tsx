"use client";

import { Children, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Carrusel con scroll-snap nativo del navegador; las flechas solo mueven el
 * scroll que el navegador ya sabe hacer (`scrollBy`). Sin librería nueva: no
 * hay ninguna instalada en el proyecto y esto no la necesita.
 *
 * Las flechas van **a los lados del riel**, montadas encima con medio botón
 * fuera. Debajo obligaban a bajar la vista, perder de vista el carrusel y
 * volver; a los lados están donde ya está el ojo.
 *
 * El riel lleva `tabIndex={0}` a propósito: en pantallas angostas las flechas
 * se ocultan —no hay dónde ponerlas sin tapar una tarjeta, y ahí el dedo
 * arrastra—, así que sin esto quien navega con teclado se quedaría sin forma
 * de recorrerlo. Un contenedor con scroll y sin foco es, además, lo que axe
 * marca como `scrollable-region-focusable`.
 */
export function Carousel({
  children,
  label,
  prevLabel,
  nextLabel,
}: {
  children: ReactNode;
  /** Qué es lo que se recorre; lo lee quien llega al riel con el teclado. */
  label: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  function scroll(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.9, behavior: "smooth" });
  }

  return (
    <div className="carousel">
      <div
        className="carousel-track"
        ref={trackRef}
        tabIndex={0}
        role="group"
        aria-label={label}
      >
        {Children.map(children, (child, index) => (
          <div className="carousel-item" key={index}>
            {child}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="carousel-btn carousel-btn-prev"
        aria-label={prevLabel}
        onClick={() => scroll(-1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="carousel-btn carousel-btn-next"
        aria-label={nextLabel}
        onClick={() => scroll(1)}
      >
        ›
      </button>
    </div>
  );
}
