-- ---------------------------------------------------------------------------
-- Estancias del Caribe mexicano · ocho casas, una por destino
--
-- El catálogo de tours (`catalogo_caribe.sql`) dejó dicho que **no creaba
-- estancias**: "el hueco era de tours; las casas se cargan por el panel". La
-- consecuencia se vio en producción: cero estancias publicadas, así que
-- filtrar por "Estancias" devolvía `0 resultados` en un sitio que anuncia dos
-- inventarios. Un buscador que ofrece una opción vacía no se lee como
-- "todavía no hay", se lee como roto.
--
-- Este guion carga ocho casas, una en cada destino que ya existe, con la
-- misma disciplina que el de tours:
--
--   1. **No toca nada existente.** Solo inserta, siempre con la llave natural
--      por delante (`on conflict do nothing` / `where not exists`). Correrlo
--      dos veces no duplica ni una fila.
--   2. **No toca `tax_rates`.** La base gravable sigue siendo decisión abierta
--      del cliente. Consecuencia visible: las casas en destinos sin tasa
--      cargada exhiben el precio sin impuesto.
--   3. **No inventa fotos del negocio.** Son de relleno (picsum con semilla
--      estable por slug) y se van en cuanto el cliente suba las suyas.
--
-- Sobre los datos: las capacidades, cuotas de limpieza y tarifas están en el
-- rango de mercado de 2026 para renta vacacional en Quintana Roo, en centavos
-- enteros. Las horas de entrada y salida son las que usa la zona (15:00 y
-- 11:00). Cada casa tiene **una tarifa base y un recargo de fin de semana**,
-- que es como se cobra de verdad: viernes y sábado valen más.
--
-- Cómo correrlo:
--
--   SEED_FILE=db/seed/estancias_caribe.sql ./scripts/demo-content.sh
--   npm run prod:sql -- db/seed/estancias_caribe.sql
-- ---------------------------------------------------------------------------

begin;

-- 1. Las casas ---------------------------------------------------------------

create temporary table cat_stay (
  slug              text primary key,
  location_slug     text not null,
  position          integer not null,
  code              text not null,
  max_guests        integer not null,
  base_guests       integer not null,
  bedrooms          integer not null,
  beds              integer not null,
  bathrooms         numeric not null,
  extra_guest_cents bigint not null,
  cleaning_cents    bigint not null,
  min_nights        integer not null,
  base_cents        bigint not null,   -- por noche, entre semana
  weekend_cents     bigint not null    -- viernes y sábado
) on commit drop;

insert into cat_stay values
  ('casa-arrecife-puerto-morelos', 'puerto-morelos',   1, 'CASA-PM', 6, 4, 3, 4, 2,   45000,  90000, 2,  380000,  460000),
  ('villa-cenote-tulum',           'tulum',            2, 'VILLA-TU', 8, 6, 4, 5, 3.5, 60000, 140000, 3,  720000,  880000),
  ('depa-quinta-avenida',          'playa-del-carmen', 3, 'DEPA-PC', 4, 2, 2, 2, 2,   35000,  70000, 2,  310000,  380000),
  ('casa-laguna-bacalar',          'bacalar',          4, 'CASA-BA', 6, 4, 3, 3, 2,   40000,  85000, 2,  420000,  510000),
  ('bungalow-holbox',              'holbox',           5, 'BUNG-HO', 4, 2, 2, 2, 1,   38000,  65000, 2,  340000,  420000),
  ('casa-del-faro-isla-mujeres',   'isla-mujeres',     6, 'CASA-IM', 5, 4, 2, 3, 2,   42000,  80000, 2,  460000,  560000),
  ('penthouse-zona-hotelera',      'cancun',           7, 'PENT-CU', 6, 4, 3, 4, 3,   55000, 120000, 2,  640000,  790000),
  ('casa-palapa-cozumel',          'cozumel',          8, 'CASA-CZ', 8, 6, 4, 5, 3,   50000, 110000, 3,  580000,  700000);

-- 2. El texto, en los dos idiomas -------------------------------------------

create temporary table cat_text (
  slug        text not null,
  locale      text not null,
  name        text not null,
  summary     text not null,
  description text not null,
  highlights  jsonb not null,
  included    jsonb not null,
  excluded    jsonb not null,
  primary key (slug, locale)
) on commit drop;

insert into cat_text values
  ('casa-arrecife-puerto-morelos', 'es', 'Casa Arrecife',
   'Casa de tres recámaras a dos cuadras del muelle de Puerto Morelos.',
   'Un pueblo de pescadores que todavía se comporta como tal, con el arrecife a quinientos metros de la orilla. La casa tiene cocina completa, patio con asador y hamacas bajo la palapa. El mar de aquí amanece plano casi todo el año: es el mejor sitio de la costa para entrar a esnorquelear sin lancha.',
   '["Arrecife a 500 m de la orilla", "Patio con asador y palapa", "Dos cuadras del muelle y la plaza"]',
   '["Cocina completa", "Aire acondicionado en recámaras", "Wi-Fi", "Ropa de cama y toallas", "Estacionamiento techado"]',
   '["Limpieza intermedia", "Alimentos", "Renta de equipo de esnórquel"]'),
  ('casa-arrecife-puerto-morelos', 'en', 'Reef House',
   'Three-bedroom house two blocks from the Puerto Morelos pier.',
   'A fishing town that still behaves like one, with the reef five hundred metres offshore. The house has a full kitchen, a grill in the yard and hammocks under the palapa. The sea here is flat most mornings of the year: the best spot on the coast to snorkel straight off the beach.',
   '["Reef 500 m offshore", "Yard with grill and palapa", "Two blocks from the pier and the square"]',
   '["Full kitchen", "Air conditioning in bedrooms", "Wi-Fi", "Linen and towels", "Covered parking"]',
   '["Mid-stay cleaning", "Food", "Snorkel gear rental"]'),

  ('villa-cenote-tulum', 'es', 'Villa Cenote',
   'Villa de cuatro recámaras con cenote privado, en la carretera de las ruinas.',
   'Cuatro recámaras alrededor de un cenote abierto, en un terreno arbolado a diez minutos de la zona arqueológica y quince de la playa. Cocina de obra, terraza techada y alberca de agua dulce. El cenote es de uso exclusivo de la casa y tiene escalera de acceso; el agua se mantiene entre 24 y 26 grados todo el año.',
   '["Cenote privado con escalera de acceso", "Alberca de agua dulce", "Diez minutos de la zona arqueológica"]',
   '["Cocina completa", "Aire acondicionado", "Wi-Fi de fibra", "Ropa de cama y toallas", "Estacionamiento para dos autos"]',
   '["Chef privado", "Alimentos", "Transporte desde el aeropuerto"]'),
  ('villa-cenote-tulum', 'en', 'Cenote Villa',
   'Four-bedroom villa with a private cenote, on the road to the ruins.',
   'Four bedrooms around an open cenote, on a wooded lot ten minutes from the archaeological site and fifteen from the beach. Masonry kitchen, covered terrace and a freshwater pool. The cenote is for the house only and has a proper ladder; the water stays between 24 and 26 degrees year round.',
   '["Private cenote with ladder access", "Freshwater pool", "Ten minutes from the archaeological site"]',
   '["Full kitchen", "Air conditioning", "Fibre Wi-Fi", "Linen and towels", "Parking for two cars"]',
   '["Private chef", "Food", "Airport transfer"]'),

  ('depa-quinta-avenida', 'es', 'Depa Quinta Avenida',
   'Departamento de dos recámaras a una cuadra de la Quinta Avenida.',
   'Segundo piso con balcón, en una calle tranquila a una cuadra del corredor peatonal y a cuatro de la playa. Edificio con alberca en la azotea y elevador. Es la base para quien quiere caminar a cenar y regresar sin taxi.',
   '["Una cuadra de la Quinta Avenida", "Alberca en la azotea", "Cuatro cuadras de la playa"]',
   '["Cocina equipada", "Aire acondicionado", "Wi-Fi", "Ropa de cama y toallas", "Elevador"]',
   '["Estacionamiento", "Alimentos", "Limpieza diaria"]'),
  ('depa-quinta-avenida', 'en', 'Fifth Avenue Flat',
   'Two-bedroom flat one block from Fifth Avenue.',
   'Second floor with a balcony, on a quiet street one block from the pedestrian strip and four from the beach. The building has a rooftop pool and a lift. This is the base for anyone who wants to walk to dinner and walk back.',
   '["One block from Fifth Avenue", "Rooftop pool", "Four blocks from the beach"]',
   '["Equipped kitchen", "Air conditioning", "Wi-Fi", "Linen and towels", "Lift"]',
   '["Parking", "Food", "Daily cleaning"]'),

  ('casa-laguna-bacalar', 'es', 'Casa Laguna',
   'Casa con muelle propio sobre la laguna de los siete colores.',
   'Terreno con frente de agua y muelle de madera con escalera, en la ribera sur de Bacalar. Tres recámaras, cocina completa y terraza con vista a la laguna. Al amanecer el agua está quieta y el color cambia con el sol: es la hora de sacar el kayak, que va incluido.',
   '["Muelle propio sobre la laguna", "Kayak incluido", "Terraza con vista al agua"]',
   '["Cocina completa", "Ventiladores de techo y aire en recámaras", "Wi-Fi", "Kayak doble", "Estacionamiento"]',
   '["Paseo en lancha", "Alimentos", "Traslados"]'),
  ('casa-laguna-bacalar', 'en', 'Lagoon House',
   'House with its own dock on the lagoon of seven colours.',
   'Waterfront lot with a wooden dock and ladder, on the southern shore of Bacalar. Three bedrooms, a full kitchen and a terrace facing the lagoon. At dawn the water is still and the colour shifts with the sun: that is the hour for the kayak, which is included.',
   '["Private dock on the lagoon", "Kayak included", "Terrace facing the water"]',
   '["Full kitchen", "Ceiling fans, AC in bedrooms", "Wi-Fi", "Double kayak", "Parking"]',
   '["Boat tour", "Food", "Transfers"]'),

  ('bungalow-holbox', 'es', 'Bungalow Holbox',
   'Bungalow de dos recámaras a pie de playa, sin autos alrededor.',
   'En Holbox no circulan autos: se llega en ferry y se anda en carrito de golf o a pie. El bungalow está en la playa norte, con acceso directo a la arena, hamacas en el porche y ducha exterior. La bioluminiscencia se ve desde aquí en noches sin luna, entre julio y enero.',
   '["Acceso directo a la arena", "Ducha exterior y hamacas", "Bioluminiscencia en temporada"]',
   '["Cocina equipada", "Ventiladores y aire en recámaras", "Wi-Fi", "Ropa de cama y toallas", "Bicicletas"]',
   '["Ferry desde Chiquilá", "Carrito de golf", "Alimentos"]'),
  ('bungalow-holbox', 'en', 'Holbox Bungalow',
   'Two-bedroom bungalow on the beach, with no cars around.',
   'No cars run on Holbox: you arrive by ferry and get around by golf cart or on foot. The bungalow sits on the north beach with direct access to the sand, hammocks on the porch and an outdoor shower. Bioluminescence is visible from here on moonless nights between July and January.',
   '["Direct access to the sand", "Outdoor shower and hammocks", "Bioluminescence in season"]',
   '["Equipped kitchen", "Fans, AC in bedrooms", "Wi-Fi", "Linen and towels", "Bicycles"]',
   '["Ferry from Chiquilá", "Golf cart", "Food"]'),

  ('casa-del-faro-isla-mujeres', 'es', 'Casa del Faro',
   'Casa de dos recámaras en la punta sur, con vista al canal.',
   'En la punta sur de Isla Mujeres, donde el acantilado da al canal y el amanecer entra por la terraza. Dos recámaras, cocina completa y una terraza alta que es el lugar donde se pasa el día. Playa Norte queda a diez minutos en carrito.',
   '["Vista al canal desde la terraza", "Amanecer de frente", "Diez minutos de Playa Norte"]',
   '["Cocina completa", "Aire acondicionado", "Wi-Fi", "Ropa de cama y toallas", "Terraza con asador"]',
   '["Carrito de golf", "Ferry", "Alimentos"]'),
  ('casa-del-faro-isla-mujeres', 'en', 'Lighthouse House',
   'Two-bedroom house on the south point, facing the channel.',
   'On the southern tip of Isla Mujeres, where the cliff faces the channel and sunrise comes in through the terrace. Two bedrooms, a full kitchen and a high terrace that is where the day gets spent. Playa Norte is ten minutes away by cart.',
   '["Channel view from the terrace", "Sunrise straight ahead", "Ten minutes from Playa Norte"]',
   '["Full kitchen", "Air conditioning", "Wi-Fi", "Linen and towels", "Terrace with grill"]',
   '["Golf cart", "Ferry", "Food"]'),

  ('penthouse-zona-hotelera', 'es', 'Penthouse Laguna',
   'Penthouse de tres recámaras entre el mar y la laguna Nichupté.',
   'Piso catorce con vista doble: el Caribe por un lado y la laguna Nichupté por el otro. Tres recámaras, sala de doble altura y terraza con jacuzzi. El edificio tiene acceso a playa privada, alberca y gimnasio. A quince minutos del aeropuerto.',
   '["Vista al mar y a la laguna", "Terraza con jacuzzi", "Acceso a playa privada"]',
   '["Cocina completa", "Aire acondicionado", "Wi-Fi", "Alberca y gimnasio", "Estacionamiento en el edificio"]',
   '["Alimentos", "Servicio de mucama diario", "Traslados"]'),
  ('penthouse-zona-hotelera', 'en', 'Lagoon Penthouse',
   'Three-bedroom penthouse between the sea and Nichupté lagoon.',
   'Fourteenth floor with a double view: the Caribbean on one side, Nichupté lagoon on the other. Three bedrooms, a double-height living room and a terrace with a hot tub. The building has private beach access, a pool and a gym. Fifteen minutes from the airport.',
   '["Sea and lagoon views", "Terrace with hot tub", "Private beach access"]',
   '["Full kitchen", "Air conditioning", "Wi-Fi", "Pool and gym", "Parking in the building"]',
   '["Food", "Daily housekeeping", "Transfers"]'),

  ('casa-palapa-cozumel', 'es', 'Casa Palapa',
   'Casa de cuatro recámaras con palapa y alberca, lado oeste de la isla.',
   'En el lado protegido de Cozumel, a cinco minutos en auto de los muelles de buceo. Cuatro recámaras, alberca, palapa con comedor de doce y tanque de enjuague para el equipo. Es la casa para un grupo que viene a bucear todos los días y necesita dónde dejar el equipo secando.',
   '["Alberca y palapa con comedor de doce", "Enjuague y tendido para equipo de buceo", "Cinco minutos de los muelles"]',
   '["Cocina completa", "Aire acondicionado", "Wi-Fi", "Ropa de cama y toallas", "Estacionamiento para dos autos"]',
   '["Renta de equipo de buceo", "Alimentos", "Salidas de buceo"]'),
  ('casa-palapa-cozumel', 'en', 'Palapa House',
   'Four-bedroom house with palapa and pool, on the island''s west side.',
   'On the sheltered side of Cozumel, a five-minute drive from the dive docks. Four bedrooms, a pool, a palapa with a table for twelve and a rinse tank for gear. This is the house for a group diving every day that needs somewhere to hang the gear to dry.',
   '["Pool and palapa seating twelve", "Rinse tank and drying line for dive gear", "Five minutes from the docks"]',
   '["Full kitchen", "Air conditioning", "Wi-Fi", "Linen and towels", "Parking for two cars"]',
   '["Dive gear rental", "Food", "Dive trips"]');

-- 3. Las fotos ---------------------------------------------------------------

create temporary table cat_photo (
  slug     text not null,
  position integer not null,
  alt_es   text not null,
  alt_en   text not null,
  primary key (slug, position)
) on commit drop;

insert into cat_photo
select c.slug, v.position, v.alt_es, v.alt_en
  from cat_stay c
 cross join lateral (values
   (1, 'Fachada de la casa',        'Front of the house'),
   (2, 'Sala y comedor',            'Living and dining room'),
   (3, 'Recámara principal',        'Main bedroom'),
   (4, 'Cocina',                    'Kitchen'),
   (5, 'Terraza y área exterior',   'Terrace and outdoor area')
 ) v(position, alt_es, alt_en);

-- 4. Insertar ----------------------------------------------------------------

-- 4.1 El producto. La política de cancelación se hereda de la que más usa el
-- catálogo, igual que en el guion de tours: inventar una nueva aquí crearía
-- dos reglas de reembolso conviviendo sin que nadie lo haya decidido.
insert into products (kind, slug, status, location_id, cancellation_policy_id, currency, position)
select 'stay', c.slug, 'published', l.id,
       (select p.cancellation_policy_id
          from products p
         where p.cancellation_policy_id is not null
         group by p.cancellation_policy_id
         order by count(*) desc, min(p.created_at)
         limit 1),
       'MXN', 100 + c.position
  from cat_stay c
  join locations l on l.slug = c.location_slug
on conflict (slug) do nothing;

insert into product_translations
  (product_id, locale, name, summary, description, highlights, included, excluded,
   meta_title, meta_description)
select p.id, t.locale, t.name, t.summary, t.description,
       t.highlights, t.included, t.excluded,
       t.name || ' · ' || l.name,
       t.summary
  from cat_text t
  join products p on p.slug = t.slug
  join cat_stay c on c.slug = t.slug
  join locations l on l.slug = c.location_slug
on conflict (product_id, locale) do nothing;

insert into product_media (product_id, url, alt_es, alt_en, width, height, position)
select p.id,
       'https://picsum.photos/seed/' || m.slug || '-' || m.position || '/1200/800',
       m.alt_es, m.alt_en, 1200, 800, m.position
  from cat_photo m
  join products p on p.slug = m.slug
 where not exists (
   select 1 from product_media x where x.product_id = p.id
 );

-- 4.2 La unidad. Una por casa: se renta entera, no por habitación.
insert into stay_units
  (product_id, code, max_guests, base_guests, extra_guest_fee_cents, cleaning_fee_cents,
   bedrooms, beds, bathrooms, min_nights, checkin_time, checkout_time, active)
select p.id, c.code, c.max_guests, c.base_guests, c.extra_guest_cents, c.cleaning_cents,
       c.bedrooms, c.beds, c.bathrooms, c.min_nights, time '15:00', time '11:00', true
  from cat_stay c
  join products p on p.slug = c.slug
on conflict (product_id, code) do nothing;

insert into stay_rate_plans (unit_id, name, currency, active)
select u.id, 'Tarifa 2026', 'MXN', true
  from cat_stay c
  join products p on p.slug = c.slug
  join stay_units u on u.product_id = p.id and u.code = c.code
 where not exists (
   select 1 from stay_rate_plans x where x.unit_id = u.id
 );

-- 4.3 Las tarifas. Dos: la base de lunes a jueves y domingo, y el recargo de
-- viernes y sábado, que es como se cobra de verdad la renta vacacional. La
-- de fin de semana lleva `priority` mayor para ganarle a la base en los días
-- que las dos cubren.
--
-- La temporada arranca hoy y dura año y medio: la ficha muestra doce meses de
-- disponibilidad, así que una temporada más corta dejaría noches sin precio
-- —y una noche sin tarifa no se puede cotizar, que es la forma silenciosa de
-- que una casa publicada no se pueda comprar.
insert into stay_rates (rate_plan_id, name, season, dows, nightly_cents, min_nights, priority)
select r.id, v.name,
       daterange(current_date, current_date + 540, '[)'),
       v.dows, v.cents, c.min_nights, v.priority
  from cat_stay c
  join products p on p.slug = c.slug
  join stay_units u on u.product_id = p.id and u.code = c.code
  join stay_rate_plans r on r.unit_id = u.id
 cross join lateral (values
   ('Base',           null::smallint[],       c.base_cents,    0),
   ('Fin de semana',  array[5, 6]::smallint[], c.weekend_cents, 10)
 ) v(name, dows, cents, priority)
 where not exists (
   select 1 from stay_rates x where x.rate_plan_id = r.id and x.name = v.name
 );

-- 5. Qué quedó ---------------------------------------------------------------
--
-- Lo único que de verdad puede salir mal es que una casa quede publicada sin
-- tarifa: se ve en la vitrina y no se puede cotizar. Se cuenta y se aborta si
-- pasa, porque eso sí es culpa de este guion.

do $$
declare
  fila       record;
  estancias  integer;
  sin_tarifa integer;
  sin_unidad integer;
  noches     integer;
begin
  select count(*) into estancias
    from products p where p.kind = 'stay' and p.status = 'published';

  select count(*) into sin_unidad
    from products p
   where p.kind = 'stay' and p.status = 'published'
     and not exists (select 1 from stay_units u where u.product_id = p.id and u.active);

  select count(*) into sin_tarifa
    from products p
    join stay_units u on u.product_id = p.id
   where p.slug in (select slug from cat_stay)
     and not exists (
       select 1 from stay_rate_plans r
         join stay_rates s on s.rate_plan_id = r.id
        where r.unit_id = u.id
     );

  select count(*) into noches
    from stay_rates s
    join stay_rate_plans r on r.id = s.rate_plan_id
    join stay_units u on u.id = r.unit_id
    join products p on p.id = u.product_id
   where p.slug in (select slug from cat_stay);

  raise notice '──';
  raise notice '── al terminar: % estancia(s) publicada(s), % fila(s) de tarifa', estancias, noches;

  for fila in
    select l.name as destino, count(*) as n
      from products p
      join locations l on l.id = p.location_id
     where p.kind = 'stay' and p.status = 'published'
     group by l.name order by l.name
  loop
    raise notice '──   %: % casa(s)', fila.destino, fila.n;
  end loop;

  if sin_tarifa > 0 then
    raise exception 'FALLO: % unidad(es) de este guion quedaron sin tarifa; se puede publicar pero no cotizar', sin_tarifa;
  end if;

  if sin_unidad > 0 then
    raise notice '── OJO: % estancia(s) publicada(s) sin unidad activa (no son de este guion)', sin_unidad;
  end if;

  raise notice '──';
end;
$$;

commit;
