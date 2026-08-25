import { nightsIn, type DateRange } from "@/db/types";

import { percentOf, roundCents, sumCents } from "./money";
import {
  QuoteError,
  type CouponInput,
  type CouponResult,
  type NightRate,
  type PaxCounts,
  type Quote,
  type QuoteLine,
  type StayUnitPricing,
  type TaxRule,
  type TourPricing,
} from "./types";

/**
 * Composición del precio · S2-1 y S2-2
 *
 * Esta capa es **pura**: recibe tarifas ya leídas y devuelve el desglose. No
 * toca la base de datos ni el reloj. Eso permite probar decenas de casos —
 * incluidos los de redondeo y los de zona horaria— en milisegundos, y es donde
 * viven de verdad las reglas de negocio.
 *
 * Dos invariantes que las pruebas verifican en cada caso:
 *   1. la suma de `lines` es exactamente `total_cents`;
 *   2. `deposit_cents + balance_cents === total_cents`.
 *
 * Un centavo de diferencia entre lo mostrado y lo cobrado es una discrepancia
 * con la pasarela y una discusión con el huésped.
 */

// ---------------------------------------------------------------------------
// Impuestos
// ---------------------------------------------------------------------------

/**
 * Aplica los impuestos sobre el subtotal de servicio.
 *
 * **Supuesto documentado, pendiente de confirmar con el contador del cliente:**
 * los impuestos NO se calculan en cascada. Cada uno aplica sobre el subtotal de
 * servicio (hospedaje, huéspedes extra, cargos, ya con descuentos), no sobre el
 * subtotal más los otros impuestos.
 *
 * Si el contador indica que el IVA va sobre subtotal + ISH, el cambio es de una
 * línea aquí y de un caso de prueba. Se dejó no-cascada porque es lo que aplica
 * en la mayoría de los casos y porque es la opción que no infla el cobro
 * mientras la duda esté abierta.
 */
export function applyTaxes(
  taxableCents: number,
  taxes: readonly TaxRule[],
  context: { nights: number; pax: number },
): QuoteLine[] {
  const lines: QuoteLine[] = [];

  for (const tax of taxes) {
    // La tarifa ya lleva este impuesto dentro: no se suma nada.
    if (tax.included_in_price) continue;

    let cents: number;
    switch (tax.kind) {
      case "percent":
        cents = percentOf(taxableCents, tax.rate);
        break;
      case "fixed_per_night":
        cents = roundCents(tax.rate * context.nights);
        break;
      case "fixed_per_pax":
        cents = roundCents(tax.rate * context.pax);
        break;
    }

    if (cents !== 0) {
      lines.push({ concept: tax.name, cents, kind: "tax" });
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Cierre común
// ---------------------------------------------------------------------------

function close(
  currency: string,
  lines: QuoteLine[],
  depositPct: number,
  now: Date,
  nights?: Quote["nights"],
  coupon?: CouponResult,
): Quote {
  const total = sumCents(lines.map((line) => line.cents));
  const deposit = Math.min(percentOf(total, depositPct), total);

  return {
    currency,
    lines,
    total_cents: total,
    deposit_pct: depositPct,
    deposit_cents: deposit,
    // Derivado, nunca calculado por otra vía: así no puede desalinearse del total.
    balance_cents: total - deposit,
    ...(nights ? { nights } : {}),
    ...(coupon ? { coupon } : {}),
    quoted_at: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cupones
// ---------------------------------------------------------------------------

/**
 * Aplica el cupón sobre lo cotizado hasta ahora — antes de impuestos, después
 * de cargos — y devuelve la línea de descuento, si corresponde, y el
 * resultado para congelar en el comprobante.
 *
 * `min_total_cents` solo se puede evaluar aquí: es la primera vez que existe
 * un subtotal. Todo lo demás del cupón (vigencia, a qué producto aplica, si ya
 * se agotó) se resuelve en `service.ts` antes de llegar hasta acá — por eso,
 * si `coupon` no es null en este punto, ya pasó esas pruebas.
 */
function applyCoupon(
  lines: readonly QuoteLine[],
  coupon: CouponInput | null | undefined,
): { discountLine: QuoteLine | null; result: CouponResult | undefined } {
  if (!coupon) return { discountLine: null, result: undefined };

  const subtotal = sumCents(lines.map((line) => line.cents));
  const discount =
    coupon.kind === "percent" ? percentOf(subtotal, coupon.value) : Math.min(coupon.value, subtotal);

  if (subtotal < coupon.minTotalCents || discount <= 0) {
    return { discountLine: null, result: { code: coupon.code, applied: false, reason: "min_total" } };
  }

  return {
    discountLine: { concept: `coupon:${coupon.code}`, cents: -discount, kind: "discount" },
    result: { code: coupon.code, applied: true },
  };
}

// ---------------------------------------------------------------------------
// Estancias
// ---------------------------------------------------------------------------

export type StayQuoteInput = {
  currency: string;
  range: DateRange;
  guests: number;
  unit: StayUnitPricing;
  /** Una entrada por noche del rango, en orden. */
  nights: readonly NightRate[];
  /** Tarifa que cubre el día de salida, si existe: define si admite salidas. */
  departureRate: { closedToDeparture: boolean } | null;
  taxes: readonly TaxRule[];
  depositPct: number;
  /** Hoy en la zona horaria de la propiedad, en formato YYYY-MM-DD. */
  today: string;
  now: Date;
  coupon?: CouponInput | null;
};

export function buildStayQuote(input: StayQuoteInput): Quote {
  const { range, guests, unit, nights } = input;
  const nightCount = nightsIn(range);

  if (nightCount <= 0) {
    throw new QuoteError("invalid_range");
  }

  // "Hoy" llega calculado en la zona de la propiedad, no en la del servidor: a
  // las 23:30 en Cancún un servidor en UTC ya cree que es mañana, y con eso
  // rechazaría una noche válida.
  if (range.from < input.today) {
    throw new QuoteError("past_dates", { today: input.today });
  }

  if (guests < 1 || guests > unit.maxGuests) {
    throw new QuoteError("over_capacity", { max: unit.maxGuests });
  }

  if (nights.length !== nightCount) {
    throw new QuoteError("no_rate");
  }

  // Una noche sin tarifa configurada no se cotiza. Es preferible un "no
  // disponible" a vender a un precio que nadie autorizó.
  const missing = nights.find((night) => night.cents === null);
  if (missing) {
    throw new QuoteError("no_rate", { night: missing.night });
  }

  // Cuando el rango cruza temporadas con mínimos distintos, gana el más alto.
  // Es lo conservador y lo que hace la industria.
  const minNights = Math.max(
    unit.minNights,
    ...nights.map((night) => night.minNights ?? 1),
  );
  if (nightCount < minNights) {
    throw new QuoteError("min_nights", { min: minNights });
  }

  const firstNight = nights[0];
  if (firstNight?.closedToArrival) {
    throw new QuoteError("closed_to_arrival", { date: firstNight.night });
  }

  if (input.departureRate?.closedToDeparture) {
    throw new QuoteError("closed_to_departure", { date: range.to });
  }

  const lines: QuoteLine[] = [];

  for (const night of nights) {
    lines.push({
      concept: night.night,
      cents: night.cents ?? 0,
      kind: "nightly",
    });
  }

  const extraGuests = Math.max(0, guests - unit.baseGuests);
  if (extraGuests > 0 && unit.extraGuestFeeCents > 0) {
    lines.push({
      concept: `occupancy:${extraGuests}x${nightCount}`,
      cents: roundCents(extraGuests * unit.extraGuestFeeCents * nightCount),
      kind: "occupancy",
    });
  }

  // La limpieza se cobra una vez por estancia, no por noche.
  if (unit.cleaningFeeCents > 0) {
    lines.push({ concept: "cleaning", cents: unit.cleaningFeeCents, kind: "fee" });
  }

  const { discountLine, result: couponResult } = applyCoupon(lines, input.coupon);
  if (discountLine) lines.push(discountLine);

  const taxable = sumCents(lines.map((line) => line.cents));
  lines.push(...applyTaxes(taxable, input.taxes, { nights: nightCount, pax: guests }));

  return close(
    input.currency,
    lines,
    input.depositPct,
    input.now,
    nights.map((night) => ({
      night: night.night,
      cents: night.cents ?? 0,
      rate_id: night.rateId,
    })),
    couponResult,
  );
}

// ---------------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------------

export type TourQuoteInput = {
  currency: string;
  pax: PaxCounts;
  prices: readonly TourPricing[];
  seatsLeft: number;
  departureOpen: boolean;
  /** Instante de la salida, para no cotizar algo que ya salió. */
  startsAt: Date;
  taxes: readonly TaxRule[];
  depositPct: number;
  now: Date;
  coupon?: CouponInput | null;
};

export function buildTourQuote(input: TourQuoteInput): Quote {
  const { pax, prices } = input;

  if (!input.departureOpen) {
    throw new QuoteError("departure_closed");
  }

  if (input.startsAt.getTime() <= input.now.getTime()) {
    throw new QuoteError("past_dates");
  }

  const totalPax = pax.adult + pax.child + pax.infant;
  if (totalPax < 1 || pax.adult < 1) {
    // Un menor o un infante no viaja solo: siempre hace falta al menos un adulto.
    throw new QuoteError("no_pax");
  }

  // Lo que consume cupo son los lugares ocupados, no las personas: el infante
  // que va en brazos no ocupa asiento. Sumar personas aquí es el error clásico
  // de este dominio.
  const seatsNeeded = (Object.keys(pax) as (keyof PaxCounts)[]).reduce((seats, type) => {
    const price = prices.find((entry) => entry.paxType === type);
    return price?.countsTowardCapacity ? seats + pax[type] : seats;
  }, 0);

  if (seatsNeeded > input.seatsLeft) {
    throw new QuoteError("sold_out", { left: input.seatsLeft, asked: seatsNeeded });
  }

  const lines: QuoteLine[] = [];

  for (const type of ["adult", "child", "infant"] as const) {
    const count = pax[type];
    if (count <= 0) continue;

    const price = prices.find((entry) => entry.paxType === type);
    if (!price) {
      throw new QuoteError("no_rate", { pax: type });
    }
    if (price.priceCents === 0) continue; // el infante sin costo no genera línea

    lines.push({
      concept: `pax:${type}:${count}`,
      cents: roundCents(price.priceCents * count),
      kind: "pax",
    });
  }

  const { discountLine, result: couponResult } = applyCoupon(lines, input.coupon);
  if (discountLine) lines.push(discountLine);

  const taxable = sumCents(lines.map((line) => line.cents));
  lines.push(...applyTaxes(taxable, input.taxes, { nights: 1, pax: seatsNeeded }));

  return close(input.currency, lines, input.depositPct, input.now, undefined, couponResult);
}
