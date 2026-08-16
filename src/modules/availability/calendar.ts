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
export async function stayAvailability(
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
      from stay_availability_range(${unitId}::uuid, daterange(${from}, ${to}))
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
      from stay_units su
     where su.product_id = ${productId}::uuid and su.active
     order by su.max_guests desc
     limit 1
  `);
  return rows[0]?.id ?? null;
}

export type TourDay = {
  date: string;
  departureId: string;
  startsAt: string;
  seatsLeft: number;
  capacity: number;
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
): Promise<TourDay[]> {
  const rows = await db.execute<{
    date: string;
    departure_id: string;
    starts_at: string;
    seats_left: number;
    capacity: number;
  }>(sql`
    select
      (d.starts_at at time zone coalesce(l.timezone, 'America/Cancun'))::date as date,
      d.id as departure_id,
      d.starts_at,
      (d.capacity - d.seats_taken) as seats_left,
      d.capacity
    from tour_departures d
    join tour_options o on o.id = d.tour_option_id
    join products p on p.id = o.product_id
    left join locations l on l.id = p.location_id
    where o.product_id = ${productId}::uuid
      and o.active
      and d.status = 'open'
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
    startsAt: row.starts_at,
    seatsLeft: Number(row.seats_left),
    capacity: Number(row.capacity),
  }));
}
