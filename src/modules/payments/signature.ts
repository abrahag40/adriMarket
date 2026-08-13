import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma de webhooks.
 *
 * Es el mismo esquema que usa Stripe: la cabecera lleva una marca de tiempo y
 * uno o más digests, y se firma la concatenación `<t>.<cuerpo>`. Se implementa
 * aquí en lugar de delegarlo a una librería por dos motivos: se puede probar con
 * vectores propios sin cuenta de proveedor, y el proveedor local lo reutiliza,
 * así que el camino del webhook queda ejercitado de verdad.
 *
 *   t=1700000000,v1=<hex>
 *
 * Tres cosas que esta función tiene que hacer bien, y por las que existe en
 * lugar de una comparación de cadenas suelta:
 *
 * 1. **Comparar en tiempo constante.** Una comparación normal filtra, por el
 *    tiempo que tarda, cuántos caracteres del digest coincidían.
 * 2. **Rechazar lo viejo.** Sin ventana de tolerancia, un webhook legítimo
 *    capturado hoy sirve para siempre.
 * 3. **Firmar el cuerpo crudo.** Si se firma el JSON re-serializado, cualquier
 *    diferencia de formato invalida firmas buenas.
 */

const DEFAULT_TOLERANCE_SECONDS = 300;

export function signPayload(rawBody: string, secret: string, timestamp: number): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function parseHeader(header: string): { timestamp: number | null; digests: string[] } {
  let timestamp: number | null = null;
  const digests: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "t" && value) {
      const parsed = Number.parseInt(value, 10);
      timestamp = Number.isFinite(parsed) ? parsed : null;
    }
    // Se aceptan varios v1: es lo que permite rotar el secreto sin cortar el
    // servicio, porque el proveedor firma con el viejo y el nuevo a la vez.
    if (key === "v1" && value) digests.push(value);
  }

  return { timestamp, digests };
}

function equalsConstantTime(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  options: { now?: Date; toleranceSeconds?: number } = {},
): boolean {
  if (!signatureHeader || !secret) return false;

  const { timestamp, digests } = parseHeader(signatureHeader);
  if (timestamp === null || digests.length === 0) return false;

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(nowSeconds - timestamp) > tolerance) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return digests.some((digest) => equalsConstantTime(digest, expected));
}
