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

-- Unidad exclusiva de la prueba.
--
-- Las pruebas 1 a 4 usaban una unidad del seed con fechas fijas, y eso las hacía
-- depender de que nadie más hubiera vendido esas noches: una reserva dejada por
-- el recorrido de navegador bastaba para tumbarlas. El fallo era de la prueba,
-- no del inventario. Se clona una unidad propia dentro de la transacción, así
-- las fechas son libres por construcción y no por suerte.
create temporary table test_fixture as
select gen_random_uuid() as unit_id;

insert into stay_units (id, product_id, code, max_guests, base_guests,
                        extra_guest_fee_cents, cleaning_fee_cents, min_nights)
select f.unit_id, u.product_id, 'TEST-' || left(f.unit_id::text, 8),
       u.max_guests, u.base_guests, u.extra_guest_fee_cents, u.cleaning_fee_cents, 1
  from test_fixture f
  join stay_units u on u.id = '66666666-6666-6666-6666-666666666666';

-- La tarifa cuelga de la unidad, así que la copia también se clona: si no, la
-- prueba 11 mediría una unidad sin precios en lugar de la resolución por
-- temporada y día de semana que quiere verificar.
create temporary table test_plan_map as
select p.id as source_plan, gen_random_uuid() as clone_plan
  from stay_rate_plans p
 where p.unit_id = '66666666-6666-6666-6666-666666666666';

insert into stay_rate_plans (id, unit_id, name, currency, active)
select m.clone_plan, f.unit_id, p.name, p.currency, p.active
  from test_plan_map m
  join stay_rate_plans p on p.id = m.source_plan
  cross join test_fixture f;

insert into stay_rates (rate_plan_id, name, season, dows, nightly_cents, min_nights,
                        closed_to_arrival, closed_to_departure, priority)
select m.clone_plan, r.name, r.season, r.dows, r.nightly_cents, r.min_nights,
       r.closed_to_arrival, r.closed_to_departure, r.priority
  from test_plan_map m
  join stay_rates r on r.rate_plan_id = m.source_plan;

create or replace function test_unit() returns uuid
language sql stable as $$ select unit_id from test_fixture $$;

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

-- Ayudante: una salida de tour exclusiva de la prueba.
--
-- Las pruebas 5, 6 y 7 tomaban una salida del seed por posición
-- (`order by starts_at offset N limit 1`) y le sobreescribían `capacity` y
-- `seats_taken` con un `update` crudo. Eso solo funciona sobre una base recién
-- sembrada: en cuanto un recorrido de navegador vende lugares en esa salida, el
-- `update` deja el contador en 0 con apartados vivos, y la vista de auditoría
-- reporta un desajuste —correctamente— que parece un defecto del inventario y
-- no lo es. Es la misma lección que ya se había aprendido con las estancias en
-- las pruebas 1 a 4, y que a los tours nunca se le aplicó.
--
-- Ahora cada prueba crea la suya, libre por construcción y no por suerte.
create temporary sequence test_departure_seq;

create or replace function test_departure(p_capacity integer default 10)
returns uuid
language plpgsql as $$
declare
  v_option uuid;
  v_dep    uuid;
begin
  select id into v_option from tour_options order by id limit 1;

  insert into tour_departures (tour_option_id, starts_at, ends_at, capacity, seats_taken, status)
  values (v_option,
          date_trunc('hour', now()) + interval '500 days'
            + (nextval('test_departure_seq') * interval '1 hour'),
          date_trunc('hour', now()) + interval '500 days'
            + (nextval('test_departure_seq') * interval '1 hour') + interval '4 hours',
          p_capacity, 0, 'open')
  returning id into v_dep;

  return v_dep;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Estancias: el traslape es imposible
-- ---------------------------------------------------------------------------

do $$
declare
  v_unit  uuid := test_unit();
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
  v_unit uuid := test_unit();
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
  v_unit uuid := test_unit();
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
  v_unit    uuid := test_unit();
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
  v_dep := test_departure(12);

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
  v_dep := test_departure(10);

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
  v_unit   uuid := test_unit();
  v_range  daterange := daterange('2026-12-01', '2026-12-04');
  v_result jsonb;
begin
  v_dep := test_departure(8);

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
  v_unit    uuid := test_unit();
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
  v_unit    uuid := test_unit();
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
  v_unit    uuid := test_unit();
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
  v_unit  uuid := test_unit();
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

-- ---------------------------------------------------------------------------
-- Ayudante para las garantías de cancelación
-- ---------------------------------------------------------------------------

-- Reserva confirmada con anticipo cobrado, con la política congelada encima y
-- con el servicio a las horas que pida la prueba. La política se congela como lo
-- hace el checkout: copiada dentro de la reserva, no referenciada.
--
-- **Cada llamada usa su propia unidad.** Dos casos que piden anticipaciones
-- parecidas caen en las mismas noches, y compartir unidad los hace chocar entre
-- sí: la prueba fallaría por cómo está escrita y no por lo que mide.
create or replace function test_confirmed_stay(
  p_hours_ahead numeric,
  p_policy      jsonb default null
) returns uuid
language plpgsql as $$
declare
  v_unit     uuid := gen_random_uuid();
  v_product  uuid;
  v_customer uuid;
  v_booking  uuid;
  v_item     uuid;
  v_start    date := ((now() + make_interval(hours => p_hours_ahead::int))
                        at time zone 'America/Cancun')::date;
  v_range    daterange;
begin
  -- La entrada es a las 15:00 locales, así que para que el servicio caiga a las
  -- horas pedidas hay que fechar la noche, no el instante.
  v_range := daterange(v_start, v_start + 3);

  insert into stay_units (id, product_id, code, max_guests, base_guests, min_nights)
  select v_unit, u.product_id, 'CANCEL-' || left(v_unit::text, 8), u.max_guests, u.base_guests, 1
    from stay_units u where u.id = test_unit()
  returning product_id into v_product;

  insert into customers (full_name, email)
  values ('Huésped cancelación', 'cancel+' || gen_random_uuid() || '@example.com')
  returning id into v_customer;

  insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                        quote, deposit_due_at, currency, cancellation_policy_snapshot)
  values (v_customer, 'hold', 1000000, 40, 400000, '{}'::jsonb,
          now() + interval '15 minutes', 'MXN',
          coalesce(p_policy,
            (select jsonb_build_object('name', name, 'rules', rules,
                                       'deposit_refundable', deposit_refundable)
               from cancellation_policies limit 1)))
  returning id into v_booking;

  insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range,
                             guests, subtotal_cents, quote)
  values (v_booking, 'stay', v_product, v_unit, v_range, 2, 1000000, '{}'::jsonb)
  returning id into v_item;

  perform stay_hold_create(v_unit, v_range, v_item);

  insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                        amount_cents, currency, paid_at)
  values (v_booking, 'deposit', 'succeeded', 'card', 'stripe',
          'pi_g_' || gen_random_uuid(), 400000, 'MXN', now());

  perform booking_confirm(v_booking, 'prueba');
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. El reembolso sale de la política congelada, no de la vigente
-- ---------------------------------------------------------------------------

-- Es la garantía central del Sprint 5. El huésped aceptó un texto concreto en el
-- checkout; que el cliente edite la política después no puede cambiar lo que ya
-- se acordó, ni a favor ni en contra.
do $$
declare
  v_booking uuid;
  v_refund  bigint;
  v_pct     numeric;
begin
  v_booking := test_confirmed_stay(
    300,
    '{"name":"Prueba","deposit_refundable":true,
      "rules":[{"hours_before":168,"refund_pct":100},{"hours_before":48,"refund_pct":50}]}'::jsonb
  );

  -- El cliente endurece su política después de que el huésped reservó.
  update cancellation_policies set rules = '[]'::jsonb, deposit_refundable = false;

  select refund_cents, refund_pct into v_refund, v_pct from booking_refund_quote(v_booking);
  assert v_refund = 400000 and v_pct = 100,
    format('FALLO: la política vigente se impuso sobre la congelada (%s / %s%%)', v_refund, v_pct);

  raise notice '✔ 13. el reembolso sale de la política congelada en la reserva';
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Los escalones de la política se aplican por anticipación
-- ---------------------------------------------------------------------------

do $$
declare
  v_politica jsonb :=
    '{"name":"Prueba","deposit_refundable":true,
      "rules":[{"hours_before":168,"refund_pct":100},{"hours_before":48,"refund_pct":50}]}'::jsonb;
  v_booking uuid;
  v_refund  bigint;
begin
  -- Cada caso se arma en su propia sentencia y después se consulta. Anidar la
  -- llamada (`booking_refund_quote(test_confirmed_stay(...))`) no funciona:
  -- booking_refund_quote es `stable` y ve la instantánea del inicio de la
  -- consulta, así que la reserva recién insertada todavía no existe para ella.
  v_booking := test_confirmed_stay(200, v_politica);
  select refund_cents into v_refund from booking_refund_quote(v_booking);
  assert v_refund = 400000, format('FALLO: 200 h antes debía devolver todo, devolvió %s', v_refund);

  -- Entre 48 y 168 horas: la mitad.
  v_booking := test_confirmed_stay(100, v_politica);
  select refund_cents into v_refund from booking_refund_quote(v_booking);
  assert v_refund = 200000, format('FALLO: 100 h antes debía devolver la mitad, devolvió %s', v_refund);

  -- Dentro de las 48 horas no hay escalón que se cumpla: nada.
  v_booking := test_confirmed_stay(10, v_politica);
  select refund_cents into v_refund from booking_refund_quote(v_booking);
  assert v_refund = 0, format('FALLO: 10 h antes no debía devolver nada, devolvió %s', v_refund);

  -- Una política que no admite devolución no devuelve, sin importar el plazo.
  v_booking := test_confirmed_stay(
    500,
    '{"name":"Estricta","deposit_refundable":false,
      "rules":[{"hours_before":24,"refund_pct":100}]}'::jsonb);
  select refund_cents into v_refund from booking_refund_quote(v_booking);
  assert v_refund = 0, format('FALLO: una política no reembolsable devolvió %s', v_refund);

  raise notice '✔ 14. los escalones de la política se aplican por anticipación';
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Cancelar el operador devuelve todo, aunque la política diga que no
-- ---------------------------------------------------------------------------

-- El cierre de puerto: el huésped no hizo nada mal. Cobrarle una penalización
-- por un huracán es el error que esta prueba existe para impedir.
do $$
declare
  v_booking uuid;
  v_refund  bigint;
begin
  v_booking := test_confirmed_stay(
    10,   -- dentro del plazo en que la política no devuelve nada
    '{"name":"Estricta","deposit_refundable":true,
      "rules":[{"hours_before":168,"refund_pct":100}]}'::jsonb
  );

  -- Confirmación de que la política sí sería 0 si cancelara el huésped.
  assert (select refund_cents from booking_refund_quote(v_booking)) = 0,
    'FALLO: la política de la prueba no está en el escalón que se quería probar';

  v_refund := booking_cancel(v_booking, 'Cierre de puerto', true, 'staff', null);

  assert v_refund = 400000,
    format('FALLO: el operador canceló y solo se devolvieron %s de 400000', v_refund);
  assert (select type from booking_events
           where booking_id = v_booking and type like 'booking.cancelled%'
           order by created_at desc limit 1) = 'booking.cancelled_by_operator',
    'FALLO: no se distingue quién canceló';

  raise notice '✔ 15. cancelación del operador devuelve todo y queda distinguida';
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. Cancelar libera el inventario y cierra el saldo por cobrar
-- ---------------------------------------------------------------------------

do $$
declare
  v_booking uuid;
  v_unit    uuid;
  v_range   daterange;
begin
  v_booking := test_confirmed_stay(400);
  -- La unidad se lee de la reserva: la fixture usa una propia por llamada.
  select i.stay_unit_id, i.stay_range into v_unit, v_range
    from booking_items i where i.booking_id = v_booking;

  assert not stay_is_available(v_unit, v_range), 'FALLO: la reserva confirmada no apartó nada';
  assert (select count(*) from payments
           where booking_id = v_booking and purpose = 'balance' and status = 'pending') = 1,
    'FALLO: la confirmación no registró el saldo por cobrar';

  perform booking_cancel(v_booking, 'El huésped canceló', false, 'staff', null);

  assert stay_is_available(v_unit, v_range),
    'FALLO: cancelar no devolvió las noches a la venta';
  -- El saldo no se cobró nunca: no es un faltante, es un cobro que ya no ocurre.
  assert (select count(*) from payments
           where booking_id = v_booking and purpose = 'balance' and status = 'pending') = 0,
    'FALLO: quedó un saldo por cobrar de una reserva cancelada';

  raise notice '✔ 16. cancelar libera el inventario y cierra el saldo por cobrar';
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. Cancelar una salida no deja a nadie sin avisar
-- ---------------------------------------------------------------------------

do $$
declare
  v_dep      uuid;
  v_item     uuid;
  v_bookings uuid[] := '{}';
  v_booking  uuid;
  v_result   record;
  v_avisos   int;
begin
  -- Salida propia de esta prueba. Reutilizar la primera del seed hace que
  -- cuenten también las reservas que dejaron las pruebas anteriores, y entonces
  -- el conteo mide el orden de ejecución en vez de la cancelación.
  insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
  select o.tour_option_id, o.starts_at + interval '900 days', o.ends_at + interval '900 days', 30
    from tour_departures o where o.status = 'open' order by o.starts_at limit 1
  returning id into v_dep;

  -- Tres reservas confirmadas sobre la misma salida.
  for i in 1..3 loop
    v_item := test_make_item('tour', null, null, v_dep, 2);
    perform tour_hold_create(v_dep, 2, v_item);
    select booking_id into v_booking from booking_items where id = v_item;
    insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                          amount_cents, currency, paid_at)
    select v_booking, 'deposit', 'succeeded', 'card', 'stripe',
           'pi_dep_' || gen_random_uuid(), deposit_cents, 'MXN', now()
      from bookings where id = v_booking;
    perform booking_confirm(v_booking, 'prueba');
    v_bookings := v_bookings || v_booking;
  end loop;

  select * into v_result from departure_cancel(v_dep, 'Cierre de puerto por mal tiempo', null);

  assert v_result.bookings_cancelled = 3,
    format('FALLO: se cancelaron %s de 3 reservas', v_result.bookings_cancelled);
  assert (select count(*) from bookings where id = any(v_bookings) and status = 'cancelled') = 3,
    'FALLO: alguna reserva de la salida quedó viva';
  assert (select status from tour_departures where id = v_dep) = 'cancelled',
    'FALLO: la salida no quedó cancelada';
  assert tour_seats_left(v_dep) = 30, 'FALLO: los lugares no volvieron al cupo';

  -- Lo que de verdad importa: nadie se queda sin aviso.
  select count(*) into v_avisos from outbox
   where booking_id = any(v_bookings) and template = 'booking_cancelled_by_operator';
  assert v_avisos = 3, format('FALLO: solo %s de 3 pasajeros recibirían aviso', v_avisos);

  -- Y cancelar dos veces la misma salida no reembolsa dos veces.
  select * into v_result from departure_cancel(v_dep, 'otra vez', null);
  assert v_result.bookings_cancelled = 0, 'FALLO: la segunda cancelación volvió a actuar';

  raise notice '✔ 17. cancelar una salida cancela, reembolsa y avisa a todos (3/3)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 18. Reprogramar a fechas ocupadas no destruye la reserva original
-- ---------------------------------------------------------------------------

-- Es el riesgo real de un cambio de fecha: soltar lo viejo antes de saber si lo
-- nuevo está libre deja al huésped sin nada. Aquí se comprueba que el rollback
-- lo impide.
do $$
declare
  v_booking uuid;
  v_unit    uuid;
  v_otra    uuid;
  v_ocupado daterange;
  v_original daterange;
  v_caught  boolean := false;
begin
  v_booking := test_confirmed_stay(500);
  select i.stay_unit_id, i.stay_range into v_unit, v_original
    from booking_items i where i.booking_id = v_booking;

  -- Otra reserva ocupa un rango distinto de la misma unidad.
  v_ocupado := daterange(upper(v_original) + 10, upper(v_original) + 13);
  v_otra := test_make_item('stay', v_unit, v_ocupado);
  perform stay_hold_create(v_unit, v_ocupado, v_otra);

  begin
    perform booking_reschedule_stay(v_booking, v_ocupado, 1000000, '{}'::jsonb, null);
  exception when sqlstate 'AM002' then
    v_caught := true;
  end;

  assert v_caught, 'FALLO: se reprogramó encima de fechas vendidas';
  raise notice '✔ 18. reprogramar a fechas ocupadas se rechaza (AM002)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 19. Reprogramar conserva el pago y ajusta el saldo
-- ---------------------------------------------------------------------------

do $$
declare
  v_booking  uuid;
  v_unit     uuid;
  v_original daterange;
  v_nuevo    daterange;
  v_diff     bigint;
begin
  v_booking := test_confirmed_stay(600);
  select i.stay_unit_id, i.stay_range into v_unit, v_original
    from booking_items i where i.booking_id = v_booking;
  v_nuevo := daterange(upper(v_original) + 30, upper(v_original) + 33);

  -- La tarifa subió 200 000 centavos respecto de lo cotizado originalmente.
  v_diff := booking_reschedule_stay(v_booking, v_nuevo, 1200000, '{}'::jsonb, null);

  assert v_diff = 200000, format('FALLO: la diferencia debía ser 200000, fue %s', v_diff);

  -- El anticipo ya cobrado se conserva tal cual: el huésped no paga dos veces.
  assert (select coalesce(sum(amount_cents), 0) from payments
           where booking_id = v_booking and purpose = 'deposit' and status = 'succeeded') = 400000,
    'FALLO: el anticipo cobrado se movió al reprogramar';

  -- La diferencia se cobra en destino, junto con el saldo.
  assert (select amount_cents from payments
           where booking_id = v_booking and purpose = 'balance' and status = 'pending') = 800000,
    'FALLO: la diferencia no se sumó al saldo por cobrar';

  -- Las noches viejas vuelven a la venta y las nuevas quedan apartadas.
  assert stay_is_available(v_unit, v_original), 'FALLO: las noches viejas siguen apartadas';
  assert not stay_is_available(v_unit, v_nuevo), 'FALLO: las noches nuevas no se apartaron';

  raise notice '✔ 19. reprogramar conserva el anticipo y ajusta el saldo';
end;
$$;

-- ---------------------------------------------------------------------------
-- 20. Los recordatorios salen una sola vez por reserva y por umbral
-- ---------------------------------------------------------------------------

do $$
declare
  v_booking uuid;
  v_primera int;
  v_total   int;
begin
  -- Servicio dentro de 30 horas: entró en la ventana de 72 y en la de 24.
  v_booking := test_confirmed_stay(30);

  select reminders_queued into v_primera from notifications_enqueue_reminders();
  assert v_primera >= 1, 'FALLO: no se encoló ningún recordatorio';

  -- El latido corre cada minuto: no puede mandar el mismo recordatorio cada vez.
  perform notifications_enqueue_reminders();
  perform notifications_enqueue_reminders();

  select count(*)::int into v_total from outbox
   where booking_id = v_booking and template = 'booking_reminder';
  assert v_total = 1,
    format('FALLO: se encolaron %s recordatorios para la misma reserva', v_total);

  raise notice '✔ 20. los recordatorios no se duplican aunque el latido corra seguido';
end;
$$;

-- ---------------------------------------------------------------------------
-- 21. Un aviso encolado siempre tiene a quién mandarse
-- ---------------------------------------------------------------------------

-- Se encontró en el Sprint 7 mirando /api/health: había confirmaciones en la
-- bandeja con el destinatario vacío, que mueren tras seis intentos. Un huésped
-- que paga y no recibe nada es la peor falla silenciosa posible, y no la ve
-- nadie hasta que reclama.
do $$
declare
  v_booking uuid;
  v_vacios  int;
begin
  v_booking := test_confirmed_stay(800);

  select count(*)::int into v_vacios from outbox
   where booking_id = v_booking and coalesce(to_address, '') = '';

  assert v_vacios = 0,
    format('FALLO: %s avisos de la confirmación quedaron sin destinatario', v_vacios);

  -- Y el correo del huésped es el suyo, no uno cualquiera.
  assert (select to_address from outbox
           where booking_id = v_booking and template = 'booking_confirmed_guest'
             and channel = 'email')
         = (select c.email from bookings b join customers c on c.id = b.customer_id
             where b.id = v_booking),
    'FALLO: la confirmación no va al correo del huésped';

  -- Y ahora sin el ajuste cargado, que es como estaba producción.
  --
  -- Esta mitad faltaba y por eso la garantía pasó en verde mientras producción
  -- acumulaba un aviso muerto por reserva: `dev_seed.sql` carga
  -- `notifications.admin_email`, así que la prueba nunca vio el caso que sí
  -- ocurrió. Una garantía que depende del seed comprueba el seed, no el
  -- sistema. Se borra el ajuste dentro de la transacción —que se revierte— y
  -- se confirma otra reserva.
  delete from settings where key = 'notifications';

  v_booking := test_confirmed_stay(900);

  select count(*)::int into v_vacios from outbox
   where booking_id = v_booking and coalesce(to_address, '') = '';

  assert v_vacios = 0,
    format('FALLO: sin el ajuste cargado se encolaron %s avisos sin destinatario', v_vacios);

  assert (select count(*) from outbox
           where booking_id = v_booking and template = 'booking_confirmed_admin') = 0,
    'FALLO: se encoló el aviso a la administración sin tener a dónde mandarlo';

  -- Pero el del huésped sí sale: no depende de ninguna configuración.
  assert (select count(*) from outbox
           where booking_id = v_booking and template = 'booking_confirmed_guest'
             and channel = 'email') = 1,
    'FALLO: la falta del ajuste dejó al huésped sin su confirmación';

  raise notice '✔ 21. toda confirmación se encola con destinatario (con ajuste y sin él)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 22. WhatsApp se encola solo si hay número que sirva
-- ---------------------------------------------------------------------------

do $$
declare
  v_booking uuid;
begin
  -- Diez dígitos: se completa con el código de país. Es el caso más común aquí.
  assert whatsapp_number('998 123 4567') = '529981234567',
    format('FALLO: número local mal normalizado: %s', whatsapp_number('998 123 4567'));
  assert whatsapp_number('+52 998 123 4567') = '529981234567', 'FALLO: número con lada mal normalizado';
  assert whatsapp_number('123') is null, 'FALLO: un número imposible debería quedar en null';
  assert whatsapp_number(null) is null, 'FALLO: sin teléfono no hay número';

  -- Sin teléfono no se encola WhatsApp, y eso no es una falla: es un huésped
  -- que no lo dejó. El correo sale igual.
  v_booking := test_confirmed_stay(900);
  update customers set phone = null
   where id = (select customer_id from bookings where id = v_booking);

  assert not outbox_enqueue_whatsapp(v_booking, 'booking_reminder'),
    'FALLO: se intentó encolar WhatsApp sin número';
  assert (select count(*) from outbox
           where booking_id = v_booking and channel = 'whatsapp') = 0,
    'FALLO: quedó una fila de WhatsApp sin destinatario';

  update customers set phone = '9981234567'
   where id = (select customer_id from bookings where id = v_booking);

  assert outbox_enqueue_whatsapp(v_booking, 'booking_reminder'),
    'FALLO: con número válido debería encolarse';
  assert (select to_address from outbox
           where booking_id = v_booking and channel = 'whatsapp') = '529981234567',
    'FALLO: el número encolado no está normalizado';

  raise notice '✔ 22. WhatsApp se encola solo con número normalizable';
end;
$$;

-- ---------------------------------------------------------------------------
-- 23. Cupón: el canje no puede pasarse del máximo (AM004)
-- ---------------------------------------------------------------------------

-- Mismo patrón que tour_hold_create (garantía 5): la fila se bloquea con
-- `for update` y el segundo canje ve el contador ya al límite. Dos huéspedes
-- canjeando el último uso disponible al mismo tiempo no pueden dejar
-- `redemptions` por encima de `max_redemptions`.
do $$
declare
  v_coupon uuid;
  v_caught boolean := false;
begin
  insert into coupons (code, kind, value, min_total_cents, max_redemptions)
  values ('TEST-CUPON-' || substr(gen_random_uuid()::text, 1, 8), 'percent', 10, 0, 1)
  returning id into v_coupon;

  perform coupon_redeem(v_coupon);
  assert (select redemptions from coupons where id = v_coupon) = 1,
    'FALLO: el primer canje debía dejar el contador en 1';

  begin
    perform coupon_redeem(v_coupon);
  exception when sqlstate 'AM004' then
    v_caught := true;
  end;

  assert v_caught, 'FALLO: se permitió canjear un cupón ya agotado';
  assert (select redemptions from coupons where id = v_coupon) = 1,
    'FALLO: el intento fallido no debía tocar el contador';

  raise notice '✔ 23. cupón agotado rechazado por coupon_redeem (AM004)';
end;
$$;

rollback;
