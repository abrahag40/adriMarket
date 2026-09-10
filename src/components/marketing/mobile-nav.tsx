import Link from "next/link";
import { Suspense } from "react";

import { otherLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

import { NavLinks } from "./nav-links";

/**
 * Panel móvil con `<details>/<summary>`: el navegador ya sabe abrir y cerrar
 * un disclosure con teclado y con toque, así que no hace falta JavaScript ni
 * estado propio para el menú de la cabecera en pantallas angostas.
 */
export function MobileNav({
  locale,
  alternate,
}: {
  locale: Locale;
  alternate: string;
}) {
  const t = getMessages(locale);
  const other = otherLocale(locale);

  return (
    <details className="mobile-nav">
      <summary className="mobile-nav-toggle" aria-label={t.navMenuOpen}>
        <span className="mobile-nav-bar" />
        <span className="mobile-nav-bar" />
        <span className="mobile-nav-bar" />
      </summary>
      <nav className="mobile-nav-panel" aria-label={t.navTours}>
        {/* Los mismos enlaces que el menú de escritorio, y por la misma
            razón: el activo se decide en el cliente. Aquí el defecto era peor,
            porque comparaba la cadena entera —`/es?kind=stay&location=&guests=`
            no coincide con `/es?kind=stay`—, así que ni siquiera en la primera
            carga marcaba bien lo que venía del buscador. */}
        <Suspense fallback={null}>
          <NavLinks locale={locale} />
        </Suspense>


        <Link href={alternate} hrefLang={other} lang={other}>
          {t.switchLanguage}
        </Link>
        <Link href="/admin/entrar">{t.navPanel}</Link>
      </nav>
    </details>
  );
}
