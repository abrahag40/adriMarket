import Link from "next/link";

import { formatMoney, productPath, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { CatalogCard } from "@/modules/catalog/queries";

import { ResponsiveImage } from "../responsive-image";

/**
 * Variante "moderna" de tarjeta — foto vertical con texto superpuesto, el
 * estilo "Popular Tours" de la referencia — visualmente distinta a
 * `ProductCard`. Mismos datos reales del catálogo, sin precio tachado: ese
 * campo no existe en el modelo de datos.
 *
 * Vive en la cuadrícula de tres del inicio, así que ocupa el ancho de su
 * columna y la foto se sirve para un tercio de la pantalla: `sizes` es lo que
 * decide qué variante baja el navegador, y una medida vieja hace que pida la
 * grande para pintarla chica.
 */
export function FeaturedCard({ item, locale }: { item: CatalogCard; locale: Locale }) {
  const t = getMessages(locale);
  const href = productPath(locale, item.kind, item.slug);
  const kindLabel = { tour: t.filterKindTour, stay: t.filterKindStay, vehicle: t.filterKindVehicle }[
    item.kind
  ];

  return (
    <Link className="featured-card" href={href}>
      {item.coverUrl ? (
        <ResponsiveImage
          src={item.coverUrl}
          alt=""
          width={item.coverWidth ?? 800}
          height={item.coverHeight ?? 1000}
          variants={item.coverVariants}
          sizes="(min-width: 1184px) 352px, (min-width: 700px) calc(33vw - 32px), (min-width: 452px) 420px, calc(100vw - 32px)"
        />
      ) : null}
      <span className="featured-card-kind">{kindLabel}</span>
      <span className="featured-card-body">
        <span className="featured-card-name">{item.name}</span>
        {item.fromCents !== null ? (
          <span className="featured-card-price">
            {t.fromPrice} {formatMoney(item.fromCents, item.currency, locale)}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
