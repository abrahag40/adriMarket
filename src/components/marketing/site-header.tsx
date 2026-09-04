import Link from "next/link";

import { otherLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

import { CurrencyBadge } from "./currency-badge";
import { MobileNav } from "./mobile-nav";

/**
 * Cabecera del sitio: marca, menú horizontal con un submenú desplegable de
 * destinos, insignia de moneda y acceso al panel. El submenú también es
 * `<details>/<summary>`, igual que `MobileNav` — mismo patrón sin JavaScript.
 */
export function SiteHeader({
  locale,
  alternate,
  currentPath,
}: {
  locale: Locale;
  alternate: string;
  currentPath: string;
}) {
  const t = getMessages(locale);
  const other = otherLocale(locale);
  // `aria-current="page"` marca el enlace activo en oscuro con su punto
  // permanente — lo mismo que la referencia resuelve con JavaScript según la
  // ruta. La comparación es exacta a propósito: "Inicio", "Tours" y
  // "Estancias" comparten el mismo `pathname` y solo se distinguen por
  // `?kind=`, así que un `startsWith` marcaría los tres a la vez.
  const isActive = (href: string) => href === currentPath;

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

        <MobileNav locale={locale} alternate={alternate} currentPath={currentPath} />
      </div>
    </header>
  );
}
