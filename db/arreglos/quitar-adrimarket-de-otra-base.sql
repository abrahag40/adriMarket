-- quitar-adrimarket-de-otra-base.sql
--
-- Quita el esquema de adriMarket de una base **ajena** donde se aplicó por
-- equivocación, sin tocar nada de quien vive ahí.
--
-- El 2026-09-04 se pegó la cadena de otro proyecto de Neon y se aplicaron las
-- 16 migraciones sobre `azahar`, que resultó **no** estar vacía: tiene un
-- sistema escolar de 28 tablas administrado por Prisma. Los nombres no
-- chocaron —`alumno` y `bookings` no compiten— así que las migraciones
-- pasaron limpias y el error no dio ninguna señal.
--
-- **Por qué no `drop schema public cascade`.** Es lo primero que uno teclea y
-- aquí habría borrado el sistema escolar completo. Esto tira objeto por
-- objeto, solo los que las migraciones crean, y se niega a correr si no
-- encuentra evidencia de que la base es de alguien más.
--
-- Lo que NO toca, a propósito:
--
--   · La extensión `btree_gist`. Se creó con `if not exists`, así que no hay
--     forma de saber si ya estaba. Quitarla podría romperle algo a quien vive
--     aquí; dejarla no le cuesta nada a nadie.
--   · Cualquier tabla, función, tipo o disparador que no esté en las listas de
--     abajo. Si las migraciones alguna vez crean algo nuevo, este archivo se
--     queda corto —y quedarse corto es el lado seguro del error.
--
-- Se corre pegándolo en el editor SQL de Neon, sobre la base ajena.
--
-- **Sin meta-comandos de psql.** El primer intento traía `\set ON_ERROR_STOP
-- on` en la cabecera y el editor web lo mandó tal cual a Postgres, que no
-- entiende `\`: error de sintaxis en la primera línea y nada se ejecutó. No
-- hace falta: todo el trabajo va dentro de un solo `do`, que es una sola
-- transacción — si algo revienta, revierte completo por sí mismo.

do $$
declare
  v_tablas    text[] := array[
    'audit_log','booking_events','booking_guests','booking_items','bookings',
    'cancellation_policies','coupons','customers','locations','media_jobs',
    'outbox','payment_events','payments','product_media','product_tags',
    'product_translations','products','refunds','schema_migrations','settings',
    'staff_login_tokens','staff_sessions','staff_users','stay_blocks',
    'stay_rate_plans','stay_rates','stay_units','tags','tax_rates',
    'tour_departures','tour_itinerary_steps','tour_options','tour_pax_prices',
    'tour_seat_holds',
    -- Solo existen si alguien corrió la prueba de concurrencia aquí.
    'bench_result','bench_target'
  ];
  v_vistas    text[] := array['booking_payment_status','tour_departure_seat_audit'];
  v_funciones text[] := array[
    'audit_record','booking_cancel','booking_collect_balance','booking_confirm',
    'booking_expire_holds','booking_refund_quote','booking_reschedule_stay',
    'booking_reschedule_tour','booking_service_at','coupon_redeem',
    'departure_cancel','departures_generate','generate_booking_code',
    'notifications_enqueue_reminders','outbox_enqueue_whatsapp',
    'resolve_deposit_pct','settings_set_deposit_pct','stay_availability_range',
    'stay_hold_create','stay_is_available','stay_nightly_rates','stay_rate_at',
    'touch_updated_at','tour_hold_create','tour_seats_left','whatsapp_number'
  ];
  v_tipos     text[] := array[
    'block_reason','booking_status','coupon_kind','departure_status',
    'notification_channel','notification_status','pax_type','payment_method',
    'payment_purpose','payment_status','product_kind','product_status',
    'staff_role','tax_kind'
  ];
  v_ajenas    integer;
  v_nuestras  integer;
  r           record;
  v_nombre    text;
  v_n         integer := 0;
begin
  -- Guarda: esto es para una base de alguien más. Si TODAS las tablas son de
  -- adriMarket, esta es la base de adriMarket y aquí no se borra nada —es
  -- exactamente el comando que arrasaría producción si se pega en la ventana
  -- equivocada, que es cómo empezó todo esto.
  select count(*) filter (where table_name <> all (v_tablas || v_vistas)),
         count(*) filter (where table_name  = any (v_tablas || v_vistas))
    into v_ajenas, v_nuestras
    from information_schema.tables
   where table_schema = 'public';

  if v_nuestras = 0 then
    raise exception 'Aquí no hay nada de adriMarket que quitar.';
  end if;

  if v_ajenas = 0 then
    raise exception
      'Todas las tablas de esta base son de adriMarket: ESTA ES LA BASE DE '
      'adriMarket, no una ajena. Cancelado.';
  end if;

  raise notice 'Se quedan % tablas que no son de adriMarket.', v_ajenas;
  raise notice 'Se van % objetos de adriMarket.', v_nuestras;

  -- Vistas antes que tablas: dependen de ellas.
  foreach v_nombre in array v_vistas loop
    execute format('drop view if exists public.%I cascade', v_nombre);
  end loop;

  foreach v_nombre in array v_tablas loop
    execute format('drop table if exists public.%I cascade', v_nombre);
  end loop;

  -- Las funciones se tiran por su firma completa: hay sobrecargas, y
  -- `drop function nombre` sin argumentos falla cuando hay más de una.
  for r in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (v_funciones)
  loop
    execute format('drop function if exists %s cascade', r.firma);
    v_n := v_n + 1;
  end loop;
  raise notice 'Funciones quitadas: %', v_n;

  foreach v_nombre in array v_tipos loop
    execute format('drop type if exists public.%I cascade', v_nombre);
  end loop;

  raise notice 'Listo.';
end;
$$;

-- Lo que queda. Debe ser solo lo de quien vive aquí.
select table_name from information_schema.tables
 where table_schema = 'public'
 order by 1;
