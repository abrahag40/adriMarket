"use server";

import { headers } from "next/headers";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { requestLoginLink } from "@/modules/identity/auth";
import { absoluteUrl } from "@/site";

/**
 * Solicitud de enlace de acceso · S4-1
 *
 * Responde lo mismo exista o no el correo. Distinguir los dos casos convertiría
 * la pantalla en una forma de averiguar quién trabaja aquí.
 *
 * El enlace se manda por la bandeja de salida, igual que las confirmaciones: si
 * el proveedor de correo está caído, se reintenta en lugar de perderse.
 */
export async function requestAccess(
  _previous: { sent: boolean },
  form: FormData,
): Promise<{ sent: boolean }> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { sent: true };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const link = await requestLoginLink(email, ip);

  if (link) {
    await db.execute(sql`
      insert into outbox (channel, template, locale, to_address, payload, dedupe_key)
      values ('email', 'staff_login_link', 'es', ${email},
              ${JSON.stringify({
                url: absoluteUrl(`/admin/entrar/${link.token}`),
                rendered: {
                  subject: "Tu acceso al panel de adriMarket",
                  text:
                    `Entra al panel con este enlace, válido 15 minutos y de un solo uso:\n\n` +
                    `${absoluteUrl(`/admin/entrar/${link.token}`)}\n\n` +
                    `Si no lo pediste, ignora este correo.`,
                },
              })}::jsonb,
              ${`staff-login:${link.staffId}:${Date.now()}`})
    `);
  }

  return { sent: true };
}
