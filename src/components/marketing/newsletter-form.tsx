import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/**
 * Presentacional únicamente: no hay proveedor de lista de correo configurado.
 * Los campos van deshabilitados a propósito, así que no hace falta manejar un
 * envío que no llega a ningún lado — y por eso no necesita ser un componente
 * cliente. No se cuelga en ninguna página pública.
 */
export function NewsletterForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale);

  return (
    <form className="newsletter-form">
      <div className="newsletter-copy">
        <h2 className="newsletter-heading">{t.newsletterHeading}</h2>
        <p className="muted">{t.newsletterBody}</p>
      </div>
      <div className="newsletter-fields">
        <label className="visually-hidden" htmlFor="newsletter-email">
          {t.newsletterPlaceholder}
        </label>
        <input
          id="newsletter-email"
          className="newsletter-input"
          type="email"
          placeholder={t.newsletterPlaceholder}
          disabled
        />
        <button className="btn" type="submit" disabled>
          {t.newsletterSubmit}
        </button>
      </div>
    </form>
  );
}
