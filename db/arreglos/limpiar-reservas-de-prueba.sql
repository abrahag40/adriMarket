-- limpiar-reservas-de-prueba.sql
--
-- Borra las dos reservas de prueba que quedaron en producción el 2026-09-07,
-- confirmadas por el simulador de pagos sin que entrara un peso:
--
--   AM-8FJ9JU · tour  · jjj@aaa.xcc  · "kkk"   · $1,300.00 · 2 lugares
--   AM-TDVCJ4 · casa  · aa@gmail.com · "kskkd" · $4,200.00 · 2026-09-09 → 13
--
-- Eran las **únicas** reservas de la base: no hay ningún cliente real de por
-- medio, y por eso esto se puede correr sin escoger.
--
-- ---------------------------------------------------------------------------
-- Por qué cancela antes de borrar, y no al revés
-- ---------------------------------------------------------------------------
--
-- `rental_blocks` y `tour_seat_holds` cuelgan de `booking_items` con
-- **ON DELETE SET NULL**, no cascade. Un `delete from bookings` a secas dejaría
-- las fechas bloqueadas y los lugares tomados **para siempre**: con
-- `released_at` en nulo, `booking_item_id` en nulo y ninguna reserva que
-- explique por qué esa casa no se puede vender del 9 al 13. Inventario muerto e
-- indiagnosticable.
--
-- No es un descuido del esquema: es el invariante del proyecto —"liberar
-- inventario es un UPDATE de released_at, nunca un DELETE"— defendido con
-- claves foráneas para que no dependa de que alguien se acuerde.
--
-- Así que primero `booking_cancel`, que es el camino probado por las garantías
-- 15, 16 y 17: libera las fechas, devuelve los lugares a la salida y cierra el
-- saldo por cobrar. Después el borrado, que en cascada se lleva renglones,
-- pagos, reembolsos, eventos, acompañantes y los avisos de la bandeja.
--
-- Se cancela **como operador** (`true`): devuelve todo y no aplica política.
-- Los reembolsos que eso registra son contra pagos del proveedor local —dinero
-- que nunca entró— y desaparecen en la misma cascada, así que no queda ninguna
-- devolución falsa esperando a que alguien la pague.
--
-- ---------------------------------------------------------------------------
-- Ojo con lo que esto NO arregla
-- ---------------------------------------------------------------------------
--
-- Se lleva los 4 avisos muertos, así que `/api/health` vuelve a 200. **El
-- correo sigue roto**: Gmail rechaza las credenciales SMTP con
-- `535-5.7.8 BadCredentials`. La salud en verde después de correr esto no
-- significa que el correo funcione — significa que ya no hay pruebas fallando.
-- La siguiente reserva real volverá a morir igual hasta que se recargue la
-- contraseña de aplicación.
--
-- Respaldo tomado antes de correr esto:
--   ~/.local/share/adrimarket/respaldos/prod-2026-09-07-limpieza/

begin;

\echo '=== ANTES ==='
select (select count(*) from bookings) as reservas,
       (select count(*) from rental_blocks where released_at is null) as fechas_ocupadas,
       (select count(*) from tour_seat_holds where released_at is null) as lugares_tomados,
       (select coalesce(sum(seats_taken),0) from tour_departures) as suma_seats_taken,
       (select count(*) from outbox where status='dead') as avisos_muertos;

\echo '=== cancelando (operador: devuelve todo, no aplica política) ==='
select b.code,
       booking_cancel(b.id, 'Reserva de prueba: limpieza previa a la venta',
                      true, 'staff', null)::text as devuelto
  from bookings b where b.code in ('AM-8FJ9JU','AM-TDVCJ4');

\echo '=== inventario liberado por la cancelación ==='
select (select count(*) from rental_blocks where released_at is null) as fechas_ocupadas,
       (select count(*) from tour_seat_holds where released_at is null) as lugares_tomados,
       (select coalesce(sum(seats_taken),0) from tour_departures) as suma_seats_taken;

\echo '=== borrando las reservas (cascada: renglones, pagos, reembolsos, eventos, avisos) ==='
delete from bookings where code in ('AM-8FJ9JU','AM-TDVCJ4');

\echo '=== borrando los clientes de prueba ==='
delete from customers where email in ('jjj@aaa.xcc','aa@gmail.com');

\echo '=== DESPUÉS (todo debe dar 0) ==='
select (select count(*) from bookings)      as reservas,
       (select count(*) from booking_items) as renglones,
       (select count(*) from payments)      as pagos,
       (select count(*) from refunds)       as reembolsos,
       (select count(*) from customers)     as clientes,
       (select count(*) from outbox where status='dead') as avisos_muertos;

\echo '=== ningún bloqueo huérfano (0 y 0, o algo salió mal) ==='
select (select count(*) from rental_blocks   where booking_item_id is null and released_at is null) as fechas_huerfanas,
       (select count(*) from tour_seat_holds where booking_item_id is null and released_at is null) as lugares_huerfanos;

\echo '=== el contador de lugares volvió a cero ==='
select coalesce(sum(seats_taken),0) as suma_seats_taken from tour_departures;

commit;
