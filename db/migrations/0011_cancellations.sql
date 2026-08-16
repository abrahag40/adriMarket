-- 0011_cancellations.sql
-- Sprint 5: cancelar, reembolsar, reprogramar y recordar.
--
-- Es el sprint que trajo el SME, y las reglas de negocio son suyas, no del
-- equipo técnico. Tres de ellas mandan sobre todo lo que sigue:
--
-- 1. **Una cancelación del operador no es una cancelación del huésped.** Cuando
--    la capitanía cierra el puerto, el huésped no hizo nada mal: se le devuelve
--    todo lo que pagó y la política de cancelación no aplica. Mezclar los dos
--    casos es la forma más rápida de cobrarle a alguien por un huracán.
-- 2. **El reembolso sale de la política congelada en la reserva**, nunca de la
--    vigente hoy. El huésped aceptó un texto concreto en el checkout; que el
--    cliente edite la política después no puede cambiar lo que ya se acordó.
-- 3. **Los cambios de fecha son más frecuentes que las cancelaciones.** Mover
--    una reserva tiene que conservar el pago hecho y recotizar la diferencia,
--    todo en una transacción: si las fechas nuevas no están libres, no se pierde
--    la reserva vieja.
--
-- Liberar inventario sigue siendo un UPDATE de released_at, nunca un DELETE.

begin;

-- ---------------------------------------------------------------------------
-- Cuándo ocurre el servicio
-- ---------------------------------------------------------------------------

-- La política se mide en horas antes del servicio, así que hace falta un solo
-- lugar que sepa qué es "el servicio": para un tour es el instante de salida;
-- para una estancia, la entrada del primer día en la zona de la propiedad.
-- Una noche es una fecha y no un instante, y suponerla a medianoche UTC corre
-- el cálculo cinco horas — suficiente para cruzar un umbral de la política.
create or replace function booking_service_at(p_booking_id uuid)
returns timestamptz
language sql stable as $$
  select min(
    coalesce(
      d.starts_at,
      (lower(i.stay_range) + coalesce(su.checkin_time, time '15:00'))
        at time zone coalesce(l.timezone, 'America/Cancun')
    )
  )
    from booking_items i
    left join tour_departures d on d.id = i.tour_departure_id
    left join stay_units su on su.id = i.stay_unit_id
    left join products pr on pr.id = i.product_id
    left join locations l on l.id = pr.location_id
   where i.booking_id = p_booking_id
$$;

-- ---------------------------------------------------------------------------
-- Cuánto se devuelve
-- ---------------------------------------------------------------------------

-- Lee la política **congelada** en la reserva y devuelve qué corresponde
-- reembolsar si se cancela en el instante dado, junto con la regla que se
-- aplicó. Se devuelve también la regla porque quien cancela en el mostrador
-- tiene que poder explicarle al huésped de dónde salió el número.
--
-- Forma de las reglas, tal como se guardan:
--   [{"hours_before": 168, "refund_pct": 100}, {"hours_before": 48, "refund_pct": 50}]
-- Gana la regla más exigente que todavía se cumple: con 200 horas de
-- anticipación aplica la de 168 y no la de 48.
create or replace function booking_refund_quote(
  p_booking_id uuid,
  p_at         timestamptz default now()
) returns table (refund_cents bigint, refund_pct numeric, paid_cents bigint, hours_before numeric)
language plpgsql stable as $$
declare
  v_booking    bookings;
  v_service    timestamptz;
  v_paid       bigint;
  v_pct        numeric := 0;
  v_hours      numeric;
begin
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'La reserva % no existe', p_booking_id using errcode = 'AM003';
  end if;

  -- Solo cuenta lo que efectivamente entró. Un saldo pendiente no se reembolsa
  -- porque nunca se cobró.
  select coalesce(sum(p.amount_cents), 0) into v_paid
    from payments p
   where p.booking_id = p_booking_id and p.status = 'succeeded';

  -- Lo ya devuelto no se devuelve dos veces.
  v_paid := v_paid - coalesce((
    select sum(rf.amount_cents) from refunds rf
      join payments p on p.id = rf.payment_id
     where p.booking_id = p_booking_id and rf.status <> 'failed'
  ), 0);

  v_service := booking_service_at(p_booking_id);
  -- `coalesce` y no solo el DEFAULT del parámetro: quien llama desde la
  -- aplicación manda NULL cuando no tiene un instante concreto, y **un NULL
  -- explícito no activa el valor por omisión**. Sin esto, v_hours queda en NULL,
  -- ninguna regla se cumple y todo reembolso sale en cero — que es exactamente
  -- lo que pasó la primera vez que se ejecutó.
  v_hours := extract(epoch from (v_service - coalesce(p_at, now()))) / 3600.0;

  if coalesce((v_booking.cancellation_policy_snapshot ->> 'deposit_refundable')::boolean, false) then
    select coalesce((rule ->> 'refund_pct')::numeric, 0) into v_pct
      from jsonb_array_elements(
             coalesce(v_booking.cancellation_policy_snapshot -> 'rules', '[]'::jsonb)
           ) as rule
     where (rule ->> 'hours_before')::numeric <= v_hours
     order by (rule ->> 'hours_before')::numeric desc
     limit 1;
  end if;

  v_pct := coalesce(v_pct, 0);

  return query select
    -- Redondeo hacia el huésped: medio centavo a su favor no quiebra a nadie y
    -- discutirlo cuesta más que la diferencia.
    ceil(greatest(v_paid, 0) * v_pct / 100.0)::bigint,
    v_pct,
    greatest(v_paid, 0)::bigint,
    v_hours;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar una reserva
-- ---------------------------------------------------------------------------

-- Un solo camino para las dos cancelaciones, con una diferencia explícita:
-- p_by_operator decide si aplica la política o se devuelve todo. No son dos
-- funciones porque todo lo demás —liberar inventario, cerrar el saldo, avisar—
-- es idéntico, y duplicarlo garantiza que un día se arreglen distinto.
create or replace function booking_cancel(
  p_booking_id  uuid,
  p_reason      text,
  p_by_operator boolean default false,
  p_actor_type  text default 'staff',
  p_actor_id    text default null
) returns bigint
language plpgsql as $$
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
    -- Idempotente: cancelar dos veces no devuelve dos veces.
    return 0;
  end if;

  if v_booking.status not in ('hold', 'confirmed', 'in_progress') then
    raise exception 'No se puede cancelar una reserva en estado %', v_booking.status
      using errcode = 'AM003';
  end if;

  if p_by_operator then
    -- No canceló el huésped: se devuelve todo lo que entró.
    select paid_cents into v_paid from booking_refund_quote(p_booking_id);
    v_refund := v_paid;
    v_pct := 100;
  else
    select refund_cents, refund_pct, paid_cents
      into v_refund, v_pct, v_paid
      from booking_refund_quote(p_booking_id);
  end if;

  -- El inventario vuelve a la venta en el mismo instante en que se cancela.
  update stay_blocks
     set released_at = now()
   where released_at is null
     and booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  update tour_seat_holds tsh
     set released_at = now()
   where tsh.released_at is null
     and tsh.booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  -- El contador de la salida se corrige con lo que realmente se liberó.
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

  -- El saldo que nunca se cobró deja de estar por cobrar. No es un faltante:
  -- es un cobro que ya no va a ocurrir.
  update payments
     set status = 'cancelled'
   where booking_id = p_booking_id and purpose = 'balance' and status = 'pending';

  -- El reembolso se reparte sobre los pagos que efectivamente entraron, del más
  -- antiguo al más nuevo. Se registra contra un pago concreto porque es contra
  -- ese cargo que la pasarela tiene que devolver el dinero.
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

  -- El aviso viaja en el mismo commit que la cancelación: si algo falla, no se
  -- avisa de una cancelación que no ocurrió.
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

  return v_refund;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar una salida completa
-- ---------------------------------------------------------------------------

-- El caso del cierre de puerto: no es una cancelación por reserva, es una por
-- salida, y lo que importa es que **no se quede nadie sin avisar**. Va en una
-- sola transacción por eso: dieciocho pasajeros o ninguno.
create or replace function departure_cancel(
  p_departure_id uuid,
  p_reason       text,
  p_staff_id     uuid default null
) returns table (bookings_cancelled int, refunded_cents bigint)
language plpgsql as $$
declare
  v_departure tour_departures;
  v_booking   uuid;
  v_count     int := 0;
  v_total     bigint := 0;
begin
  select * into v_departure from tour_departures where id = p_departure_id for update;
  if not found then
    raise exception 'La salida % no existe', p_departure_id using errcode = 'AM003';
  end if;

  if v_departure.status = 'cancelled' then
    return query select 0, 0::bigint;                       -- idempotente
    return;
  end if;

  for v_booking in
    select distinct i.booking_id
      from booking_items i
      join bookings b on b.id = i.booking_id
     where i.tour_departure_id = p_departure_id
       and b.status in ('hold', 'confirmed', 'in_progress')
  loop
    v_total := v_total + booking_cancel(v_booking, p_reason, true, 'staff', p_staff_id::text);
    v_count := v_count + 1;
  end loop;

  update tour_departures
     set status = 'cancelled', note = coalesce(p_reason, note)
   where id = p_departure_id;

  return query select v_count, v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reprogramar
-- ---------------------------------------------------------------------------

-- Mueve una estancia de fechas conservando lo pagado. Todo ocurre en una
-- transacción: se libera lo viejo y se aparta lo nuevo, y si lo nuevo choca con
-- la restricción de exclusión, el rollback deja la reserva original intacta. El
-- huésped no puede quedarse sin las fechas que tenía por pedir un cambio.
create or replace function booking_reschedule_stay(
  p_booking_id uuid,
  p_range      daterange,
  p_total_cents bigint,
  p_quote      jsonb,
  p_actor_id   text default null
) returns bigint
language plpgsql as $$
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

  v_old := v_item.stay_range;

  update stay_blocks set released_at = now()
   where booking_item_id = v_item.id and released_at is null;

  update booking_items
     set stay_range = p_range, subtotal_cents = p_total_cents, quote = p_quote
   where id = v_item.id;

  -- Si estas noches ya están vendidas, aquí truena con AM002 y no se pierde nada.
  perform stay_hold_create(v_item.stay_unit_id, p_range, v_item.id, interval '100 years');

  -- Una reserva confirmada mantiene su apartado firme, no vuelve a "hold".
  if v_booking.status = 'confirmed' then
    update stay_blocks set reason = 'booking', expires_at = null
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
$$;

-- Mueve un tour a otra salida. Misma idea, pero el cupo se cuenta en lugar de
-- traslaparse: primero se apartan los lugares nuevos y después se sueltan los
-- viejos, para que un cupo insuficiente no deje la reserva sin nada.
create or replace function booking_reschedule_tour(
  p_booking_id   uuid,
  p_departure_id uuid,
  p_total_cents  bigint,
  p_quote        jsonb,
  p_actor_id     text default null
) returns bigint
language plpgsql as $$
declare
  v_booking bookings;
  v_item    booking_items;
  v_old     uuid;
  v_diff    bigint;
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
   where booking_id = p_booking_id and kind = 'tour'
   limit 1 for update;

  if not found then
    raise exception 'Esta reserva no es de tour' using errcode = 'AM003';
  end if;

  v_old := v_item.tour_departure_id;

  if (select status from tour_departures where id = p_departure_id) <> 'open' then
    raise exception 'La salida destino no está abierta' using errcode = 'AM003';
  end if;

  update booking_items
     set tour_departure_id = p_departure_id, subtotal_cents = p_total_cents, quote = p_quote
   where id = v_item.id;

  -- Primero apartar: si no hay cupo, truena con AM001 antes de soltar lo viejo.
  perform tour_hold_create(p_departure_id, v_item.seats, v_item.id, interval '100 years');

  if v_booking.status = 'confirmed' then
    update tour_seat_holds set confirmed_at = now(), expires_at = null
     where booking_item_id = v_item.id and departure_id = p_departure_id
       and released_at is null and confirmed_at is null;
  end if;

  update tour_seat_holds set released_at = now()
   where booking_item_id = v_item.id and departure_id = v_old and released_at is null;

  update tour_departures
     set seats_taken = greatest(0, seats_taken - v_item.seats)
   where id = v_old;

  v_diff := p_total_cents - v_booking.total_cents;

  update bookings set total_cents = p_total_cents, quote = p_quote
   where id = p_booking_id;

  update payments
     set amount_cents = greatest(0, amount_cents + v_diff)
   where booking_id = p_booking_id and purpose = 'balance' and status = 'pending';

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id, 'booking.rescheduled',
          jsonb_build_object('from_departure', v_old, 'to_departure', p_departure_id,
                             'difference_cents', v_diff),
          'staff', p_actor_id);

  return v_diff;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recordatorios
-- ---------------------------------------------------------------------------

-- Encola los recordatorios de 72 y 24 horas. Lo corre el mismo latido que
-- expira apartados.
--
-- La ventana se abre pero no se cierra: el `dedupe_key` impide el duplicado, así
-- que si el worker no corrió durante seis horas, el recordatorio sale tarde pero
-- sale. Un recordatorio tarde sirve; uno que no se manda, no.
create or replace function notifications_enqueue_reminders()
returns table (reminders_queued int)
language plpgsql as $$
declare
  v_count int := 0;
begin
  with abiertos as (
    select b.id as booking_id, b.code, b.locale, c.email, h.hours
      from bookings b
      join customers c on c.id = b.customer_id
      cross join lateral (select booking_service_at(b.id) as at) s
      cross join (values (72), (24)) as h(hours)
     where b.status = 'confirmed'
       and c.email is not null
       and s.at is not null
       -- Ya entró en la ventana de ese recordatorio y el servicio no ha ocurrido.
       and s.at - make_interval(hours => h.hours) <= now()
       and s.at > now()
  ), candidates as (
    -- De las ventanas abiertas se manda **solo la más cercana**.
    --
    -- Las dos pueden estar abiertas a la vez por dos motivos legítimos: alguien
    -- reservó para mañana (aquí es negocio normal) o el worker estuvo caído un
    -- par de días. En los dos casos, mandar el de 72 horas produce un correo que
    -- dice "te esperamos en tres días" a quien viaja mañana. El de 24 horas dice
    -- la verdad, así que es el único que sale.
    --
    -- El de 72 no se pierde en el caso normal: cuando se abre, es la única
    -- ventana abierta y por eso es la más cercana.
    select distinct on (booking_id) booking_id, code, locale, email, hours
      from abiertos
     order by booking_id, hours asc
  ), inserted as (
    insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
    select 'email', 'booking_reminder', candidates.locale, candidates.email,
           jsonb_build_object('booking_code', candidates.code,
                              'hours_before', candidates.hours),
           candidates.booking_id,
           'booking:' || candidates.booking_id || ':reminder:' || candidates.hours
      from candidates
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::int into v_count from inserted;

  return query select v_count;
end;
$$;

commit;
