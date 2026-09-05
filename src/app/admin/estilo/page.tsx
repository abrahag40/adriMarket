import { Carousel } from "@/components/marketing/carousel";
import { FeaturedCard } from "@/components/marketing/featured-card";
import { NewsletterForm } from "@/components/marketing/newsletter-form";
import { TestimonialCard, type Testimonial } from "@/components/marketing/testimonial-card";
import { listCatalog } from "@/modules/catalog/queries";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../nav";

export const dynamic = "force-dynamic";

/**
 * Contenido de muestra: no existe todavía un módulo de reseñas, así que estos
 * testimonios no salen de ninguna tabla. Existen solo para ejercitar
 * `TestimonialCard` en esta página de staff — nunca llegan a un huésped.
 */
const SAMPLE_TESTIMONIALS: Testimonial[] = [
  {
    quote: "Así se vería una reseña en esta tarjeta. Todavía no hay reseñas reales que mostrar.",
    name: "Nombre de ejemplo",
    role: "Huésped de ejemplo",
  },
  {
    quote: "Segundo ejemplo, para ver cómo se comporta el carrusel con más de una tarjeta.",
    name: "Otro nombre de ejemplo",
    role: "Huésped de ejemplo",
  },
];

/**
 * Guía de estilo — ejemplos, no contenido real · componentes de marketing
 *
 * Cada componente de `src/components/marketing/` se monta aquí para que
 * ninguno quede como código muerto, sin fabricar contenido que un huésped
 * real llegue a ver. Los que sí tienen datos reales hoy (cabecera, pie,
 * tarjetas de destino, banner de anticipo) ya se montan en el sitio público
 * y no se repiten en esta página.
 */
export default async function EstiloPage() {
  const user = await requireStaff("manager");
  const items = await listCatalog("es", {});
  const featured = items.filter((item) => item.coverUrl !== null).slice(0, 6);

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/estilo" />
      <h1 className="page-title">Guía de estilo — ejemplos, no contenido real</h1>
      <p className="muted">
        Componentes de marketing que hoy no aparecen en ninguna página real, o que aparecen con
        datos de muestra. Nada de lo que se ve aquí abajo se le muestra a un huésped.
      </p>

      <section className="stack-sm">
        <h2 className="section-title">FeaturedCard + Carousel</h2>
        <p className="muted">Datos reales del catálogo publicado — foto vertical con texto superpuesto.</p>
        {featured.length > 0 ? (
          <Carousel label="Ejemplo" prevLabel="Anterior" nextLabel="Siguiente">
            {featured.map((item) => (
              <FeaturedCard key={item.id} item={item} locale="es" />
            ))}
          </Carousel>
        ) : (
          <p className="muted">No hay productos publicados con foto todavía.</p>
        )}
      </section>

      <section className="stack-sm">
        <h2 className="section-title">TestimonialCard</h2>
        <p className="muted">
          Contenido de ejemplo — no existe un módulo de reseñas todavía. El componente recibe el
          texto por props; no trae ninguno escrito adentro.
        </p>
        <Carousel label="Ejemplo" prevLabel="Anterior" nextLabel="Siguiente">
          {SAMPLE_TESTIMONIALS.map((testimonial) => (
            <TestimonialCard key={testimonial.name} testimonial={testimonial} />
          ))}
        </Carousel>
      </section>

      <section className="stack-sm">
        <h2 className="section-title">NewsletterForm</h2>
        <p className="muted">
          Sin conectar — no hay proveedor de lista de correo configurado, por eso los campos están
          deshabilitados.
        </p>
        <NewsletterForm locale="es" />
      </section>
    </div>
  );
}
