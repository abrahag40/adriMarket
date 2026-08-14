"use client";

import { useActionState } from "react";

import { requestAccess } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(requestAccess, { sent: false });

  if (state.sent) {
    return (
      <div className="notice">
        Si ese correo pertenece a alguien del equipo, le llega un enlace en unos segundos.
        Es válido 15 minutos y sirve una sola vez.
      </div>
    );
  }

  return (
    <form action={action} className="checkout-form">
      <div className="field">
        <label htmlFor="email">Correo de trabajo</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <button className="btn btn-block" type="submit" disabled={pending}>
        {pending ? "…" : "Mandarme el enlace"}
      </button>
    </form>
  );
}
