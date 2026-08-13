-- concurrency.sql
-- Preparación de la prueba de carga: la garantía anti-sobreventa se verifica
-- con clientes REALES en paralelo, no en secuencia.
--
-- Uso (ver scripts/db.sh bench):
--   psql -d adrimarket -f db/tests/concurrency.sql
--   pgbench -d adrimarket -n -f db/tests/concurrency_seats.pgbench -c 40 -j 4 -t 5
--   psql -d adrimarket -f db/tests/concurrency_report.sql
--
-- Estas tablas y funciones llevan prefijo bench_ y solo existen para la
-- prueba. No forman parte del esquema de la aplicación.

begin;

create table if not exists bench_result (
  ok  boolean not null,
  err text,
  at  timestamptz not null default clock_timestamp()
);

create table if not exists bench_target (
  departure_id uuid,
  unit_id      uuid
);

truncate bench_result;
truncate bench_target;

insert into bench_target (departure_id, unit_id)
select
  (select id from tour_departures order by starts_at limit 1),
  (select id from stay_units order by created_at limit 1);

-- Cupo exacto y contador en cero para que el resultado sea comparable.
update tour_departures
   set capacity = 20, seats_taken = 0
 where id = (select departure_id from bench_target);

delete from tour_seat_holds
 where departure_id = (select departure_id from bench_target);

-- Envoltorios que capturan el error de dominio. Sin esto, pgbench aborta al
-- cliente en el primer rechazo y no se puede contar cuántos intentos hubo.
create or replace function bench_try_seat(p_seats integer) returns boolean
language plpgsql as $$
begin
  perform tour_hold_create(
    (select departure_id from bench_target), p_seats, null, interval '15 minutes');
  insert into bench_result (ok) values (true);
  return true;
exception when sqlstate 'AM001' then
  insert into bench_result (ok, err) values (false, sqlerrm);
  return false;
end;
$$;

create or replace function bench_try_stay(p_from date, p_nights integer) returns boolean
language plpgsql as $$
begin
  perform stay_hold_create(
    (select unit_id from bench_target),
    daterange(p_from, p_from + p_nights), null, interval '15 minutes');
  insert into bench_result (ok) values (true);
  return true;
exception when sqlstate 'AM002' then
  insert into bench_result (ok, err) values (false, sqlerrm);
  return false;
end;
$$;

commit;
