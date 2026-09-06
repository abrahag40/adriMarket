-- 0020_apartado_sin_interbloqueo.sql
--
-- Dos huéspedes que piden las mismas fechas en el mismo instante podían
-- provocar un **interbloqueo**, y el que perdía no recibía "esas fechas ya no
-- están disponibles": recibía un error 500.
--
-- Es el interbloqueo clásico de las restricciones de exclusión, y no es un
-- defecto de esta base: al insertar, Postgres comprueba la restricción contra
-- las filas de otras transacciones **todavía sin confirmar**, y si encuentra
-- una en conflicto se queda esperando a que esa transacción termine. Con dos
-- inserciones simultáneas que chocan entre sí, cada una espera a la otra:
--
--   Process A waits for ShareLock on transaction B; blocked by process B.
--   Process B waits for ShareLock on transaction A; blocked by process A.
--   ... while checking exclusion constraint on relation "rental_blocks"
--
-- Lo detectó `npm run db:bench`, que es su razón de existir: cuarenta clientes
-- reales peleando por el mismo rango. Con menos concurrencia el sistema tenía
-- suerte y la prueba pasaba — que es lo que hace peligroso este defecto.
--
-- **El arreglo es serializar por unidad antes de insertar**, no reintentar ni
-- atrapar el interbloqueo. Con un cerrojo consultivo por unidad, la segunda
-- petición espera a que la primera confirme y entonces su inserción choca con
-- una fila **ya confirmada**: eso no es un interbloqueo, es un rechazo limpio
-- con AM002, que es exactamente lo que el huésped tiene que leer.
--
-- Por qué un cerrojo consultivo y no `select ... for update` sobre la unidad:
-- la fila de `rental_units` no cambia al apartar, así que bloquearla sería
-- pedir un candado sobre algo que no se toca —y lo tomaría también todo lo que
-- lea la unidad con `for share` por la llave foránea—. El consultivo se pide
-- sobre un número derivado del identificador y se suelta solo al terminar la
-- transacción.
--
-- Es transaccional (`_xact_`) a propósito: se libera al confirmar o al
-- revertir, sin que nadie tenga que acordarse de soltarlo. Un cerrojo de
-- sesión olvidado por una excepción dejaría la unidad congelada hasta que
-- alguien matara la conexión.
--
-- El costo: dos apartados de la MISMA unidad se serializan. Es justo lo que
-- se quiere —no puede haber dos a la vez— y no toca a unidades distintas.
-- Los tours no lo necesitan: `tour_hold_create` ya toma `for update` sobre la
-- salida, que serializa por sí mismo.

begin;

create or replace function rental_hold_create(
  p_unit_id         uuid,
  p_dates           daterange,
  p_booking_item_id uuid default null,
  p_ttl             interval default interval '15 minutes'
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  if isempty(p_dates) then
    raise exception 'El rango de fechas está vacío' using errcode = 'AM002';
  end if;

  -- Una unidad a la vez. Lo que sigue —la comprobación de la restricción de
  -- exclusión— deja de competir consigo mismo y pasa a encontrar filas ya
  -- confirmadas, que rechaza limpio en lugar de esperar.
  perform pg_advisory_xact_lock(hashtextextended(p_unit_id::text, 0));

  insert into rental_blocks (unit_id, dates, reason, booking_item_id, expires_at)
  values (p_unit_id, p_dates, 'hold', p_booking_item_id, now() + p_ttl)
  returning id into v_id;

  return v_id;
exception
  when exclusion_violation then
    raise exception 'Las fechas % ya están ocupadas en esa unidad', p_dates
      using errcode = 'AM002';
end;
$$;

commit;
