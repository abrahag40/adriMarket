-- dev_seed.sql
-- Datos mínimos para desarrollo y pruebas: un tour con salidas y una
-- propiedad con dos unidades y tarifas por temporada.
-- No se ejecuta en producción.

begin;

-- ---------------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------------

insert into settings (key, value, description) values
  ('deposit',
   '{"default_pct": 30}',
   'Porcentaje de anticipo por omisión. Cada producto puede sobreescribirlo.'),
  ('notifications',
   '{"admin_email": "reservas@adrimarket.mx", "reminder_hours": [72, 24]}',
   'Destino de los avisos internos y horas de recordatorio.'),
  ('checkout',
   '{"hold_minutes": 15, "currencies": ["MXN", "USD"]}',
   'Duración del apartado durante el checkout.');

insert into staff_users (email, full_name, role) values
  ('admin@adrimarket.mx', 'Administración', 'owner'),
  ('recepcion@adrimarket.mx', 'Recepción', 'front_desk');

-- ---------------------------------------------------------------------------
-- Ubicación, política e impuestos
-- ---------------------------------------------------------------------------

insert into locations (id, name, slug, city, state, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'Tulum', 'tulum', 'Tulum', 'Quintana Roo', 'America/Cancun');

insert into cancellation_policies (id, name, rules, deposit_refundable, text_es) values
  ('22222222-2222-2222-2222-222222222222',
   'Flexible 7 días',
   '[{"hours_before": 168, "refund_pct": 100}, {"hours_before": 48, "refund_pct": 50}]',
   true,
   'Cancelación sin costo hasta 7 días antes. Entre 7 y 2 días, 50%.');

insert into tax_rates (name, kind, rate, applies_to, location_id) values
  ('ISH Quintana Roo', 'percent', 3.0, 'stay', '11111111-1111-1111-1111-111111111111'),
  ('IVA', 'percent', 16.0, null, '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- Tour: usa el anticipo global (30%)
-- ---------------------------------------------------------------------------

insert into products (id, kind, slug, status, location_id, cancellation_policy_id, currency) values
  ('33333333-3333-3333-3333-333333333333', 'tour', 'snorkel-cenotes-tulum', 'published',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'MXN');

insert into product_translations (product_id, locale, name, summary, description,
                                  highlights, included, excluded, meta_title, meta_description) values
  ('33333333-3333-3333-3333-333333333333', 'es', 'Snorkel en cenotes de Tulum',
   'Tres cenotes con guía certificado, equipo y transporte incluidos.',
   'Salimos temprano para llegar a los cenotes antes que los autobuses. Recorremos tres formaciones distintas: una caverna abierta, un cenote de agua cristalina rodeado de selva y uno semiabierto con raíces colgantes. El grupo nunca pasa de doce personas.',
   '["Antes que los autobuses turísticos", "Grupos de máximo 12 personas", "Guía certificado en cuevas", "Tres cenotes en un solo día"]',
   '["Transporte redondo desde Tulum centro", "Equipo de snorkel y chaleco", "Guía certificado", "Fruta y agua", "Entradas a los tres cenotes"]',
   '["Propinas", "Comida", "Toalla"]',
   'Snorkel en cenotes de Tulum · grupos pequeños',
   'Tres cenotes con guía certificado, equipo y transporte incluidos. Grupos de máximo 12 personas.'),
  ('33333333-3333-3333-3333-333333333333', 'en', 'Tulum Cenote Snorkeling',
   'Three cenotes with a certified guide, gear and transport included.',
   'We leave early to reach the cenotes before the tour buses. You will snorkel three different formations: an open cavern, a crystal-clear cenote surrounded by jungle, and a semi-open one with hanging roots. Groups never exceed twelve people.',
   '["Ahead of the tour buses", "Groups of 12 people maximum", "Certified cave guide", "Three cenotes in one day"]',
   '["Round-trip transport from downtown Tulum", "Snorkel gear and vest", "Certified guide", "Fruit and water", "Entrance to all three cenotes"]',
   '["Gratuities", "Lunch", "Towel"]',
   'Tulum Cenote Snorkeling · small groups',
   'Three cenotes with a certified guide, gear and transport included. Groups of 12 people maximum.');

insert into tour_options (id, product_id, code, name_es, duration_minutes, meeting_point, default_capacity) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333',
   'shared-am', 'Compartido 9:00', 300, 'Parque Dos Aguas, Tulum centro', 12);

insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity) values
  ('44444444-4444-4444-4444-444444444444', 'adult',  180000, true),
  ('44444444-4444-4444-4444-444444444444', 'child',  120000, true),
  ('44444444-4444-4444-4444-444444444444', 'infant',      0, false);

-- Salidas diarias del próximo mes, 9:00 hora de Cancún.
insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
select
  '44444444-4444-4444-4444-444444444444',
  (d::date + time '09:00') at time zone 'America/Cancun',
  (d::date + time '14:00') at time zone 'America/Cancun',
  12
from generate_series(current_date + 1, current_date + 30, interval '1 day') d;

-- ---------------------------------------------------------------------------
-- Estancia: anticipo propio del 40%, más alto que el global
-- ---------------------------------------------------------------------------

insert into products (id, kind, slug, status, location_id, cancellation_policy_id, currency, deposit_pct) values
  ('55555555-5555-5555-5555-555555555555', 'stay', 'casa-akumal', 'published',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'MXN', 40);

insert into product_translations (product_id, locale, name, summary, description,
                                  highlights, included, excluded, meta_title, meta_description) values
  ('55555555-5555-5555-5555-555555555555', 'es', 'Casa Akumal',
   'Casa de dos recámaras a cinco minutos de la playa.',
   'Casa completa con alberca privada, cocina abierta y terraza con sombra buena parte del día. Está a cinco minutos caminando de la bahía donde se puede nadar con tortugas, y a diez de la tienda y la panadería.',
   '["Alberca privada", "Cinco minutos de la bahía de tortugas", "Cocina completa", "Terraza con sombra"]',
   '["Ropa de cama y toallas", "Wifi", "Aire acondicionado en recámaras", "Limpieza al final de la estancia", "Estacionamiento"]',
   '["Alimentos", "Servicio de limpieza diario", "Cuna (bajo solicitud)"]',
   'Casa Akumal · casa con alberca cerca de la bahía',
   'Casa completa de dos recámaras con alberca privada, a cinco minutos de la bahía de Akumal.'),
  ('55555555-5555-5555-5555-555555555555', 'en', 'Casa Akumal',
   'Two-bedroom house, five minutes from the beach.',
   'Whole house with a private pool, open kitchen and a terrace that stays shaded most of the day. It is a five-minute walk from the bay where you can swim with turtles, and ten from the store and bakery.',
   '["Private pool", "Five minutes from the turtle bay", "Full kitchen", "Shaded terrace"]',
   '["Linens and towels", "Wifi", "Air conditioning in bedrooms", "End-of-stay cleaning", "Parking"]',
   '["Food", "Daily housekeeping", "Crib (on request)"]',
   'Casa Akumal · house with pool near the bay',
   'Whole two-bedroom house with a private pool, five minutes from Akumal bay.');

insert into stay_units (id, product_id, code, max_guests, base_guests, extra_guest_fee_cents,
                        cleaning_fee_cents, bedrooms, beds, bathrooms, min_nights) values
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555',
   'casa-completa', 6, 4, 60000, 80000, 2, 3, 2, 2);

insert into stay_rate_plans (id, unit_id, name) values
  ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'Tarifa pública');

-- Temporada baja todo el año, alta en invierno, y fin de semana encima de
-- ambas por priority. Así se define un puente sin partir la temporada.
insert into stay_rates (rate_plan_id, name, season, dows, nightly_cents, min_nights, priority) values
  ('77777777-7777-7777-7777-777777777777', 'Base',
   daterange('2026-01-01', '2027-01-01'), null, 320000, 2, 0),
  ('77777777-7777-7777-7777-777777777777', 'Temporada alta',
   daterange('2026-12-15', '2027-01-07'), null, 580000, 4, 10),
  ('77777777-7777-7777-7777-777777777777', 'Fin de semana',
   daterange('2026-01-01', '2027-01-01'), array[5,6]::smallint[], 390000, null, 5);

-- Segunda unidad del mismo producto: una casita al fondo, para dos personas.
-- Hace demostrable la regla de "cotizar la unidad más chica que alcanza":
-- ofrecer la casa de seis a una pareja desperdicia inventario y encarece la
-- oferta sin razón.
insert into stay_units (id, product_id, code, max_guests, base_guests, extra_guest_fee_cents,
                        cleaning_fee_cents, bedrooms, beds, bathrooms, min_nights) values
  ('66666666-6666-6666-6666-66666666aaaa', '55555555-5555-5555-5555-555555555555',
   'casita', 2, 2, 0, 40000, 1, 1, 1, 1);

insert into stay_rate_plans (id, unit_id, name) values
  ('77777777-7777-7777-7777-77777777aaaa', '66666666-6666-6666-6666-66666666aaaa', 'Tarifa pública');

insert into stay_rates (rate_plan_id, name, season, nightly_cents, priority) values
  ('77777777-7777-7777-7777-77777777aaaa', 'Base',
   daterange('2026-01-01', '2027-01-01'), 180000, 0);

-- ---------------------------------------------------------------------------
-- Tercer producto, en otra ubicación: hace demostrables los filtros
-- ---------------------------------------------------------------------------

insert into locations (id, name, slug, city, state, timezone) values
  ('88888888-8888-8888-8888-888888888888', 'Playa del Carmen', 'playa-del-carmen',
   'Playa del Carmen', 'Quintana Roo', 'America/Cancun');

insert into products (id, kind, slug, status, location_id, cancellation_policy_id, currency, position) values
  ('99999999-9999-9999-9999-999999999999', 'tour', 'catamaran-arrecife-playa', 'published',
   '88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', 'MXN', 1);

insert into product_translations (product_id, locale, name, summary, description,
                                  highlights, included, excluded) values
  ('99999999-9999-9999-9999-999999999999', 'es', 'Catamarán al arrecife',
   'Cuatro horas de navegación con dos paradas de snorkel en el arrecife.',
   'Salida desde la marina de Playa del Carmen a bordo de un catamarán de 40 pies. Dos paradas de snorkel en el arrecife y barra abierta en el regreso.',
   '["Barra abierta de regreso", "Dos paradas de snorkel", "Catamarán de 40 pies"]',
   '["Equipo de snorkel", "Guía", "Barra abierta", "Fruta y botanas"]',
   '["Transporte al muelle", "Propinas"]'),
  ('99999999-9999-9999-9999-999999999999', 'en', 'Reef Catamaran',
   'Four hours of sailing with two snorkel stops at the reef.',
   'Departure from the Playa del Carmen marina aboard a 40-foot catamaran. Two snorkel stops at the reef and an open bar on the way back.',
   '["Open bar on the return leg", "Two snorkel stops", "40-foot catamaran"]',
   '["Snorkel gear", "Guide", "Open bar", "Fruit and snacks"]',
   '["Transport to the dock", "Gratuities"]');

insert into tour_options (id, product_id, code, name_es, name_en, duration_minutes,
                          meeting_point, default_capacity) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999',
   'shared-pm', 'Compartido 13:00', 'Shared 1:00 pm', 240,
   'Marina Playa del Carmen, muelle 3', 20);

insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'adult',  240000, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'child',  160000, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'infant',      0, false);

insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
select
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  (d::date + time '13:00') at time zone 'America/Cancun',
  (d::date + time '17:00') at time zone 'America/Cancun',
  20
from generate_series(current_date + 1, current_date + 30, interval '1 day') d;

-- ---------------------------------------------------------------------------
-- Galerías
--
-- Contenido de relleno hasta que lleguen las fotos reales del cliente (es una
-- dependencia del Sprint 1 con dueño: el SME). El texto alternativo se escribe
-- en los dos idiomas desde el principio, porque agregarlo después nunca pasa.
-- ---------------------------------------------------------------------------

insert into product_media (product_id, url, alt_es, alt_en, width, height, position) values
  ('33333333-3333-3333-3333-333333333333', '/media/cenotes-1.svg',
   'Cenote de agua turquesa rodeado de selva', 'Turquoise cenote surrounded by jungle', 1200, 800, 0),
  ('33333333-3333-3333-3333-333333333333', '/media/cenotes-2.svg',
   'Caverna con haz de luz sobre el agua', 'Cavern with a beam of light over the water', 1200, 800, 1),
  ('33333333-3333-3333-3333-333333333333', '/media/cenotes-3.svg',
   'Raíces colgantes sobre agua dulce', 'Hanging roots over fresh water', 1200, 800, 2),

  ('55555555-5555-5555-5555-555555555555', '/media/akumal-1.svg',
   'Terraza con alberca privada', 'Terrace with private pool', 1200, 800, 0),
  ('55555555-5555-5555-5555-555555555555', '/media/akumal-2.svg',
   'Recámara principal con ventanal', 'Main bedroom with large window', 1200, 800, 1),
  ('55555555-5555-5555-5555-555555555555', '/media/akumal-3.svg',
   'Cocina abierta hacia la terraza', 'Kitchen open to the terrace', 1200, 800, 2),

  ('99999999-9999-9999-9999-999999999999', '/media/catamaran-1.svg',
   'Catamarán navegando frente a la costa', 'Catamaran sailing off the coast', 1200, 800, 0),
  ('99999999-9999-9999-9999-999999999999', '/media/catamaran-2.svg',
   'Snorkel sobre el arrecife', 'Snorkeling over the reef', 1200, 800, 1);

-- Un bloqueo de mantenimiento en fechas fijas: hace demostrable el calendario y
-- la regla de que el motivo no se expone al huésped.
insert into stay_blocks (unit_id, stay, reason, note) values
  ('66666666-6666-6666-6666-666666666666', daterange('2026-10-05', '2026-10-09'),
   'maintenance', 'Pintura de la terraza');

-- Publicado pero solo en español: sirve para probar que /en responde 404 en
-- lugar de mostrar contenido a medio traducir.
insert into products (id, kind, slug, status, location_id, currency, position) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'stay', 'depa-centro-tulum', 'published',
   '11111111-1111-1111-1111-111111111111', 'MXN', 9);

insert into product_translations (product_id, locale, name, summary) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'es', 'Depa en el centro de Tulum',
   'Estudio para dos, a cuatro cuadras de la avenida principal.');

insert into stay_units (id, product_id, code, max_guests, base_guests, bedrooms, beds, bathrooms, min_nights) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'estudio', 2, 2, 1, 1, 1, 1);

insert into stay_rate_plans (id, unit_id, name) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Tarifa pública');

insert into stay_rates (rate_plan_id, name, season, nightly_cents, priority) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Base',
   daterange('2026-01-01', '2027-01-01'), 145000, 0);

-- Un borrador para probar que lo no publicado no se filtra a la vitrina.
insert into products (id, kind, slug, status, location_id, currency) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'tour', 'borrador-no-publicado', 'draft',
   '11111111-1111-1111-1111-111111111111', 'MXN');

insert into product_translations (product_id, locale, name, summary) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'es', 'Tour en borrador',
   'No debe aparecer en el listado ni tener ficha accesible.');

commit;
