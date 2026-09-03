"use client";

import { useCallback, useEffect, useState } from "react";

export type DetailTab = { id: string; label: string };

/** Cuánto baja el ancla para no quedar debajo de la cabecera pegada. */
const MARGEN = 96;

/**
 * Fila de enlaces ancla a las secciones de la ficha — el mismo lugar que
 * ocupan las pestañas "Detail / Itinerary / Map / FAQ / Reviews" de la
 * referencia.
 *
 * Dos cosas que estaban mal y se rehicieron:
 *
 * **El salto era brusco.** El navegador saltaba al ancla de golpe. Ahora el
 * clic se intercepta y se desplaza con `scrollTo({ behavior: "smooth" })`,
 * respetando a quien pidió menos movimiento. Sin JavaScript el enlace `#id`
 * sigue funcionando, solo sin el deslizamiento.
 *
 * **La pestaña activa no cambiaba al desplazarse.** Antes era un
 * `IntersectionObserver` que solo marcaba activa una sección mientras
 * estuviera visible con una razón mayor a cero — con secciones más altas que
 * la ventana, y con `#overview` convertido en un ancla de altura cero, había
 * tramos enteros del recorrido sin ninguna activa, así que el resaltado se
 * quedaba pegado en la primera. Ahora se calcula al desplazarse: la activa es
 * la última sección que ya pasó la línea de la cabecera. Siempre hay una, y
 * cambia de forma continua.
 */
export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  const recalcular = useCallback(() => {
    const linea = window.scrollY + MARGEN + 8;
    let actual = tabs[0]?.id ?? "";
    for (const tab of tabs) {
      const seccion = document.getElementById(tab.id);
      if (!seccion) continue;
      if (seccion.getBoundingClientRect().top + window.scrollY <= linea) actual = tab.id;
    }
    /* Al final de la página la última sección puede no llegar nunca a la
       línea —no queda scroll suficiente—, y esa es justo la que se está
       leyendo. */
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 8) {
      actual = tabs[tabs.length - 1]?.id ?? actual;
    }
    setActive(actual);
  }, [tabs]);

  useEffect(() => {
    /* El cálculo va directo en el escuchador, sin `requestAnimationFrame`.
       Son tres `getBoundingClientRect` por evento —nada— y a cambio funciona
       en contextos donde el cuadro de animación no corre: una pestaña que no
       se está pintando nunca ejecuta el `rAF` y el resaltado se quedaría
       congelado en la primera pestaña, que es justo el defecto que esto
       viene a corregir. */
    recalcular();
    window.addEventListener("scroll", recalcular, { passive: true });
    window.addEventListener("resize", recalcular);
    return () => {
      window.removeEventListener("scroll", recalcular);
      window.removeEventListener("resize", recalcular);
    };
  }, [recalcular]);

  function irA(evento: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const seccion = document.getElementById(id);
    if (!seccion) return;

    evento.preventDefault();
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const destino = Math.max(0, seccion.getBoundingClientRect().top + window.scrollY - MARGEN);
    window.scrollTo({ top: destino, behavior: suave ? "smooth" : "auto" });

    /* Respaldo: el desplazamiento suave necesita cuadros de animación, y hay
       contextos donde no los hay (una pestaña que no se está pintando) y
       navegadores viejos que ignoran el objeto de opciones por completo. En
       los dos casos el clic no movería nada, que es peor que el salto brusco
       que esto vino a quitar. Si tras un segundo seguimos lejos, se salta. */
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - destino) > 8) window.scrollTo(0, destino);
    }, 1000);
    /* La URL cambia sin provocar un segundo salto: `history` en lugar de
       dejar que el navegador navegue al ancla. */
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  }

  return (
    <nav className="detail-tabs" aria-label={tabs.map((tab) => tab.label).join(" · ")}>
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          aria-current={tab.id === active ? "page" : undefined}
          onClick={(evento) => irA(evento, tab.id)}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
