import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, redeemLoginToken } from "@/modules/identity/auth";

/**
 * Canje del enlace de acceso.
 *
 * Es una ruta y no una página porque su único trabajo es poner la cookie y
 * redirigir: no hay nada que renderizar y así el token no queda en el historial
 * de una página que se pueda recargar.
 *
 * La redirección lleva `Location` **relativo**, y no una URL absoluta armada con
 * `request.url`. No es un detalle de estilo: detrás de un proxy —o simplemente
 * entrando por 127.0.0.1 en vez de localhost— la URL absoluta puede salir con
 * otro host, y una cookie puesta en un host no viaja al otro. El síntoma es
 * exactamente el que se vio al ejecutarlo: el enlace "funciona", pero el panel
 * vuelve a pedir acceso. Con `Location` relativo el navegador se queda donde
 * estaba y la sesión sobrevive.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await redeemLoginToken(token, {
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  if (!session) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/admin/entrar?vencido=1" },
    });
  }

  // 303 y no 307: el navegador debe pedir el panel con GET, y el enlace no debe
  // quedar como algo repetible en el historial.
  const response = new NextResponse(null, { status: 303, headers: { Location: "/admin" } });

  response.cookies.set(SESSION_COOKIE, session.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    // En producción va solo por HTTPS. En desarrollo local no hay TLS.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });

  return response;
}
