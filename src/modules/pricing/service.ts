import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import type { DateRange } from "@/db/types";
import { todayIn } from "@/time";

import { buildStayQuote, buildTourQuote } from "./quote";
import {
  QuoteError,
  type NightRate,
  type PaxCounts,
  type Quote,
  type StayUnitPricing,
  type TaxRule,
  type TourPricing,
} from "./types";

/**
 * Cotización · S2-1 y S2-2
 *
 * Esta es la **única** función autorizada para decir cuánto cuesta algo. La usan
 * la ficha, el checkout (Sprint 3), el panel y los reportes. El navegador nunca
 * suma: recibe el desglose ya hecho.
 *
 * Aquí solo hay lecturas y composición; las reglas y la aritmética viven en
 * `quote.ts`, que es puro y se prueba sin base de datos.
 */

// ---------------------------------------------------------------------------
// Impuestos
// ---------------------------------------------------------------------------

/**
 * Impuestos aplicables a un producto, hoy.
 *
 * Se filtra por tipo de producto y por ubicación: el impuesto al hospedaje de
 * Quintana Roo aplica a estancias, el IVA a todo. Son configuración porque
 * cambian por decreto.
 */
async function taxesFor(productId: string): Promise<TaxRule[]> {
  const rows = await db.execute<{
    name: string;
    kind: TaxRule["kind"];
    rate: string;
    included_in_price: boolean;
  }>(sql`
    select t.name, t.kind, t.rate, t.included_in_price
      from tax_rates t
      join products p on p.id = ${productId}::uuid
     where t.active
       and (t.applies_to is null or t.applies_to = p.kind)
       and (t.location_id is null or t.location_id = p.location_id)
       and (t.valid_from is null or t.valid_from <= current_date)
       and (t.valid_to is null or t.valid_to >= current_date)
     order by t.kind, t.rate
  `);

  return rows.map((row) => ({
    name: row.name,
    kind: row.kind,
    rate: Number(row.rate),
    included_in_price: row.included_in_price,
  }));
}

/**
 * Factor por el que hay que multiplicar un precio neto para obtener el precio
 * con impuestos.
 *
 * Se usa solo en los precios "desde" del catálogo, que son indicativos. El
 * precio exacto siempre sale de una cotización completa.
 *
 * **Supuesto documentado:** los precios que se exhiben al huésped incluyen
 * impuestos. La ley de protección al consumidor obliga a exhibir el total, así
 * que un "desde" sin impuestos sería un precio que nadie puede pagar.
 */
export async function taxFactorFor(productId: string): Promise<number> {
  const taxes = await taxesFor(productId);
  return taxes
    .filter((tax) => tax.kind === "percent" && !tax.included_in_price)
    .reduce((factor, tax) => factor + tax.rate / 100, 1);
}

// ---------------------------------------------------------------------------
// Estancias
// ---------------------------------------------------------------------------

type StayContext = {
  unitId: string;
  currency: string;
  timezone: string;
  depositPct: number;
  unit: StayUnitPricing;
};

/**
 * Elige la unidad que se va a cotizar: la más chica que alcanza para el número
 * de personas. Cotizar la casa de seis para dos huéspedes desperdicia inventario
 * y encarece la oferta sin razón.
 */
async function stayContext(productId: string, guests: number): Promise<StayContext | null> {
  const rows = await db.execute<{
    unit_id: string;
    currency: string;
    timezone: string;
    deposit_pct: string;
    max_guests: number;
    base_guests: number;
    extra_guest_fee_cents: string;
    cleaning_fee_cents: string;
    min_nights: number;
  }>(sql`
    select
      su.id as unit_id,
      p.currency,
      coalesce(l.timezone, 'America/Cancun') as timezone,
      resolve_deposit_pct(p.id) as deposit_pct,
      su.max_guests, su.base_guests, su.extra_guest_fee_cents,
      su.cleaning_fee_cents, su.min_nights
    from stay_units su
    join products p on p.id = su.product_id
    left join locations l on l.id = p.location_id
    where su.product_id = ${productId}::uuid
      and su.active
      and su.max_guests >= ${guests}
    order by su.max_guests
    limit 1
  `);

  const row = rows[0];
  if (!row) return null;

  return {
    unitId: row.unit_id,
    currency: row.currency,
    timezone: row.timezone,
    depositPct: Number(row.deposit_pct),
    unit: {
      maxGuests: Number(row.max_guests),
      baseGuests: Number(row.base_guests),
      extraGuestFeeCents: Number(row.extra_guest_fee_cents),
      cleaningFeeCents: Number(row.cleaning_fee_cents),
      minNights: Number(row.min_nights),
    },
  };
}

export type StayQuoteResult = {
  quote: Quote;
  unitId: string;
  /** Falso cuando las fechas están ocupadas: el precio es válido, no la fecha. */
  available: boolean;
};

/**
 * Cotiza una estancia.
 *
 * **Cotizar no aparta inventario.** La disponibilidad se informa, pero nada se
 * bloquea: apartar es del checkout (Sprint 3). Si cotizar apartara, cada
 * visitante que mueve el selector dejaría fechas fuera de venta.
 */
export async function quoteStay(
  productId: string,
  range: DateRange,
  guests: number,
  now: Date = new Date(),
): Promise<StayQuoteResult> {
  const context = await stayContext(productId, guests);
  if (!context) {
    // No hay ninguna unidad de este producto que alcance para tantas personas.
    const capacity = await db.execute<{ max_guests: number | null }>(sql`
      select max(su.max_guests) as max_guests
        from stay_units su
       where su.product_id = ${productId}::uuid and su.active
    `);
    throw new QuoteError("over_capacity", { max: Number(capacity[0]?.max_guests ?? 0) });
  }

  const [nightRows, departureRows, taxes] = await Promise.all([
    db.execute<{
      night: string;
      nightly_cents: string | null;
      rate_id: string | null;
      min_nights: number | null;
      closed_to_arrival: boolean;
      closed_to_departure: boolean;
    }>(sql`
      select night, nightly_cents, rate_id, min_nights, closed_to_arrival, closed_to_departure
        from stay_nightly_rates(${context.unitId}::uuid, daterange(${range.from}, ${range.to}))
       order by night
    `),
    db.execute<{ closed_to_departure: boolean }>(sql`
      select closed_to_departure from stay_rate_at(${context.unitId}::uuid, ${range.to}::date)
    `),
    taxesFor(productId),
  ]);

  const nights: NightRate[] = nightRows.map((row) => ({
    night: row.night,
    cents: row.nightly_cents === null ? null : Number(row.nightly_cents),
    rateId: row.rate_id,
    minNights: row.min_nights === null ? null : Number(row.min_nights),
    closedToArrival: row.closed_to_arrival,
    closedToDeparture: row.closed_to_departure,
  }));

  const quote = buildStayQuote({
    currency: context.currency,
    range,
    guests,
    unit: context.unit,
    nights,
    departureRate: departureRows[0] ? { closedToDeparture: departureRows[0].closed_to_departure } : null,
    taxes,
    depositPct: context.depositPct,
    today: todayIn(context.timezone, now),
    now,
  });

  const availability = await db.execute<{ available: boolean }>(sql`
    select stay_is_available(${context.unitId}::uuid, daterange(${range.from}, ${range.to})) as available
  `);

  return {
    quote,
    unitId: context.unitId,
    available: availability[0]?.available ?? false,
  };
}

// ---------------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------------

export type TourQuoteResult = {
  quote: Quote;
  departureId: string;
  startsAt: string;
  seatsLeft: number;
  /**
   * Lugares que ocupa este grupo, según `counts_toward_capacity`.
   *
   * Se expone para que el apartado use el mismo número que la validación del
   * precio. Recalcularlo en el checkout sería duplicar la regla del infante que
   * no ocupa asiento, y dos copias de una regla se separan tarde o temprano.
   */
  seatsNeeded: number;
};

/**
 * Cotiza un tour para una salida concreta.
 *
 * Igual que en estancias: informa cupo, no lo aparta.
 */
export async function quoteTour(
  productId: string,
  departureId: string,
  pax: PaxCounts,
  now: Date = new Date(),
): Promise<TourQuoteResult> {
  const rows = await db.execute<{
    departure_id: string;
    starts_at: string;
    status: string;
    seats_left: number;
    currency: string;
    deposit_pct: string;
    option_id: string;
  }>(sql`
    select
      d.id as departure_id,
      d.starts_at,
      d.status::text as status,
      (d.capacity - d.seats_taken) as seats_left,
      p.currency,
      resolve_deposit_pct(p.id) as deposit_pct,
      o.id as option_id
    from tour_departures d
    join tour_options o on o.id = d.tour_option_id
    join products p on p.id = o.product_id
    where d.id = ${departureId}::uuid
      and o.product_id = ${productId}::uuid
    limit 1
  `);

  const departure = rows[0];
  if (!departure) {
    throw new QuoteError("departure_closed");
  }

  const [priceRows, taxes] = await Promise.all([
    db.execute<{
      pax_type: TourPricing["paxType"];
      price_cents: string;
      counts_toward_capacity: boolean;
    }>(sql`
      select pax_type, price_cents, counts_toward_capacity
        from tour_pax_prices
       where tour_option_id = ${departure.option_id}::uuid
    `),
    taxesFor(productId),
  ]);

  const prices = priceRows.map((row) => ({
    paxType: row.pax_type,
    priceCents: Number(row.price_cents),
    countsTowardCapacity: row.counts_toward_capacity,
  }));

  const quote = buildTourQuote({
    currency: departure.currency,
    pax,
    prices,
    seatsLeft: Number(departure.seats_left),
    departureOpen: departure.status === "open",
    startsAt: new Date(departure.starts_at),
    taxes,
    depositPct: Number(departure.deposit_pct),
    now,
  });

  const seatsNeeded = (Object.keys(pax) as (keyof PaxCounts)[]).reduce((seats, type) => {
    const price = prices.find((entry) => entry.paxType === type);
    return price?.countsTowardCapacity ? seats + pax[type] : seats;
  }, 0);

  return {
    quote,
    departureId: departure.departure_id,
    startsAt: departure.starts_at,
    seatsLeft: Number(departure.seats_left),
    seatsNeeded,
  };
}
