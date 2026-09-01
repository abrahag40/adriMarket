/**
 * Insignia de moneda, estática a propósito: el negocio cobra en una sola
 * moneda por reserva. No es un selector — uno que no cambiara nada sería un
 * control roto a propósito. Texto simple con una flecha, sin insignia ni
 * borde: así se ve en la referencia, donde tampoco es un control.
 */
export function CurrencyBadge() {
  return (
    <span className="currency-badge">
      MXN <span aria-hidden="true">▾</span>
    </span>
  );
}
