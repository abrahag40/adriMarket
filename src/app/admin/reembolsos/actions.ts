"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { RefundError, settleRefund } from "@/modules/booking/refunds";
import { requireStaff } from "@/modules/identity/session";

export type ActionState = { error: string | null; ok: string | null };

const METHODS = ["cash", "card", "transfer", "spei", "oxxo", "other"] as const;
type Method = (typeof METHODS)[number];

/**
 * Registrar una devolución que ya se pagó fuera del sistema.
 *
 * **Exige gerencia.** Recepción ve la lista y sabe qué falta, pero decir "el
 * dinero salió" es una afirmación sobre el mundo con consecuencias contables, y
 * quien la firma no debería ser la misma persona que canceló la reserva. La
 * jerarquía de roles ya existía; aquí solo se usa.
 *
 * El servidor pone la fecha y el autor. Del formulario solo se lee qué se hizo,
 * nunca quién ni cuándo: eso ya se sabe sin preguntarlo, y preguntarlo sería
 * dejar que se conteste mal.
 */
export async function registerRefund(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const staff = await requireStaff("manager");

  const refundId = String(form.get("refundId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(refundId)) {
    return { error: "No se identificó la devolución.", ok: null };
  }

  const method = String(form.get("method") ?? "");
  if (!METHODS.includes(method as Method)) {
    return { error: "Elige cómo se devolvió el dinero.", ok: null };
  }

  const providerRef = String(form.get("providerRef") ?? "").trim() || null;
  const notes = String(form.get("notes") ?? "").trim() || null;

  // Una transferencia sin referencia no se puede localizar en el banco después,
  // y localizarla es justamente para lo que sirve registrarla.
  if ((method === "transfer" || method === "spei") && !providerRef) {
    return {
      error: "Una transferencia necesita su clave de rastreo o folio para poder localizarla.",
      ok: null,
    };
  }

  const file = form.get("receipt");
  const receipt =
    file instanceof File && file.size > 0
      ? { name: file.name, mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) }
      : null;

  try {
    await settleRefund({
      refundId,
      method: method as Method,
      providerRef,
      notes,
      staffId: staff.id,
      receipt,
    });

    await db.execute(sql`
      select audit_record(${staff.id}::uuid, 'refund.settle', 'refund', ${refundId},
                          null, ${JSON.stringify({ method, providerRef, receipt: receipt !== null })}::jsonb)
    `);

    revalidatePath("/admin/reembolsos");
    return { error: null, ok: "Devolución registrada." };
  } catch (error: unknown) {
    if (error instanceof RefundError) return { error: error.message, ok: null };
    throw error;
  }
}
