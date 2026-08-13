import { expireHolds } from "@/modules/availability/holds";
import { processOutbox } from "@/modules/notifications/send";

/**
 * Latido del worker · S3-5
 *
 * Un solo punto de entrada que hace las dos tareas periódicas: liberar
 * apartados vencidos y despachar la bandeja de salida. En producción lo llama un
 * cron cada minuto; en desarrollo se llama a mano con curl.
 *
 * Está protegido por un secreto compartido en cabecera. Sin él, cualquiera
 * podría disparar el worker a voluntad — no es catastrófico, pero es carga
 * gratuita contra la base y una forma de averiguar cuántas reservas expiran.
 *
 * Las dos funciones son seguras si se ejecutan a la vez que otra copia de sí
 * mismas: la de expiración usa `for update skip locked` y la bandeja también.
 */
export async function POST(request: Request) {
  const secret = process.env.JOBS_SECRET;
  if (!secret || request.headers.get("x-job-secret") !== secret) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const expired = await expireHolds();
  const outbox = await processOutbox();

  return Response.json({ expired, outbox });
}
