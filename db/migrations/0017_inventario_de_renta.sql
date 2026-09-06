-- 0017_inventario_de_renta.sql
--
-- Un solo mecanismo de inventario por rango de fechas, con nombre honesto.
--
-- El negocio suma un tercer inventario: renta de scooters, autos y camionetas.
-- Un vehículo se agota exactamente como una casa —una unidad concreta queda
-- ocupada mientras alguien la tiene entre dos fechas— y nada como un tour, que
-- vende lugares en una salida. O sea que el mecanismo ya existía: la
-- restricción de exclusión sobre rangos, los bloqueos, los planes de tarifa y
-- las ocho funciones que los operan.
--
-- Lo que faltaba era el nombre. `stay_units` con scooters adentro es la clase
-- de mentira que en seis meses hace que alguien escriba tablas paralelas para
-- vehículos "porque las de estancias son de casas" — justo la duplicación que
-- se quiere evitar. Así que el mecanismo pasa a llamarse `rental_*`: unidades
-- que se ocupan por rango de fechas, sean casas o vehículos.
--
-- **El tipo de producto `stay` NO se renombra.** Una casa sigue siendo una
-- estancia; lo que se generaliza es cómo se ocupa, no qué es. Por eso en los
-- cuerpos de las funciones sobrevive un `kind = \'stay\'` intacto.
--
-- Esta migración **solo renombra**. No cambia una sola condición ni agrega
-- comportamiento: los cuerpos de las diez funciones se volcaron de la base con
-- `pg_get_functiondef` y se les aplicó el mapa de renombres, para que sea
-- imposible que se cuele un cambio de lógica disfrazado de refactor. Los
-- vehículos entran en la migración siguiente.
--
-- Renombres:
--
--   stay_units      → rental_units        booking_items.stay_unit_id → rental_unit_id
--   stay_blocks     → rental_blocks       booking_items.stay_range   → rental_range
--   stay_rate_plans → rental_rate_plans   rental_blocks.stay         → dates
--   stay_rates      → rental_rates
--
--   stay_is_available        → rental_is_available
--   stay_hold_create         → rental_hold_create
--   stay_availability_range  → rental_availability_range
--   stay_nightly_rates       → rental_nightly_rates
--   stay_rate_at             → rental_rate_at
--   booking_reschedule_stay  → booking_reschedule_rental

begin;

-- 1. Las tablas -------------------------------------------------------------

alter table stay_units      rename to rental_units;
alter table stay_blocks     rename to rental_blocks;
alter table stay_rate_plans rename to rental_rate_plans;
alter table stay_rates      rename to rental_rates;

-- 2. Las columnas -----------------------------------------------------------
--
-- `stay` era el rango de fechas que ocupa un bloqueo. `dates` dice lo mismo
-- sin prometer que sea una casa.

alter table rental_blocks rename column stay to dates;
alter table booking_items rename column stay_unit_id to rental_unit_id;
alter table booking_items rename column stay_range   to rental_range;

-- 3. Índices y restricciones -------------------------------------------------
--
-- Los nombres viajan con el objeto renombrado, así que sin esto quedaría un
-- `stay_blocks_no_overlap` sobre `rental_blocks` — el mismo problema, más
-- escondido.

alter table rental_blocks rename constraint stay_blocks_booking_item_fk to rental_blocks_booking_item_fk;
alter table rental_blocks rename constraint stay_blocks_created_by_fkey to rental_blocks_created_by_fkey;
alter table rental_blocks rename constraint stay_blocks_hold_has_expiry to rental_blocks_hold_has_expiry;
alter table rental_blocks rename constraint stay_blocks_no_overlap to rental_blocks_no_overlap;
alter table rental_blocks rename constraint stay_blocks_not_empty to rental_blocks_not_empty;
alter table rental_blocks rename constraint stay_blocks_pkey to rental_blocks_pkey;
alter table rental_blocks rename constraint stay_blocks_unit_id_fkey to rental_blocks_unit_id_fkey;
alter table rental_rate_plans rename constraint stay_rate_plans_pkey to rental_rate_plans_pkey;
alter table rental_rate_plans rename constraint stay_rate_plans_unit_id_fkey to rental_rate_plans_unit_id_fkey;
alter table rental_rates rename constraint stay_rates_dows_valid to rental_rates_dows_valid;
alter table rental_rates rename constraint stay_rates_min_nights_check to rental_rates_min_nights_check;
alter table rental_rates rename constraint stay_rates_nightly_cents_check to rental_rates_nightly_cents_check;
alter table rental_rates rename constraint stay_rates_pkey to rental_rates_pkey;
alter table rental_rates rename constraint stay_rates_rate_plan_id_fkey to rental_rates_rate_plan_id_fkey;
alter table rental_rates rename constraint stay_rates_season_not_empty to rental_rates_season_not_empty;
alter table rental_units rename constraint stay_units_base_guests_check to rental_units_base_guests_check;
alter table rental_units rename constraint stay_units_cleaning_fee_cents_check to rental_units_cleaning_fee_cents_check;
alter table rental_units rename constraint stay_units_extra_guest_fee_cents_check to rental_units_extra_guest_fee_cents_check;
alter table rental_units rename constraint stay_units_guests_ok to rental_units_guests_ok;
alter table rental_units rename constraint stay_units_max_guests_check to rental_units_max_guests_check;
alter table rental_units rename constraint stay_units_min_nights_check to rental_units_min_nights_check;
alter table rental_units rename constraint stay_units_pkey to rental_units_pkey;
alter table rental_units rename constraint stay_units_product_id_code_key to rental_units_product_id_code_key;
alter table rental_units rename constraint stay_units_product_id_fkey to rental_units_product_id_fkey;

alter index stay_blocks_expiry_idx rename to rental_blocks_expiry_idx;
alter index stay_blocks_unit_idx rename to rental_blocks_unit_idx;
alter index stay_rates_lookup_idx rename to rental_rates_lookup_idx;

-- 4. Las funciones ----------------------------------------------------------
--
-- Se recrean enteras, no se renombran: el cuerpo de una función plpgsql
-- resuelve los nombres al ejecutarse, así que renombrar las tablas las habría
-- roto en la primera reserva y no antes.

CREATE OR REPLACE FUNCTION public.booking_cancel(p_booking_id uuid, p_reason text, p_by_operator boolean DEFAULT false, p_actor_type text DEFAULT 'staff'::text, p_actor_id text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
  v_booking  bookings;
  v_customer customers;
  v_refund   bigint;
  v_pct      numeric;
  v_paid     bigint;
  v_payment  uuid;
  v_left     bigint;
  v_take     bigint;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'La reserva % no existe', p_booking_id using errcode = 'AM003';
  end if;

  if v_booking.status = 'cancelled' then
    return 0;                                       -- idempotente
  end if;

  if v_booking.status not in ('hold', 'confirmed', 'in_progress') then
    raise exception 'No se puede cancelar una reserva en estado %', v_booking.status
      using errcode = 'AM003';
  end if;

  if p_by_operator then
    select paid_cents into v_paid from booking_refund_quote(p_booking_id);
    v_refund := v_paid;
    v_pct := 100;
  else
    select refund_cents, refund_pct, paid_cents
      into v_refund, v_pct, v_paid
      from booking_refund_quote(p_booking_id);
  end if;

  update rental_blocks
     set released_at = now()
   where released_at is null
     and booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  update tour_seat_holds tsh
     set released_at = now()
   where tsh.released_at is null
     and tsh.booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  update tour_departures d
     set seats_taken = greatest(
           0,
           d.seats_taken - coalesce((
             select sum(h.seats) from tour_seat_holds h
               join booking_items bi on bi.id = h.booking_item_id
              where bi.booking_id = p_booking_id
                and h.departure_id = d.id
                and h.released_at >= now() - interval '1 second'
           ), 0)
         )
   where d.id in (
     select i.tour_departure_id from booking_items i
      where i.booking_id = p_booking_id and i.tour_departure_id is not null
   );

  update payments
     set status = 'cancelled'
   where booking_id = p_booking_id and purpose = 'balance' and status = 'pending';

  v_left := v_refund;
  for v_payment, v_take in
    select p.id, p.amount_cents from payments p
     where p.booking_id = p_booking_id and p.status = 'succeeded'
     order by p.paid_at nulls last, p.created_at
  loop
    exit when v_left <= 0;
    insert into refunds (payment_id, amount_cents, currency, reason, status, created_by)
    values (v_payment, least(v_left, v_take), v_booking.currency,
            coalesce(p_reason, 'Cancelación'), 'pending',
            case when p_actor_type = 'staff' then p_actor_id::uuid end);
    v_left := v_left - least(v_left, v_take);
  end loop;

  update bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = p_reason
   where id = p_booking_id;

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id,
          case when p_by_operator then 'booking.cancelled_by_operator'
               else 'booking.cancelled_by_guest' end,
          jsonb_build_object('refund_cents', v_refund, 'refund_pct', v_pct,
                             'paid_cents', v_paid, 'reason', p_reason),
          p_actor_type, p_actor_id);

  select * into v_customer from customers where id = v_booking.customer_id;

  insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
  values ('email',
          case when p_by_operator then 'booking_cancelled_by_operator'
               else 'booking_cancelled_by_guest' end,
          v_booking.locale, coalesce(v_customer.email, ''),
          jsonb_build_object('booking_code', v_booking.code,
                             'refund_cents', v_refund,
                             'reason', p_reason),
          p_booking_id,
          'booking:' || p_booking_id || ':cancelled:guest')
  on conflict (dedupe_key) do nothing;

  if p_by_operator then
    perform outbox_enqueue_whatsapp(
      p_booking_id, 'booking_cancelled_by_operator',
      jsonb_build_object('refund_cents', v_refund, 'reason', p_reason)
    );
  end if;

  return v_refund;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.booking_confirm(p_booking_id uuid, p_actor text DEFAULT 'system'::text)
 RETURNS booking_status
 LANGUAGE plpgsql
AS $function$
declare
  v_booking     bookings;
  v_customer    customers;
  v_deposit     bigint;
  v_admin_email text;
begin
  select * into v_booking from bookings where id = p_booking_id for update;

  if not found then
    raise exception 'La reserva % no existe', p_booking_id using errcode = 'AM003';
  end if;

  if v_booking.status = 'confirmed' then
    return v_booking.status;                       -- idempotente
  end if;

  if v_booking.status <> 'hold' then
    raise exception 'No se puede confirmar una reserva en estado %', v_booking.status
      using errcode = 'AM003';
  end if;

  -- El anticipo tiene que estar efectivamente cobrado.
  select coalesce(sum(amount_cents), 0) into v_deposit
    from payments
   where booking_id = p_booking_id
     and purpose = 'deposit'
     and status = 'succeeded';

  if v_deposit < v_booking.deposit_cents then
    raise exception 'Anticipo insuficiente: cobrado %, requerido %',
      v_deposit, v_booking.deposit_cents using errcode = 'AM003';
  end if;

  -- Las noches apartadas pasan de hold a ocupación firme.
  update rental_blocks sb
     set reason = 'booking', expires_at = null
   where sb.released_at is null
     and sb.reason = 'hold'
     and sb.booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  -- Los lugares apartados quedan confirmados (siguen contando en seats_taken).
  update tour_seat_holds tsh
     set confirmed_at = now(), expires_at = null
   where tsh.released_at is null
     and tsh.confirmed_at is null
     and tsh.booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  update bookings
     set status = 'confirmed',
         confirmed_at = now(),
         deposit_due_at = null
   where id = p_booking_id;

  -- El saldo pendiente se registra como pago por cobrar, no como faltante.
  if v_booking.balance_cents > 0 then
    insert into payments (booking_id, purpose, status, method, provider, amount_cents, currency)
    values (p_booking_id, 'balance', 'pending', 'cash', 'onsite',
            v_booking.balance_cents, v_booking.currency);
  end if;

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id, 'booking.confirmed',
          jsonb_build_object('deposit_cents', v_deposit,
                             'balance_cents', v_booking.balance_cents),
          'provider', p_actor);

  -- Avisos: mismo commit que la confirmación.
  select * into v_customer from customers where id = v_booking.customer_id;

  insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
  values (
    'email', 'booking_confirmed_guest', v_booking.locale,
    coalesce(v_customer.email, ''),
    jsonb_build_object('booking_code', v_booking.code),
    p_booking_id,
    'booking:' || p_booking_id || ':confirmed:guest'
  )
  on conflict (dedupe_key) do nothing;

  -- El aviso a la administración solo si hay a dónde mandarlo. Sin el ajuste
  -- cargado no se encola nada: una fila que no se puede entregar nunca no es un
  -- aviso pendiente, es basura que se hace pasar por falla de entrega.
  select nullif(trim(value ->> 'admin_email'), '') into v_admin_email
    from settings where key = 'notifications';

  if v_admin_email is not null then
    insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
    values (
      'email', 'booking_confirmed_admin', 'es', v_admin_email,
      jsonb_build_object('booking_code', v_booking.code),
      p_booking_id,
      'booking:' || p_booking_id || ':confirmed:admin'
    )
    on conflict (dedupe_key) do nothing;
  end if;

  -- Y por WhatsApp, si dejó número. Es el canal por el que este negocio ya se
  -- comunica: un correo se le pierde entre las promociones.
  perform outbox_enqueue_whatsapp(
    p_booking_id, 'booking_confirmed_guest',
    jsonb_build_object('booking_code', v_booking.code)
  );

  return 'confirmed'::booking_status;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.booking_expire_holds()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_booking_id uuid;
  v_count      integer := 0;
  v_orphans    integer := 0;
  v_orphan_seats integer := 0;
begin
  for v_booking_id in
    select id from bookings
     where status = 'hold'
       and deposit_due_at is not null
       and deposit_due_at < now()
     order by deposit_due_at
     for update skip locked                        -- no pelea con otro worker
  loop
    -- Devolver los lugares de tour al contador de la salida.
    update tour_departures td
       set seats_taken = td.seats_taken - agg.seats
      from (
        select tsh.departure_id, sum(tsh.seats) as seats
          from tour_seat_holds tsh
          join booking_items bi on bi.id = tsh.booking_item_id
         where bi.booking_id = v_booking_id
           and tsh.released_at is null
           and tsh.confirmed_at is null
         group by tsh.departure_id
      ) agg
     where td.id = agg.departure_id;

    update tour_seat_holds tsh
       set released_at = now()
     where tsh.released_at is null
       and tsh.confirmed_at is null
       and tsh.booking_item_id in (select id from booking_items where booking_id = v_booking_id);

    update rental_blocks sb
       set released_at = now()
     where sb.released_at is null
       and sb.reason = 'hold'
       and sb.booking_item_id in (select id from booking_items where booking_id = v_booking_id);

    update bookings
       set status = 'expired'
     where id = v_booking_id;

    insert into booking_events (booking_id, type, actor_type)
    values (v_booking_id, 'hold.expired', 'system');

    v_count := v_count + 1;
  end loop;

  -- Barrido de apartados huérfanos: el visitante llegó a apartar inventario
  -- pero abandonó antes de que existiera la reserva, así que ningún
  -- booking_id los libera. Sin este barrido, esas fechas y esos lugares se
  -- quedarían fuera de venta para siempre.
  --
  -- Solo se tocan los huérfanos de verdad (booking_item_id is null). Cuando
  -- un apartado sí pertenece a una reserva, el que manda es el vencimiento de
  -- la reserva, no el del apartado.
  update tour_departures td
     set seats_taken = td.seats_taken - agg.seats
    from (
      select departure_id, sum(seats)::integer as seats
        from tour_seat_holds
       where released_at is null
         and confirmed_at is null
         and booking_item_id is null
         and expires_at < now()
       group by departure_id
    ) agg
   where td.id = agg.departure_id;

  with released as (
    update tour_seat_holds
       set released_at = now()
     where released_at is null
       and confirmed_at is null
       and booking_item_id is null
       and expires_at < now()
    returning seats
  )
  select coalesce(sum(seats), 0)::integer, count(*)::integer
    into v_orphan_seats, v_orphans
    from released;

  with released as (
    update rental_blocks
       set released_at = now()
     where released_at is null
       and reason = 'hold'
       and booking_item_id is null
       and expires_at < now()
    returning 1
  )
  select v_orphans + count(*)::integer into v_orphans from released;

  return jsonb_build_object(
    'bookings_expired', v_count,
    'orphan_holds_released', v_orphans,
    'orphan_seats_returned', v_orphan_seats
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.booking_reschedule_rental(p_booking_id uuid, p_range daterange, p_total_cents bigint, p_quote jsonb, p_actor_id text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
  v_booking  bookings;
  v_item     booking_items;
  v_old      daterange;
  v_diff     bigint;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'La reserva % no existe', p_booking_id using errcode = 'AM003';
  end if;

  if v_booking.status not in ('hold', 'confirmed') then
    raise exception 'No se puede reprogramar una reserva en estado %', v_booking.status
      using errcode = 'AM003';
  end if;

  select * into v_item from booking_items
   where booking_id = p_booking_id and kind = 'stay'
   limit 1 for update;

  if not found then
    raise exception 'Esta reserva no es de estancia' using errcode = 'AM003';
  end if;

  v_old := v_item.rental_range;

  update rental_blocks set released_at = now()
   where booking_item_id = v_item.id and released_at is null;

  update booking_items
     set rental_range = p_range, subtotal_cents = p_total_cents, quote = p_quote
   where id = v_item.id;

  -- Si estas noches ya están vendidas, aquí truena con AM002 y no se pierde nada.
  perform rental_hold_create(v_item.rental_unit_id, p_range, v_item.id, interval '100 years');

  -- Una reserva confirmada mantiene su apartado firme, no vuelve a "hold".
  if v_booking.status = 'confirmed' then
    update rental_blocks set reason = 'booking', expires_at = null
     where booking_item_id = v_item.id and released_at is null;
  end if;

  v_diff := p_total_cents - v_booking.total_cents;

  -- El anticipo ya cobrado no se recalcula: se conserva y la diferencia se
  -- suma o se resta del saldo que se paga en destino. Volver a cobrar por una
  -- tarifa distinta obligaría a un segundo cargo, y el huésped ya pagó.
  update bookings
     set total_cents = p_total_cents,
         quote = p_quote
   where id = p_booking_id;

  update payments
     set amount_cents = greatest(0, amount_cents + v_diff)
   where booking_id = p_booking_id and purpose = 'balance' and status = 'pending';

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id, 'booking.rescheduled',
          jsonb_build_object('from', v_old::text, 'to', p_range::text,
                             'difference_cents', v_diff),
          'staff', p_actor_id);

  return v_diff;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.booking_service_at(p_booking_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
AS $function$
  select min(
    coalesce(
      d.starts_at,
      (lower(i.rental_range) + coalesce(su.checkin_time, time '15:00'))
        at time zone coalesce(l.timezone, 'America/Cancun')
    )
  )
    from booking_items i
    left join tour_departures d on d.id = i.tour_departure_id
    left join rental_units su on su.id = i.rental_unit_id
    left join products pr on pr.id = i.product_id
    left join locations l on l.id = pr.location_id
   where i.booking_id = p_booking_id
$function$
;

CREATE OR REPLACE FUNCTION public.rental_availability_range(p_unit_id uuid, p_range daterange)
 RETURNS TABLE(night date, available boolean, nightly_cents bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select
    d::date,
    not exists (
      select 1 from rental_blocks sb
       where sb.unit_id = p_unit_id
         and sb.released_at is null
         and sb.dates @> d::date
    ),
    r.nightly_cents
  from generate_series(
         lower(p_range)::timestamp,
         (upper(p_range) - 1)::timestamp,
         interval '1 day'
       ) as d
  left join lateral (
    select sr.nightly_cents
    from rental_rates sr
    join rental_rate_plans rp on rp.id = sr.rate_plan_id
    where rp.unit_id = p_unit_id
      and rp.active
      and sr.season @> d::date
      and (sr.dows is null or extract(isodow from d)::smallint = any (sr.dows))
    order by sr.priority desc, sr.created_at desc
    limit 1
  ) r on true;
$function$
;

CREATE OR REPLACE FUNCTION public.rental_hold_create(p_unit_id uuid, p_dates daterange, p_booking_item_id uuid DEFAULT NULL::uuid, p_ttl interval DEFAULT '00:15:00'::interval)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
begin
  if isempty(p_dates) then
    raise exception 'El rango de fechas está vacío' using errcode = 'AM002';
  end if;

  insert into rental_blocks (unit_id, dates, reason, booking_item_id, expires_at)
  values (p_unit_id, p_dates, 'hold', p_booking_item_id, now() + p_ttl)
  returning id into v_id;

  return v_id;
exception
  when exclusion_violation then
    raise exception 'Las fechas % ya están ocupadas en esa unidad', p_dates
      using errcode = 'AM002';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rental_is_available(p_unit_id uuid, p_dates daterange)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select not exists (
    select 1 from rental_blocks
    where unit_id = p_unit_id
      and released_at is null
      and dates && p_dates
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rental_nightly_rates(p_unit_id uuid, p_dates daterange)
 RETURNS TABLE(night date, nightly_cents bigint, rate_id uuid, min_nights integer, closed_to_arrival boolean, closed_to_departure boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select
    d::date,
    r.nightly_cents,
    r.id,
    r.min_nights,
    coalesce(r.closed_to_arrival, false),
    coalesce(r.closed_to_departure, false)
  from generate_series(
         lower(p_dates)::timestamp,
         (upper(p_dates) - 1)::timestamp,
         interval '1 day'
       ) as d
  left join lateral (
    select sr.id, sr.nightly_cents, sr.min_nights, sr.closed_to_arrival, sr.closed_to_departure
    from rental_rates sr
    join rental_rate_plans rp on rp.id = sr.rate_plan_id
    where rp.unit_id = p_unit_id
      and rp.active
      and sr.season @> d::date
      and (sr.dows is null or extract(isodow from d)::smallint = any (sr.dows))
    order by sr.priority desc, sr.created_at desc
    limit 1
  ) r on true;
$function$
;

CREATE OR REPLACE FUNCTION public.rental_rate_at(p_unit_id uuid, p_date date)
 RETURNS TABLE(rate_id uuid, nightly_cents bigint, min_nights integer, closed_to_arrival boolean, closed_to_departure boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select sr.id, sr.nightly_cents, sr.min_nights, sr.closed_to_arrival, sr.closed_to_departure
  from rental_rates sr
  join rental_rate_plans rp on rp.id = sr.rate_plan_id
  where rp.unit_id = p_unit_id
    and rp.active
    and sr.season @> p_date
    and (sr.dows is null or extract(isodow from p_date)::smallint = any (sr.dows))
  order by sr.priority desc, sr.created_at desc
  limit 1;
$function$
;

-- 5. Se van las viejas -------------------------------------------------------

drop function if exists booking_reschedule_stay(p_booking_id uuid, p_range daterange, p_total_cents bigint, p_quote jsonb, p_actor_id text);
drop function if exists stay_availability_range(p_unit_id uuid, p_range daterange);
drop function if exists stay_hold_create(p_unit_id uuid, p_stay daterange, p_booking_item_id uuid, p_ttl interval);
drop function if exists stay_is_available(p_unit_id uuid, p_stay daterange);
drop function if exists stay_nightly_rates(p_unit_id uuid, p_stay daterange);
drop function if exists stay_rate_at(p_unit_id uuid, p_date date);

-- 6. El tercer inventario ----------------------------------------------------
--
-- Se agrega el valor, todavía sin usarlo: el catálogo de vehículos entra en la
-- migración siguiente. Postgres 12+ permite esto dentro de una transacción
-- mientras el valor nuevo no se use en la misma.

alter type product_kind add value if not exists 'vehicle';

commit;

