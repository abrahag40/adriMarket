import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import type { ReactNode } from "react";

import "../globals.css";
import { LOCALES, alternateForPathname, isLocale, otherLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { absoluteUrl } from "@/site";

/**
 * Este es el layout raíz de la aplicación: no existe app/layout.tsx porque
 * toda ruta pública lleva prefijo de idioma, y el atributo lang del documento
 * tiene que reflejarlo. Un lang incorrecto afecta a los lectores de pantalla y
 * a los buscadores.
 *
 * `next/font` descarga las fuentes una vez, al construir, y las sirve desde
 * el propio dominio: cero petición a Google en cada visita, y funciona igual
 * en la conexión de un hotel del Caribe que sin internet fuera del sitio.
 */

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif-display",
  display: "swap",
});

export async function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getMessages(locale);

  return {
    title: { default: `${t.siteName} · ${t.tagline}`, template: `%s · ${t.siteName}` },
    description: t.tagline,
    alternates: {
      canonical: absoluteUrl(`/${locale}`),
      languages: { es: absoluteUrl("/es"), en: absoluteUrl("/en") },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const other = otherLocale(locale);
  const requestHeaders = await headers();
  const alternate = alternateForPathname(
    locale,
    requestHeaders.get("x-pathname") ?? `/${locale}`,
  );

  return (
    <html lang={locale} className={`${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <body>
        <a className="skip" href="#content">
          {t.skipToContent}
        </a>

        <header className="site-header">
          <div className="wrap site-header-inner">
            <Link className="brand" href={`/${locale}`}>
              <span className="brand-name">{t.siteName}</span>
              <span className="brand-tagline">{t.tagline}</span>
            </Link>
            {/* El cambio de idioma es un enlace, no un control con JavaScript:
                cambia la URL porque cambia el documento. */}
            <Link className="lang-switch" href={alternate} hrefLang={other} lang={other}>
              {t.switchLanguage}
            </Link>
          </div>
        </header>

        <main id="content" className="wrap">
          {children}
        </main>

        <footer className="site-footer">
          <div className="wrap">
            {t.siteName} · {t.tagline}
          </div>
        </footer>
      </body>
    </html>
  );
}
