-- guarantees.sql
-- Pruebas de las garantías del inventario y del dinero.
--
-- No son pruebas de "el SQL compila": cada bloque intenta provocar el error
-- que costaría dinero en producción y verifica que la base lo impida.
-- Se ejecuta contra una base con el esquema y el seed de desarrollo:
--
--   psql -d adrimarket -v ON_ERROR_STOP=1 -f db/tests/guarantees.sql
--
-- Cualquier fallo aborta con excepción. Al final imprime el resumen.

\set ON_ERROR_STOP on

begin;

-- Ayudante: arma una reserva en hold con un renglón, como lo haría el
-- checkout. Devuelve el id del renglón.
create or replace function test_make_item(
  p_kind         product_kind,
  p_unit_id      uuid default null,
  p_range        daterange default null,
  p_departure_id uuid default null,
  p_seats        integer default null,
  p_total_cents  bigint default 1000000
) returns uuid
language plpgsql as $$
declare
  v_customer uuid;
  v_product  uuid;
  v_booking  uuid;
  v_item     uuid;
  v_pct      numeric;
begin
  insert into customers (full_name, email)
  values ('Huésped de prueba', 'prueba+' || gen_random_uuid() || '@example.com')
  returning id into v_customer;

  if p_kind = 'stay' then
    select product_id into v_product from stay_units where id = p_unit_id;
  else
    select o.product_id into v_product
      from tour_options o
      join tour_departures d on d.tour_option_id = o.id
     where d.id = p_departure_id;
  end if;

  v_pct := resolve_deposit_pct(v_product);

  insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                        quote, deposit_due_at, currency)
  values (v_customer, 'hold', p_total_cents, v_pct,
          round(p_total_cents * v_pct / 100), '{}'::jsonb,
          now() + interval '15 minutes', 'MXN')
  returning id into v_booking;

  insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range, guests,
                             tour_departure_id, seats, subtotal_cents, quote)
  values (v_booking, p_kind, v_product, p_unit_id, p_range,
          case when p_kind = 'stay' then 2 end,
          p_departure_id, p_seats, p_total_cents, '{}'::jsonb)
  returning id into v_item;

  return v_item;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Estancias: el traslape es imposible
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit  uuid := '66666666-6666-6666-6666-666666666666';
  v_item  uuid;
  v_caught boolean := false;
begin
  v_item := test_make_item('stay', v_unit, daterange('2026-09-14', '2026-09-17'));
  perform stay_hold_create(v_unit, daterange('2026-09-14', '2026-09-17'), v_item);

  -- Segundo intento traslapando el día 16.
  begin
    v_item := test_make_item('stay', v_unit, daterange('2026-09-16', '2026-09-19'));
    perform stay_hold_create(v_unit, daterange('2026-09-16', '2026-09-19'), v_item);
  exception when sqlstate 'AM002' then
    v_caught := true;
  end;

  assert v_caught, 'FALLO: se permitió apartar fechas traslapadas';
  raise notice '✔ 1. traslape de fechas rechazado por la base (AM002)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rotación el mismo día SÍ se permite
-- ---------------------------------------------------------------------------

-- Uno sale el 17 y otro entra el 17: no es traslape. Es el caso que rompen
-- casi todas las implementaciones que usan fecha_inicio <= X <= fecha_fin.
do $$
declare
  v_unit uuid := '66666666-6666-6666-6666-666666666666';
  v_item uuid;
  v_id   uuid;
begin
  v_item := test_make_item('stay', v_unit, daterange('2026-09-17', '2026-09-20'));
  v_id := stay_hold_create(v_unit, daterange('2026-09-17', '2026-09-20'), v_item);

  assert v_id is not null, 'FALLO: se rechazó una rotación válida el mismo día';
  raise notice '✔ 2. rotación el mismo día aceptada (salida 17 / llegada 17)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Un bloqueo de mantenimiento también impide vender
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit uuid := '66666666-6666-6666-6666-666666666666';
  v_item uuid;
  v_caught boolean := false;
begin
  insert into stay_blocks (unit_id, stay, reason, note)
  values (v_unit, daterange('2026-10-01', '2026-10-05'), 'maintenance', 'Pintura');

  begin
    v_item := test_make_item('stay', v_unit, daterange('2026-10-03', '2026-10-06'));
    perform stay_hold_create(v_unit, daterange('2026-10-03', '2026-10-06'), v_item);
  exception when sqlstate 'AM002' then
    v_caught := true;
  end;

  assert v_caught, 'FALLO: se vendió sobre un bloqueo de mantenimiento';
  assert not stay_is_available(v_unit, daterange('2026-10-03', '2026-10-06')),
    'FALLO: stay_is_available no ve el bloqueo';
  raise notice '✔ 3. bloqueo de mantenimiento impide la venta';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Al expirar el hold, las fechas vuelven a estar a la venta
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit    uuid := '66666666-6666-6666-6666-666666666666';
  v_item    uuid;
  v_booking uuid;
  v_range   daterange := daterange('2026-11-10', '2026-11-13');
  v_result  jsonb;
begin
  v_item := test_make_item('stay', v_unit, v_range);
  perform stay_hold_create(v_unit, v_range, v_item);

  assert not stay_is_available(v_unit, v_range), 'FALLO: el hold no apartó nada';

  -- El anticipo nunca llegó: el plazo ya venció.
  select booking_id into v_booking from booking_items where id = v_item;
  update bookings set deposit_due_at = now() - interval '1 minute' where id = v_booking;

  v_result := booking_expire_holds();

  assert (v_result ->> 'bookings_expired')::int >= 1,
    'FALLO: el job no expiró la reserva';
  assert (select status from bookings where id = v_booking) = 'expired',
    'FALLO: la reserva no quedó en expired';
  assert stay_is_available(v_unit, v_range),
    'FALLO: las fechas no volvieron a estar disponibles';
  raise notice '✔ 4. hold vencido libera las fechas y marca la reserva expirada';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Tours: no se puede vender más allá del cupo
-- ---------------------------------------------------------------------------

do $$
declare
  v_dep   uuid;
  v_item  uuid;
  v_caught boolean := false;
begin
  select id into v_dep from tour_departures order by starts_at limit 1;
  update tour_departures set capacity = 12, seats_taken = 0 where id = v_dep;

  -- 9 lugares vendidos.
  v_item := test_make_item('tour', null, null, v_dep, 9);
  perform tour_hold_create(v_dep, 9, v_item);
  assert tour_seats_left(v_dep) = 3, 'FALLO: el contador no cuadra tras vender 9';

  -- Alguien pide 4 y solo quedan 3.
  begin
    v_item := test_make_item('tour', null, null, v_dep, 4);
    perform tour_hold_create(v_dep, 4, v_item);
  exception when sqlstate 'AM001' then
    v_caught := true;
  end;

  assert v_caught, 'FALLO: se vendieron más lugares que el cupo';
  assert tour_seats_left(v_dep) = 3, 'FALLO: el intento fallido movió el contador';
  raise notice '✔ 5. sobreventa de tour rechazada (AM001), contador intacto';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. El hold de tour vencido devuelve los lugares
-- ---------------------------------------------------------------------------

do $$
declare
  v_dep     uuid;
  v_item    uuid;
  v_booking uuid;
  v_drift   integer;
begin
  select id into v_dep from tour_departures order by starts_at offset 1 limit 1;
  update tour_departures set capacity = 10, seats_taken = 0 where id = v_dep;

  v_item := test_make_item('tour', null, null, v_dep, 6);
  perform tour_hold_create(v_dep, 6, v_item);
  assert tour_seats_left(v_dep) = 4, 'FALLO: contador incorrecto tras apartar 6';

  select booking_id into v_booking from booking_items where id = v_item;
  update bookings set deposit_due_at = now() - interval '1 minute' where id = v_booking;
  perform booking_expire_holds();

  assert tour_seats_left(v_dep) = 10, 'FALLO: los lugares no regresaron al cupo';

  select drift into v_drift from tour_departure_seat_audit where departure_id = v_dep;
  assert v_drift = 0, format('FALLO: el contador quedó desalineado (drift=%s)', v_drift);
  raise notice '✔ 6. lugares devueltos al expirar, contador sin desalineación';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Apartados huérfanos: checkout abandonado antes de crear la reserva
-- ---------------------------------------------------------------------------

do $$
declare
  v_dep    uuid;
  v_unit   uuid := '66666666-6666-6666-6666-666666666666';
  v_range  daterange := daterange('2026-12-01', '2026-12-04');
  v_result jsonb;
begin
  select id into v_dep from tour_departures order by starts_at offset 2 limit 1;
  update tour_departures set capacity = 8, seats_taken = 0 where id = v_dep;

  -- Sin booking_item_id: nadie los va a liberar por reserva.
  perform tour_hold_create(v_dep, 3, null, interval '-1 minute');
  perform stay_hold_create(v_unit, v_range, null, interval '-1 minute');

  assert tour_seats_left(v_dep) = 5, 'FALLO: el hold huérfano no apartó lugares';
  assert not stay_is_available(v_unit, v_range), 'FALLO: el hold huérfano no apartó fechas';

  v_result := booking_expire_holds();

  assert (v_result ->> 'orphan_holds_released')::int = 2,
    format('FALLO: se esperaban 2 huérfanos liberados, hubo %s', v_result ->> 'orphan_holds_released');
  assert tour_seats_left(v_dep) = 8, 'FALLO: los lugares huérfanos no regresaron';
  assert stay_is_available(v_unit, v_range), 'FALLO: las fechas huérfanas no se liberaron';
  raise notice '✔ 7. apartados huérfanos recuperados por el barrido';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Confirmar exige el anticipo cobrado
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit    uuid := '66666666-6666-6666-6666-666666666666';
  v_item    uuid;
  v_booking uuid;
  v_caught  boolean := false;
begin
  v_item := test_make_item('stay', v_unit, daterange('2027-02-10', '2027-02-14'), null, null, 2000000);
  perform stay_hold_create(v_unit, daterange('2027-02-10', '2027-02-14'), v_item);
  select booking_id into v_booking from booking_items where id = v_item;

  begin
    perform booking_confirm(v_booking);
  exception when sqlstate 'AM003' then
    v_caught := true;
  end;

  assert v_caught, 'FALLO: se confirmó una reserva sin anticipo cobrado';
  assert (select status from bookings where id = v_booking) = 'hold',
    'FALLO: la reserva cambió de estado sin cobro';
  raise notice '✔ 8. no se confirma sin el anticipo efectivamente cobrado';
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Confirmación completa: 40% de anticipo, saldo por cobrar y avisos
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit    uuid := '66666666-6666-6666-6666-666666666666';
  v_item    uuid;
  v_booking uuid;
  v_row     record;
  v_avisos  integer;
begin
  v_item := test_make_item('stay', v_unit, daterange('2027-03-01', '2027-03-05'), null, null, 2000000);
  perform stay_hold_create(v_unit, daterange('2027-03-01', '2027-03-05'), v_item);
  select booking_id into v_booking from booking_items where id = v_item;

  -- Casa Akumal sobreescribe el anticipo global: 40% de 20 000.00 = 8 000.00
  assert (select deposit_pct from bookings where id = v_booking) = 40,
    'FALLO: no se aplicó el anticipo del producto';
  assert (select deposit_cents from bookings where id = v_booking) = 800000,
    'FALLO: el anticipo no se calculó sobre el total';
  assert (select balance_cents from bookings where id = v_booking) = 1200000,
    'FALLO: el saldo derivado no cuadra';

  -- Llega el webhook de la pasarela.
  insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                        amount_cents, currency, paid_at)
  values (v_booking, 'deposit', 'succeeded', 'card', 'stripe', 'pi_test_' || v_booking,
          800000, 'MXN', now());

  perform booking_confirm(v_booking, 'webhook:stripe');

  select * into v_row from booking_payment_status where booking_id = v_booking;
  assert v_row.status = 'confirmed', 'FALLO: la reserva no quedó confirmada';
  assert v_row.deposit_paid_cents = 800000, 'FALLO: anticipo cobrado incorrecto';
  assert v_row.balance_due_cents = 1200000,
    'FALLO: el saldo en destino no quedó registrado como pago pendiente';

  -- El hold pasó a ocupación firme y ya no tiene vencimiento.
  assert (select reason from stay_blocks where booking_item_id = v_item) = 'booking',
    'FALLO: el hold no se convirtió en reserva firme';
  assert (select expires_at from stay_blocks where booking_item_id = v_item) is null,
    'FALLO: la ocupación firme sigue con vencimiento';

  select count(*) into v_avisos from outbox where booking_id = v_booking;
  assert v_avisos = 2, format('FALLO: se esperaban 2 avisos encolados, hubo %s', v_avisos);
  raise notice '✔ 9. confirmación: anticipo 40%%, saldo registrado, 2 avisos en cola';
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Idempotencia: el mismo webhook diez veces = una sola reserva
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit    uuid := '66666666-6666-6666-6666-666666666666';
  v_item    uuid;
  v_booking uuid;
  v_avisos  integer;
  v_balance integer;
  v_dup     boolean := false;
begin
  v_item := test_make_item('stay', v_unit, daterange('2027-04-01', '2027-04-04'), null, null, 1000000);
  perform stay_hold_create(v_unit, daterange('2027-04-01', '2027-04-04'), v_item);
  select booking_id into v_booking from booking_items where id = v_item;

  insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                        amount_cents, currency, paid_at)
  values (v_booking, 'deposit', 'succeeded', 'card', 'stripe', 'pi_idem_' || v_booking,
          400000, 'MXN', now());

  -- El webhook llega diez veces, como pasa de verdad.
  for i in 1..10 loop
    perform booking_confirm(v_booking, 'webhook:stripe');
  end loop;

  select count(*) into v_avisos from outbox where booking_id = v_booking;
  select count(*) into v_balance from payments
   where booking_id = v_booking and purpose = 'balance';

  assert v_avisos = 2, format('FALLO: avisos duplicados (%s)', v_avisos);
  assert v_balance = 1, format('FALLO: saldo duplicado (%s filas)', v_balance);

  -- Y el registro del evento del proveedor tampoco se puede duplicar.
  insert into payment_events (provider, provider_event_id, type, payload, booking_id)
  values ('stripe', 'evt_unico_1', 'payment_intent.succeeded', '{}'::jsonb, v_booking);
  begin
    insert into payment_events (provider, provider_event_id, type, payload, booking_id)
    values ('stripe', 'evt_unico_1', 'payment_intent.succeeded', '{}'::jsonb, v_booking);
  exception when unique_violation then
    v_dup := true;
  end;
  assert v_dup, 'FALLO: el mismo evento del proveedor se guardó dos veces';
  raise notice '✔ 10. 10 webhooks = 1 reserva, 2 avisos, 1 saldo; evento no duplicable';
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Tarifas: temporada y día de la semana por prioridad
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit  uuid := '66666666-6666-6666-6666-666666666666';
  v_total bigint;
  v_sin_tarifa integer;
begin
  -- Jueves 2026-09-17 a domingo 2026-09-20: 3 noches (17, 18, 19).
  -- Jueves usa Base (320 000); viernes y sábado usan Fin de semana (390 000).
  select sum(nightly_cents) into v_total
    from stay_nightly_rates(v_unit, daterange('2026-09-17', '2026-09-20'));

  assert v_total = 1100000,
    format('FALLO: el total por noche no cuadra, se obtuvo %s', v_total);

  -- Diciembre 25 cae en temporada alta (priority 10) aunque sea viernes.
  assert (select nightly_cents from stay_nightly_rates(v_unit, daterange('2026-12-25', '2026-12-26'))) = 580000,
    'FALLO: la temporada alta no ganó por prioridad';

  -- Una noche sin tarifa configurada NO se cotiza sola: sale en null para que
  -- la aplicación se niegue en lugar de inventar un precio.
  select count(*) into v_sin_tarifa
    from stay_nightly_rates(v_unit, daterange('2029-01-01', '2029-01-03'))
   where nightly_cents is null;
  assert v_sin_tarifa = 2, 'FALLO: una noche sin tarifa no se reportó como null';

  raise notice '✔ 11. tarifas por temporada, día de semana y prioridad correctas';
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Integridad del modelo
-- ---------------------------------------------------------------------------

do $$
declare
  v_caught integer := 0;
begin
  -- Un renglón no puede ser de estancia y de tour a la vez.
  begin
    insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range,
                               guests, tour_departure_id, seats, subtotal_cents, quote)
    select b.id, 'stay', '55555555-5555-5555-5555-555555555555',
           '66666666-6666-6666-6666-666666666666', daterange('2028-01-01','2028-01-03'), 2,
           (select id from tour_departures limit 1), 2, 100, '{}'::jsonb
      from bookings b limit 1;
  exception when check_violation then v_caught := v_caught + 1;
  end;

  -- El anticipo no puede exceder el total.
  begin
    insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                          quote, deposit_due_at)
    select id, 'hold', 100000, 30, 200000, '{}'::jsonb, now() + interval '15 minutes'
      from customers limit 1;
  exception when check_violation then v_caught := v_caught + 1;
  end;

  -- Una reserva en hold necesita fecha límite de pago.
  begin
    insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents, quote)
    select id, 'hold', 100000, 30, 30000, '{}'::jsonb from customers limit 1;
  exception when check_violation then v_caught := v_caught + 1;
  end;

  assert v_caught = 3, format('FALLO: solo %s de 3 restricciones se aplicaron', v_caught);
  raise notice '✔ 12. restricciones de forma del modelo aplicadas (3/3)';
end;
$$;

rollback;
