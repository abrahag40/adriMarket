import { roundCents } from "./money";

/**
 * Reventa · decisión 0025
 *
 * El precio al huésped NO se calcula aquí: vive en una sola función de la base,
 * `resale_price()` (migración 0026), por la que pasan la tarjeta, la ficha, el
 * calendario, los extras y la cotización. Una segunda copia en TypeScript sería
 * la que tarde o temprano dice otro número.
 *
 * Lo que vive aquí es el otro lado de la cuenta: **cuánto se lleva la
 * pasarela** de un cobro. Sirve para comprobar que la fórmula deja exactamente
 * el precio del proveedor y la comisión del sitio, y para la liquidación, que
 * compara este cálculo con la comisión real que Stripe reporta en cada cargo.
 */

/** Cómo cobra la pasarela: un porcentaje del total, un fijo por cobro y el IVA sobre su comisión. */
export type GatewayRate = {
  pct: number;
  fixedCents: number;
  vatPct: number;
};

/**
 * Stripe México, leído en https://stripe.com/mx/pricing el 2026-10-24: 3.6 % +
 * MXN 3 con tarjeta mexicana y 4.1 % + MXN 3 con extranjera, más IVA. El motor
 * cobra siempre en pesos, así que no aplica el 2 % por conversión.
 */
export const STRIPE_MX = {
  extranjera: { pct: 4.1, fixedCents: 300, vatPct: 16 },
  nacional: { pct: 3.6, fixedCents: 300, vatPct: 16 },
} as const satisfies Record<string, GatewayRate>;

/**
 * Lo que la pasarela se queda de un cobro, IVA incluido.
 *
 * El redondeo es un modelo: Stripe no publica en qué paso redondea. Por eso la
 * liquidación guarda la comisión **real** de cada cargo y no ésta.
 */
export function gatewayFeeCents(totalCents: number, rate: GatewayRate): number {
  const comision = roundCents((totalCents * rate.pct) / 100) + rate.fixedCents;
  return comision + roundCents((comision * rate.vatPct) / 100);
}

/** Lo que le queda al sitio de un cobro, después de la pasarela y del proveedor. */
export function siteMarginCents(totalCents: number, supplierCents: number, rate: GatewayRate): number {
  return totalCents - gatewayFeeCents(totalCents, rate) - supplierCents;
}
