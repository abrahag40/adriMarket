import Link from "next/link";

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

import { ResponsiveImage, type ImageVariants } from "../responsive-image";

/**
 * Tarjeta de destino, extraída del JSX que antes vivía inline en la página
 * del catálogo. Agrega un estado al pasar el mouse — el enlace "ver más" —
 * que la versión inline no tenía: la tarjeta entera ya era un enlace, esto
 * solo hace visible esa afordancia en vez de dejarla implícita.
 */
export function DestinationCard({
  locale,
  slug,
  name,
  count,
  coverUrl,
  coverWidth,
  coverHeight,
  coverVariants,
}: {
  locale: Locale;
  slug: string;
  name: string;
  count: number;
  coverUrl: string;
  coverWidth: number | null;
  coverHeight: number | null;
  coverVariants: ImageVariants | null;
}) {
  const t = getMessages(locale);

  return (
    <Link className="destination-card" href={`/${locale}?location=${slug}`}>
      <ResponsiveImage
        src={coverUrl}
        alt=""
        width={coverWidth ?? 600}
        height={coverHeight ?? 600}
        variants={coverVariants}
        /* La medida real de la columna, no una aproximación: la cuadrícula
           es de tres sobre 1120px (352px por tarjeta) y de dos en el
           teléfono. Diciendo `33vw` el navegador calculaba 422px en un
           escritorio de 1280 y bajaba la variante de 800 para pintarla a
           331 — cuatro veces los bytes, sin un píxel más de detalle. */
        sizes="(min-width: 1184px) 352px, (min-width: 900px) calc(33vw - 32px), (min-width: 360px) calc(50vw - 22px), calc(100vw - 32px)"
      />
      <span className="destination-card-count">{t.resultsCount(count)}</span>
      <span className="destination-card-body">
        <span className="destination-card-name">{name}</span>
        <span className="destination-card-more">
          {t.destinationViewMore}
          {/* La flecha es decorativa: el texto ya dice a dónde va. */}
          <span aria-hidden="true">→</span>
        </span>
      </span>
    </Link>
  );
}
