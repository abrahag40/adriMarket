"use client";

import { Children, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Carrusel con scroll-snap nativo del navegador; las flechas solo mueven el
 * scroll que el navegador ya sabe hacer (`scrollBy`). Sin librería nueva: no
 * hay ninguna instalada en el proyecto y esto no la necesita.
 */
export function Carousel({
  children,
  prevLabel,
  nextLabel,
}: {
  children: ReactNode;
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
      <div className="carousel-track" ref={trackRef}>
        {Children.map(children, (child, index) => (
          <div className="carousel-item" key={index}>
            {child}
          </div>
        ))}
      </div>
      <div className="carousel-controls">
        <button
          type="button"
          className="carousel-btn"
          aria-label={prevLabel}
          onClick={() => scroll(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="carousel-btn"
          aria-label={nextLabel}
          onClick={() => scroll(1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}
