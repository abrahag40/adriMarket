-- 0008_domain_functions.sql
-- Las operaciones donde la corrección no es negociable viven en la base de
-- datos, no en la aplicación: apartar inventario, confirmar y expirar.
--
-- La aplicación las llama dentro de una transacción; si algo falla, no queda
-- inventario apartado a medias.
--
-- Códigos de error propios, para que la app los traduzca a mensajes claros:
--   AM001  cupo agotado en la salida del tour
--   AM002  fechas ya ocupadas en la unidad
--   AM003  transición de estado inválida

begin;

-- ---------------------------------------------------------------------------
-- Anticipo: resolución en tres niveles
-- ---------------------------------------------------------------------------

-- producto → configuración global → 30 por omisión.
-- El resultado se congela en bookings.deposit_pct al reservar.
create or replace function resolve_deposit_pct(p_product_id uuid)
returns numeric
language sql stable as $$
  select coalesce(
    (select p.deposit_pct from products p where p.id = p_product_id),
    (select (value -> 'default_pct')::numeric from settings where key = 'deposit'),
    30
  );
$$;

-- ---------------------------------------------------------------------------
-- Estancias: consulta y apartado
-- ---------------------------------------------------------------------------

create or replace function stay_is_available(p_unit_id uuid, p_stay daterange)
returns boolean
language sql stable as $$
  select not exists (
    select 1 from stay_blocks
    where unit_id = p_unit_id
      and released_at is null
      and stay && p_stay
  );
$$;

-- Tarifa noche por noche. Cuando dos reglas cubren la misma noche gana la de
-- mayor priority. Si una noche no tiene tarifa, sale con nightly_cents null:
-- la app debe negarse a cotizar en lugar de inventar un precio.
create or replace function stay_nightly_rates(p_unit_id uuid, p_stay daterange)
returns table (night date, nightly_cents bigint, rate_id uuid)
language sql stable as $$
  select
    d::date,
    r.nightly_cents,
    r.id
  from generate_series(
         lower(p_stay)::timestamp,
         (upper(p_stay) - 1)::timestamp,
         interval '1 day'
       ) as d
  left join lateral (
    select sr.id, sr.nightly_cents
    from stay_rates sr
    join stay_rate_plans rp on rp.id = sr.rate_plan_id
    where rp.unit_id = p_unit_id
      and rp.active
      and sr.season @> d::date
      and (sr.dows is null or extract(isodow from d)::smallint = any (sr.dows))
    order by sr.priority desc, sr.created_at desc
    limit 1
  ) r on true;
$$;

-- Aparta noches durante el checkout. Si las fechas ya están ocupadas, la
-- restricción de exclusión revienta y se traduce a un error de dominio.
create or replace function stay_hold_create(
  p_unit_id         uuid,
  p_stay            daterange,
  p_booking_item_id uuid default null,
  p_ttl             interval default interval '15 minutes'
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  if isempty(p_stay) then
    raise exception 'El rango de fechas está vacío' using errcode = 'AM002';
  end if;

  insert into stay_blocks (unit_id, stay, reason, booking_item_id, expires_at)
  values (p_unit_id, p_stay, 'hold', p_booking_item_id, now() + p_ttl)
  returning id into v_id;

  return v_id;
exception
  when exclusion_violation then
    raise exception 'Las fechas % ya están ocupadas en esa unidad', p_stay
      using errcode = 'AM002';
end;
$$;

-- ---------------------------------------------------------------------------
-- Tours: apartado con bloqueo de fila
-- ---------------------------------------------------------------------------

create or replace function tour_seats_left(p_departure_id uuid)
returns integer
language sql stable as $$
  select capacity - seats_taken from tour_departures where id = p_departure_id;
$$;

-- El SELECT ... FOR UPDATE es lo que decide el orden entre dos peticiones
-- simultáneas por los últimos lugares: la segunda espera, vuelve a leer el
-- contador ya actualizado y recibe un "ya no hay lugar" honesto.
create or replace function tour_hold_create(
  p_departure_id    uuid,
  p_seats           integer,
  p_booking_item_id uuid default null,
  p_ttl             interval default interval '15 minutes'
) returns uuid
language plpgsql as $$
declare
  v_capacity integer;
  v_taken    integer;
  v_status   departure_status;
  v_id       uuid;
begin
  if p_seats is null or p_seats <= 0 then
    raise exception 'El número de lugares debe ser positivo' using errcode = 'AM001';
  end if;

  select capacity, seats_taken, status
    into v_capacity, v_taken, v_status
    from tour_departures
   where id = p_departure_id
     for update;                                  -- ← serializa a los competidores

  if not found then
    raise exception 'La salida % no existe', p_departure_id using errcode = 'AM001';
  end if;

  if v_status <> 'open' then
    raise exception 'La salida no está abierta a la venta' using errcode = 'AM001';
  end if;

  if v_taken + p_seats > v_capacity then
    raise exception 'Cupo agotado: se piden % lugares y quedan %',
      p_seats, v_capacity - v_taken using errcode = 'AM001';
  end if;

  update tour_departures
     set seats_taken = seats_taken + p_seats
   where id = p_departure_id;

  insert into tour_seat_holds (departure_id, booking_item_id, seats, expires_at)
  values (p_departure_id, p_booking_item_id, p_seats, now() + p_ttl)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirmar
-- ---------------------------------------------------------------------------

-- Se llama desde el webhook de la pasarela, ya con el anticipo registrado.
-- Convierte los holds en ocupación firme, mueve el estado, escribe la
-- bitácora y encola los avisos — todo en la misma transacción.
-- Es idempotente: si la reserva ya está confirmada, no hace nada.
create or replace function booking_confirm(
  p_booking_id uuid,
  p_actor      text default 'system'
) returns booking_status
language plpgsql as $$
declare
  v_booking   bookings;
  v_customer  customers;
  v_deposit   bigint;
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
  update stay_blocks sb
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

  insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
  values (
    'email', 'booking_confirmed_admin', 'es',
    coalesce((select value ->> 'admin_email' from settings where key = 'notifications'), ''),
    jsonb_build_object('booking_code', v_booking.code),
    p_booking_id,
    'booking:' || p_booking_id || ':confirmed:admin'
  )
  on conflict (dedupe_key) do nothing;

  return 'confirmed'::booking_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expirar: el job que corre cada minuto
-- ---------------------------------------------------------------------------

-- Libera el inventario de las reservas cuyo anticipo nunca llegó. Liberar es
-- un UPDATE de released_at, nunca un DELETE: la historia se conserva y las
-- fechas vuelven a estar a la venta en el mismo instante.
create or replace function booking_expire_holds()
returns jsonb
language plpgsql as $$
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

    update stay_blocks sb
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
    update stay_blocks
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
$$;

-- ---------------------------------------------------------------------------
-- Vistas de control
-- ---------------------------------------------------------------------------

-- El contador seats_taken es un dato derivado y podría desalinearse si algún
-- día alguien escribe fuera de las funciones. Esta vista lo delata: en
-- operación normal drift siempre es 0, y vale la pena alertar si no lo es.
create or replace view tour_departure_seat_audit as
select
  td.id as departure_id,
  td.starts_at,
  td.capacity,
  td.seats_taken,
  coalesce(sum(tsh.seats), 0)::integer as seats_from_holds,
  td.seats_taken - coalesce(sum(tsh.seats), 0)::integer as drift
from tour_departures td
left join tour_seat_holds tsh
       on tsh.departure_id = td.id
      and tsh.released_at is null
group by td.id, td.starts_at, td.capacity, td.seats_taken;

-- Estado real del dinero de cada reserva: cuánto se cobró y cuánto falta.
create or replace view booking_payment_status as
select
  b.id as booking_id,
  b.code,
  b.status,
  b.currency,
  b.total_cents,
  b.deposit_cents,
  b.balance_cents,
  coalesce(sum(p.amount_cents) filter (
    where p.purpose = 'deposit' and p.status = 'succeeded'), 0) as deposit_paid_cents,
  coalesce(sum(p.amount_cents) filter (
    where p.purpose = 'balance' and p.status = 'succeeded'), 0) as balance_paid_cents,
  coalesce(sum(p.amount_cents) filter (
    where p.purpose = 'balance' and p.status = 'pending'), 0) as balance_due_cents
from bookings b
left join payments p on p.booking_id = b.id
group by b.id, b.code, b.status, b.currency, b.total_cents, b.deposit_cents, b.balance_cents;

commit;
