import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/db/index";

/**
 * Acceso del staff al panel · S4-1
 *
 * Enlace por correo, sin contraseñas. La decisión y su porqué están en
 * db/migrations/0010_staff_auth.sql.
 *
 * Dos reglas que atraviesan el módulo:
 *
 * - **Solo se guardan hashes.** Ni el enlace de acceso ni el token de sesión
 *   existen en la base en claro; quien lea la base no puede entrar con lo que
 *   encuentre.
 * - **Los permisos se resuelven en el servidor.** Ocultar un botón no es un
 *   permiso: es una sugerencia. Cada acción vuelve a preguntar quién es quien la
 *   pide.
 */

export const SESSION_COOKIE = "adri_staff";
const LOGIN_TTL_MINUTES = 15;
const SESSION_TTL_DAYS = 14;

export type StaffRole = "owner" | "manager" | "front_desk" | "guide";

export type StaffUser = {
  id: string;
  email: string;
  fullName: string;
  role: StaffRole;
};

/**
 * Jerarquía de roles.
 *
 * Un número más alto puede todo lo del número más bajo. Es suficiente para este
 * negocio y evita una tabla de permisos que nadie va a mantener.
 */
const RANK: Record<StaffRole, number> = {
  guide: 1,
  front_desk: 2,
  manager: 3,
  owner: 4,
};

export function hasRole(user: StaffUser, minimum: StaffRole): boolean {
  return RANK[user.role] >= RANK[minimum];
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------
// Enlace de acceso
// ---------------------------------------------------------------------------

export type LoginRequest = { token: string; staffId: string } | null;

/**
 * Genera un enlace de acceso para un correo de staff activo.
 *
 * Devuelve null cuando el correo no corresponde a nadie activo, y **quien llama
 * debe responder lo mismo en ambos casos**: si la pantalla distingue entre
 * "te mandamos el enlace" y "ese correo no existe", se convierte en una forma de
 * averiguar quién trabaja aquí.
 */
export async function requestLoginLink(email: string, ip: string | null): Promise<LoginRequest> {
  const rows = await db.execute<{ id: string }>(sql`
    select id from staff_users where lower(email) = lower(${email}) and active limit 1
  `);
  const staff = rows[0];
  if (!staff) return null;

  const token = newToken();
  await db.execute(sql`
    insert into staff_login_tokens (staff_user_id, token_hash, expires_at, requested_ip)
    values (${staff.id}::uuid, ${hashToken(token)},
            now() + make_interval(mins => ${LOGIN_TTL_MINUTES}), ${ip}::inet)
  `);

  return { token, staffId: staff.id };
}

/**
 * Canjea el enlace por una sesión.
 *
 * El canje es de un solo uso y va en una transacción: dos pestañas abiertas con
 * el mismo enlace no producen dos sesiones.
 */
export async function redeemLoginToken(
  token: string,
  context: { userAgent: string | null; ip: string | null },
): Promise<{ sessionToken: string; user: StaffUser } | null> {
  const hash = hashToken(token);

  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; staff_user_id: string }>(sql`
      update staff_login_tokens
         set used_at = now()
       where token_hash = ${hash}
         and used_at is null
         and expires_at > now()
      returning id, staff_user_id
    `);
    const found = rows[0];
    if (!found) return null;

    const users = await tx.execute<{
      id: string;
      email: string;
      full_name: string;
      role: StaffRole;
    }>(sql`
      select id, email, full_name, role::text as role
        from staff_users where id = ${found.staff_user_id}::uuid and active
    `);
    const user = users[0];
    if (!user) return null;

    const sessionToken = newToken();
    await tx.execute(sql`
      insert into staff_sessions (staff_user_id, token_hash, expires_at, user_agent, ip)
      values (${user.id}::uuid, ${hashToken(sessionToken)},
              now() + make_interval(days => ${SESSION_TTL_DAYS}),
              ${context.userAgent}, ${context.ip}::inet)
    `);

    await tx.execute(sql`
      update staff_users set last_login_at = now() where id = ${user.id}::uuid
    `);

    return {
      sessionToken,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    };
  });
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

/** Resuelve la sesión de una cookie, o null si no vale. */
export async function staffFromSession(token: string | undefined): Promise<StaffUser | null> {
  if (!token) return null;

  const rows = await db.execute<{
    id: string;
    email: string;
    full_name: string;
    role: StaffRole;
    session_id: string;
  }>(sql`
    select u.id, u.email, u.full_name, u.role::text as role, s.id as session_id
      from staff_sessions s
      join staff_users u on u.id = s.staff_user_id
     where s.token_hash = ${hashToken(token)}
       and s.revoked_at is null
       and s.expires_at > now()
       and u.active
     limit 1
  `);

  const row = rows[0];
  if (!row) return null;

  // Se registra el uso para poder distinguir una sesión viva de una olvidada.
  await db.execute(sql`
    update staff_sessions set last_seen_at = now() where id = ${row.session_id}::uuid
  `);

  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.execute(sql`
    update staff_sessions set revoked_at = now()
     where token_hash = ${hashToken(token)} and revoked_at is null
  `);
}

/** Cierra todas las sesiones de una persona. Se usa al darla de baja. */
export async function revokeAllSessions(staffId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    with cerradas as (
      update staff_sessions set revoked_at = now()
       where staff_user_id = ${staffId}::uuid and revoked_at is null
      returning 1
    )
    select count(*)::int as n from cerradas
  `);
  return rows[0]?.n ?? 0;
}

/** Comparación en tiempo constante, para comparar tokens fuera de la base. */
export function tokensMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
