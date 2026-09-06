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
