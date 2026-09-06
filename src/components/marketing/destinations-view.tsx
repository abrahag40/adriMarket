import type { Metadata } from "next";

import { destinationsPath, otherLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { listCatalog } from "@/modules/catalog/queries";
import { absoluteUrl } from "@/site";

import { DestinationCard } from "./destination-card";

/**
 * Página de destinos.
 *
 * Existe porque la portada dejó de enseñarlos todos. Mientras el inicio los
 * listaba sin tope, era la única puerta a los destinos y cortarlos a seis
 * habría dejado los demás alcanzables solo escribiendo la URL a mano — la
 * razón por la que hasta ahora no se cortaban. Con esta página, la portada
 * puede hacer lo que hace una portada, enseñar una muestra, y la salida de
 * abajo lleva al resto.
 *
 * No hay tabla de destinos con foto propia que mantener: un destino es una
 * ubicación con productos publicados, y su foto es la portada del primero que
 * tenga una. Es el mismo dato que ya se ve en la tarjeta del producto.
 *
 * El cuerpo vive aquí y no en la ruta porque **hay dos rutas**: el segmento se
 * traduce (/es/destinos y /en/destinations) como el de cualquier colección, y
 * en Next eso son dos carpetas. Lo que no puede haber son dos copias del
 * cuerpo.
 */
export function destinationsMetadata(locale: Locale): Metadata {
  const t = getMessages(locale);
  const other = otherLocale(locale);
  return {
    title: t.destinationsPageTitle,
    description: t.destinationsPageSubtitle,
    alternates: {
      canonical: absoluteUrl(destinationsPath(locale)),
      languages: {
        [locale]: absoluteUrl(destinationsPath(locale)),
        [other]: absoluteUrl(destinationsPath(other)),
      },
    },
  };
}

export async function DestinationsView({ locale }: { locale: Locale }) {
  const t = getMessages(locale);
  const items = await listCatalog(locale, {});

  /* El conteo de la insignia es el mismo dato que "N resultados" en el
     catálogo, contado por ubicación: lo que se ve al pulsar la tarjeta. */
  const countByLocation = new Map<string, number>();
  for (const item of items) {
    if (item.locationSlug === null) continue;
    countByLocation.set(item.locationSlug, (countByLocation.get(item.locationSlug) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const destinations = items
    .filter((item) => item.locationSlug !== null && item.coverUrl !== null)
    .filter((item) => {
      if (seen.has(item.locationSlug!)) return false;
      seen.add(item.locationSlug!);
      return true;
    });

  return (
    <div className="stack">
      <header className="section-head">
        <h1 className="section-title">{t.destinationsPageTitle}</h1>
        <p className="muted">{t.destinationsPageSubtitle}</p>
      </header>

      <ul className="destinations-grid">
        {destinations.map((item) => (
          <li key={item.locationSlug}>
            <DestinationCard
              locale={locale}
              slug={item.locationSlug!}
              name={item.locationName!}
              count={countByLocation.get(item.locationSlug!) ?? 1}
              coverUrl={item.coverUrl!}
              coverWidth={item.coverWidth}
              coverHeight={item.coverHeight}
              coverVariants={item.coverVariants}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
