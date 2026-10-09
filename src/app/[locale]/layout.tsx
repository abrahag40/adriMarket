import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import type { ReactNode } from "react";

import "../globals.css";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
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
  // Aquí ya no se decide nada que dependa de la URL. En el App Router un
  // layout no se vuelve a renderizar en una navegación de cliente, así que
  // cualquier valor sacado de `x-pathname`/`x-search` se congela en el primer
  // render. Pasó dos veces: primero con el enlace activo del menú (decisión
  // 0018) y después con el enlace de idioma, que se había dejado aquí con un
  // comentario que afirmaba que "sí es cosa del servidor". No lo era: entrabas
  // por el inicio, navegabas a Estancias, y "Ver en inglés" seguía apuntando
  // a `/en` — la portada. Los dos viven ahora en componentes de cliente
  // (`NavLinks`, `LangSwitch`) con `usePathname` y `useSearchParams`.

  return (
    <html lang={locale} className={`${dmSans.variable} ${dmSerifDisplay.variable}`}>
      <body>
        <a className="skip" href="#content">
          {t.skipToContent}
        </a>

        <SiteHeader locale={locale} />

        <main id="content" className="wrap">
          {children}
        </main>

        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
