export type SocialLink = { label: string; href: string };

/**
 * Fila de íconos de redes, controlada por props. Vacía hoy a propósito: el
 * cliente no ha dado sus perfiles reales y no se inventa ninguno.
 */
export function SocialLinks({ links }: { links: SocialLink[] }) {
  if (links.length === 0) return null;

  return (
    <ul className="social-links">
      {links.map((link) => (
        <li key={link.href}>
          <a href={link.href} target="_blank" rel="noreferrer noopener">
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
