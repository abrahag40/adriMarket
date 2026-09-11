"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

/**
 * Envoltura del formulario de extras · S8
 *
 * Mismo trato que `BookingSelector`: es un `form method="get"` que funciona sin
 * una línea de JavaScript —al enviarlo, la página se recarga con la cotización
 * hecha en el servidor— y cuando hay JavaScript, marcar una casilla recotiza al
 * instante sin recargar.
 *
 * Eso es lo que cumple el "el total sube automáticamente" **sin romper el
 * invariante**: el navegador no suma nada, solo cambia la URL y vuelve a pedir.
 * El número que ve el huésped es el que calculó el servidor, siempre.
 *
 * La diferencia con `BookingSelector` está en cómo se reconstruye el
 * parámetro: una casilla apagada **no aparece** en el FormData, así que
 * fusionar lo enviado sobre lo que ya estaba en la URL nunca quitaría nada
 * —desmarcar no haría efecto—. `extras` se borra y se vuelve a escribir
 * completo desde el formulario; el resto de la URL se conserva.
 */
export function ExtrasSelector({
  action,
  children,
}: {
  action: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(form: HTMLFormElement) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("extras");
    for (const value of new FormData(form).getAll("extras")) {
      if (typeof value === "string" && value) next.append("extras", value);
    }
    router.replace(`${action}?${next.toString()}`, { scroll: false });
  }

  return (
    <form
      className="extras-form"
      method="get"
      action={action}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        navigate(event.currentTarget);
      }}
      onChange={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
          navigate(event.currentTarget);
        }
      }}
    >
      {children}
    </form>
  );
}
