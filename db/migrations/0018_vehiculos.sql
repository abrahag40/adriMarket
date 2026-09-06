-- 0018_vehiculos.sql
--
-- El tercer inventario: renta de scooters, autos y camionetas.
--
-- La migración anterior hizo el trabajo pesado —renombrar el mecanismo de
-- `stay_*` a `rental_*`— justo para que esta fuera corta. Un vehículo se
-- ocupa igual que una casa: `rental_units` para la unidad, `rental_blocks`
-- con su restricción de exclusión sobre rangos para que no se rente dos
-- veces, `rental_rate_plans` y `rental_rates` para el precio por día.
--
-- **Cero tablas nuevas.** Si esta migración creara `vehicle_units` y
-- `vehicle_blocks`, habría que duplicar la restricción anti-sobreventa, las
-- funciones de cotización y el panel — y el día que una se corrigiera, la
-- otra se quedaría atrás sin que nadie se enterara.
--
-- Lo único que hace falta:
--
--   1. Tres columnas de ficha técnica que una casa no tiene y un auto sí.
--      Nulas para estancias, igual que `bedrooms` es nula para un scooter.
--   2. Que reprogramar deje de ser exclusivo de estancias.
--
-- **Lo que NO cambia, y es a propósito**: `rental_rates.nightly_cents` y
-- `min_nights` conservan su nombre. Para renta, una noche y un día de uso son
-- la misma unidad de cuenta, así que la imprecisión es de vocabulario y no de
-- concepto — a diferencia de `stay_units` con scooters dentro, que sí prometía
-- otra cosa. Renombrarlas toca 168 sitios en 25 archivos y no desbloquea
-- nada; queda anotado como deuda. Lo que **sí** se corrige es la etiqueta que
-- ve el huésped, que no puede decirle "3 noches" por un scooter.

begin;

-- 1. Ficha técnica del vehículo ---------------------------------------------
--
-- Van en `rental_units` y no en una tabla aparte por la misma razón que todo
-- lo demás: son atributos de la unidad que se renta, igual que `bedrooms`.
-- Nulas donde no aplican.

alter table rental_units add column if not exists transmission text;
alter table rental_units add column if not exists luggage      integer;
alter table rental_units add column if not exists doors        integer;

alter table rental_units
  add constraint rental_units_transmission_valid
  check (transmission is null or transmission in ('manual', 'automatica'));

alter table rental_units
  add constraint rental_units_luggage_check check (luggage is null or luggage >= 0);

alter table rental_units
  add constraint rental_units_doors_check check (doors is null or doors between 1 and 8);

comment on column rental_units.transmission is
  'Solo vehículos: manual o automatica. Nula en estancias.';
comment on column rental_units.luggage is
  'Solo vehículos: maletas que caben. Nula en estancias.';
comment on column rental_units.doors is
  'Solo vehículos: número de puertas. Nula en estancias.';

comment on table rental_units is
  'Unidades que se ocupan por rango de fechas: casas y vehículos. El tipo lo '
  'da products.kind; aquí conviven porque el mecanismo de ocupación es el mismo.';

-- 2. Reprogramar deja de ser exclusivo de estancias --------------------------
--
-- `booking_reschedule_rental` buscaba el renglón de la reserva con
-- `kind = 'stay'`. Un vehículo se reprograma exactamente igual —se libera el
-- rango viejo y se aparta el nuevo, con la misma restricción de exclusión
-- decidiendo si se puede— así que la condición pasa a preguntar por el
-- mecanismo y no por el tipo.
--
-- Es el mismo error que se corrigió en el código con `isRental()`: preguntar
-- "¿esto es una casa?" cuando lo que importa es "¿esto se ocupa por fechas?".

CREATE OR REPLACE FUNCTION public.booking_reschedule_rental(p_booking_id uuid, p_range daterange, p_total_cents bigint, p_quote jsonb, p_actor_id text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
AS $function$
declare
  v_booking  bookings;
  v_item     booking_items;
  v_old      daterange;
  v_diff     bigint;
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
   where booking_id = p_booking_id and kind in ('stay', 'vehicle')
   limit 1 for update;

  if not found then
    raise exception 'Esta reserva no se ocupa por fechas' using errcode = 'AM003';
  end if;

  v_old := v_item.rental_range;

  update rental_blocks set released_at = now()
   where booking_item_id = v_item.id and released_at is null;

  update booking_items
     set rental_range = p_range, subtotal_cents = p_total_cents, quote = p_quote
   where id = v_item.id;

  -- Si estas noches ya están vendidas, aquí truena con AM002 y no se pierde nada.
  perform rental_hold_create(v_item.rental_unit_id, p_range, v_item.id, interval '100 years');

  -- Una reserva confirmada mantiene su apartado firme, no vuelve a "hold".
  if v_booking.status = 'confirmed' then
    update rental_blocks set reason = 'booking', expires_at = null
     where booking_item_id = v_item.id and released_at is null;
  end if;

  v_diff := p_total_cents - v_booking.total_cents;

  -- El anticipo ya cobrado no se recalcula: se conserva y la diferencia se
  -- suma o se resta del saldo que se paga en destino. Volver a cobrar por una
  -- tarifa distinta obligaría a un segundo cargo, y el huésped ya pagó.
  update bookings
     set total_cents = p_total_cents,
         quote = p_quote
   where id = p_booking_id;

  update payments
     set amount_cents = greatest(0, amount_cents + v_diff)
   where booking_id = p_booking_id and purpose = 'balance' and status = 'pending';

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id, 'booking.rescheduled',
          jsonb_build_object('from', v_old::text, 'to', p_range::text,
                             'difference_cents', v_diff),
          'staff', p_actor_id);

  return v_diff;
end;
$function$;

commit;
