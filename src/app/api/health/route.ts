import { sql } from "drizzle-orm";

import { db } from "@/db/index";

/**
 * Salud del sistema · S7-3
 *
 * No es un `{"ok": true}` que siempre responde lo mismo. Un chequeo que no puede
 * fallar no informa de nada, y su único efecto es que el monitoreo esté en verde
 * mientras el negocio está parado.
 *
 * Comprueba las cuatro cosas cuya falla se traduce en dinero, y cada una tiene
 * un umbral escogido por lo que significa operativamente:
 *
 * - **La base responde.** Sin ella no hay nada.
 * - **El worker está corriendo.** Si dejó de latir, los apartados no expiran
 *   —inventario bloqueado que nadie puede comprar— y los avisos no salen.
 * - **No hay avisos muertos.** Un aviso agotado es un huésped que no supo de su
 *   reserva. Nadie se entera si no se mira.
 * - **No hay reembolsos pendientes atorados.** Es dinero que se prometió
 *   devolver y no salió.
 * - **Hay a quién avisarle de una reserva nueva.** Es configuración, no
 *   operación, y por eso se comprueba aquí: sin ella nada da error, solo deja
 *   de pasar. Igual que el cron del latido.
 *
 * Responde 200 cuando todo está bien y **503 cuando algo lo está**, porque es lo
 * que un monitor entiende sin configurarle reglas. El detalle va en el cuerpo
 * para que quien lo abra sepa qué revisar sin entrar a la base.
 *
 * No lleva secreto: no expone datos de nadie, solo conteos, y un monitoreo que
 * necesita credenciales es un monitoreo que alguien va a desconectar.
 */
export const dynamic = "force-dynamic";

/** Minutos sin latido a partir de los cuales el worker se considera caído. */
const HEARTBEAT_MINUTES = 10;

type Check = { ok: boolean; detail: string };

export async function GET() {
  const checks: Record<string, Check> = {};

  // 1. La base.
  try {
    await db.execute(sql`select 1`);
    checks.database = { ok: true, detail: "responde" };
  } catch (error) {
    return Response.json(
      {
        status: "down",
        checks: {
          database: {
            ok: false,
            detail: error instanceof Error ? error.message : "sin conexión",
          },
        },
      },
      { status: 503 },
    );
  }

  const rows = await db.execute<{
    ultimo_latido: string | null;
    minutos_sin_latido: number | null;
    avisos_muertos: number;
    avisos_atrasados: number;
    reembolsos_atorados: number;
    apartados_vencidos: number;
    fotos_falladas: number;
    correo_admin: string | null;
  }>(sql`
    select
      (select max(created_at)::text from audit_log where action = 'job.tick') as ultimo_latido,
      (select extract(epoch from (now() - max(created_at))) / 60
         from audit_log where action = 'job.tick')::int as minutos_sin_latido,
      (select count(*)::int from outbox where status = 'dead') as avisos_muertos,
      -- Pendientes cuya hora de intento ya pasó hace rato: la cola no avanza.
      (select count(*)::int from outbox
        where status in ('pending', 'failed') and next_attempt_at < now() - interval '15 minutes')
        as avisos_atrasados,
      (select count(*)::int from refunds
        where status = 'pending' and created_at < now() - interval '24 hours')
        as reembolsos_atorados,
      -- Apartados que ya vencieron y siguen ocupando inventario.
      (select count(*)::int from bookings
        where status = 'hold' and deposit_due_at < now() - interval '5 minutes')
        as apartados_vencidos,
      (select count(*)::int from media_jobs where status = 'failed') as fotos_falladas,
      -- Configuración, no operación: sin esto nadie recibe el aviso de
      -- reserva nueva. Antes se manifestaba como un aviso muerto por cada
      -- reserva —el síntoma más caro de leer, porque parece falla de
      -- entrega y es un ajuste que nunca se cargó.
      (select nullif(trim(value ->> 'admin_email'), '')
         from settings where key = 'notifications') as correo_admin
  `);

  const row = rows[0]!;
  const minutos = row.minutos_sin_latido;

  checks.worker = {
    // Nunca haber latido también es una falla: significa que el cron no se
    // configuró, que es justo el error que se comete el día del despliegue.
    ok: minutos !== null && minutos <= HEARTBEAT_MINUTES,
    detail:
      minutos === null
        ? "nunca ha latido: falta configurar el cron"
        : `último latido hace ${minutos} min`,
  };

  checks.notifications = {
    ok: row.avisos_muertos === 0 && row.avisos_atrasados === 0,
    detail: `${row.avisos_muertos} muertos, ${row.avisos_atrasados} atrasados`,
  };

  checks.refunds = {
    ok: row.reembolsos_atorados === 0,
    detail: `${row.reembolsos_atorados} sin procesar por más de 24 h`,
  };

  checks.inventory = {
    ok: row.apartados_vencidos === 0,
    detail: `${row.apartados_vencidos} apartados vencidos sin liberar`,
  };

  checks.media = {
    ok: row.fotos_falladas === 0,
    detail: `${row.fotos_falladas} fotos sin procesar`,
  };

  checks.config = {
    ok: row.correo_admin !== null,
    detail:
      row.correo_admin === null
        ? "falta settings.notifications.admin_email: nadie se entera de una reserva nueva"
        : "correo de administración configurado",
  };

  const healthy = Object.values(checks).every((check) => check.ok);

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      checked_at: new Date().toISOString(),
      checks,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
