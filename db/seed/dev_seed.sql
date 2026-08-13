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

insert into product_translations (product_id, locale, name, summary) values
  ('33333333-3333-3333-3333-333333333333', 'es', 'Snorkel en cenotes de Tulum',
   'Tres cenotes con guía certificado, equipo y transporte incluidos.'),
  ('33333333-3333-3333-3333-333333333333', 'en', 'Tulum Cenote Snorkeling',
   'Three cenotes with a certified guide, gear and transport included.');

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

insert into product_translations (product_id, locale, name, summary) values
  ('55555555-5555-5555-5555-555555555555', 'es', 'Casa Akumal',
   'Casa de dos recámaras a cinco minutos de la playa.'),
  ('55555555-5555-5555-5555-555555555555', 'en', 'Casa Akumal',
   'Two-bedroom house, five minutes from the beach.');

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

commit;
