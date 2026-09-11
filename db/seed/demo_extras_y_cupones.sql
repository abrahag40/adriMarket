-- demo_extras_y_cupones.sql — contenido de demostración para presentar la
-- plataforma mientras no llega la información real del cliente.
--
-- Qué llena, y por qué esto y no más:
--
--   1. EXTRAS DE TOUR. La función existe desde la migración 0023 pero
--      producción no tiene ni uno, así que el paso no se puede enseñar: todo
--      tour va derecho al checkout. Sin datos, la función es invisible.
--   2. SALIDAS de los dos tours que nunca tuvieron ninguna. Salen en el
--      catálogo sin botón de reserva, y en una demo eso se lee como un
--      defecto.
--   3. CUPONES. El checkout tiene el campo desde el Sprint 8 y producción no
--      tiene ninguno: cualquier código que se escriba responde "ese código no
--      existe". Tres bastan para enseñar las tres conductas que hay escritas.
--
-- Lo que NO llena: el catálogo. Producción ya tiene 41 productos publicados
-- con sus fotos, sus tarifas hasta 2028 y 2,525 salidas abiertas.
--
-- **Es idempotente**: se puede correr dos veces sin duplicar nada. Los extras
-- y las salidas se protegen con `on conflict do nothing`; los cupones con un
-- `where not exists`, porque su índice único va sobre `upper(code)` y una
-- expresión no se puede inferir en un `on conflict`.
--
-- Se aplica con:  npm run prod:sql -- db/seed/demo_extras_y_cupones.sql
--
-- Para retirarlo el día que llegue la información real, ver el bloque final.

begin;

-- ---------------------------------------------------------------------------
-- 1. Extras de tour
-- ---------------------------------------------------------------------------

-- El precio de un extra es POR LUGAR OCUPADO (decisión 0019), así que se
-- eligió entre el 15% y el 35% del precio de adulto del tour: por debajo no se
-- nota en el total, y por encima compite con el propio tour en vez de
-- acompañarlo.
--
-- Cuatro tours se quedan SIN extras a propósito —los más cortos y baratos,
-- donde un complemento no es natural— para que el otro camino también se pueda
-- enseñar: un tour sin extras manda derecho al checkout, sin un paso vacío de
-- por medio. Son `sabores-de-la-quinta-avenida`,
-- `vuelta-a-la-isla-en-carrito-de-golf`, `bioluminiscencia-en-punta-coco` y
-- `snorkel-parque-nacional-puerto-morelos`.

create temporary table demo_extra (
  slug        text    not null,
  code        text    not null,
  name_es     text    not null,
  name_en     text    not null,
  note_es     text,
  note_en     text,
  price_cents bigint  not null,
  position    integer not null
) on commit drop;

insert into demo_extra values
  -- Snorkel ------------------------------------------------------------------
  ('musa-snorkel-arrecife-manchones', 'fotos', 'Fotos submarinas', 'Underwater photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 35000, 1),
  ('musa-snorkel-arrecife-manchones', 'equipo-premium', 'Equipo premium', 'Premium gear',
   'Visor de silicón y aletas de tu talla', 'Silicone mask and fins in your size', 25000, 2),

  ('snorkel-el-cielo-colombia-y-palancar', 'fotos', 'Fotos submarinas', 'Underwater photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 35000, 1),
  ('snorkel-el-cielo-colombia-y-palancar', 'barra', 'Barra libre a bordo', 'Open bar aboard',
   'Cerveza, refrescos y agua', 'Beer, soft drinks and water', 29000, 2),

  ('snorkel-el-farito-y-manchones', 'fotos', 'Fotos submarinas', 'Underwater photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 33000, 1),
  ('snorkel-el-farito-y-manchones', 'equipo-premium', 'Equipo premium', 'Premium gear',
   'Visor de silicón y aletas de tu talla', 'Silicone mask and fins in your size', 24000, 2),

  ('snorkel-en-los-cenotes-de-tulum', 'fotos', 'Fotos submarinas', 'Underwater photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 32000, 1),
  ('snorkel-en-los-cenotes-de-tulum', 'traje', 'Traje de neopreno', 'Wetsuit',
   'El agua del cenote está a 24 °C', 'Cenote water sits at 24 °C', 24000, 2),

  -- Buceo --------------------------------------------------------------------
  ('buceo-palancar-y-colombia', 'nitrox', 'Tanque de nitrox', 'Nitrox tank',
   'Más fondo sin acortar el tiempo', 'More depth without cutting your time', 48000, 1),
  ('buceo-palancar-y-colombia', 'fotos', 'Fotos submarinas', 'Underwater photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 39000, 2),

  ('buceo-en-el-arrecife-de-cozumel', 'nitrox', 'Tanque de nitrox', 'Nitrox tank',
   'Más fondo sin acortar el tiempo', 'More depth without cutting your time', 48000, 1),
  ('buceo-en-el-arrecife-de-cozumel', 'fotos', 'Fotos submarinas', 'Underwater photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 39000, 2),

  ('bautismo-de-buceo-playa', 'video', 'Video de tu primer buceo', 'Video of your first dive',
   'Editado y listo para compartir', 'Edited and ready to share', 55000, 1),
  ('bautismo-de-buceo-playa', 'fotos', 'Fotos submarinas', 'Underwater photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 39000, 2),

  -- Cenotes y aventura -------------------------------------------------------
  ('ruta-de-los-cenotes-tirolesas-y-caverna', 'tirolesa', 'Tirolesa sobre el cenote',
   'Zip line over the cenote', 'Incluye arnés y casco', 'Harness and helmet included', 45000, 1),
  ('ruta-de-los-cenotes-tirolesas-y-caverna', 'rappel', 'Rappel a la caverna',
   'Rappel into the cavern', 'Doce metros, con instructor', 'Twelve metres, with an instructor', 40000, 2),
  ('ruta-de-los-cenotes-tirolesas-y-caverna', 'comida', 'Buffet de tacos', 'Taco buffet',
   'Opción vegetariana disponible', 'Vegetarian option available', 28000, 3),

  ('cenotes-cristalino-azul-y-eden', 'fotos', 'Fotos del recorrido', 'Tour photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 34000, 1),
  ('cenotes-cristalino-azul-y-eden', 'comida', 'Comida yucateca', 'Yucatecan lunch',
   'Cochinita, sopa de lima y agua de chaya', 'Cochinita, lime soup and chaya water', 28000, 2),

  ('cenote-azul-los-rapidos-y-cocalitos', 'kayak', 'Kayak media hora', 'Half-hour kayak',
   null, null, 30000, 1),
  ('cenote-azul-los-rapidos-y-cocalitos', 'comida', 'Comida a la orilla', 'Lakeside lunch',
   'Pescado fresco o opción vegetariana', 'Fresh fish or vegetarian option', 28000, 2),

  -- Navegación ---------------------------------------------------------------
  ('catamaran-al-arrecife-de-playa-del-carmen', 'barra-premium', 'Barra libre premium',
   'Premium open bar', 'Destilados de marca y coctelería', 'Branded spirits and cocktails', 39000, 1),
  ('catamaran-al-arrecife-de-playa-del-carmen', 'kayak', 'Kayak media hora', 'Half-hour kayak',
   null, null, 30000, 2),

  ('velero-por-la-laguna-de-los-siete-colores', 'barra-premium', 'Barra libre premium',
   'Premium open bar', 'Destilados de marca y coctelería', 'Branded spirits and cocktails', 39000, 1),
  ('velero-por-la-laguna-de-los-siete-colores', 'paddle', 'Tabla de paddle', 'Paddle board',
   'Media hora en la laguna', 'Half an hour on the lagoon', 28000, 2),

  ('isla-contoy-e-isla-mujeres', 'barra-premium', 'Barra libre premium', 'Premium open bar',
   'Destilados de marca y coctelería', 'Branded spirits and cocktails', 42000, 1),
  ('isla-contoy-e-isla-mujeres', 'fotos', 'Fotos del recorrido', 'Tour photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 39000, 2),

  ('paseo-de-las-tres-islas-holbox', 'fotos', 'Fotos del recorrido', 'Tour photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 34000, 1),
  ('paseo-de-las-tres-islas-holbox', 'comida', 'Comida en Isla Pájaros', 'Lunch at Isla Pájaros',
   'Pescado fresco o opción vegetariana', 'Fresh fish or vegetarian option', 29000, 2),

  -- Cultural -----------------------------------------------------------------
  ('chichen-itza-cenote-y-valladolid', 'guia-privado', 'Guía privado', 'Private guide',
   'Solo para tu grupo, en español o inglés', 'Just your group, Spanish or English', 55000, 1),
  ('chichen-itza-cenote-y-valladolid', 'comida', 'Buffet regional', 'Regional buffet',
   'En Valladolid, con opción vegetariana', 'In Valladolid, vegetarian option', 32000, 2),

  ('ruinas-de-tulum-al-amanecer', 'guia-privado', 'Guía privado', 'Private guide',
   'Solo para tu grupo, en español o inglés', 'Just your group, Spanish or English', 49000, 1),
  ('ruinas-de-tulum-al-amanecer', 'desayuno', 'Desayuno frente al mar', 'Breakfast by the sea',
   'Después de la visita', 'After the visit', 21000, 2),

  ('coba-en-bicicleta-y-dos-cenotes', 'guia-privado', 'Guía privado', 'Private guide',
   'Solo para tu grupo, en español o inglés', 'Just your group, Spanish or English', 49000, 1),
  ('coba-en-bicicleta-y-dos-cenotes', 'comida', 'Comida yucateca', 'Yucatecan lunch',
   'Cochinita, sopa de lima y agua de chaya', 'Cochinita, lime soup and chaya water', 32000, 2),

  ('sian-kaan-canal-maya-de-muyil', 'fotos', 'Fotos del recorrido', 'Tour photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 39000, 1),
  ('sian-kaan-canal-maya-de-muyil', 'comida', 'Comida en la reserva', 'Lunch in the reserve',
   'Opción vegetariana disponible', 'Vegetarian option available', 35000, 2),

  ('cozumel-en-jeep-punta-sur-y-chen-rio', 'comida', 'Comida en Chen Río', 'Lunch at Chen Río',
   'Pescado fresco o opción vegetariana', 'Fresh fish or vegetarian option', 32000, 1),
  ('cozumel-en-jeep-punta-sur-y-chen-rio', 'snorkel', 'Equipo de snorkel', 'Snorkel gear',
   'Para la parada en el arrecife', 'For the reef stop', 28000, 2),

  -- Amanecer y remo ----------------------------------------------------------
  ('kayak-al-amanecer-canal-de-los-piratas', 'desayuno', 'Desayuno al volver', 'Breakfast on return',
   'Café de olla y pan dulce', 'Spiced coffee and pastries', 19000, 1),
  ('kayak-al-amanecer-canal-de-los-piratas', 'fotos', 'Fotos del amanecer', 'Sunrise photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 29000, 2),

  ('amanecer-en-paddle-sobre-el-arrecife', 'desayuno', 'Desayuno al volver', 'Breakfast on return',
   'Café de olla y pan dulce', 'Spiced coffee and pastries', 19000, 1),
  ('amanecer-en-paddle-sobre-el-arrecife', 'fotos', 'Fotos del amanecer', 'Sunrise photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 29000, 2),

  ('kayak-en-el-manglar-de-holbox', 'fotos', 'Fotos del recorrido', 'Tour photos',
   'Galería digital el mismo día', 'Digital gallery the same day', 29000, 1),
  ('kayak-en-el-manglar-de-holbox', 'desayuno', 'Desayuno al volver', 'Breakfast on return',
   'Café de olla y pan dulce', 'Spiced coffee and pastries', 21000, 2),

  -- Pesca --------------------------------------------------------------------
  ('pesca-de-altura-isla-mujeres', 'equipo-pesado', 'Equipo para pez grande', 'Heavy tackle',
   'Caña y carrete para marlín y vela', 'Rod and reel for marlin and sailfish', 65000, 1),
  ('pesca-de-altura-isla-mujeres', 'limpieza', 'Limpieza y empacado de tu pesca',
   'Cleaning and packing your catch', 'Listo para llevar al hotel', 'Ready to take to your hotel', 35000, 2);

insert into tour_extras (product_id, code, name_es, name_en, note_es, note_en, price_cents, position)
select p.id, e.code, e.name_es, e.name_en, e.note_es, e.note_en, e.price_cents, e.position
  from demo_extra e
  join products p on p.slug = e.slug and p.kind = 'tour'
on conflict (product_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Salidas para los dos tours que nunca tuvieron ninguna
-- ---------------------------------------------------------------------------

-- No es que se hayan cancelado ni vendido: `tour_departures` no tiene una sola
-- fila para estas dos opciones desde que existen. Salen en el catálogo sin
-- botón de reserva, que en una demo se lee como un defecto del sitio.
--
-- Mismo patrón que `catalogo_caribe.sql`: 120 días hacia adelante, en la zona
-- del destino y no la del servidor, con el cupo propio de la opción.

create temporary table demo_salida (
  option_code text not null,
  start_time  time not null
) on commit drop;

insert into demo_salida values
  ('cozumel-2tanks', '08:30'),   -- el buceo sale temprano
  ('catamaran-pm',   '13:00');   -- el catamarán, después de comer

insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
select o.id,
       (d::date + s.start_time) at time zone coalesce(l.timezone, 'America/Cancun'),
       (d::date + s.start_time + make_interval(mins => coalesce(o.duration_minutes, 240)))
         at time zone coalesce(l.timezone, 'America/Cancun'),
       o.default_capacity
  from demo_salida s
  join tour_options o on o.code = s.option_code and o.active
  join products p on p.id = o.product_id and p.status = 'published'
  join locations l on l.id = p.location_id
 cross join lateral generate_series(current_date + 1, current_date + 120, interval '1 day') d
on conflict (tour_option_id, starts_at) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Cupones
-- ---------------------------------------------------------------------------

-- Tres, y cada uno enseña una conducta distinta que ya está escrita:
--
--   BIENVENIDA10  · el descuento de toda la vida, antes de impuestos.
--   CARIBE15      · pide un mínimo de compra. Con extras marcados el mínimo se
--                   alcanza antes, porque los extras SÍ cuentan para él aunque
--                   no reciban el descuento (decisión 0019). Es la asimetría
--                   que se puede enseñar en pantalla.
--   TODOINCLUIDO  · `applies_to_extras`, la reversa de esa decisión: el mismo
--                   descuento alcanzando también los extras, y la línea del
--                   desglose deja de decir "solo el tour".
--
-- Vigentes un año, sin límite de canjes: una demo no debería agotarlos.
insert into coupons (code, kind, value, min_total_cents, valid_from, valid_to,
                     applies_to, applies_to_extras, active)
select v.code, v.kind::coupon_kind, v.value, v.min_total_cents,
       now(), now() + interval '1 year', v.applies_to::jsonb, v.applies_to_extras, true
  from (values
    ('BIENVENIDA10', 'percent', 10, 0,      '{}',              false),
    ('CARIBE15',     'percent', 15, 300000, '{"kind":"tour"}', false),
    ('TODOINCLUIDO', 'percent', 10, 0,      '{"kind":"tour"}', true)
  ) as v(code, kind, value, min_total_cents, applies_to, applies_to_extras)
 where not exists (select 1 from coupons c where upper(c.code) = v.code);

commit;

-- ---------------------------------------------------------------------------
-- Guion para la presentación
-- ---------------------------------------------------------------------------
--
-- Tres momentos que estos datos dejan enseñar en vivo, en este orden:
--
-- 1. EL UPSELL. Tour "Ruta de los cenotes, tirolesas y caverna" (Puerto
--    Morelos). Al dar Reservar aparece el paso con tirolesa, rappel y buffet.
--    Marcar una casilla y el total sube SOLO, sin recargar — y lo calculó el
--    servidor, no el navegador. Apagar JavaScript y repetirlo da el mismo
--    número, con un botón "Actualizar total" en lugar del cambio automático.
--
-- 2. POR LUGAR OCUPADO, NO POR PERSONA. En ese mismo paso, poner 2 adultos y
--    1 infante: el renglón dice "× 2", no "× 3". Un bebé en brazos no sube a
--    la tirolesa, y el sistema ya lo sabía porque es el mismo número que
--    decide el cupo.
--
-- 3. EL CUPÓN Y SU ALCANCE — el caso más interesante. Tour "MUSA, snorkel en
--    el arrecife de Manchones" (Cancún), 2 adultos = $2,300:
--
--      · con CARIBE15 y sin extras → "Tu compra no alcanza el mínimo que pide
--        ese cupón". $2,300 contra los $3,000 que pide.
--      · agregar "Fotos submarinas" ($350 × 2) → $3,000, y AHORA sí aplica.
--        La línea dice "Cupón CARIBE15 · solo el tour": el extra ayudó a
--        alcanzar el mínimo pero no se descontó a sí mismo.
--      · cambiar a TODOINCLUIDO → el descuento alcanza también los extras y
--        la aclaración desaparece, porque ya no hay nada que aclarar.
--
--    Es la decisión 0019 entera, en pantalla, sin explicar nada.
--
-- Y el camino corto, para que no parezca que todo tour obliga a un paso extra:
-- "Sabores de la Quinta Avenida" no tiene complementos y Reservar lleva
-- directo a "Confirma tu reserva".

-- ---------------------------------------------------------------------------
-- Cómo retirarlo cuando llegue la información real
-- ---------------------------------------------------------------------------
--
-- Los extras y los cupones se borran por su código; las salidas NO se borran a
-- mano —si alguna se vendió, `booking_items` la referencia—: se cierran, que es
-- lo que este dominio entiende por retirar inventario.
--
--   delete from tour_extras where code in (
--     'fotos','equipo-premium','barra','traje','nitrox','video','tirolesa',
--     'rappel','comida','kayak','barra-premium','paddle','guia-privado',
--     'desayuno','snorkel','equipo-pesado','limpieza');
--   delete from coupons where upper(code) in ('BIENVENIDA10','CARIBE15','TODOINCLUIDO');
--   update tour_departures set status = 'closed'
--    where tour_option_id in (select id from tour_options where code in ('cozumel-2tanks','catamaran-pm'))
--      and starts_at > now();
