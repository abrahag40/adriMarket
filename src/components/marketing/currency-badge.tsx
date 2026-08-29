/**
 * Insignia de moneda, estática a propósito: el negocio cobra en una sola
 * moneda por reserva. No es un selector — uno que no cambiara nada sería un
 * control roto a propósito.
 */
export function CurrencyBadge() {
  return <span className="currency-badge">MXN</span>;
}
