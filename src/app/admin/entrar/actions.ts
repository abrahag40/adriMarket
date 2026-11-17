"use server";

import { brand } from "@/brand";
import { headers } from "next/headers";
import { after } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { requestLoginLink } from "@/modules/identity/auth";
import { processOutbox } from "@/modules/notifications/send";
import { absoluteUrl } from "@/site";

/**
 * Solicitud de enlace de acceso · S4-1
 *
 * Responde lo mismo exista o no el correo. Distinguir los dos casos convertiría
 * la pantalla en una forma de averiguar quién trabaja aquí.
 *
 * El enlace se manda por la bandeja de salida, igual que las confirmaciones: si
 * el proveedor de correo está caído, se reintenta en lugar de perderse.
 *
 * **Y se manda en el acto, no en el siguiente latido.** El enlace caduca en 15
 * minutos y el latido corre cada 15 (decisión 0020): esperándolo, podía llegar
 * ya vencido. Pasó el 2026-11-15 con la primera cuenta del cliente, y hubo que
 * relanzar el latido a mano para que le llegara.
 *
 * El envío va en `after()`, después de responder, y no antes del `return`: si
 * la respuesta tardara lo que tarda el correo solo cuando la cuenta existe, el
 * tiempo de respuesta delataría quién es del equipo, que es justo lo que el
 * mensaje idéntico de arriba evita.
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
    const encolado = await db.execute<{ id: string }>(sql`
      insert into outbox (channel, template, locale, to_address, payload, dedupe_key)
      values ('email', 'staff_login_link', 'es', ${email},
              ${JSON.stringify({
                url: absoluteUrl(`/admin/entrar/${link.token}`),
                rendered: {
                  subject: `Tu acceso al panel de ${brand().name}`,
                  text:
                    `Entra al panel con este enlace, válido 15 minutos y de un solo uso:\n\n` +
                    `${absoluteUrl(`/admin/entrar/${link.token}`)}\n\n` +
                    `Si no lo pediste, ignora este correo.`,
                },
              })}::jsonb,
              ${`staff-login:${link.staffId}:${Date.now()}`})
      returning id
    `);

    const id = encolado[0]?.id;
    if (id) {
      after(async () => {
        // Un fallo aquí no se pierde: el aviso sigue en la bandeja y el latido
        // lo reintenta. Solo se deja constancia en el log.
        try {
          await processOutbox(1, { id });
        } catch (error) {
          console.error("[acceso] el envío inmediato del enlace falló; queda para el latido", error);
        }
      });
    }
  }

  return { sent: true };
}
