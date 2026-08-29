import Link from "next/link";

import { hasRole, type StaffUser } from "@/modules/identity/auth";

import { signOut } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  owner: "Dueño",
  manager: "Gerencia",
  front_desk: "Recepción",
  guide: "Guía",
};

export function AdminNav({ user, active }: { user: StaffUser; active: string }) {
  const items = [
    { href: "/admin", label: "Hoy" },
    { href: "/admin/reservas", label: "Reservas" },
    { href: "/admin/calendario", label: "Calendario" },
    { href: "/admin/salidas", label: "Salidas" },
    { href: "/admin/bloqueos", label: "Bloqueos" },
  ];

  // El catálogo y los ajustes son decisiones comerciales, no operativas: no se
  // le muestran a recepción ni a un guía. El servidor los protege igual, esto
  // solo evita ofrecer una puerta cerrada.
  const managerItems = [
    { href: "/admin/catalogo", label: "Catálogo" },
    { href: "/admin/ajustes", label: "Ajustes" },
    { href: "/admin/bitacora", label: "Bitácora" },
    { href: "/admin/estilo", label: "Estilo" },
  ];

  return (
    <header className="admin-head">
      <nav className="admin-nav" aria-label="Panel">
        {(hasRole(user, "manager") ? [...items, ...managerItems] : items).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.href === active ? "admin-tab admin-tab-on" : "admin-tab"}
            aria-current={item.href === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {/* `<div>` y no `<p>`: un `<form>` dentro de un párrafo es HTML inválido
          que el navegador reescribe al analizarlo, y React lo detecta como un
          desajuste de hidratación — eso rompe la hidratación de esta página
          entera, silenciosamente, hasta que algo dependa de JavaScript en el
          cliente para funcionar. */}
      <div className="admin-who">
        {user.fullName} · {ROLE_LABEL[user.role] ?? user.role}
        {/*
          Cerrar sesión no es cosmética en un mostrador: el teléfono se presta,
          se queda en el cajón y cambia de turno. La sesión se revoca en la base,
          así que salir la mata de verdad y no solo borra la cookie.
        */}
        <form action={signOut}>
          <button className="admin-exit" type="submit">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
