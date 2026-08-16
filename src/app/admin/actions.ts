"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { formatMoney } from "@/i18n/config";
import { cancelBooking, cancelDeparture } from "@/modules/booking/cancel";
import { rescheduleStay, rescheduleTour } from "@/modules/booking/reschedule";
import { SESSION_COOKIE, revokeSession } from "@/modules/identity/auth";
import { requireStaff } from "@/modules/identity/session";

/**
 * Acciones del panel · S4-4 y S4-5
 *
 * Cada una vuelve a preguntar quién la pide. **Ocultar un botón no es un
 * permiso**: la acción del servidor se puede invocar directamente, sin pasar por
 * la página que lo ocultaba.
 */

export type ActionState = { error: string | null; ok: string | null };

/**
 * Texto de un error, recorriendo la cadena de causas.
 *
 * Igual que en el módulo de inventario: drizzle envuelve la excepción del
 * driver, así que el mensaje de Postgres no está en el error que se atrapa.
 */
function describe(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (typeof current === "object") {
      const candidate = current as { message?: unknown; code?: unknown; cause?: unknown };
      if (typeof candidate.message === "string") parts.push(candidate.message);
      if (typeof candidate.code === "string") parts.push(candidate.code);
      current = candidate.cause;
    } else {
      parts.push(String(current));
      current = null;
    }
  }
  return parts.join(" | ");
}

/**
 * Cerrar sesión.
 *
 * Se revoca en la base **antes** de borrar la cookie. Al revés, quien tuviera
 * copiada la cookie seguiría entrando: borrar la copia del cliente no cancela
 * nada del lado del servidor.
 */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  await revokeSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/admin/entrar");
}

/** Cobro del saldo en destino. Recepción puede hacerlo; un guía no. */
export async function collectBalance(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("front_desk");

  const code = String(form.get("code") ?? "").toUpperCase();
  const method = String(form.get("method") ?? "cash");
  if (!["cash", "card", "transfer", "spei", "other"].includes(method)) {
    return { error: "Forma de pago no válida.", ok: null };
  }

  try {
    const rows = await db.execute<{ amount: string }>(sql`
      select booking_collect_balance(
        (select id from bookings where code = ${code}),
        ${staff.id}::uuid,
        ${method}::payment_method
      )::text as amount
    `);
    revalidatePath(`/admin/reservas/${code}`);
    revalidatePath("/admin/reservas");
    return { error: null, ok: `Saldo cobrado: ${rows[0]?.amount ?? "0"} centavos.` };
  } catch (error: unknown) {
    // Un error de dominio aquí es información para quien está en el mostrador,
    // no una falla: se le dice qué pasó.
    const message = describe(error);
    if (message.includes("saldo pendiente")) {
      return { error: "Esta reserva no tiene saldo pendiente.", ok: null };
    }
    if (message.includes("estado")) {
      return { error: "La reserva no está en un estado que permita cobrar.", ok: null };
    }
    if (message.includes("parcial")) {
      return { error: "El cobro parcial todavía no está soportado.", ok: null };
    }
    throw error;
  }
}

/** Bloqueo manual de una unidad: mantenimiento, uso del propietario u otro. */
export async function createBlock(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("front_desk");

  const unitId = String(form.get("unitId") ?? "");
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const reason = String(form.get("reason") ?? "maintenance");
  const note = String(form.get("note") ?? "").trim() || null;

  if (!/^[0-9a-f-]{36}$/i.test(unitId)) return { error: "Elige una unidad.", ok: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: "Faltan las fechas.", ok: null };
  }
  if (from >= to) return { error: "La fecha de fin debe ser posterior al inicio.", ok: null };
  if (!["maintenance", "owner_use", "other"].includes(reason)) {
    return { error: "Motivo no válido.", ok: null };
  }

  try {
    await db.execute(sql`
      insert into stay_blocks (unit_id, stay, reason, note, created_by)
      values (${unitId}::uuid, daterange(${from}, ${to}), ${reason}::block_reason,
              ${note}, ${staff.id}::uuid)
    `);
  } catch (error: unknown) {
    // La restricción de exclusión es la misma que impide sobrevender: si esas
    // noches ya están ocupadas, no se puede bloquear encima. Es la garantía del
    // Sprint 0 protegiendo también a la operación de sí misma.
    const message = describe(error);
    if (
      message.includes("exclusion") ||
      message.includes("stay_blocks_no_overlap") ||
      message.includes("23P01")
    ) {
      return { error: "Esas noches ya están ocupadas por una reserva u otro bloqueo.", ok: null };
    }
    throw error;
  }

  revalidatePath("/admin/bloqueos");
  revalidatePath("/admin/calendario");
  return { error: null, ok: "Bloqueo creado." };
}

/** Liberar un bloqueo. Liberar es un UPDATE, nunca un DELETE. */
export async function releaseBlock(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireStaff("front_desk");

  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Bloqueo no válido.", ok: null };

  await db.execute(sql`
    update stay_blocks set released_at = now()
     where id = ${id}::uuid
       and released_at is null
       and reason in ('maintenance', 'owner_use', 'other')
  `);

  revalidatePath("/admin/bloqueos");
  revalidatePath("/admin/calendario");
  return { error: null, ok: "Bloqueo liberado." };
}

// ---------------------------------------------------------------------------
// Sprint 5 · cancelar, cancelar salida, reprogramar
// ---------------------------------------------------------------------------

/**
 * Cancelación a solicitud del huésped.
 *
 * Es de gerencia y no de recepción: devuelve dinero. Un cobro mal hecho se
 * corrige; una devolución mal hecha ya salió de la cuenta.
 */
export async function cancelBookingAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const code = String(form.get("code") ?? "").toUpperCase();
  const reason = String(form.get("reason") ?? "").trim();
  const byOperator = String(form.get("byOperator") ?? "") === "1";

  if (reason.length < 3) {
    return { error: "Escribe el motivo: queda en la bitácora de la reserva.", ok: null };
  }

  const rows = await db.execute<{ id: string; currency: string }>(sql`
    select id, currency from bookings where code = ${code}
  `);
  const booking = rows[0];
  if (!booking) return { error: "No se encontró esa reserva.", ok: null };

  try {
    const refund = await cancelBooking({
      bookingId: booking.id,
      reason,
      byOperator,
      staffId: staff.id,
    });
    revalidatePath(`/admin/reservas/${code}`);
    revalidatePath("/admin/reservas");
    return {
      error: null,
      ok:
        refund > 0
          ? `Reserva cancelada. Devolución registrada: ${formatMoney(refund, booking.currency, "es")}.`
          : "Reserva cancelada. Según la política, no corresponde devolución.",
    };
  } catch (error: unknown) {
    const message = describe(error);
    if (message.includes("estado")) {
      return { error: "La reserva no está en un estado que permita cancelar.", ok: null };
    }
    throw error;
  }
}

/**
 * Cancelación de una salida completa: el cierre de puerto.
 *
 * Siempre cuenta como cancelación del operador, sin casilla que lo decida. Si
 * fuera opcional, un día alguien la dejaría sin marcar y se le aplicaría la
 * política de cancelación a dieciocho personas que no cancelaron nada.
 */
export async function cancelDepartureAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const departureId = String(form.get("departureId") ?? "");
  const reason = String(form.get("reason") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(departureId)) return { error: "Salida no válida.", ok: null };
  if (reason.length < 3) {
    return { error: "Escribe el motivo: se lo vamos a decir a cada pasajero.", ok: null };
  }

  const result = await cancelDeparture(departureId, reason, staff.id);

  revalidatePath("/admin/salidas");
  revalidatePath("/admin/reservas");
  return {
    error: null,
    ok:
      result.bookingsCancelled === 0
        ? "La salida quedó cancelada. No había reservas que avisar."
        : `Salida cancelada: ${result.bookingsCancelled} reserva(s) avisadas y devolución total registrada.`,
  };
}

/** Cambio de fecha. Recepción puede hacerlo: no mueve dinero fuera. */
export async function rescheduleAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("front_desk");

  const code = String(form.get("code") ?? "").toUpperCase();
  const kind = String(form.get("kind") ?? "");

  const rows = await db.execute<{ id: string; currency: string }>(sql`
    select id, currency from bookings where code = ${code}
  `);
  const booking = rows[0];
  if (!booking) return { error: "No se encontró esa reserva.", ok: null };

  try {
    const result =
      kind === "tour"
        ? await rescheduleTour(booking.id, String(form.get("departureId") ?? ""), staff.id)
        : await rescheduleStay(
            booking.id,
            { from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") },
            staff.id,
          );

    revalidatePath(`/admin/reservas/${code}`);
    revalidatePath("/admin/calendario");

    if (result.differenceCents === 0) {
      return { error: null, ok: "Reserva movida. El precio no cambió." };
    }
    const diff = formatMoney(Math.abs(result.differenceCents), booking.currency, "es");
    return {
      error: null,
      ok:
        result.differenceCents > 0
          ? `Reserva movida. La tarifa nueva es mayor: ${diff} se suman al saldo en destino.`
          : `Reserva movida. La tarifa nueva es menor: ${diff} se restan del saldo en destino.`,
    };
  } catch (error: unknown) {
    const message = describe(error);
    if (message.includes("AM002") || message.includes("ocupad")) {
      return { error: "Esas noches ya están ocupadas. La reserva quedó como estaba.", ok: null };
    }
    // El motor de precios detecta el cupo agotado antes que la base y lanza su
    // propio error, así que hay que reconocer los dos nombres. Con solo el de la
    // base, el panel respondía con una excepción en vez de una frase.
    if (
      message.includes("AM001") ||
      message.includes("cupo") ||
      message.includes("sold_out")
    ) {
      return { error: "Esa salida ya no tiene lugares. La reserva quedó como estaba.", ok: null };
    }
    if (message.includes("estado")) {
      return { error: "La reserva no está en un estado que permita reprogramar.", ok: null };
    }
    if (message.includes("no está abierta")) {
      return { error: "Esa salida no está abierta.", ok: null };
    }
    throw error;
  }
}
