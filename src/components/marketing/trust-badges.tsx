/**
 * Insignia de "pago seguro" del pie. Texto, no logos de tarjeta: Visa,
 * Mastercard y Amex son marcas registradas de terceros.
 */
export function TrustBadges({ text }: { text: string }) {
  return (
    <p className="trust-badges">
      <span className="trust-badge">{text}</span>
    </p>
  );
}
