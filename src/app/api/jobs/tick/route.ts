import { expireHolds } from "@/modules/availability/holds";
import { enqueueReminders, processOutbox } from "@/modules/notifications/send";

/**
 * Latido del worker · S3-5
 *
 * Un solo punto de entrada que hace las tres tareas periódicas: liberar
 * apartados vencidos, encolar los recordatorios que ya entraron en su ventana y
 * despachar la bandeja de salida. En producción lo llama un cron cada minuto; en
 * desarrollo se llama a mano con curl.
 *
 * El orden importa: los recordatorios se encolan **antes** de despachar, así
 * salen en el mismo latido en vez de esperar al siguiente.
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
  const reminders = await enqueueReminders();
  const outbox = await processOutbox();

  return Response.json({ expired, reminders, outbox });
}
