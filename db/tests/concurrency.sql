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

-- La salida es PROPIA del banco, no la primera del calendario.
--
-- Tomarla por posición (`order by starts_at limit 1`) es la misma trampa que
-- ya costó caro en las garantías 5-7, y aquí mordió peor porque nadie lo vio:
-- `e2e-sme` crea una salida a las 8:00 —más temprano que las 9:00 del seed— y
-- **la cancela**, que es justo lo que ese recorrido va a probar. A partir de
-- ahí el banco apuntaba a una salida cerrada, `tour_hold_create` rechazaba los
-- 200 intentos con AM001, y el veredicto decía "sin sobreventa: 0 lugares
-- otorgados". Cierto, y completamente vacío: **la garantía anti-sobreventa
-- pasaba sin otorgar un solo lugar.**
--
-- El otro daño era simétrico: el `update ... set seats_taken = 0` de abajo le
-- borraba el contador a una salida compartida que podía tener apartados vivos.
--
-- Se reutiliza entre corridas en vez de crear una nueva cada vez: (opción,
-- instante) es único, así que sin el `on conflict` la segunda corrida del día
-- truena.
insert into tour_departures (tour_option_id, starts_at, ends_at, capacity, note)
select o.id,
       (current_date + 90 + time '05:00') at time zone 'America/Cancun',
       (current_date + 90 + time '09:00') at time zone 'America/Cancun',
       20, 'salida del banco de concurrencia'
  from tour_options o
  join products pr on pr.id = o.product_id
 where pr.kind = 'tour' and o.active
 order by o.created_at
 limit 1
on conflict (tour_option_id, starts_at) do update
   set capacity = 20, status = 'open', note = excluded.note;

insert into bench_target (departure_id, unit_id)
select
  (select id from tour_departures where note = 'salida del banco de concurrencia'),
  (select id from rental_units order by created_at limit 1);

-- Cupo exacto y contador en cero para que el resultado sea comparable. Ahora
-- se le hace a una fila que es del banco y de nadie más.
update tour_departures
   set capacity = 20, seats_taken = 0, status = 'open'
 where id = (select departure_id from bench_target);

delete from tour_seat_holds
 where departure_id = (select departure_id from bench_target);

-- Y los bloqueos de estancia que dejó la corrida anterior.
--
-- Sin esto, B ("40 clientes por el mismo rango, solo uno debe ganar") solo
-- pasa la PRIMERA vez: el apartado del ganador dura 15 minutos, así que una
-- segunda corrida dentro de ese rato encuentra las fechas ocupadas, ganan
-- cero clientes y el veredicto falla con "0 clientes ganaron el mismo rango"
-- — un fallo que parece del inventario y es del banco. Pasaba desapercibido
-- porque nadie corre el banco dos veces seguidas... hasta que alguien lo hace.
--
-- Acotado a la unidad del banco y a sus años sintéticos (2030 y 2031), que no
-- existen en ningún otro lado. Se borra en vez de liberar porque son filas de
-- utilería: el invariante de "liberar es un UPDATE, nunca un DELETE" gobierna
-- a la aplicación, no a la preparación de una prueba de carga, y es el mismo
-- trato que ya reciben los apartados de tour de aquí arriba.
delete from rental_blocks
 where unit_id = (select unit_id from bench_target)
   and lower(dates) >= date '2030-01-01';

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
  perform rental_hold_create(
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
