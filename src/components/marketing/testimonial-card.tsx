export type Testimonial = {
  quote: string;
  name: string;
  role: string;
};

/**
 * Pura por props: no existe todavía un módulo de reseñas, así que el
 * componente no trae ningún contenido de muestra escrito adentro. Quien lo
 * monta decide qué texto pasarle — hoy, solo `/admin/estilo`, marcado como
 * ejemplo.
 */
export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure className="testimonial-card">
      <blockquote className="testimonial-quote">“{testimonial.quote}”</blockquote>
      <figcaption className="testimonial-meta">
        <span className="testimonial-name">{testimonial.name}</span>
        <span className="testimonial-role">{testimonial.role}</span>
      </figcaption>
    </figure>
  );
}
