import Link from "next/link";
import { headers } from "next/headers";

import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/**
 * 404 dentro del árbol de idioma.
 *
 * Se llega aquí por tres caminos y todos son legítimos: URL inventada, producto
 * despublicado, o producto sin traducción al idioma pedido. El visitante no
 * necesita saber cuál fue; necesita una salida.
 *
 * El idioma se saca de la ruta porque este componente no recibe params.
 */
function localeFromPathname(pathname: string): Locale {
  const first = pathname.split("/").filter(Boolean)[0];
  return first !== undefined && isLocale(first) ? first : DEFAULT_LOCALE;
}

export default async function NotFound() {
  const requestHeaders = await headers();
  const locale = localeFromPathname(requestHeaders.get("x-pathname") ?? "");
  const t = getMessages(locale);

  return (
    <div className="empty">
      <h1 className="page-title">
        {locale === "es" ? "No encontramos esa página" : "We couldn't find that page"}
      </h1>
      <p className="muted">
        {locale === "es"
          ? "Puede que el enlace haya cambiado o que ese producto ya no esté disponible."
          : "The link may have changed, or that listing may no longer be available."}
      </p>
      <Link className="btn" href={`/${locale}`}>
        {t.siteName}
      </Link>
    </div>
  );
}
