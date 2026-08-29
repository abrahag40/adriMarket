import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import type { ReactNode } from "react";

import "../globals.css";
import { LOCALES, alternateForPathname, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { listLocations } from "@/modules/catalog/queries";
import { absoluteUrl } from "@/site";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

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
  const requestHeaders = await headers();
  const alternate = alternateForPathname(
    locale,
    requestHeaders.get("x-pathname") ?? `/${locale}`,
  );
  const locations = await listLocations();

  return (
    <html lang={locale} className={`${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <body>
        <a className="skip" href="#content">
          {t.skipToContent}
        </a>

        <SiteHeader locale={locale} locations={locations} alternate={alternate} />

        <main id="content" className="wrap">
          {children}
        </main>

        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
