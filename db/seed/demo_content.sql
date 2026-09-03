-- ---------------------------------------------------------------------------
-- Contenido de relleno para la ficha de producto
--
-- La ficha reproduce la arquitectura de la referencia visual: descripción,
-- qué incluye, qué no incluye, lo mejor e itinerario. Un producto cargado
-- solo con nombre, resumen y un párrafo —como estaban los tres tours de
-- producción— deja cuatro de esos cinco bloques sin renderizar, y el diseño
-- se juzga vacío cuando lo que falta es el dato.
--
-- Esto lo rellena con la **forma** de la referencia (cuatro puntos de "lo
-- mejor", cuatro de "qué incluye", tres de "qué no incluye", cuatro pasos de
-- itinerario) y texto coherente con el catálogo del Caribe. No se copia la
-- copia de la plantilla: un tour de buceo en Cozumel con "Air fares" y
-- "Day 1 · Arrive in Zürich" no se lee como relleno, se lee como un defecto.
--
-- Dos reglas que lo hacen seguro de correr contra cualquier ambiente,
-- producción incluida:
--
--   1. **Solo llena lo vacío.** Un arreglo con algo dentro no se toca, y la
--      descripción —el único campo con copia escrita por el cliente— no se
--      toca nunca.
--   2. **Es idempotente.** Correrlo dos veces no duplica pasos ni reescribe
--      lo que ya quedó.
--
-- Se elige por tipo de producto, no por slug: los slugs de producción no son
-- los del seed de desarrollo, y el cliente seguirá agregando productos.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/demo_content.sql
--
-- Para deshacerlo, el camino es el panel (`/admin/catalogo/[id]`), que es
-- donde el cliente va a escribir la copia de verdad.
-- ---------------------------------------------------------------------------

begin;

-- 1. Lo mejor, qué incluye y qué no ------------------------------------------

with contenido (kind, locale, highlights, included, excluded) as (
  values
    ('tour', 'es',
     '["Grupos pequeños, nunca de autobús", "Guía certificado en cada salida", "Equipo incluido, sin renta aparte", "Recolección en tu hotel"]'::jsonb,
     '["Transporte redondo desde tu hotel", "Equipo completo y chaleco salvavidas", "Guía certificado", "Fruta y agua durante el recorrido"]'::jsonb,
     '["Propinas", "Comida", "Toalla"]'::jsonb),
    ('tour', 'en',
     '["Small groups, never a bus load", "A certified guide on every departure", "Gear included, nothing to rent", "Pickup at your hotel"]'::jsonb,
     '["Round-trip transport from your hotel", "Full gear and life vest", "Certified guide", "Fruit and water along the way"]'::jsonb,
     '["Gratuities", "Lunch", "Towel"]'::jsonb),
    ('stay', 'es',
     '["A pocos minutos de la playa", "Alberca privada", "Cocina equipada", "Aire acondicionado en las recámaras"]'::jsonb,
     '["Ropa de cama y toallas", "Wi-Fi de fibra", "Limpieza al llegar y al salir", "Estacionamiento en la casa"]'::jsonb,
     '["Limpieza intermedia", "Traslado del aeropuerto", "Servicio de chef"]'::jsonb),
    ('stay', 'en',
     '["Minutes from the beach", "Private pool", "Fully equipped kitchen", "Air conditioning in every bedroom"]'::jsonb,
     '["Linens and towels", "Fiber Wi-Fi", "Cleaning on arrival and departure", "On-site parking"]'::jsonb,
     '["Mid-stay cleaning", "Airport transfer", "Chef service"]'::jsonb)
)
update product_translations pt
   set highlights = case when pt.highlights = '[]'::jsonb then c.highlights else pt.highlights end,
       included   = case when pt.included   = '[]'::jsonb then c.included   else pt.included   end,
       excluded   = case when pt.excluded   = '[]'::jsonb then c.excluded   else pt.excluded   end
  from products p, contenido c
 where pt.product_id = p.id
   and p.kind::text = c.kind
   and pt.locale = c.locale
   and (pt.highlights = '[]'::jsonb
     or pt.included   = '[]'::jsonb
     or pt.excluded   = '[]'::jsonb);

-- 2. Itinerario --------------------------------------------------------------
--
-- Los pasos cuelgan de la opción de tour, no del producto. Solo se llenan las
-- opciones que no tienen ninguno: una opción con itinerario cargado a mano se
-- queda como está.

with pasos (position, time_label, title_es, title_en, description_es, description_en) as (
  values
    (0, '8:00',  'Recolección en tu hotel', 'Pickup at your hotel',
        'Pasamos por ti en la entrada del hotel. El grupo se completa en el camino, sin esperas largas.',
        'We pick you up at the hotel entrance. The group fills up along the way, with no long waits.'),
    (1, '9:30',  'Primera parada y plática de seguridad', 'First stop and safety briefing',
        'Llegamos antes que los grupos grandes. El guía reparte el equipo y explica el recorrido completo.',
        'We arrive ahead of the big groups. The guide hands out the gear and walks through the whole route.'),
    (2, '12:00', 'Fruta, agua y segunda parada', 'Fruit, water and second stop',
        'Media hora de descanso a la sombra antes de la segunda parada, la más tranquila del día.',
        'Half an hour resting in the shade before the second stop, the calmest one of the day.'),
    (3, '14:00', 'Regreso al hotel', 'Back to your hotel',
        'Volvemos por la misma ruta. Te dejamos donde te recogimos, a menos que prefieras otro punto.',
        'We head back the same way and drop you where we picked you up, unless you would rather stop elsewhere.')
)
insert into tour_itinerary_steps
  (tour_option_id, position, time_label, title_es, title_en, description_es, description_en)
select o.id, s.position, s.time_label, s.title_es, s.title_en, s.description_es, s.description_en
  from tour_options o
 cross join pasos s
 where o.active
   and not exists (
     select 1 from tour_itinerary_steps x where x.tour_option_id = o.id
   );

commit;
