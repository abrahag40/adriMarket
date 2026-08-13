import Link from "next/link";

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { LocationOption } from "@/modules/catalog/queries";

/**
 * Filtros del catálogo.
 *
 * Es un formulario GET, sin una línea de JavaScript: al enviarlo, los valores
 * quedan en la URL. Eso da tres cosas gratis que un filtro con estado en el
 * cliente no da — la búsqueda se puede compartir por WhatsApp, se puede recargar
 * sin perderla, y el servidor la puede renderizar completa para los buscadores.
 */
export function CatalogFilters({
  locale,
  locations,
  selected,
}: {
  locale: Locale;
  locations: LocationOption[];
  selected: { kind: string; location: string; guests: string };
}) {
  const t = getMessages(locale);
  const hasFilters = Boolean(selected.kind || selected.location || selected.guests);

  return (
    <form className="filters" method="get" action={`/${locale}`}>
      <h2 className="visually-hidden">{t.filterHeading}</h2>

      <div className="filters-row">
        <div className="field">
          <label htmlFor="kind">{t.filterKind}</label>
          <select id="kind" name="kind" defaultValue={selected.kind}>
            <option value="">{t.filterKindAll}</option>
            <option value="tour">{t.filterKindTour}</option>
            <option value="stay">{t.filterKindStay}</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="location">{t.filterLocation}</label>
          <select id="location" name="location" defaultValue={selected.location}>
            <option value="">{t.filterLocationAll}</option>
            {locations.map((location) => (
              <option key={location.slug} value={location.slug}>
                {location.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="guests">{t.filterGuests}</label>
          <select id="guests" name="guests" defaultValue={selected.guests}>
            <option value="">{t.filterGuestsAny}</option>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button className="btn" type="submit">
          {t.filterApply}
        </button>

        {hasFilters ? (
          <Link className="btn btn-secondary" href={`/${locale}`}>
            {t.filterClear}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
