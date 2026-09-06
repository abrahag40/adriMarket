import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Una sección con título y bajada del inicio.
 *
 * Existía tres veces copiada —destinos, tours destacados y estancias— con la
 * misma estructura y las mismas clases; lo único distinto eran el `id`, el
 * título y la bajada. Copiar tres veces no es caro; lo caro es que la cuarta
 * salga distinta, o que un ajuste de espaciado se aplique a dos de las tres.
 *
 * El `id` no es decorativo: lo usa `aria-labelledby` para que un lector de
 * pantalla anuncie a qué sección pertenece cada tarjeta.
 *
 * ## La salida
 *
 * `action` pone un enlace al catálogo completo de ese inventario. No es
 * adorno: desde que el listado dejó de vivir en la portada, una vitrina sin
 * salida es un callejón — enseña seis de veintisiete y se acaba. Lleva el
 * número dentro ("Ver los 27 tours") porque fija la expectativa antes del
 * clic, que es lo que hace un enlace de categoría en cualquier tienda.
 *
 * **Va centrada debajo de las tarjetas**, no arriba junto al título. Estuvo
 * arriba mientras las cuatro vitrinas eran rieles: una fila que se arrastra
 * no tiene final visible, así que un enlace al final no tenía dónde ponerse.
 * Ahora destinos y tours son cuadrículas con un final que se ve, y el mismo
 * lugar para las cuatro es lo que hace que se lean como el mismo gesto —
 * terminar de mirar la muestra y pedir el resto. Es también donde la pone la
 * referencia, y donde ya está el ojo cuando se acaba lo que hay que mirar.
 */
export function HomeSection({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  /** Enlace al catálogo completo de este inventario. */
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="home-section" aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        <p className="muted">{subtitle}</p>
      </div>
      {children}
      {action ? (
        <div className="section-outro">
          <Link className="section-action" href={action.href}>
            {action.label}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </section>
  );
}
