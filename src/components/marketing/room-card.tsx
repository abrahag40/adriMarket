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
            sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
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
