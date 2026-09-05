import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { transport } from "./send";

/**
 * Elección del transporte de correo
 *
 * Se prueba porque es configuración que decide si un huésped recibe o no su
 * confirmación, y porque **equivocarse aquí no da error**: se elige el
 * transporte local, que guarda el correo y no lo manda, y todo parece bien
 * hasta que alguien reclama.
 *
 * Ya pasó una vez en producción a medias: se cargó `RESEND_API_KEY` sin
 * `MAIL_FROM` y el sistema siguió guardando en silencio durante una hora,
 * exactamente igual que antes. El caso 2 de aquí abajo es ese.
 *
 * No manda nada: solo construye.
 */

const VARIABLES = [
  "MAIL_FROM",
  "RESEND_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
] as const;

const ORIGINAL = Object.fromEntries(VARIABLES.map((k) => [k, process.env[k]]));

function configurar(valores: Partial<Record<(typeof VARIABLES)[number], string>>) {
  for (const clave of VARIABLES) {
    const valor = valores[clave];
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
}

afterEach(() => {
  for (const clave of VARIABLES) {
    const valor = ORIGINAL[clave];
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

const SMTP = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "alguien@gmail.com",
  SMTP_PASSWORD: "contraseña de aplicación",
};

describe("elección del transporte de correo", () => {
  it("sin nada configurado, guarda en lugar de mandar", () => {
    configurar({});
    assert.equal(transport().name, "local");
  });

  it("una llave de Resend SIN remitente no manda nada", () => {
    // El caso que ocurrió en producción. Si algún día se quiere que esto
    // truene en vez de callar, esta prueba es la que hay que cambiar — pero
    // que truene deja al huésped sin aviso, y guardar al menos lo conserva.
    configurar({ RESEND_API_KEY: "re_x" });
    assert.equal(transport().name, "local");
  });

  it("con llave y remitente, usa Resend", () => {
    configurar({ RESEND_API_KEY: "re_x", MAIL_FROM: "reservas@ejemplo.mx" });
    assert.equal(transport().name, "resend");
  });

  it("con SMTP completo y sin Resend, usa SMTP", () => {
    configurar({ ...SMTP, MAIL_FROM: "alguien@gmail.com" });
    assert.equal(transport().name, "smtp");
  });

  it("Resend gana sobre SMTP cuando los dos están configurados", () => {
    // El día que exista el dominio, cargar la llave basta: toma el relevo sola
    // y nadie tiene que acordarse de quitar lo anterior.
    configurar({ ...SMTP, RESEND_API_KEY: "re_x", MAIL_FROM: "reservas@ejemplo.mx" });
    assert.equal(transport().name, "resend");
  });

  it("un SMTP a medias no se usa a medias", () => {
    // Sin contraseña no hay forma de autenticar; elegirlo igual daría un fallo
    // por cada aviso en vez de uno solo, visible, al configurar.
    configurar({
      SMTP_HOST: SMTP.SMTP_HOST,
      SMTP_USER: SMTP.SMTP_USER,
      MAIL_FROM: "alguien@gmail.com",
    });
    assert.equal(transport().name, "local");
  });
});
