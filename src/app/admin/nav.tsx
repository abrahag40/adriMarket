import Link from "next/link";

import type { StaffUser } from "@/modules/identity/auth";

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

  return (
    <header className="admin-head">
      <nav className="admin-nav" aria-label="Panel">
        {items.map((item) => (
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
      <p className="admin-who">
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
      </p>
    </header>
  );
}
