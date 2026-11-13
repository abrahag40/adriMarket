import { sql } from "drizzle-orm";

import { db } from "@/db/index";

/**
 * Disponibilidad de un mes para pintar el calendario de la ficha · S2-3
 *
 * Dos reglas que atraviesan el módulo:
 *
 * 1. **Una sola consulta por mes.** El calendario se pinta en cada visita a una
 *    ficha; una consulta por día serían treinta viajes a la base por página.
 * 2. **Se expone disponibilidad, nunca el motivo.** El huésped no tiene por qué
 *    saber que la casa está en mantenimiento o que la está usando el
 *    propietario. Solo si puede o no reservar esa noche.
 */

export type StayNight = {
  night: string;
  available: boolean;
  nightlyCents: number | null;
};

/**
 * Noches de un rango con su disponibilidad y su tarifa.
 *
 * Una noche ocupada del 14 al 17 marca 14, 15 y 16 — no el 17. Es la semántica
 * `[entrada, salida)` del esquema, y es lo que hace que la salida de un huésped
 * y la llegada del siguiente el mismo día no se estorben.
 */
export async function rentalAvailability(
  unitId: string,
  from: string,
  to: string,
): Promise<StayNight[]> {
  const rows = await db.execute<{
    night: string;
    available: boolean;
    nightly_cents: string | null;
  }>(sql`
    select night, available, nightly_cents
      from rental_availability_range(${unitId}::uuid, daterange(${from}, ${to}))
     order by night
  `);

  return rows.map((row) => ({
    night: row.night,
    available: row.available,
    nightlyCents: row.nightly_cents === null ? null : Number(row.nightly_cents),
  }));
}

/** Unidad que se muestra en el calendario de la ficha: la de mayor capacidad. */
export async function primaryUnitId(productId: string): Promise<string | null> {
  const rows = await db.execute<{ id: string }>(sql`
    select su.id
      from rental_units su
     where su.product_id = ${productId}::uuid and su.active
     order by su.max_guests desc
     limit 1
  `);
  return rows[0]?.id ?? null;
}

export type TourDay = {
  date: string;
  departureId: string;
  optionId: string;
  startsAt: string;
  seatsLeft: number;
  capacity: number;
  /** Barco privado: la salida se vende entera o no se vende (decisión 0022). */
  private: boolean;
};

/**
 * Salidas de un tour en un rango de fechas, con lugares disponibles.
 *
 * La fecha se agrupa en la zona del producto y no en UTC: una salida a las 09:00
 * de Cancún es 14:00 UTC, y agrupando en UTC caería en el día correcto por
 * casualidad — pero una salida nocturna caería en el día siguiente.
 */
export async function tourDepartures(
  productId: string,
  from: string,
  to: string,
  /** Solo las salidas de esta opción. Sin ella, las de todas. */
  optionId?: string,
): Promise<TourDay[]> {
  const rows = await db.execute<{
    date: string;
    departure_id: string;
    option_id: string;
    starts_at: string;
    seats_left: number;
    capacity: number;
    private: boolean;
  }>(sql`
    select
      (d.starts_at at time zone coalesce(l.timezone, 'America/Cancun'))::date as date,
      d.id as departure_id,
      o.id as option_id,
      d.starts_at,
      -- La función, no capacity - seats_taken: un barco apartado en otra
      -- opción que se encima también deja esta salida sin lugares.
      tour_seats_left(d.id) as seats_left,
      d.capacity,
      o.pricing_mode = 'private' as private
    from tour_departures d
    join tour_options o on o.id = d.tour_option_id
    join products p on p.id = o.product_id
    left join locations l on l.id = p.location_id
    where o.product_id = ${productId}::uuid
      and o.active
      and d.status = 'open'
      and (${optionId ?? null}::uuid is null or o.id = ${optionId ?? null}::uuid)
      -- Una salida que ya partió no está a la venta, aunque siga siendo de hoy.
      --
      -- El filtro es por fecha y esto es por instante, a propósito: el calendario
      -- razona en días, pero a las tres de la tarde la salida de las nueve ya se
      -- fue. Sin esta línea la vitrina la preseleccionaba, el motor la rechazaba
      -- por fecha pasada y el huésped se quedaba sin precio a la vista.
      and d.starts_at > now()
      and (d.starts_at at time zone coalesce(l.timezone, 'America/Cancun'))::date
            >= ${from}::date
      and (d.starts_at at time zone coalesce(l.timezone, 'America/Cancun'))::date
            < ${to}::date
    order by d.starts_at
  `);

  return rows.map((row) => ({
    date: row.date,
    departureId: row.departure_id,
    optionId: row.option_id,
    startsAt: row.starts_at,
    seatsLeft: Number(row.seats_left),
    capacity: Number(row.capacity),
    private: row.private,
  }));
}

export type TourOptionOnSale = {
  id: string;
  name: string;
  private: boolean;
  /** Precio que se exhibe en el selector: el barco, o el adulto. Sin impuestos. */
  fromCents: number | null;
  /** Si el operador dio tarifa de niño: sin ella no se ofrece el campo. */
  hasChildPrice: boolean;
  /** Edades de la tarifa de niño, si la ficha las da. */
  childAges: { min: number; max: number } | null;
  capacity: number;
};

/**
 * Las opciones activas de un tour, en el idioma del huésped.
 *
 * Existe por los barcos: un tour de una opción nunca necesitó elegirla, pero
 * la Leopard se vende en 4, 5, 6 y 8 horas y en "8 horas Cozumel", y sin este
 * selector el calendario mezclaba las salidas de todas en el mismo día.
 */
export async function tourOptionsOnSale(productId: string, locale: "es" | "en"): Promise<TourOptionOnSale[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    private: boolean;
    from_cents: string | null;
    has_child: boolean;
    child_min: number | null;
    child_max: number | null;
    capacity: number;
  }>(sql`
    select
      o.id,
      case when ${locale} = 'en' then coalesce(o.name_en, o.name_es) else o.name_es end as name,
      o.pricing_mode = 'private' as private,
      -- Por resale_price(): en un sitio que revende, el precio al huésped.
      resale_price(case when o.pricing_mode = 'private' then o.private_price_cents
                        else (select pp.price_cents from tour_pax_prices pp
                               where pp.tour_option_id = o.id and pp.pax_type = 'adult')
                   end, true) as from_cents,
      exists (select 1 from tour_pax_prices pp
               where pp.tour_option_id = o.id and pp.pax_type = 'child') as has_child,
      (select pp.min_age from tour_pax_prices pp
        where pp.tour_option_id = o.id and pp.pax_type = 'child') as child_min,
      (select pp.max_age from tour_pax_prices pp
        where pp.tour_option_id = o.id and pp.pax_type = 'child') as child_max,
      o.default_capacity as capacity
    from tour_options o
    where o.product_id = ${productId}::uuid
      and o.active
    order by o.duration_minutes nulls last, o.code
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    private: row.private,
    fromCents: row.from_cents === null ? null : Number(row.from_cents),
    hasChildPrice: row.has_child,
    childAges:
      row.child_min !== null && row.child_max !== null
        ? { min: Number(row.child_min), max: Number(row.child_max) }
        : null,
    capacity: Number(row.capacity),
  }));
}
