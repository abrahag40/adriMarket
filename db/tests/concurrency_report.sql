-- concurrency_report.sql
-- Veredicto de la prueba de carga. Aborta si hubo sobreventa o desalineación.

\pset border 2

select
  count(*)                          as intentos,
  count(*) filter (where ok)        as apartados,
  count(*) filter (where not ok)    as rechazados
from bench_result;

select
  d.capacity                        as cupo,
  d.seats_taken                     as tomados,
  a.seats_from_holds                as lugares_en_holds,
  a.drift                           as desalineacion
from tour_departures d
join tour_departure_seat_audit a on a.departure_id = d.id
where d.id = (select departure_id from bench_target);

do $$
declare
  v_capacity integer;
  v_taken    integer;
  v_drift    integer;
  v_granted  integer;
begin
  select d.capacity, d.seats_taken, a.drift
    into v_capacity, v_taken, v_drift
    from tour_departures d
    join tour_departure_seat_audit a on a.departure_id = d.id
   where d.id = (select departure_id from bench_target);

  select count(*) filter (where ok) into v_granted from bench_result;

  assert v_taken <= v_capacity,
    format('SOBREVENTA: %s lugares tomados sobre un cupo de %s', v_taken, v_capacity);
  assert v_drift = 0,
    format('CONTADOR DESALINEADO: drift = %s', v_drift);

  raise notice '✔ sin sobreventa: % lugares otorgados, cupo %, desalineación %',
    v_granted, v_capacity, v_drift;
end;
$$;
