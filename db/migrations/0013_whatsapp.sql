-- 0013_whatsapp.sql
-- Sprint 7: los avisos también por WhatsApp.
--
-- El canal se agrega **donde ya se encolan los avisos**, dentro de la misma
-- transacción que confirma o cancela. Es la garantía del Sprint 3 y no se toca:
-- si el aviso se encolara desde la aplicación después del commit, existiría el
-- caso de una reserva confirmada de la que nadie se entera.
--
-- El correo sigue siendo el canal principal: lleva el desglose completo, la
-- política y el depósito de garantía. WhatsApp lleva lo que se lee en la
-- pantalla de bloqueo — cuándo, dónde y cuánto falta pagar — y por eso se manda
-- **además** del correo y no en su lugar.

begin;

-- ---------------------------------------------------------------------------
-- Normalización del número
-- ---------------------------------------------------------------------------

-- La API exige solo dígitos con código de país. Vive en la base y no en la
-- aplicación porque el encolado es transaccional y ocurre aquí: tener la regla
-- en los dos lados garantiza que algún día difieran.
--
-- Diez dígitos se completan con 52. Es el caso más común en este negocio —los
-- huéspedes nacionales escriben su número local— y rechazarlo dejaría sin aviso
-- justo a la mayoría. Lo que no se puede normalizar devuelve null, y quien no
-- tiene número simplemente no recibe WhatsApp.
create or replace function whatsapp_number(p_phone text)
returns text
language sql immutable as $$
  select case
    when p_phone is null then null
    when length(regexp_replace(p_phone, '\D', '', 'g')) = 10
      then '52' || regexp_replace(p_phone, '\D', '', 'g')
    when length(regexp_replace(p_phone, '\D', '', 'g')) between 11 and 15
      then regexp_replace(p_phone, '\D', '', 'g')
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Encolar WhatsApp junto al correo
-- ---------------------------------------------------------------------------

-- Un solo lugar que decide si corresponde mandarlo y con qué datos. Las tres
-- funciones que avisan lo llaman en vez de repetir el insert, para que agregar
-- un canal mañana no sea buscar tres sitios.
create or replace function outbox_enqueue_whatsapp(
  p_booking_id uuid,
  p_template   text,
  p_payload    jsonb default '{}'::jsonb
) returns boolean
language plpgsql as $$
declare
  v_phone  text;
  v_locale text;
begin
  select whatsapp_number(c.phone), b.locale
    into v_phone, v_locale
    from bookings b join customers c on c.id = b.customer_id
   where b.id = p_booking_id;

  if v_phone is null then
    return false;
  end if;

  insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
  values ('whatsapp', p_template, v_locale, v_phone, p_payload, p_booking_id,
          'booking:' || p_booking_id || ':' || p_template || ':whatsapp')
  on conflict (dedupe_key) do nothing;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirmación
-- ---------------------------------------------------------------------------

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

  -- Y por WhatsApp, si dejó número. Es el canal por el que este negocio ya se
  -- comunica: un correo se le pierde entre las promociones.
  perform outbox_enqueue_whatsapp(
    p_booking_id, 'booking_confirmed_guest',
    jsonb_build_object('booking_code', v_booking.code)
  );

  return 'confirmed'::booking_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelación y recordatorios
-- ---------------------------------------------------------------------------

-- Solo la cancelación **del operador** va por WhatsApp. Es la que el huésped no
-- esperaba y la que le cambia el viaje: enterarse tarde de que el tour de mañana
-- no sale es la diferencia entre reacomodar el día y llegar al muelle. Cuando
-- cancela el huésped ya sabe que canceló, y el correo con el detalle basta.
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

  update stay_blocks
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
$$;

-- El recordatorio es el caso más claro de WhatsApp: se lee de un vistazo, dice
-- la hora de presentación y el punto de encuentro, y llega a un teléfono que ya
-- está en la mano.
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
       and s.at - make_interval(hours => h.hours) <= now()
       and s.at > now()
  ), candidates as (
    -- De las ventanas abiertas se manda **solo la más cercana**: las dos pueden
    -- estar abiertas a la vez porque alguien reservó para mañana o porque el
    -- worker estuvo caído, y el de 72 horas diría "en tres días" a quien viaja
    -- mañana.
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

  -- El mismo recordatorio por WhatsApp, con su propia clave de deduplicación.
  perform outbox_enqueue_whatsapp(booking_id, 'booking_reminder',
                                  jsonb_build_object('hours_before', hours))
     from (
       select distinct on (b.id) b.id as booking_id, h.hours
         from bookings b
         join customers c on c.id = b.customer_id
         cross join lateral (select booking_service_at(b.id) as at) s
         cross join (values (72), (24)) as h(hours)
        where b.status = 'confirmed'
          and s.at is not null
          and s.at - make_interval(hours => h.hours) <= now()
          and s.at > now()
        order by b.id, h.hours asc
     ) elegibles;

  return query select v_count;
end;
$$;

commit;
