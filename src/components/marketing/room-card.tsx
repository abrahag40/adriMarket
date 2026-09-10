import Link from "next/link";

import { formatMoney, productPath, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { CatalogCard } from "@/modules/catalog/queries";

import { ResponsiveImage } from "../responsive-image";

/**
 * Tarjeta de la cuadrícula de estancias — foto con la insignia de precio
 * flotando sobre ella y el cuerpo (título, resumen, enlace) debajo, en vez
 * de superpuesto: el estilo "Room Grid" de la referencia, distinto tanto de
 * `.card` (precio en el cuerpo) como de `.featured-card` (todo el texto
 * superpuesto en la foto).
 */
export function RoomCard({ item, locale }: { item: CatalogCard; locale: Locale }) {
  const t = getMessages(locale);
  const href = productPath(locale, item.kind, item.slug);

  return (
    <div className="room-card">
      <Link className="room-card-media" href={href}>
        {item.coverUrl ? (
          <ResponsiveImage
            src={item.coverUrl}
            alt={item.coverAlt ?? ""}
            width={item.coverWidth ?? 800}
            height={item.coverHeight ?? 600}
            variants={item.coverVariants}
            /* Misma cuadrícula que los destinos, misma medida: tres columnas
               de 352px sobre 1120, dos en el teléfono. Ver el comentario en
               `destination-card.tsx` para lo que costaba la aproximación. */
            sizes="(min-width: 1184px) 352px, (min-width: 900px) calc(33vw - 32px), (min-width: 380px) calc(50vw - 22px), calc(100vw - 32px)"
          />
        ) : null}
        {item.fromCents !== null ? (
          <span className="room-card-price">
            {t.fromPrice} <strong>{formatMoney(item.fromCents, item.currency, locale)}</strong>
          </span>
        ) : null}
        {/* El destino, dentro de la foto.
        
            Va **abajo a la izquierda** y no arriba a la derecha —que es donde
            la tarjeta de destino pone su insignia— por una medida concreta: en
            el teléfono esta cuadrícula es de dos columnas y cada tarjeta mide
            unos 165px. "Playa del Carmen" enfrentado a "Desde $1,450" en la
            misma línea no cabe, y truncar un nombre de lugar —"Playa del
            Car…"— es peor que no ponerlo. Apilado debajo del precio siempre
            cabe, sea cual sea el destino.

            Es un `<span>` y no un enlace a propósito: la foto entera ya es un
            enlace a la ficha, y un `<a>` dentro de otro `<a>` es HTML inválido
            que el navegador reescribe al analizarlo. Quien quiera filtrar por
            destino tiene los destinos arriba, con su foto.

            `locationName` primero y `city` de respaldo: son el mismo dato en
            los destinos de hoy, pero un día un destino puede llamarse "Riviera
            Maya" con ciudad "Playa del Carmen", y el nombre del destino es el
            que el huésped reconoce. */}
        {(item.locationName ?? item.city) ? (
          <span className="room-card-location">
            <span className="visually-hidden">{t.filterLocation}: </span>
            {item.locationName ?? item.city}
          </span>
        ) : null}
      </Link>
      <div className="room-card-body">
        <h3 className="room-card-title">
          <Link href={href}>{item.name}</Link>
        </h3>
        {item.summary ? <p className="room-card-summary">{item.summary}</p> : null}
        <Link className="room-card-link" href={href}>
          {t.viewDetail}
        </Link>
      </div>
    </div>
  );
}
