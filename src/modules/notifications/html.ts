import { render } from "@react-email/render";

import { BookingConfirmedEmail } from "./emails/booking-confirmed";
import type { BookingNotification } from "./templates";

/**
 * Versión HTML de los avisos · post-Sprint 7
 *
 * **El texto plano manda.** Aquí solo se produce la mitad bonita de un correo
 * multiparte: si esta función devuelve `null`, el aviso sale igual, con todos
 * sus datos, y nadie se queda sin enterarse. Esa es la razón de que devuelva
 * `null` en lugar de lanzar: **un diseño roto no puede convertirse en una
 * reserva sin confirmar.**
 *
 * Por eso también se envuelve en `try`: `render` ejecuta un árbol de React, y
 * un fallo ahí —una fecha inválida, un campo que llegó como no se esperaba— no
 * tiene por qué costarle a nadie su confirmación.
 *
 * Hoy solo la confirmación al huésped tiene diseño. Las demás —aviso a la
 * administración, cancelación, recordatorio— siguen en texto plano, que para
 * lo que hacen está bien: la primera la lee quien opera, y las otras dos se
 * leen de una pasada.
 */
export async function renderHtml(
  template: string,
  data: BookingNotification,
): Promise<string | null> {
  if (template !== "booking_confirmed_guest") return null;

  try {
    return await render(BookingConfirmedEmail({ data }));
  } catch (error) {
    // No se re-lanza: el texto plano ya va en el mismo mensaje.
    console.error(
      `no se pudo renderizar el HTML de ${template}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
