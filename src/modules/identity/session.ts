import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, hasRole, staffFromSession, type StaffRole, type StaffUser } from "./auth";

/**
 * Guardas del panel.
 *
 * `requireStaff` se llama en cada página y en cada acción del panel, no una sola
 * vez en un layout. Un layout no protege una acción del servidor: la acción se
 * invoca directamente y no pasa por él.
 */

export async function currentStaff(): Promise<StaffUser | null> {
  const jar = await cookies();
  return staffFromSession(jar.get(SESSION_COOKIE)?.value);
}

export async function requireStaff(minimum: StaffRole = "guide"): Promise<StaffUser> {
  const user = await currentStaff();
  if (!user) redirect("/admin/entrar");

  if (!hasRole(user, minimum)) {
    // Sin permiso no se manda al inicio de sesión: ya está identificado, lo que
    // falta es autorización. Confundirlos hace que la gente crea que su sesión
    // se cayó y vuelva a entrar una y otra vez.
    redirect("/admin?sin_permiso=1");
  }

  return user;
}
