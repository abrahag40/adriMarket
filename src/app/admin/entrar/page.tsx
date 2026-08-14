import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="stack admin-narrow">
      <h1 className="page-title">Panel de operación</h1>
      <p className="muted">
        Escribe tu correo de trabajo y te mandamos un enlace para entrar. Sin contraseñas.
      </p>
      <LoginForm />
    </div>
  );
}
