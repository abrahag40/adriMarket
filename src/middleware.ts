import { NextResponse, type NextRequest } from "next/server";

import { LOCALES, negotiateLocale } from "@/i18n/config";

/**
 * Toda ruta pública vive bajo un prefijo de idioma. Este middleware solo
 * resuelve la entrada sin prefijo: manda al visitante a la versión que su
 * navegador prefiere.
 *
 * Es una redirección 307 y no 308 a propósito: la preferencia de idioma del
 * visitante puede cambiar, y no queremos que quede cacheada de forma permanente
 * en su navegador.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (hasLocale) {
    // Los layouts no reciben la ruta actual, y el selector de idioma la
    // necesita para llevar al visitante a la misma página en el otro idioma.
    const headers = new Headers(request.headers);
    headers.set("x-pathname", pathname);
    headers.set("x-search", request.nextUrl.search);
    return NextResponse.next({ request: { headers } });
  }

  const locale = negotiateLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Se excluyen recursos estáticos y de sistema: no tienen idioma.
  //
  // `api` es la exclusión que importa y la que faltaba: sin ella, el webhook de
  // la pasarela recibe un 307 hacia /es/api/... y la reserva nunca se confirma.
  // Un proveedor de pagos no sigue redirecciones ni firma la URL nueva.
  matcher: ["/((?!api|_next|media|favicon.ico|robots.txt|sitemap.xml).*)"],
};
