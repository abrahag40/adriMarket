/**
 * Contratos del motor de cotización.
 *
 * El desglose que se produce aquí es el mismo objeto que el Sprint 3 congelará
 * en `bookings.quote`, así que sus llaves están en snake_case: es formato de
 * almacenamiento, no de código. El formato está documentado en
 * docs/esquema.md#el-desglose-de-la-cotización.
 */

export type QuoteLineKind =
  | "nightly" // una noche de hospedaje
  | "occupancy" // huéspedes por encima de la base
  | "pax" // pasajeros de un tour, por tipo
  | "fee" // cargos fijos: limpieza, etc.
  | "discount" // siempre negativo
  | "tax";

export type QuoteLine = {
  concept: string;
  cents: number;
  kind: QuoteLineKind;
};

export type QuoteNight = {
  night: string; // YYYY-MM-DD
  cents: number;
  rate_id: string | null;
};

export type Quote = {
  currency: string;
  lines: QuoteLine[];
  /** Suma exacta de `lines`. Nunca se recalcula por otra vía. */
  total_cents: number;
  deposit_pct: number;
  deposit_cents: number;
  balance_cents: number;
  /** Solo en estancias: detalle noche por noche. */
  nights?: QuoteNight[];
  quoted_at: string;
};

/**
 * Reglas de impuesto aplicables.
 *
 * `included_in_price` significa que la tarifa configurada YA lleva ese impuesto
 * dentro: entonces no se suma nada y el impuesto solo se informa. Cuando es
 * falso, la tarifa es neta y el impuesto se agrega.
 */
export type TaxRule = {
  name: string;
  kind: "percent" | "fixed_per_night" | "fixed_per_pax";
  /** Porcentaje (16 = 16%) o centavos, según `kind`. */
  rate: number;
  included_in_price: boolean;
};

/** Motivos por los que no se puede cotizar. La traducción vive en la interfaz. */
export type QuoteErrorCode =
  | "invalid_range"
  | "past_dates"
  | "no_rate"
  | "min_nights"
  | "closed_to_arrival"
  | "closed_to_departure"
  | "over_capacity"
  | "no_pax"
  | "sold_out"
  | "departure_closed";

/**
 * Error de cotización.
 *
 * Lleva un código y datos, no un mensaje: el texto se arma en la interfaz, en
 * el idioma de la página. Un mensaje construido aquí terminaría en español para
 * un huésped que está leyendo en inglés.
 */
export class QuoteError extends Error {
  readonly code: QuoteErrorCode;
  readonly params: Record<string, number | string>;

  constructor(code: QuoteErrorCode, params: Record<string, number | string> = {}) {
    super(`quote:${code} ${JSON.stringify(params)}`);
    this.name = "QuoteError";
    this.code = code;
    this.params = params;
  }
}

export type StayUnitPricing = {
  maxGuests: number;
  baseGuests: number;
  extraGuestFeeCents: number;
  cleaningFeeCents: number;
  minNights: number;
};

export type NightRate = {
  night: string;
  cents: number | null;
  rateId: string | null;
  minNights: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
};

export type PaxCounts = { adult: number; child: number; infant: number };

export type TourPricing = {
  paxType: keyof PaxCounts;
  priceCents: number;
  countsTowardCapacity: boolean;
};
