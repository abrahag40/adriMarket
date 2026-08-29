import Link from "next/link";

import { formatMoney, productPath, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { CatalogCard } from "@/modules/catalog/queries";

import { ResponsiveImage } from "../responsive-image";

/**
 * Variante "moderna" de tarjeta — foto vertical con texto superpuesto, el
 * estilo de "Popular Tours"/"Hotel Rooms" de la referencia — visualmente
 * distinta a `ProductCard`. Mismos datos reales del catálogo, sin precio
 * tachado: ese campo no existe en el modelo de datos.
 */
export function FeaturedCard({ item, locale }: { item: CatalogCard; locale: Locale }) {
  const t = getMessages(locale);
  const href = productPath(locale, item.kind, item.slug);
  const kindLabel = item.kind === "tour" ? t.filterKindTour : t.filterKindStay;

  return (
    <Link className="featured-card" href={href}>
      {item.coverUrl ? (
        <ResponsiveImage
          src={item.coverUrl}
          alt=""
          width={item.coverWidth ?? 800}
          height={item.coverHeight ?? 1000}
          variants={item.coverVariants}
          sizes="(min-width: 900px) 25vw, (min-width: 600px) 40vw, 80vw"
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
