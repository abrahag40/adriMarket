import Link from "next/link";

import { otherLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { LocationOption } from "@/modules/catalog/queries";

/**
 * Panel móvil con `<details>/<summary>`: el navegador ya sabe abrir y cerrar
 * un disclosure con teclado y con toque, así que no hace falta JavaScript ni
 * estado propio para el menú de la cabecera en pantallas angostas.
 */
export function MobileNav({
  locale,
  locations,
  alternate,
  currentPath,
}: {
  locale: Locale;
  locations: LocationOption[];
  alternate: string;
  currentPath: string;
}) {
  const t = getMessages(locale);
  const other = otherLocale(locale);
  const isActive = (href: string) => href === currentPath;

  return (
    <details className="mobile-nav">
      <summary className="mobile-nav-toggle" aria-label={t.navMenuOpen}>
        <span className="mobile-nav-bar" />
        <span className="mobile-nav-bar" />
        <span className="mobile-nav-bar" />
      </summary>
      <nav className="mobile-nav-panel" aria-label={t.navTours}>
        <Link href={`/${locale}`} aria-current={isActive(`/${locale}`) ? "page" : undefined}>
          {t.navHome}
        </Link>
        <Link
          href={`/${locale}?kind=tour`}
          aria-current={isActive(`/${locale}?kind=tour`) ? "page" : undefined}
        >
          {t.navTours}
        </Link>
        <Link
          href={`/${locale}?kind=stay`}
          aria-current={isActive(`/${locale}?kind=stay`) ? "page" : undefined}
        >
          {t.navStays}
        </Link>

        {locations.length > 0 ? (
          <div className="mobile-nav-group">
            <span className="mobile-nav-group-label">{t.navDestinations}</span>
            {locations.map((location) => (
              <Link
                key={location.slug}
                href={`/${locale}?location=${location.slug}`}
                aria-current={
                  isActive(`/${locale}?location=${location.slug}`) ? "page" : undefined
                }
              >
                {location.name}
              </Link>
            ))}
          </div>
        ) : null}

        <Link href={alternate} hrefLang={other} lang={other}>
          {t.switchLanguage}
        </Link>
        <Link href="/admin/entrar">{t.navPanel}</Link>
      </nav>
    </details>
  );
}
