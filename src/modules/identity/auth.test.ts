import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";

import {
  hasRole,
  redeemLoginToken,
  requestLoginLink,
  revokeAllSessions,
  revokeSession,
  staffFromSession,
  type StaffUser,
} from "./auth";

/**
 * Pruebas del acceso al panel · S4-1
 *
 * Lo que se verifica aquí no es que el login "funcione" en el caso feliz —eso
 * se ve a simple vista— sino las cuatro formas en que un acceso por enlace se
 * rompe en la práctica: el enlace reutilizado, el enlace vencido, la sesión que
 * se dio de baja y la persona que ya no trabaja aquí.
 *
 * Requiere DATABASE_URL con el esquema aplicado.
 */

const CONTEXT = { userAgent: "prueba", ip: null };

let recepcion: string;
let recepcionEmail: string;

async function createStaff(role: string, active = true): Promise<{ id: string; email: string }> {
  // Cada corrida crea su propia gente: si la prueba dependiera del seed, dos
  // corridas seguidas se pisarían entre sí.
  const email = `it+${randomUUID().slice(0, 8)}@example.com`;
  const rows = await db.execute<{ id: string }>(sql`
    insert into staff_users (email, full_name, role, active)
    values (${email}, 'Prueba integración', ${role}::staff_role, ${active})
    returning id
  `);
  return { id: rows[0]!.id, email };
}

describe("acceso del staff", () => {
  before(async () => {
    const staff = await createStaff("front_desk");
    recepcion = staff.id;
    recepcionEmail = staff.email;
  });

  after(async () => {
    await sqlClient.end();
  });

  it("un correo que no es de nadie no genera enlace", async () => {
    const resultado = await requestLoginLink(`nadie+${randomUUID()}@example.com`, null);
    assert.equal(resultado, null);
  });

  it("una persona dada de baja no genera enlace aunque su correo exista", async () => {
    const baja = await createStaff("front_desk", false);
    assert.equal(await requestLoginLink(baja.email, null), null);
  });

  it("el correo no distingue mayúsculas", async () => {
    const resultado = await requestLoginLink(recepcionEmail.toUpperCase(), null);
    assert.ok(resultado, "el enlace debe generarse aunque el correo venga en mayúsculas");
  });

  it("el enlace sirve una sola vez", async () => {
    const solicitud = await requestLoginLink(recepcionEmail, null);
    assert.ok(solicitud);

    const primera = await redeemLoginToken(solicitud.token, CONTEXT);
    assert.ok(primera, "el primer canje debe entregar sesión");
    assert.equal(primera.user.role, "front_desk");

    // Dos pestañas abiertas con el mismo correo: la segunda no entra.
    const segunda = await redeemLoginToken(solicitud.token, CONTEXT);
    assert.equal(segunda, null, "un enlace canjeado no puede volver a usarse");
  });

  it("un enlace vencido no sirve", async () => {
    const solicitud = await requestLoginLink(recepcionEmail, null);
    assert.ok(solicitud);

    await db.execute(sql`
      update staff_login_tokens set expires_at = now() - interval '1 minute'
       where staff_user_id = ${recepcion}::uuid and used_at is null
    `);

    assert.equal(await redeemLoginToken(solicitud.token, CONTEXT), null);
  });

  it("un token inventado no entrega sesión", async () => {
    assert.equal(await redeemLoginToken("token-inventado", CONTEXT), null);
    assert.equal(await staffFromSession("cookie-inventada"), null);
    assert.equal(await staffFromSession(undefined), null);
  });

  it("el token no se guarda en claro", async () => {
    const solicitud = await requestLoginLink(recepcionEmail, null);
    assert.ok(solicitud);

    // Quien lea la base no debe encontrar nada con lo que pueda entrar.
    const filas = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from staff_login_tokens
       where token_hash = ${solicitud.token}
    `);
    assert.equal(filas[0]!.n, 0, "el enlace no puede estar guardado tal cual");
  });

  it("la sesión revocada deja de valer de inmediato", async () => {
    const solicitud = await requestLoginLink(recepcionEmail, null);
    assert.ok(solicitud);
    const sesion = await redeemLoginToken(solicitud.token, CONTEXT);
    assert.ok(sesion);

    assert.ok(await staffFromSession(sesion.sessionToken));

    await revokeSession(sesion.sessionToken);
    assert.equal(
      await staffFromSession(sesion.sessionToken),
      null,
      "cerrar sesión debe invalidarla en la base, no solo borrar la cookie",
    );
  });

  it("dar de baja a alguien cierra todas sus sesiones", async () => {
    const persona = await createStaff("front_desk");
    const tokens: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const solicitud = await requestLoginLink(persona.email, null);
      assert.ok(solicitud);
      const sesion = await redeemLoginToken(solicitud.token, CONTEXT);
      assert.ok(sesion);
      tokens.push(sesion.sessionToken);
    }

    const cerradas = await revokeAllSessions(persona.id);
    assert.equal(cerradas, 3);
    for (const token of tokens) {
      assert.equal(await staffFromSession(token), null);
    }
  });

  it("desactivar la cuenta invalida la sesión ya abierta", async () => {
    const persona = await createStaff("manager");
    const solicitud = await requestLoginLink(persona.email, null);
    assert.ok(solicitud);
    const sesion = await redeemLoginToken(solicitud.token, CONTEXT);
    assert.ok(sesion);
    assert.ok(await staffFromSession(sesion.sessionToken));

    // Alguien deja de trabajar aquí: la sesión que tenía abierta muere sin que
    // haya que ir a buscarla.
    await db.execute(sql`update staff_users set active = false where id = ${persona.id}::uuid`);
    assert.equal(await staffFromSession(sesion.sessionToken), null);
  });

  it("una sesión vencida no vale", async () => {
    const solicitud = await requestLoginLink(recepcionEmail, null);
    assert.ok(solicitud);
    const sesion = await redeemLoginToken(solicitud.token, CONTEXT);
    assert.ok(sesion);

    await db.execute(sql`
      update staff_sessions set expires_at = now() - interval '1 day'
       where staff_user_id = ${recepcion}::uuid and revoked_at is null
    `);
    assert.equal(await staffFromSession(sesion.sessionToken), null);
  });

  it("la jerarquía de roles ordena lo que cada quien puede", () => {
    const como = (role: StaffUser["role"]): StaffUser => ({
      id: "x",
      email: "x@example.com",
      fullName: "x",
      role,
    });

    // Un guía ve su salida; no cobra ni bloquea.
    assert.equal(hasRole(como("guide"), "guide"), true);
    assert.equal(hasRole(como("guide"), "front_desk"), false);

    // Recepción cobra y bloquea; no cambia configuración.
    assert.equal(hasRole(como("front_desk"), "front_desk"), true);
    assert.equal(hasRole(como("front_desk"), "manager"), false);

    // Hacia arriba, todo lo de abajo.
    assert.equal(hasRole(como("owner"), "guide"), true);
    assert.equal(hasRole(como("owner"), "manager"), true);
    assert.equal(hasRole(como("manager"), "front_desk"), true);
  });
});
