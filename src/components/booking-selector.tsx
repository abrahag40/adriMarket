"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

/**
 * Envoltura del formulario de selección.
 *
 * El formulario funciona sin JavaScript: es un `form method="get"` y al enviarlo
 * la página se recarga con la cotización hecha en el servidor. Con JavaScript
 * disponible, este componente intercepta el envío y navega del lado del cliente,
 * así que el precio se actualiza sin recargar la página completa.
 *
 * En ambos casos **el precio lo calcula el servidor** y la selección queda en la
 * URL: se puede compartir por WhatsApp y recargar sin perderla.
 */
export function BookingSelector({
  action,
  children,
}: {
  action: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(form: HTMLFormElement) {
    const data = new FormData(form);
    // Se preservan los parámetros ajenos al selector —el mes del calendario, por
    // ejemplo— para no perder el contexto de la página.
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of data.entries()) {
      if (typeof value !== "string") continue;
      if (value === "") next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${action}?${next.toString()}`, { scroll: false });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(event.currentTarget);
  }

  return (
    <form
      className="selector"
      method="get"
      action={action}
      onSubmit={onSubmit}
      onChange={(event) => {
        // Cambiar un desplegable recotiza de inmediato. Las fechas esperan al
        // botón, porque un rango a medio escribir no se puede cotizar.
        if (event.target instanceof HTMLSelectElement) navigate(event.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
