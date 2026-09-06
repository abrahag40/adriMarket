import Link from "next/link";

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/** Una opción de faceta ya resuelta: la página arma las URLs, esto las pinta. */
export type FacetOption = {
  label: string;
  href: string;
  /** Cuántos resultados daría. Se enseña entre paréntesis, como en la referencia. */
  count: number;
  selected: boolean;
};

export type FacetGroup = {
  /** Sirve de `id` para el `aria-labelledby` del grupo. */
  id: string;
  heading: string;
  /** La opción "sin filtrar" de este grupo; `null` cuando el grupo no se puede vaciar. */
  any: { label: string; href: string; count: number; selected: boolean } | null;
  options: FacetOption[];
};

/**
 * Filtro lateral del listado · el patrón de Amazon y Mercado Libre
 *
 * Reemplaza a `CatalogFilters` en las vistas filtradas, y las dos diferencias
 * con aquel formulario son el punto:
 *
 * 1. **Son enlaces, no campos.** Un formulario obliga a elegir, pulsar
 *    "Aplicar" y esperar; una faceta se aplica en un clic y se quita en otro.
 *    Sin JavaScript tampoco: cada opción es una URL completa, así que funciona
 *    igual con el JS caído y se puede compartir por WhatsApp.
 * 2. **Cada opción trae su cuenta**, y **la que daría cero no se ofrece**. Es
 *    lo que evita el callejón: en el formulario se podía pedir "Cozumel · 10
 *    personas" y llegar a una página vacía sin ninguna pista de qué sobraba.
 *
 * En el teléfono el panel es un `<details>` cerrado —el mismo mecanismo sin
 * JavaScript que usa `MobileNav`—; en escritorio el CSS esconde el resumen y
 * deja el contenido abierto. El resumen dice cuántos filtros hay puestos,
 * porque cerrado es lo único que se ve de ellos.
 */
export function CatalogSidebar({
  locale,
  groups,
  activeCount,
  clearHref,
}: {
  locale: Locale;
  groups: FacetGroup[];
  activeCount: number;
  clearHref: string;
}) {
  const t = getMessages(locale);

  return (
    <aside className="facets">
      <details className="facets-panel">
        <summary className="facets-summary">
          <span>{t.filtersOpen(activeCount)}</span>
          <span className="facets-summary-chevron" aria-hidden="true">
            ▾
          </span>
        </summary>

        <div className="facets-body">
          <div className="facets-head">
            <h2 className="facets-title">{t.filtersTitle}</h2>
            {activeCount > 0 ? (
              <Link className="facets-clear" href={clearHref}>
                {t.filterClear}
              </Link>
            ) : null}
          </div>

          {groups.map((group) => (
            <section className="facet" key={group.id} aria-labelledby={group.id}>
              <h3 className="facet-heading" id={group.id}>
                {group.heading}
              </h3>
              <ul className="facet-options">
                {group.any ? (
                  <li>
                    <Link
                      className="facet-option"
                      href={group.any.href}
                      aria-current={group.any.selected ? "true" : undefined}
                    >
                      <span className="facet-option-label">{group.any.label}</span>
                      <span className="facet-option-count">{group.any.count}</span>
                    </Link>
                  </li>
                ) : null}
                {group.options.map((option) => (
                  <li key={option.href}>
                    <Link
                      className="facet-option"
                      href={option.href}
                      aria-current={option.selected ? "true" : undefined}
                    >
                      <span className="facet-option-label">{option.label}</span>
                      {/* La cuenta es dato, no decoración: dice a dónde lleva el
                          clic antes de darlo. `aria-hidden` no — un lector de
                          pantalla la necesita tanto como la vista. */}
                      <span className="facet-option-count">{option.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </aside>
  );
}

/**
 * Las fichas de lo que está filtrado, encima de los resultados.
 *
 * Van aquí y no en la barra lateral porque en el teléfono la barra está
 * cerrada: sin esto, los filtros puestos serían invisibles justo donde más
 * confunde ver pocos resultados sin saber por qué.
 */
export function ActiveFacets({
  locale,
  chips,
  clearHref,
}: {
  locale: Locale;
  chips: { label: string; removeHref: string }[];
  clearHref: string;
}) {
  const t = getMessages(locale);
  if (chips.length === 0) return null;

  return (
    <div className="active-facets">
      <h2 className="visually-hidden">{t.filtersActiveHeading}</h2>
      <ul className="active-facets-list">
        {chips.map((chip) => (
          <li key={chip.removeHref}>
            <Link
              className="active-facet"
              href={chip.removeHref}
              aria-label={t.filterRemove(chip.label)}
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </Link>
          </li>
        ))}
        <li>
          <Link className="active-facets-clear" href={clearHref}>
            {t.filterClear}
          </Link>
        </li>
      </ul>
    </div>
  );
}
