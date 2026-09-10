import Link from "next/link";
import { Suspense } from "react";

import { otherLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

import { CurrencyBadge } from "./currency-badge";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";

/**
 * Cabecera del sitio: marca, menú horizontal con un submenú desplegable de
 * destinos, insignia de moneda y acceso al panel. El submenú también es
 * `<details>/<summary>`, igual que `MobileNav` — mismo patrón sin JavaScript.
 */
export function SiteHeader({
  locale,
  alternate,
}: {
  locale: Locale;
  alternate: string;
}) {
  const t = getMessages(locale);
  const other = otherLocale(locale);
  return (
    <header className="site-header">
      <div className="wrap site-header-inner">
        {/* Una sola línea, sin la leyenda debajo: la referencia trae el
            nombre solo en la cabecera — la leyenda vive en el pie. Dos
            líneas aquí infla la cabecera y desalinea todo lo demás.
            "adri" en el color de texto normal, "Market" en el acento — el
            mismo tratamiento de dos tonos que la referencia le da a su
            propio nombre ("Travel Tour"), aplicado al nombre real del
            sitio en vez de inventar uno nuevo. */}
        <Link className="brand brand-header" href={`/${locale}`}>
          <span className="brand-name">
            {t.siteName.slice(0, 4)}
            <span className="brand-accent">{t.siteName.slice(4)}</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label={t.navTours}>
          {/* `useSearchParams` obliga a una frontera de Suspense: sin ella,
              cualquier ruta que Next quiera renderizar de forma estática falla
              al construir. El respaldo son los mismos enlaces sin marcar —el
              menú nunca desaparece, solo tarda un instante en saber cuál está
              activo—. */}
          <Suspense fallback={null}>
            <NavLinks locale={locale} />
          </Suspense>

          {/* Sin "Destinos" en el menú: los seis destinos viven en el inicio,
              con su foto y su conteo, que es donde se eligen mirando. Un
              desplegable de texto en la cabecera repetía esa navegación en su
              peor forma y alargaba el menú en el teléfono. */}
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

        <MobileNav locale={locale} alternate={alternate} />
      </div>
    </header>
  );
}
