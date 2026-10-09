"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { alternateForPathname, otherLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/**
 * El enlace "Ver en inglés / Ver en español", decidido **desde el cliente**.
 *
 * Es la misma lección que `NavLinks` (decisión 0018), aplicada al único sitio
 * donde se había dejado fuera a propósito: el layout calculaba este enlace con
 * `x-pathname` de las cabeceras, con un comentario que decía que "sí es cosa
 * del servidor porque depende de la ruta y no cambia con la búsqueda". Las dos
 * mitades eran falsas:
 *
 *   · Un layout no se vuelve a renderizar en una navegación de cliente, así
 *     que el enlace se congelaba en la página por la que se entró. Entrabas
 *     por el inicio, navegabas a Estancias, y "Ver en inglés" seguía apuntando
 *     a `/en`: **la portada**.
 *   · Y sí cambia con la búsqueda: `/es?kind=tour` tiene que ir a
 *     `/en?kind=tour`. Sin los parámetros, `/en` es literalmente el inicio.
 *     Mismo defecto que la decisión 0017, por otra puerta.
 *
 * `usePathname` y `useSearchParams` se actualizan en cada navegación. El
 * segmento se traduce como siempre (`estancias` ↔ `stays`) y los parámetros
 * viajan tal cual: ninguno depende del idioma.
 */
export function LangSwitch({ locale, className }: { locale: Locale; className?: string }) {
  const t = getMessages(locale);
  const other = otherLocale(locale);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  const href = `${alternateForPathname(locale, pathname)}${search ? `?${search}` : ""}`;

  return (
    <Link className={className} href={href} hrefLang={other} lang={other}>
      {t.switchLanguage}
    </Link>
  );
}
