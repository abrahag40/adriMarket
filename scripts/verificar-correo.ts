#!/usr/bin/env tsx
/**
 * ¿Las credenciales de correo sirven de verdad?
 *
 * Autentica contra el proveedor **sin mandar nada**. Existe para ser la
 * compuerta de `scripts/correo.sh`: unas credenciales que no funcionan no deben
 * llegar a Vercel.
 *
 * No es una precaución teórica. El 2026-09-07 se cargó una contraseña de
 * aplicación de Google en producción sin comprobarla, y Gmail la rechazó con
 * `535-5.7.8 BadCredentials`. El síntoma no fue un error visible: fueron cuatro
 * avisos muriendo en silencio tras seis intentos cada uno —confirmaciones de
 * reserva que ningún huésped recibió— y una salud que solo lo dijo cuando
 * alguien fue a mirarla.
 *
 * Qué comprueba, según el transporte elegido:
 *
 *   SMTP    · abre la conexión y autentica (`verify()` de nodemailer). Es la
 *             misma negociación que hace el envío real, sin el envío.
 *
 *   Resend  · autentica **y además exige que el dominio de `MAIL_FROM` esté
 *             verificado**. Sin eso Resend solo entrega a la dirección dueña de
 *             la cuenta y responde 403 a cualquier otra: el aviso del huésped se
 *             reintentaría seis veces y quedaría muerto. Una llave de Resend sin
 *             dominio verificado es peor que no tener llave, porque el sistema
 *             cree que puede escribir.
 *
 * Se niega con el transporte local, igual que `probar:correo`: una comprobación
 * que no puede fallar no comprueba nada.
 */

import { transport } from "@/modules/notifications/send";

/** `Reservas <hola@dominio.mx>` y `hola@dominio.mx` dan lo mismo. */
function dominioDe(remitente: string): string | null {
  const m = remitente.match(/<([^>]+)>/);
  const dir = (m?.[1] ?? remitente).trim();
  const arroba = dir.lastIndexOf("@");
  return arroba === -1 ? null : dir.slice(arroba + 1).toLowerCase();
}

const from = process.env.MAIL_FROM ?? "";
const elegido = transport();

if (elegido.name === "local") {
  console.error("✘ El transporte elegido es el local: guarda el correo en vez de mandarlo.");
  console.error();
  console.error("  Falta MAIL_FROM, o falta el proveedor. Configura uno de los dos:");
  console.error("    · MAIL_FROM + RESEND_API_KEY          (exige dominio verificado)");
  console.error("    · MAIL_FROM + SMTP_HOST/USER/PASSWORD (la propia cuenta de correo)");
  process.exit(1);
}

console.log(`→ transporte: ${elegido.name}`);
console.log(`→ remitente:  ${from}`);
console.log();

if (elegido.name === "resend") {
  const dominio = dominioDe(from);
  const r = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });

  if (r.status === 401 || r.status === 403) {
    console.error("✘ Resend rechazó la llave. Revisa RESEND_API_KEY.");
    process.exit(1);
  }
  if (!r.ok) {
    console.error(`✘ Resend respondió ${r.status}.`);
    process.exit(1);
  }
  console.log("  ✔ la llave autentica");

  const { data } = (await r.json()) as {
    data?: { name: string; status: string }[];
  };
  const dominios = data ?? [];

  if (dominios.length === 0) {
    console.error("✘ La cuenta de Resend no tiene NINGÚN dominio.");
    console.error();
    console.error("  Sin dominio verificado, Resend solo entrega a la dirección dueña de");
    console.error("  la cuenta: a un huésped real respondería 403 y el aviso quedaría");
    console.error("  muerto tras seis intentos. Usa el camino SMTP mientras tanto.");
    process.exit(1);
  }

  const verificados = dominios.filter((d) => d.status === "verified").map((d) => d.name.toLowerCase());
  for (const d of dominios) {
    console.log(`     ${d.status === "verified" ? "✔" : "·"} ${d.name} (${d.status})`);
  }

  if (!dominio || !verificados.includes(dominio)) {
    console.error();
    console.error(`✘ El dominio de MAIL_FROM (${dominio ?? "?"}) no está verificado en esta cuenta.`);
    console.error("  Resend rechazaría cualquier destinatario que no sea el dueño de la cuenta.");
    process.exit(1);
  }
  console.log(`  ✔ ${dominio} está verificado: se le puede escribir a cualquiera`);
} else {
  const { createTransport } = await import("nodemailer");
  const puerto = Number(process.env.SMTP_PORT ?? 465);
  const transporter = createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  try {
    await transporter.verify();
    console.log(`  ✔ ${process.env.SMTP_HOST}:${puerto} acepta las credenciales`);
  } catch (error) {
    const msg = (error as Error).message;
    console.error(`✘ El servidor rechazó las credenciales:`);
    console.error(`  ${msg.split("\n")[0]}`);
    if (msg.includes("535")) {
      console.error();
      console.error("  El 535 con Google casi siempre es una de dos:");
      console.error("    · la contraseña de aplicación va SIN espacios (Google la enseña");
      console.error("      en cuatro bloques de cuatro para que se lea; los espacios no");
      console.error("      son parte de ella);");
      console.error("    · o se revocó y hay que generar otra en");
      console.error("      myaccount.google.com/apppasswords (exige verificación en dos pasos).");
    }
    process.exit(1);
  }

  // El remitente tiene que ser la MISMA dirección que autentica, o la firma no
  // alinea y el correo cae en no deseado. Es la razón por la que no se eligió
  // un ESP con "remitente verificado".
  const usuario = (process.env.SMTP_USER ?? "").toLowerCase();
  const remitente = (dominioDe(from) ? from.match(/<([^>]+)>/)?.[1] ?? from : from).trim().toLowerCase();
  if (usuario && remitente && usuario !== remitente) {
    console.log();
    console.log(`  ⚠ MAIL_FROM (${remitente}) no es la dirección que autentica (${usuario}).`);
    console.log("    SPF y DKIM alinean con quien autentica: si no coinciden, el correo");
    console.log("    llega a no deseado aunque el envío diga que salió bien.");
  }
}

console.log();
console.log("\x1b[32mCredenciales buenas.\x1b[0m");
