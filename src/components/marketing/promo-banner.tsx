import Link from "next/link";

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/** Extracción del `.cta-banner` que ya existía inline en la página del catálogo. */
export function PromoBanner({ locale }: { locale: Locale }) {
  const t = getMessages(locale);

  return (
    <section className="cta-banner" aria-labelledby="cta-heading">
      <h2 id="cta-heading" className="cta-heading">
        {t.ctaHeading}
      </h2>
      <p className="cta-body">{t.ctaBody}</p>
      <Link className="btn" href={`/${locale}`}>
        {t.ctaButton}
      </Link>
    </section>
  );
}
