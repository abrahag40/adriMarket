-- ---------------------------------------------------------------------------
-- Vehículos de renta · seis unidades en cuatro destinos
--
-- El tercer inventario, y **cero tablas nuevas**: un vehículo vive en
-- `rental_units` junto a las casas porque se ocupa igual —una unidad concreta
-- entre dos fechas, con la misma restricción de exclusión decidiendo si se
-- puede—. Lo único propio son tres columnas de ficha técnica que la migración
-- 0018 agregó: transmisión, maletas y puertas.
--
-- Qué se reutiliza tal cual, sin una línea nueva de dominio:
--
--   · `rental_blocks` y su `EXCLUDE USING gist` — no se renta dos veces
--   · `rental_hold_create` — el apartado con vencimiento
--   · `rental_rate_plans` / `rental_rates` — precio por día, con recargo de
--     fin de semana, igual que las casas
--   · `booking_reschedule_rental` — cambiar fechas
--   · el checkout, el comprobante, los avisos y el panel
--
-- Sobre los datos: precios de renta 2026 en Quintana Roo, en centavos. Los
-- horarios de entrega y devolución (09:00 / 18:00) son los de mostrador. El
-- `min_nights` de la tabla es, para un vehículo, el mínimo de **días**: la
-- columna cuenta unidades de fecha y para renta una noche y un día de uso son
-- lo mismo. Al huésped se le dice "días", que es lo que le importa.
--
--   npm run prod:sql -- db/seed/vehiculos_caribe.sql
-- ---------------------------------------------------------------------------

begin;

create temporary table cat_veh (
  slug          text primary key,
  location_slug text not null,
  position      integer not null,
  code          text not null,
  passengers    integer not null,
  transmission  text,
  luggage       integer,
  doors         integer,
  min_days      integer not null,
  base_cents    bigint not null,
  weekend_cents bigint not null
) on commit drop;

insert into cat_veh values
  ('scooter-vespa-tulum',        'tulum',            1, 'SCO-TU', 2, null,        1, null, 1,  65000,  78000),
  ('moto-adventure-bacalar',     'bacalar',          2, 'MOT-BA', 2, 'manual',    2, null, 1,  95000, 115000),
  ('auto-compacto-cancun',       'cancun',           3, 'AUT-CU', 5, 'automatica',2, 4,    2,  89000, 105000),
  ('suv-familiar-playa',         'playa-del-carmen', 4, 'SUV-PC', 5, 'automatica',4, 5,    2, 145000, 175000),
  ('van-grupos-cozumel',         'cozumel',          5, 'VAN-CZ', 8, 'automatica',6, 4,    2, 210000, 250000),
  ('jeep-techo-abierto-cozumel', 'cozumel',          6, 'JEE-CZ', 4, 'manual',    2, 2,    1, 165000, 195000);

create temporary table cat_text (
  slug text not null, locale text not null, name text not null,
  summary text not null, description text not null,
  highlights jsonb not null, included jsonb not null, excluded jsonb not null,
  primary key (slug, locale)
) on commit drop;

insert into cat_text values
  ('scooter-vespa-tulum', 'es', 'Scooter 125 cc en Tulum',
   'Scooter automática para dos, con casco incluido y entrega en el centro.',
   'La forma en que de verdad se mueve la gente en Tulum: del pueblo a la zona hotelera son ocho kilómetros de ciclovía y carretera, y en scooter se hacen en quince minutos sin buscar estacionamiento. Se entrega con el tanque lleno y dos cascos.',
   '["Dos cascos incluidos", "Entrega en el centro de Tulum", "Tanque lleno al salir"]',
   '["Dos cascos", "Candado de disco", "Seguro de responsabilidad civil"]',
   '["Gasolina", "Casetas", "Seguro contra robo"]'),
  ('scooter-vespa-tulum', 'en', '125cc Scooter in Tulum',
   'Automatic scooter for two, helmets included, picked up downtown.',
   'How people actually get around Tulum: eight kilometres of bike path and road between town and the hotel zone, fifteen minutes on a scooter and no parking to hunt for. Delivered with a full tank and two helmets.',
   '["Two helmets included", "Pick-up in downtown Tulum", "Full tank at pick-up"]',
   '["Two helmets", "Disc lock", "Third-party liability insurance"]',
   '["Fuel", "Tolls", "Theft insurance"]'),

  ('moto-adventure-bacalar', 'es', 'Moto adventure 250 cc',
   'Moto de doble propósito para recorrer la ribera de Bacalar.',
   'La costera de Bacalar es terracería en buena parte del tramo sur, y un auto bajo no llega a los cenotes de la orilla. Esta moto sí. Manual, con maletas laterales y soporte para teléfono.',
   '["Llega a los cenotes de terracería", "Maletas laterales", "Soporte para teléfono"]',
   '["Casco integral", "Maletas laterales", "Seguro de responsabilidad civil"]',
   '["Gasolina", "Segundo casco", "Seguro contra robo"]'),
  ('moto-adventure-bacalar', 'en', '250cc Adventure Bike',
   'Dual-sport bike for the Bacalar lakeshore road.',
   'Much of the southern lakeshore road is dirt, and a low car will not reach the cenotes along it. This bike will. Manual, with side cases and a phone mount.',
   '["Reaches the dirt-road cenotes", "Side cases", "Phone mount"]',
   '["Full-face helmet", "Side cases", "Third-party liability insurance"]',
   '["Fuel", "Second helmet", "Theft insurance"]'),

  ('auto-compacto-cancun', 'es', 'Auto compacto automático',
   'Cinco plazas, transmisión automática, entrega en el aeropuerto de Cancún.',
   'El auto para moverse por la Riviera sin pensarlo: automático, aire acondicionado y consumo bajo. Se entrega en la terminal del aeropuerto de Cancún y se devuelve ahí mismo. Cuatro puertas y cajuela para dos maletas grandes.',
   '["Entrega y devolución en el aeropuerto", "Automático con aire acondicionado", "Cajuela para dos maletas"]',
   '["Seguro de responsabilidad civil", "Kilometraje ilimitado", "Segundo conductor"]',
   '["Gasolina", "Casetas", "Cobertura amplia"]'),
  ('auto-compacto-cancun', 'en', 'Compact Automatic Car',
   'Five seats, automatic, picked up at Cancún airport.',
   'The car for getting around the Riviera without thinking about it: automatic, air conditioning, low consumption. Picked up at the Cancún airport terminal and returned there. Four doors and a boot for two large bags.',
   '["Airport pick-up and drop-off", "Automatic with air conditioning", "Boot for two large bags"]',
   '["Third-party liability insurance", "Unlimited mileage", "Second driver"]',
   '["Fuel", "Tolls", "Full coverage"]'),

  ('suv-familiar-playa', 'es', 'SUV familiar',
   'Cinco plazas altas con cajuela grande, entrega en Playa del Carmen.',
   'Altura para los topes y las entradas de terracería a los cenotes, y cajuela de verdad para equipaje de una familia. Automática, con aire acondicionado y cámara de reversa.',
   '["Altura para caminos de terracería", "Cajuela para cuatro maletas", "Cámara de reversa"]',
   '["Seguro de responsabilidad civil", "Kilometraje ilimitado", "Sillas para niño a pedido"]',
   '["Gasolina", "Casetas", "Cobertura amplia"]'),
  ('suv-familiar-playa', 'en', 'Family SUV',
   'Five high seats with a big boot, picked up in Playa del Carmen.',
   'Ground clearance for the speed bumps and the dirt turn-offs to the cenotes, and a real boot for a family''s luggage. Automatic, with air conditioning and a reversing camera.',
   '["Clearance for dirt roads", "Boot for four bags", "Reversing camera"]',
   '["Third-party liability insurance", "Unlimited mileage", "Child seats on request"]',
   '["Fuel", "Tolls", "Full coverage"]'),

  ('van-grupos-cozumel', 'es', 'Van para ocho',
   'Ocho plazas y espacio para equipo de buceo, en Cozumel.',
   'Para un grupo que viene a bucear: ocho asientos, piso plano y espacio atrás para ocho equipos completos con tanques. Automática, con aire acondicionado en las tres filas.',
   '["Ocho plazas con aire en las tres filas", "Espacio para ocho equipos de buceo", "Piso plano de carga"]',
   '["Seguro de responsabilidad civil", "Kilometraje ilimitado", "Segundo conductor"]',
   '["Gasolina", "Ferry", "Cobertura amplia"]'),
  ('van-grupos-cozumel', 'en', 'Eight-Seat Van',
   'Eight seats and room for dive gear, on Cozumel.',
   'For a group that came to dive: eight seats, a flat floor and room in the back for eight full kits with tanks. Automatic, with air conditioning in all three rows.',
   '["Eight seats, AC in all three rows", "Room for eight dive kits", "Flat load floor"]',
   '["Third-party liability insurance", "Unlimited mileage", "Second driver"]',
   '["Fuel", "Ferry", "Full coverage"]'),

  ('jeep-techo-abierto-cozumel', 'es', 'Jeep de techo abierto',
   'Cuatro plazas sin techo para dar la vuelta a Cozumel.',
   'La vuelta a la isla son sesenta kilómetros de costera con el mar de un lado todo el camino, y se hace sin techo o no se hace. Manual, cuatro plazas, con lona por si llueve.',
   '["Sin techo para la costera este", "Lona incluida", "Cuatro plazas"]',
   '["Seguro de responsabilidad civil", "Lona de lluvia", "Kilometraje ilimitado"]',
   '["Gasolina", "Ferry", "Cobertura amplia"]'),
  ('jeep-techo-abierto-cozumel', 'en', 'Open-Top Jeep',
   'Four seats, no roof, for the loop around Cozumel.',
   'The island loop is sixty kilometres of coast road with the sea on one side the whole way, and it is done without a roof or not at all. Manual, four seats, with a rain cover just in case.',
   '["No roof for the east coast road", "Rain cover included", "Four seats"]',
   '["Third-party liability insurance", "Rain cover", "Unlimited mileage"]',
   '["Fuel", "Ferry", "Full coverage"]');

create temporary table cat_photo (slug text, position integer, url text) on commit drop;
insert into cat_photo values
  ('scooter-vespa-tulum', 1, 'https://images.unsplash.com/photo-1606837731961-c5211df9aa10'),
  ('scooter-vespa-tulum', 2, 'https://images.unsplash.com/photo-1675980892208-7b6ba39120ea'),
  ('scooter-vespa-tulum', 3, 'https://images.unsplash.com/photo-1692897433040-16d8dbbb7554'),
  ('scooter-vespa-tulum', 4, 'https://images.unsplash.com/photo-1701681673549-22ac5dc076c9'),
  ('moto-adventure-bacalar', 1, 'https://images.unsplash.com/photo-1588756681780-9d5859fc2ca0'),
  ('moto-adventure-bacalar', 2, 'https://images.unsplash.com/photo-1550149550-33b46c745e03'),
  ('moto-adventure-bacalar', 3, 'https://images.unsplash.com/photo-1629294148914-678ba902dd49'),
  ('moto-adventure-bacalar', 4, 'https://images.unsplash.com/photo-1666907418714-1b5f85aaf146'),
  ('auto-compacto-cancun', 1, 'https://images.unsplash.com/photo-1611965008308-f117c8ca80fd'),
  ('auto-compacto-cancun', 2, 'https://images.unsplash.com/photo-1625556841726-ee3959350033'),
  ('auto-compacto-cancun', 3, 'https://images.unsplash.com/photo-1612415491873-144fd5e03169'),
  ('auto-compacto-cancun', 4, 'https://images.unsplash.com/photo-1642797986651-9c7cc8f1d92a'),
  ('suv-familiar-playa', 1, 'https://images.unsplash.com/photo-1572401611152-cf63d874b019'),
  ('suv-familiar-playa', 2, 'https://images.unsplash.com/photo-1531181616225-f8e50c1ab53e'),
  ('suv-familiar-playa', 3, 'https://images.unsplash.com/photo-1532931899774-fbd4de0008fb'),
  ('suv-familiar-playa', 4, 'https://images.unsplash.com/photo-1529424601215-d2a3daf193ff'),
  ('van-grupos-cozumel', 1, 'https://images.unsplash.com/photo-1549194898-60fd030ecc0f'),
  ('van-grupos-cozumel', 2, 'https://images.unsplash.com/photo-1464219789935-c2d9d9aba644'),
  ('van-grupos-cozumel', 3, 'https://images.unsplash.com/photo-1602721186896-1b21c7405c0b'),
  ('van-grupos-cozumel', 4, 'https://images.unsplash.com/photo-1647702504702-6b3dc40eafe5'),
  ('jeep-techo-abierto-cozumel', 1, 'https://images.unsplash.com/photo-1763637674546-40ec5030dc85'),
  ('jeep-techo-abierto-cozumel', 2, 'https://images.unsplash.com/photo-1760926443548-4f71b637bcdf'),
  ('jeep-techo-abierto-cozumel', 3, 'https://images.unsplash.com/photo-1760126106195-c26f666ea0c9'),
  ('jeep-techo-abierto-cozumel', 4, 'https://images.unsplash.com/photo-1711788811627-afa8bf1cadb7')
;

-- Insertar -------------------------------------------------------------------

insert into products (kind, slug, status, location_id, cancellation_policy_id, currency, position)
select 'vehicle', c.slug, 'published', l.id,
       (select p.cancellation_policy_id from products p
         where p.cancellation_policy_id is not null
         group by p.cancellation_policy_id
         order by count(*) desc, min(p.created_at) limit 1),
       'MXN', 200 + c.position
  from cat_veh c join locations l on l.slug = c.location_slug
on conflict (slug) do nothing;

insert into product_translations
  (product_id, locale, name, summary, description, highlights, included, excluded,
   meta_title, meta_description)
select p.id, t.locale, t.name, t.summary, t.description,
       t.highlights, t.included, t.excluded, t.name || ' · ' || l.name, t.summary
  from cat_text t
  join products p on p.slug = t.slug
  join cat_veh c on c.slug = t.slug
  join locations l on l.slug = c.location_slug
on conflict (product_id, locale) do nothing;

-- Fotos con sus variantes: el mismo tratamiento que tours y estancias, porque
-- el presupuesto de bytes no distingue inventarios.
insert into product_media (product_id, url, alt_es, alt_en, width, height, position, variants)
select p.id,
       m.url || '?w=800&fit=crop&fm=jpg&q=65',
       'Foto del vehículo', 'Photo of the vehicle', 1200, 800, m.position,
       jsonb_build_object(
         'avif', jsonb_build_object(
           '400',  m.url || '?w=400&fit=crop&fm=avif&q=36',
           '800',  m.url || '?w=800&fit=crop&fm=avif&q=45',
           '1200', m.url || '?w=1200&fit=crop&fm=avif&q=50'),
         'webp', jsonb_build_object(
           '400',  m.url || '?w=400&fit=crop&fm=webp&q=52',
           '800',  m.url || '?w=800&fit=crop&fm=webp&q=55',
           '1200', m.url || '?w=1200&fit=crop&fm=webp&q=60'))
  from cat_photo m
  join products p on p.slug = m.slug
 where not exists (select 1 from product_media x where x.product_id = p.id);

-- La unidad. Las columnas de casa (recámaras, camas, baños, limpieza) quedan
-- en cero o nulas: es la misma tabla, y cada tipo llena lo suyo.
insert into rental_units
  (product_id, code, max_guests, base_guests, min_nights,
   checkin_time, checkout_time, transmission, luggage, doors, active)
select p.id, c.code, c.passengers, c.passengers, c.min_days,
       time '09:00', time '18:00', c.transmission, c.luggage, c.doors, true
  from cat_veh c join products p on p.slug = c.slug
on conflict (product_id, code) do nothing;

insert into rental_rate_plans (unit_id, name, currency, active)
select u.id, 'Tarifa 2026', 'MXN', true
  from cat_veh c
  join products p on p.slug = c.slug
  join rental_units u on u.product_id = p.id and u.code = c.code
 where not exists (select 1 from rental_rate_plans x where x.unit_id = u.id);

insert into rental_rates (rate_plan_id, name, season, dows, nightly_cents, min_nights, priority)
select r.id, v.name, daterange(current_date, current_date + 540, '[)'),
       v.dows, v.cents, c.min_days, v.priority
  from cat_veh c
  join products p on p.slug = c.slug
  join rental_units u on u.product_id = p.id and u.code = c.code
  join rental_rate_plans r on r.unit_id = u.id
 cross join lateral (values
   ('Base',          null::smallint[],        c.base_cents,    0),
   ('Fin de semana', array[5, 6]::smallint[], c.weekend_cents, 10)
 ) v(name, dows, cents, priority)
 where not exists (select 1 from rental_rates x where x.rate_plan_id = r.id and x.name = v.name);

do $$
declare n integer; sin_tarifa integer;
begin
  select count(*) into n from products where kind = 'vehicle' and status = 'published';
  select count(*) into sin_tarifa
    from products p join rental_units u on u.product_id = p.id
   where p.kind = 'vehicle'
     and not exists (select 1 from rental_rate_plans r
                       join rental_rates s on s.rate_plan_id = r.id
                      where r.unit_id = u.id);
  raise notice '── vehículos publicados: %', n;
  if sin_tarifa > 0 then
    raise exception 'FALLO: % vehículo(s) sin tarifa; se publican y no se pueden cotizar', sin_tarifa;
  end if;
end;
$$;

commit;
