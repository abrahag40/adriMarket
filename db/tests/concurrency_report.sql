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

  -- Primero que la prueba haya ocurrido. "Sin sobreventa" con cero lugares
  -- otorgados es cierto y no comprueba nada: si la salida está cerrada o
  -- agotada, los 200 intentos se rechazan y el veredicto sale en verde sobre
  -- un banco que nunca se ejecutó. Con 200 intentos de 1 lugar sobre un cupo
  -- de 20, lo correcto es que se otorguen exactamente 20.
  assert v_granted = v_capacity,
    format('EL BANCO NO SE EJECUTÓ: se otorgaron %s lugares de un cupo de %s. '
           'Sin lugares otorgados, "sin sobreventa" no comprueba nada.',
           v_granted, v_capacity);

  assert v_taken <= v_capacity,
    format('SOBREVENTA: %s lugares tomados sobre un cupo de %s', v_taken, v_capacity);
  assert v_drift = 0,
    format('CONTADOR DESALINEADO: drift = %s', v_drift);

  raise notice '✔ sin sobreventa: % lugares otorgados, cupo %, desalineación %',
    v_granted, v_capacity, v_drift;
end;
$$;
