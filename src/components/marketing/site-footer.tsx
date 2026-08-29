import Link from "next/link";

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

import { CurrencyBadge } from "./currency-badge";
import { SocialLinks, type SocialLink } from "./social-links";
import { TrustBadges } from "./trust-badges";

/**
 * Lista de redes vacía a propósito: el cliente no ha dado sus perfiles
 * reales. `SocialLinks` no renderiza nada mientras siga así — código listo,
 * sin contenido inventado.
 */
const SOCIAL_LINKS: SocialLink[] = [];

export function SiteFooter({ locale }: { locale: Locale }) {
  const t = getMessages(locale);

  return (
    <footer className="site-footer">
      <div className="wrap site-footer-grid">
        <div className="footer-col">
          <span className="brand-name">{t.siteName}</span>
          <p className="muted">{t.tagline}</p>
          <div className="footer-col-meta">
            <CurrencyBadge />
            <SocialLinks links={SOCIAL_LINKS} />
          </div>
        </div>

        <div className="footer-col">
          <h2 className="footer-col-heading">{t.footerLinksHeading}</h2>
          <ul className="footer-links">
            <li>
              <Link href={`/${locale}`}>{t.footerHome}</Link>
            </li>
            <li>
              <Link href={`/${locale}?kind=tour`}>{t.navTours}</Link>
            </li>
            <li>
              <Link href={`/${locale}?kind=stay`}>{t.navStays}</Link>
            </li>
          </ul>
        </div>

        <div className="footer-col">
          <h2 className="footer-col-heading">{t.footerHowHeading}</h2>
          <p className="muted">{t.footerHowBody}</p>
          <TrustBadges text={t.trustBadgeText} />
        </div>
      </div>
      <div className="wrap site-footer-bottom">{t.footerRights(new Date().getFullYear())}</div>
    </footer>
  );
}
