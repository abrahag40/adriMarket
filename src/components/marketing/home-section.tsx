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
 */
export function HomeSection({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
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
    </section>
  );
}
