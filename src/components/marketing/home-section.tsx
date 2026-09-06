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
 * Va arriba, junto al título, y no debajo de las tarjetas: en un carrusel la
 * fila no tiene final visible, así que un enlace al final no tiene dónde
 * ponerse.
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
        <div className="section-head-text">
          <h2 id={id} className="section-title">
            {title}
          </h2>
          <p className="muted">{subtitle}</p>
        </div>
        {action ? (
          <Link className="section-action" href={action.href}>
            {action.label}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
