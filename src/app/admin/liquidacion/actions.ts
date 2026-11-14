"use server";

import { revalidatePath } from "next/cache";

import { PayoutError, recordPayout, type PayoutMethod } from "@/modules/booking/payouts";
import { requireStaff } from "@/modules/identity/session";

export type ActionState = { error: string | null; ok: string | null };

const METHODS: readonly PayoutMethod[] = ["spei", "transfer", "cash", "other"];

/**
 * Registrar que ya se le transfirió al proveedor lo de una reserva.
 *
 * **Exige gerencia**, como las devoluciones: decir "el dinero salió" es una
 * afirmación contable. Del formulario sólo se lee cómo, cuándo y con qué
 * referencia; **el monto no viaja** —lo pone la base, es lo que se congeló al
 * reservar— y el autor lo pone el servidor.
 */
export async function registerPayout(_previous: ActionState, form: FormData): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const bookingId = String(form.get("bookingId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return { error: "No se identificó la reserva.", ok: null };
  }

  const method = String(form.get("method") ?? "");
  if (!METHODS.includes(method as PayoutMethod)) {
    return { error: "Elige cómo se le pagó.", ok: null };
  }

  const paidOn = String(form.get("paidOn") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return { error: "Escribe la fecha de la transferencia.", ok: null };
  }

  // Sin referencia no se puede localizar en el banco después, y localizarla es
  // justamente para lo que sirve registrarla. La base lo exige igual.
  const reference = String(form.get("reference") ?? "").trim();
  if (!reference) {
    return { error: "Escribe la clave de rastreo o el folio: es con lo que se localiza en el banco.", ok: null };
  }

  const notes = String(form.get("notes") ?? "").trim() || null;

  try {
    await recordPayout({ bookingId, paidOn, method: method as PayoutMethod, reference, notes, staffId: staff.id });
    revalidatePath("/admin/liquidacion");
    return { error: null, ok: "Transferencia registrada." };
  } catch (error: unknown) {
    if (error instanceof PayoutError) return { error: error.message, ok: null };
    throw error;
  }
}
