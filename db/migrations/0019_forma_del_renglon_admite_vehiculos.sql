-- 0019_forma_del_renglon_admite_vehiculos.sql
--
-- **Ninguna reserva de vehículo podía crearse.**
--
-- `booking_items_shape` enumeraba los dos tipos que existían cuando se
-- escribió: o el renglón es de estancia —unidad, rango y huéspedes, sin
-- salida ni asientos— o es de tour —salida y asientos, sin unidad ni rango—.
-- Al agregar `vehicle` a `product_kind`, un renglón de vehículo no encaja en
-- ninguna de las dos ramas y la base lo rechaza.
--
-- Lo que hace peligroso este defecto es **dónde no aparece**: la ficha del
-- vehículo se pinta, el calendario responde, la cotización sale con su
-- desglose y el checkout renderiza sus campos. Todo eso funciona porque nada
-- de eso escribe en `booking_items`. El primer huésped que pulsara "Reservar"
-- se habría llevado un error 500 después de capturar sus datos.
--
-- Lo encontró la garantía 24 —"un vehículo se agota con la misma restricción
-- que una casa"— al intentar apartar de verdad. Ninguna prueba de pantalla lo
-- habría visto.
--
-- La rama nueva no es una copia: se **generaliza** la de estancias, que ya
-- describía "se ocupa por rango de fechas" sin decirlo. Ahora lo dice.

begin;

alter table booking_items drop constraint booking_items_shape;

alter table booking_items add constraint booking_items_shape check (
  -- Renta por rango de fechas: casas y vehículos. Una unidad concreta, un
  -- rango, y cuánta gente va. Sin salida ni asientos, que son de los tours.
  (
    kind in ('stay', 'vehicle')
    and rental_unit_id is not null
    and rental_range   is not null
    and guests         is not null
    and tour_departure_id is null
    and seats             is null
  )
  or
  -- Lugares en una salida con hora.
  (
    kind = 'tour'
    and tour_departure_id is not null
    and seats             is not null
    and rental_unit_id is null
    and rental_range   is null
  )
);

comment on constraint booking_items_shape on booking_items is
  'Un renglón es de renta por fechas (casa o vehículo) o de lugares en una '
  'salida (tour). Las columnas del otro caso van nulas: media fila llena es '
  'una reserva que no se sabe cobrar.';

commit;
