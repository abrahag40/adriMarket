/**
 * Dirección pública del sitio.
 *
 * Se usa para construir las URLs absolutas de canonical y hreflang. Google
 * ignora hreflang cuando es relativo, y con él se va el tráfico orgánico en
 * inglés — que es justo el que evita pagar comisión a un intermediario.
 *
 * Las URLs absolutas se arman aquí en lugar de declarar metadataBase y dejar
 * que Next resuelva rutas relativas. Las dos vías funcionan; esta se eligió
 * porque lo que se escribe es exactamente lo que sale en el HTML, y eso es
 * comprobable desde fuera — scripts/smoke.sh exige el origen en cada hreflang.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
