import { processPaymentWebhook } from "@/modules/booking/webhook";

/**
 * Entrada del webhook de la pasarela.
 *
 * Dos detalles que deciden si esto funciona en producción:
 *
 * 1. **Se lee el cuerpo crudo**, no el JSON parseado. La firma cubre los bytes
 *    exactos; re-serializar el objeto cambia el orden o el espaciado y toda firma
 *    legítima empezaría a fallar.
 * 2. **Solo una firma inválida responde con error.** Todo lo demás responde 200,
 *    incluido un monto que no cuadra: el proveedor reintenta ante un error, y
 *    reintentar no va a arreglar un monto equivocado. Se acepta, se marca para
 *    revisión y se corta el ciclo de reintentos.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const signature =
    request.headers.get("stripe-signature") ?? request.headers.get("x-webhook-signature");

  const outcome = await processPaymentWebhook(rawBody, signature);

  if (outcome.status === "invalid_signature") {
    // No se dice por qué falló: a quien intenta adivinar el secreto no se le
    // regalan pistas.
    return Response.json({ error: "firma inválida" }, { status: 400 });
  }

  return Response.json(outcome, { status: 200 });
}
