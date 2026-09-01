import Link from "next/link";

import { otherLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { LocationOption } from "@/modules/catalog/queries";

import { CurrencyBadge } from "./currency-badge";
import { MobileNav } from "./mobile-nav";

/**
 * Cabecera del sitio: marca, menú horizontal con un submenú desplegable de
 * destinos, insignia de moneda y acceso al panel. El submenú también es
 * `<details>/<summary>`, igual que `MobileNav` — mismo patrón sin JavaScript.
 */
export function SiteHeader({
  locale,
  locations,
  alternate,
}: {
  locale: Locale;
  locations: LocationOption[];
  alternate: string;
}) {
  const t = getMessages(locale);
  const other = otherLocale(locale);

  return (
    <header className="site-header">
      <div className="wrap site-header-inner">
        {/* Una sola línea, sin la leyenda debajo: la referencia trae el
            nombre solo en la cabecera — la leyenda vive en el pie. Dos
            líneas aquí infla la cabecera y desalinea todo lo demás. */}
        <Link className="brand brand-header" href={`/${locale}`}>
          <span className="brand-name">{t.siteName}</span>
        </Link>

        <nav className="site-nav" aria-label={t.navTours}>
          <Link href={`/${locale}`}>{t.navHome}</Link>
          <Link href={`/${locale}?kind=tour`}>{t.navTours}</Link>
          <Link href={`/${locale}?kind=stay`}>{t.navStays}</Link>

          {locations.length > 0 ? (
            <details className="site-nav-dropdown">
              <summary>{t.navDestinations}</summary>
              <div className="site-nav-dropdown-panel">
                {locations.map((location) => (
                  <Link key={location.slug} href={`/${locale}?location=${location.slug}`}>
                    {location.name}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </nav>

        <div className="site-header-meta">
          <CurrencyBadge />
          <Link className="lang-switch" href={alternate} hrefLang={other} lang={other}>
            {t.switchLanguage}
          </Link>
          <Link className="site-header-access" href="/admin/entrar">
            {t.navPanel}
          </Link>
        </div>

        <MobileNav locale={locale} locations={locations} alternate={alternate} />
      </div>
    </header>
  );
}
