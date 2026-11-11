-- 0025_embarcacion_privada.sql
--
-- Una embarcación se renta entera: se cobra el barco, no el asiento.
--
-- Las fichas de Adri (Bertram 46, Leopard 47, Sea Ray 55…) no venden lugares
-- en una salida compartida: venden el barco por horas —4, 6, 8, Cozumel— a un
-- precio que cubre a un grupo de hasta N personas, más un cargo por cada
-- pasajero extra y la cuota de muelle por persona. El motor de tours solo
-- sabía cobrar por pasajero, así que cargarlas tal cual habría exhibido un
-- precio que el operador no cobra.
--
-- **Se monta sobre los tours, no sobre la renta por fechas**, porque lo que el
-- huésped elige es lo mismo que en un tour —una opción ("8 horas Cozumel") y
-- una salida con hora— y todo lo que cuelga de una salida ya existe: ficha,
-- checkout, manifiesto, cierre de puerto, reprogramar. La renta por fechas
-- (`rental_blocks`) razona en días; un barco se ocupa por horas.
--
-- Lo que agrega:
--
--   1. `tour_options.pricing_mode`: 'per_pax' (todo lo que existía) o
--      'private'. En una opción privada `private_price_cents` es el precio del
--      barco para hasta `private_included_pax` personas, y `tour_pax_prices`
--      pasa a ser el precio de **cada pasajero por encima de ese número**, por
--      tipo (así cabe "niños de 2 a 6 pagan 50%" sin otra columna).
--      `per_pax_fee_cents` es la cuota de muelle por persona; vale en las dos
--      modalidades, aunque hoy solo la usan los barcos.
--
--   2. **La garantía nueva: el mismo barco no se aparta dos veces a la vez.**
--      Las opciones de un barco son salidas distintas —"4 horas 9:00" y
--      "8 horas 9:00"— con contadores distintos, así que el CHECK del cupo no
--      ve que son el mismo casco. Cada apartado de una opción privada guarda
--      el producto y el rango de horas que ocupa, y una restricción de
--      exclusión impide que dos apartados vivos del mismo producto se
--      traslapen. Vive en `tour_seat_holds` y no en una tabla aparte a
--      propósito: **todos** los caminos que liberan un lugar —cancelar, vencer,
--      reprogramar, cerrar el puerto— ya marcan `released_at` ahí, y la
--      exclusión solo mira las filas sin liberar. Una tabla aparte habría
--      exigido acordarse de liberarla en cinco funciones; esta se suelta sola.
--
--   3. Un apartado privado toma **todo** el cupo de su salida, para que nadie
--      se sume a un barco ya rentado aunque la salida diga "quedan 6".
--
-- Ver docs/decisiones/0022-la-embarcacion-se-renta-entera.md.

begin;

-- 1. La modalidad de cobro ----------------------------------------------------

alter table tour_options
  add column pricing_mode         text   not null default 'per_pax',
  add column private_price_cents  bigint,
  add column private_included_pax integer,
  add column per_pax_fee_cents    bigint not null default 0;

alter table tour_options
  add constraint tour_options_pricing_mode_valid
    check (pricing_mode in ('per_pax', 'private')),
  add constraint tour_options_private_price_check
    check (private_price_cents is null or private_price_cents >= 0),
  add constraint tour_options_private_included_check
    check (private_included_pax is null or private_included_pax > 0),
  add constraint tour_options_per_pax_fee_check
    check (per_pax_fee_cents >= 0),
  -- Una opción privada sin precio de barco, sin cuántos cubre o sin duración
  -- no se puede cotizar ni apartar: la duración es la que define el rango de
  -- horas que el barco queda ocupado.
  add constraint tour_options_private_complete
    check (pricing_mode <> 'private'
           or (private_price_cents is not null
               and private_included_pax is not null
               and duration_minutes is not null)),
  add constraint tour_options_included_fits
    check (private_included_pax is null or private_included_pax <= default_capacity);

comment on column tour_options.pricing_mode is
  'per_pax: se cobra cada pasajero. private: se cobra el barco entero (decisión 0022).';
comment on column tour_options.private_price_cents is
  'Solo private: precio del barco para hasta private_included_pax personas.';
comment on column tour_options.per_pax_fee_cents is
  'Cargo por persona que no es del operador (cuota de muelle). No se descuenta ni grava.';

-- 2. El barco ocupado por horas ----------------------------------------------

alter table tour_seat_holds
  add column product_id uuid references products (id),
  add column period     tstzrange;

alter table tour_seat_holds
  add constraint tour_seat_holds_period_shape
    check ((product_id is null) = (period is null)
           and (period is null or not isempty(period))),
  -- ► LA GARANTÍA: dos apartados vivos del mismo barco no se traslapan, aunque
  --   cuelguen de opciones y salidas distintas.
  add constraint tour_seat_holds_vessel_no_overlap
    exclude using gist (product_id with =, period with &&)
    where (released_at is null and period is not null);

comment on constraint tour_seat_holds_vessel_no_overlap on tour_seat_holds is
  'Backstop de doble renta de un barco. El orden entre peticiones lo da un cerrojo consultivo por producto.';

-- Rango de horas que ocupa una salida: lo que diga la salida y, si no dice,
-- lo que dura la opción.
create or replace function tour_departure_period(p_departure_id uuid)
returns tstzrange
language sql stable as $$
  select tstzrange(d.starts_at,
                   coalesce(d.ends_at, d.starts_at + make_interval(mins => o.duration_minutes)))
    from tour_departures d
    join tour_options o on o.id = d.tour_option_id
   where d.id = p_departure_id;
$$;

-- 3. Lugares que quedan, contando el barco -----------------------------------
--
-- Para una opción privada la respuesta es todo o nada: el cupo entero si el
-- barco está libre en esas horas, cero si alguien ya lo tiene —en esta salida
-- o en otra opción que se le encime—. Es la misma función que ya consultaban
-- el calendario y las pruebas, así que la vitrina deja de ofrecer un barco
-- ocupado sin que nadie tenga que acordarse de preguntar por él.
create or replace function tour_seats_left(p_departure_id uuid)
returns integer
language sql stable as $$
  select case
           when o.pricing_mode <> 'private' then d.capacity - d.seats_taken
           when d.seats_taken > 0 then 0
           when exists (
             select 1
               from tour_seat_holds h
              where h.released_at is null
                and h.product_id = o.product_id
                and h.period && tour_departure_period(d.id)
           ) then 0
           else d.capacity
         end
    from tour_departures d
    join tour_options o on o.id = d.tour_option_id
   where d.id = p_departure_id;
$$;

-- 4. Apartar ------------------------------------------------------------------
--
-- Para una opción por pasajero el cuerpo es el de siempre. Para una privada:
--
--   · el cerrojo consultivo por producto va **antes** del `for update` de la
--     salida —mismo orden en todos los caminos— por la razón de la 0020: dos
--     inserciones simultáneas que chocan en una restricción de exclusión se
--     esperan entre sí y terminan en interbloqueo, no en un rechazo limpio;
--   · se aparta el cupo entero, no los lugares pedidos;
--   · el choque con otra opción del mismo barco sale como AM001, el mismo
--     "ya no hay lugar" que lee el huésped cuando se agota una salida.
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
  v_mode     text;
  v_product  uuid;
  v_seats    integer := p_seats;
  v_period   tstzrange;
  v_id       uuid;
begin
  if p_seats is null or p_seats <= 0 then
    raise exception 'El número de lugares debe ser positivo' using errcode = 'AM001';
  end if;

  select o.pricing_mode, o.product_id
    into v_mode, v_product
    from tour_departures d
    join tour_options o on o.id = d.tour_option_id
   where d.id = p_departure_id;

  if not found then
    raise exception 'La salida % no existe', p_departure_id using errcode = 'AM001';
  end if;

  if v_mode = 'private' then
    perform pg_advisory_xact_lock(hashtextextended(v_product::text, 0));
  end if;

  select capacity, seats_taken, status
    into v_capacity, v_taken, v_status
    from tour_departures
   where id = p_departure_id
     for update;                                  -- ← serializa a los competidores

  if v_status <> 'open' then
    raise exception 'La salida no está abierta a la venta' using errcode = 'AM001';
  end if;

  if v_mode = 'private' then
    if p_seats > v_capacity then
      raise exception 'El barco admite % personas y se piden %', v_capacity, p_seats
        using errcode = 'AM001';
    end if;
    if v_taken > 0 then
      raise exception 'El barco ya está apartado en esta salida' using errcode = 'AM001';
    end if;
    v_seats  := v_capacity;
    v_period := tour_departure_period(p_departure_id);
  elsif v_taken + p_seats > v_capacity then
    raise exception 'Cupo agotado: se piden % lugares y quedan %',
      p_seats, v_capacity - v_taken using errcode = 'AM001';
  end if;

  update tour_departures
     set seats_taken = seats_taken + v_seats
   where id = p_departure_id;

  begin
    insert into tour_seat_holds (departure_id, booking_item_id, seats, expires_at,
                                 product_id, period)
    values (p_departure_id, p_booking_item_id, v_seats, now() + p_ttl,
            case when v_mode = 'private' then v_product end, v_period)
    returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'El barco ya está apartado en un horario que se encima con %', v_period
        using errcode = 'AM001';
  end;

  return v_id;
end;
$$;

-- 5. Reprogramar --------------------------------------------------------------
--
-- Dos cambios, los dos por el barco:
--
--   · **Se suelta lo viejo antes de apartar lo nuevo.** Pasar un barco de
--     "4 horas" a "6 horas" el mismo día choca contra su propio apartado si se
--     aparta primero. El orden ya no protege nada: todo corre en una
--     transacción, y si el apartado nuevo truena con AM001 se revierte también
--     la liberación.
--   · **Se descuenta lo que de verdad se apartó**, sumado de los apartados, y
--     no `booking_items.seats`: un barco aparta su cupo entero aunque el
--     renglón diga que viajan cuatro.
create or replace function booking_reschedule_tour(
  p_booking_id   uuid,
  p_departure_id uuid,
  p_total_cents  bigint,
  p_quote        jsonb,
  p_actor_id     text default null
) returns bigint
language plpgsql as $$
declare
  v_booking  bookings;
  v_item     booking_items;
  v_old      uuid;
  v_released integer;
  v_diff     bigint;
  v_product  uuid;
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

  -- El mismo orden de cerrojos que tour_hold_create: primero el barco.
  select o.product_id into v_product
    from tour_departures d join tour_options o on o.id = d.tour_option_id
   where d.id = p_departure_id and o.pricing_mode = 'private';
  if v_product is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_product::text, 0));
  end if;

  with released as (
    update tour_seat_holds set released_at = now()
     where booking_item_id = v_item.id and departure_id = v_old and released_at is null
    returning seats
  )
  select coalesce(sum(seats), 0)::integer into v_released from released;

  update tour_departures
     set seats_taken = greatest(0, seats_taken - v_released)
   where id = v_old;

  update booking_items
     set tour_departure_id = p_departure_id, subtotal_cents = p_total_cents, quote = p_quote
   where id = v_item.id;

  perform tour_hold_create(p_departure_id, v_item.seats, v_item.id, interval '100 years');

  if v_booking.status = 'confirmed' then
    update tour_seat_holds set confirmed_at = now(), expires_at = null
     where booking_item_id = v_item.id and departure_id = p_departure_id
       and released_at is null and confirmed_at is null;
  end if;

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

commit;
