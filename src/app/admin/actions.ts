"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
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
