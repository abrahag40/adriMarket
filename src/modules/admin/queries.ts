import { sql } from "drizzle-orm";

import { db } from "@/db/index";

/**
 * Lecturas del panel · S4-2, S4-3, S4-4
 *
 * Todo lo que la operación necesita ver en un día normal. Dos diferencias
 * respecto a las consultas de la vitrina:
 *
 * - Aquí **sí** se expone el motivo de un bloqueo: es información de la
 *   operación, y es justo lo que recepción necesita para decidir.
 * - Se ordena por lo que urge, no por lo que es bonito: llegadas de hoy antes
 *   que reservas de marzo.
 */

export type BookingRow = {
  code: string;
  status: string;
  kind: "tour" | "stay";
  productName: string;
  holderName: string;
  holderPhone: string | null;
  when: string | null;
  currency: string;
  totalCents: number;
  balanceDueCents: number;
  createdAt: string;
};

export type BookingFilters = {
  status?: string;
  kind?: string;
  search?: string;
  /** Solo lo que llega o sale hoy. Es la vista que más se usa. */
  today?: boolean;
  /**
   * Solo apartados con plazo de pago vigente.
   *
   * Un apartado cuyo plazo ya venció está muerto: el barrido lo va a expirar y
   * nadie va a pagarlo. Mezclarlo con los vivos entierra los que sí requieren
   * atención, que es exactamente lo contrario de para qué sirve esa lista.
   */
  payable?: boolean;
};

export async function listBookings(filters: BookingFilters = {}): Promise<BookingRow[]> {
  const rows = await db.execute<{
    code: string;
    status: string;
    kind: "tour" | "stay";
    product_name: string;
    holder_name: string;
    holder_phone: string | null;
    when: string | null;
    currency: string;
    total_cents: string;
    balance_due: string;
    created_at: string;
  }>(sql`
    select
      b.code, b.status::text as status, i.kind,
      -- Cae al slug si falta la traducción: una tarjeta sin nombre de producto
      -- obliga a abrirla para saber de qué se trata.
      coalesce(nullif(t.name, ''), pr.slug) as product_name,
      c.full_name as holder_name,
      c.phone as holder_phone,
      coalesce(d.starts_at::text, lower(i.stay_range)::text) as when,
      b.currency, b.total_cents,
      (select coalesce(sum(p.amount_cents), 0) from payments p
        where p.booking_id = b.id and p.purpose = 'balance' and p.status = 'pending') as balance_due,
      b.created_at::text as created_at
    from bookings b
    join customers c on c.id = b.customer_id
    join booking_items i on i.booking_id = b.id
    join products pr on pr.id = i.product_id
    left join product_translations t on t.product_id = pr.id and t.locale = 'es'
    left join tour_departures d on d.id = i.tour_departure_id
    left join locations l on l.id = pr.location_id
    where (${filters.status ?? null}::text is null or b.status::text = ${filters.status ?? null})
      and (${filters.kind ?? null}::text is null or i.kind::text = ${filters.kind ?? null})
      and (
        ${filters.search ?? null}::text is null
        or b.code ilike '%' || ${filters.search ?? null} || '%'
        or c.full_name ilike '%' || ${filters.search ?? null} || '%'
        or c.email ilike '%' || ${filters.search ?? null} || '%'
        or c.phone ilike '%' || ${filters.search ?? null} || '%'
      )
      and (${filters.payable ? 1 : 0} = 0 or b.deposit_due_at > now())
      and (
        ${filters.today ? 1 : 0} = 0
        or lower(i.stay_range) = (now() at time zone coalesce(l.timezone, 'America/Cancun'))::date
        or upper(i.stay_range) = (now() at time zone coalesce(l.timezone, 'America/Cancun'))::date
        or (d.starts_at at time zone coalesce(l.timezone, 'America/Cancun'))::date
             = (now() at time zone coalesce(l.timezone, 'America/Cancun'))::date
      )
    order by
      -- Lo que urge primero: lo que espera pago, luego por fecha de servicio.
      case when b.status = 'hold' then 0 else 1 end,
      coalesce(d.starts_at, lower(i.stay_range)::timestamptz) asc nulls last,
      b.created_at desc
    limit 200
  `);

  return rows.map((row) => ({
    code: row.code,
    status: row.status,
    kind: row.kind,
    productName: row.product_name,
    holderName: row.holder_name,
    holderPhone: row.holder_phone,
    when: row.when,
    currency: row.currency,
    totalCents: Number(row.total_cents),
    balanceDueCents: Number(row.balance_due),
    createdAt: row.created_at,
  }));
}

export type BookingDetail = BookingRow & {
  id: string;
  holderEmail: string | null;
  depositPaidCents: number;
  balancePaidCents: number;
  quote: unknown;
  policy: { text_es?: string } | null;
  meetingPoint: string | null;
  checkIn: string | null;
  checkOut: string | null;
  timezone: string;
  guests: { fullName: string; paxType: string; age: number | null; isLead: boolean }[];
  events: { type: string; createdAt: string; actor: string }[];
};

export async function bookingDetail(code: string): Promise<BookingDetail | null> {
  const rows = await db.execute<Record<string, string | null>>(sql`
    select
      b.id::text, b.code, b.status::text as status, b.currency, b.total_cents,
      b.quote::text as quote, b.cancellation_policy_snapshot::text as policy,
      b.created_at::text as created_at,
      i.kind,
      coalesce(nullif(t.name, ''), pr.slug) as product_name,
      c.full_name as holder_name, c.email as holder_email, c.phone as holder_phone,
      coalesce(d.starts_at::text, lower(i.stay_range)::text) as when,
      lower(i.stay_range)::text as check_in,
      upper(i.stay_range)::text as check_out,
      o.meeting_point,
      coalesce(l.timezone, 'America/Cancun') as timezone,
      (select coalesce(sum(p.amount_cents), 0)::text from payments p
        where p.booking_id = b.id and p.purpose = 'deposit' and p.status = 'succeeded') as deposit_paid,
      (select coalesce(sum(p.amount_cents), 0)::text from payments p
        where p.booking_id = b.id and p.purpose = 'balance' and p.status = 'succeeded') as balance_paid,
      (select coalesce(sum(p.amount_cents), 0)::text from payments p
        where p.booking_id = b.id and p.purpose = 'balance' and p.status = 'pending') as balance_due
    from bookings b
    join customers c on c.id = b.customer_id
    join booking_items i on i.booking_id = b.id
    join products pr on pr.id = i.product_id
    left join product_translations t on t.product_id = pr.id and t.locale = 'es'
    left join tour_departures d on d.id = i.tour_departure_id
    left join tour_options o on o.id = d.tour_option_id
    left join locations l on l.id = pr.location_id
    where b.code = ${code.toUpperCase()}
    limit 1
  `);

  const row = rows[0];
  if (!row) return null;

  const guests = await db.execute<{
    full_name: string;
    pax_type: string;
    age: number | null;
    is_lead: boolean;
  }>(sql`
    select full_name, pax_type::text as pax_type, is_lead,
           case when birthdate is null then null else extract(year from age(birthdate))::int end as age
      from booking_guests where booking_id = ${row.id}::uuid
     order by is_lead desc, full_name
  `);

  const events = await db.execute<{ type: string; created_at: string; actor: string }>(sql`
    select type, created_at::text as created_at,
           coalesce(actor_id, actor_type) as actor
      from booking_events where booking_id = ${row.id}::uuid
     order by created_at desc limit 30
  `);

  return {
    id: row.id ?? "",
    code: row.code ?? "",
    status: row.status ?? "",
    kind: (row.kind as "tour" | "stay") ?? "stay",
    productName: row.product_name ?? "",
    holderName: row.holder_name ?? "",
    holderEmail: row.holder_email ?? null,
    holderPhone: row.holder_phone ?? null,
    when: row.when ?? null,
    checkIn: row.check_in ?? null,
    checkOut: row.check_out ?? null,
    meetingPoint: row.meeting_point ?? null,
    timezone: row.timezone ?? "America/Cancun",
    currency: row.currency ?? "MXN",
    totalCents: Number(row.total_cents ?? 0),
    depositPaidCents: Number(row.deposit_paid ?? 0),
    balancePaidCents: Number(row.balance_paid ?? 0),
    balanceDueCents: Number(row.balance_due ?? 0),
    createdAt: row.created_at ?? "",
    quote: row.quote ? JSON.parse(row.quote) : null,
    policy: row.policy ? JSON.parse(row.policy) : null,
    guests: guests.map((guest) => ({
      fullName: guest.full_name,
      paxType: guest.pax_type,
      age: guest.age === null ? null : Number(guest.age),
      isLead: guest.is_lead,
    })),
    events: events.map((event) => ({
      type: event.type,
      createdAt: event.created_at,
      actor: event.actor,
    })),
  };
}

// ---------------------------------------------------------------------------
// Ocupación
// ---------------------------------------------------------------------------

export type OccupancyDay = {
  night: string;
  unitId: string;
  unitLabel: string;
  /** Código de la reserva, o el motivo si es un bloqueo manual. */
  label: string;
  reason: string;
};

/**
 * Ocupación del mes por unidad.
 *
 * Una consulta para todo el mes, igual que en la vitrina. La diferencia es que
 * aquí sí se dice el motivo y el código: recepción necesita saber si el día está
 * ocupado por una reserva o por mantenimiento.
 */
export async function occupancyMonth(from: string, to: string): Promise<OccupancyDay[]> {
  const rows = await db.execute<{
    night: string;
    unit_id: string;
    unit_label: string;
    label: string;
    reason: string;
  }>(sql`
    select
      d::date::text as night,
      su.id as unit_id,
      coalesce(nullif(t.name, ''), pr.slug) || ' · ' || su.code as unit_label,
      coalesce(b.code, sb.note, sb.reason::text) as label,
      sb.reason::text as reason
    from stay_blocks sb
    join stay_units su on su.id = sb.unit_id
    join products pr on pr.id = su.product_id
    left join product_translations t on t.product_id = pr.id and t.locale = 'es'
    left join booking_items i on i.id = sb.booking_item_id
    left join bookings b on b.id = i.booking_id
    cross join lateral generate_series(
      greatest(lower(sb.stay), ${from}::date)::timestamp,
      (least(upper(sb.stay), ${to}::date) - 1)::timestamp,
      interval '1 day'
    ) d
    where sb.released_at is null
      and sb.stay && daterange(${from}, ${to})
    order by unit_label, night
  `);

  return rows.map((row) => ({
    night: row.night,
    unitId: row.unit_id,
    unitLabel: row.unit_label,
    label: row.label,
    reason: row.reason,
  }));
}

export type UnitOption = { id: string; label: string };

export async function listUnits(): Promise<UnitOption[]> {
  // El nombre cae al slug del producto cuando falta la traducción. Con la cadena
  // vacía la fila se leía " · unidad", que no le dice nada a quien tiene que
  // elegir una unidad en el teléfono.
  const rows = await db.execute<{ id: string; label: string }>(sql`
    select su.id, coalesce(nullif(t.name, ''), pr.slug) || ' · ' || su.code as label
      from stay_units su
      join products pr on pr.id = su.product_id
      left join product_translations t on t.product_id = pr.id and t.locale = 'es'
     where su.active and pr.status <> 'archived'
     order by label
  `);
  return rows.map((row) => ({ id: row.id, label: row.label }));
}

export type ManualBlock = {
  id: string;
  unitLabel: string;
  from: string;
  to: string;
  reason: string;
  note: string | null;
};

export async function listManualBlocks(): Promise<ManualBlock[]> {
  const rows = await db.execute<{
    id: string;
    unit_label: string;
    from: string;
    to: string;
    reason: string;
    note: string | null;
  }>(sql`
    select sb.id,
           coalesce(nullif(t.name, ''), pr.slug) || ' · ' || su.code as unit_label,
           lower(sb.stay)::text as from, upper(sb.stay)::text as to,
           sb.reason::text as reason, sb.note
      from stay_blocks sb
      join stay_units su on su.id = sb.unit_id
      join products pr on pr.id = su.product_id
      left join product_translations t on t.product_id = pr.id and t.locale = 'es'
     where sb.released_at is null
       and sb.reason in ('maintenance', 'owner_use', 'other')
       and upper(sb.stay) >= current_date
     order by lower(sb.stay)
     limit 100
  `);

  return rows.map((row) => ({
    id: row.id,
    unitLabel: row.unit_label,
    from: row.from,
    to: row.to,
    reason: row.reason,
    note: row.note,
  }));
}

// ---------------------------------------------------------------------------
// Manifiesto del guía · S5-4
// ---------------------------------------------------------------------------

export type DepartureRow = {
  id: string;
  productName: string;
  optionName: string;
  startsAt: string;
  timezone: string;
  status: string;
  capacity: number;
  seatsTaken: number;
  meetingPoint: string | null;
};

/** Salidas de un rango de fechas, para el panel y para elegir a cuál mover. */
export async function listDepartures(from: string, to: string): Promise<DepartureRow[]> {
  const rows = await db.execute<{
    id: string;
    product_name: string;
    option_name: string;
    starts_at: string;
    timezone: string;
    status: string;
    capacity: number;
    seats_taken: number;
    meeting_point: string | null;
  }>(sql`
    select d.id,
           coalesce(nullif(t.name, ''), pr.slug) as product_name,
           o.name_es as option_name,
           d.starts_at::text, d.status::text as status,
           d.capacity, d.seats_taken, o.meeting_point,
           coalesce(l.timezone, 'America/Cancun') as timezone
      from tour_departures d
      join tour_options o on o.id = d.tour_option_id
      join products pr on pr.id = o.product_id
      left join product_translations t on t.product_id = pr.id and t.locale = 'es'
      left join locations l on l.id = pr.location_id
     where d.starts_at >= ${from}::timestamptz
       and d.starts_at < ${to}::timestamptz
     order by d.starts_at
     limit 200
  `);

  return rows.map((row) => ({
    id: row.id,
    productName: row.product_name,
    optionName: row.option_name,
    startsAt: row.starts_at,
    timezone: row.timezone,
    status: row.status,
    capacity: Number(row.capacity),
    seatsTaken: Number(row.seats_taken),
    meetingPoint: row.meeting_point,
  }));
}

export async function departureById(departureId: string): Promise<DepartureRow | null> {
  const rows = await db.execute<{
    id: string;
    product_name: string;
    option_name: string;
    starts_at: string;
    timezone: string;
    status: string;
    capacity: number;
    seats_taken: number;
    meeting_point: string | null;
  }>(sql`
    select d.id,
           coalesce(nullif(t.name, ''), pr.slug) as product_name,
           o.name_es as option_name,
           d.starts_at::text, d.status::text as status,
           d.capacity, d.seats_taken, o.meeting_point,
           coalesce(l.timezone, 'America/Cancun') as timezone
      from tour_departures d
      join tour_options o on o.id = d.tour_option_id
      join products pr on pr.id = o.product_id
      left join product_translations t on t.product_id = pr.id and t.locale = 'es'
      left join locations l on l.id = pr.location_id
     where d.id = ${departureId}::uuid
     limit 1
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    productName: row.product_name,
    optionName: row.option_name,
    startsAt: row.starts_at,
    timezone: row.timezone,
    status: row.status,
    capacity: Number(row.capacity),
    seatsTaken: Number(row.seats_taken),
    meetingPoint: row.meeting_point,
  };
}

export type ManifestPax = {
  fullName: string;
  paxType: string;
  age: number | null;
  isLead: boolean;
};

export type ManifestBooking = {
  code: string;
  holderName: string;
  holderPhone: string | null;
  seats: number;
  balanceDueCents: number;
  currency: string;
  pax: ManifestPax[];
};

export type Manifest = {
  departure: DepartureRow;
  bookings: ManifestBooking[];
  totalPax: number;
  totalDueCents: number;
};

/**
 * Manifiesto de una salida.
 *
 * Lo que el guía necesita a las siete de la mañana, en el teléfono y sin
 * computadora: quién viene, cuántos son, las edades de los menores (para
 * chalecos), el teléfono del titular y **quién debe saldo**. Hoy eso es una
 * captura de pantalla de un grupo de WhatsApp.
 *
 * Solo entran reservas vivas. Una cancelada en el manifiesto es peor que no
 * tenerlo: el guía espera a alguien que no va a llegar.
 */
export async function departureManifest(departureId: string): Promise<Manifest | null> {
  const departure = await departureById(departureId);
  if (!departure) return null;

  const rows = await db.execute<{
    booking_id: string;
    code: string;
    holder_name: string;
    holder_phone: string | null;
    seats: number;
    currency: string;
    balance_due: string;
  }>(sql`
    select b.id as booking_id, b.code, c.full_name as holder_name, c.phone as holder_phone,
           i.seats, b.currency,
           (select coalesce(sum(p.amount_cents), 0) from payments p
             where p.booking_id = b.id and p.purpose = 'balance' and p.status = 'pending')::text
             as balance_due
      from booking_items i
      join bookings b on b.id = i.booking_id
      join customers c on c.id = b.customer_id
     where i.tour_departure_id = ${departureId}::uuid
       and b.status in ('confirmed', 'in_progress', 'completed')
     order by c.full_name
  `);

  const bookings: ManifestBooking[] = [];
  for (const row of rows) {
    const pax = await db.execute<{
      full_name: string;
      pax_type: string;
      age: number | null;
      is_lead: boolean;
    }>(sql`
      select full_name, pax_type::text as pax_type, is_lead,
             case when birthdate is null then null
                  else extract(year from age(birthdate))::int end as age
        from booking_guests where booking_id = ${row.booking_id}::uuid
       order by is_lead desc, full_name
    `);

    bookings.push({
      code: row.code,
      holderName: row.holder_name,
      holderPhone: row.holder_phone,
      seats: Number(row.seats),
      currency: row.currency,
      balanceDueCents: Number(row.balance_due),
      pax: pax.map((guest) => ({
        fullName: guest.full_name,
        paxType: guest.pax_type,
        age: guest.age === null ? null : Number(guest.age),
        isLead: guest.is_lead,
      })),
    });
  }

  return {
    departure,
    bookings,
    totalPax: bookings.reduce((sum, booking) => sum + booking.seats, 0),
    totalDueCents: bookings.reduce((sum, booking) => sum + booking.balanceDueCents, 0),
  };
}
