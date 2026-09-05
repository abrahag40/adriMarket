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
        sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
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
