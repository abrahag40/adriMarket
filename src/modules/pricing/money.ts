/**
 * Aritmética de dinero.
 *
 * Todo se maneja en centavos enteros. Estas funciones existen para que el
 * redondeo sea una decisión escrita y probada, y no el comportamiento accidental
 * de `Math.round` con números negativos.
 */

/**
 * Redondea a centavo entero, con los medios hacia el lado contrario al cero
 * (2.5 → 3, −2.5 → −3).
 *
 * `Math.round` redondea los medios hacia +infinito, así que −2.5 daría −2: un
 * descuento saldría un centavo más chico de lo debido. La diferencia es de un
 * centavo por línea, y un centavo basta para que el total mostrado no cuadre con
 * el que cobra la pasarela.
 */
export function roundCents(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Porcentaje de un monto en centavos, redondeado. */
export function percentOf(cents: number, percent: number): number {
  return roundCents((cents * percent) / 100);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
