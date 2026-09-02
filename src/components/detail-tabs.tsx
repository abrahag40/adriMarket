"use client";

import { useEffect, useRef, useState } from "react";

export type DetailTab = { id: string; label: string };

/**
 * Fila de enlaces ancla a las secciones de la ficha — el mismo lugar que
 * ocupan las pestañas "Detail / Itinerary / Map / FAQ / Reviews" de la
 * referencia. La referencia resalta la pestaña de la sección visible con un
 * script; aquí es un `IntersectionObserver` sobre las mismas secciones que
 * ya existen en el DOM, sin reimplementar el scroll — si JavaScript no
 * carga, los enlaces `#id` siguen funcionando igual, solo sin el resaltado.
 */
export function DetailTabs({ tabs }: { tabs: DetailTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const ratios = useRef(new Map<string, number>());

  useEffect(() => {
    const sections = tabs
      .map((tab) => document.getElementById(tab.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.current.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let bestId = active;
        let bestRatio = 0;
        for (const tab of tabs) {
          const ratio = ratios.current.get(tab.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = tab.id;
          }
        }
        if (bestRatio > 0) setActive(bestId);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  return (
    <nav className="detail-tabs" aria-label={tabs.map((tab) => tab.label).join(" · ")}>
      {tabs.map((tab) => (
        <a key={tab.id} href={`#${tab.id}`} aria-current={tab.id === active ? "page" : undefined}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
