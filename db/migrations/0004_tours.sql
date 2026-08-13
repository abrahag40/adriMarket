-- 0004_tours.sql
-- Inventario de tours: se agota por CONTEO DE LUGARES en una salida fechada.
--
-- Aquí el rango de fechas no sirve: lo que se vende son asientos de una
-- salida concreta. La garantía es un CHECK sobre el contador, y el orden
-- entre peticiones simultáneas lo decide un bloqueo de fila
-- (ver tour_hold_create en 0008_domain_functions.sql).

begin;

-- ---------------------------------------------------------------------------
-- Variantes del tour
-- ---------------------------------------------------------------------------

-- Un tour puede venderse en variantes: "compartido 9:00", "privado",
-- "con transporte". Cada una tiene su cupo y sus precios.
create table tour_options (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references products (id) on delete cascade,
  code             text not null,
  name_es          text not null,
  name_en          text,
  duration_minutes integer check (duration_minutes > 0),
  meeting_point    text,
  default_capacity integer not null check (default_capacity > 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (product_id, code)
);

create trigger tour_options_touch before update on tour_options
  for each row execute function touch_updated_at();

-- Precio por tipo de pasajero. Los infantes suelen no ocupar lugar:
-- 'counts_toward_capacity' decide si consumen cupo o no.
create table tour_pax_prices (
  id                     uuid primary key default gen_random_uuid(),
  tour_option_id         uuid not null references tour_options (id) on delete cascade,
  pax_type               pax_type not null,
  price_cents            bigint not null check (price_cents >= 0),
  min_age                integer,
  max_age                integer,
  counts_toward_capacity boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (tour_option_id, pax_type)
);

create trigger tour_pax_prices_touch before update on tour_pax_prices
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Salidas: la pieza crítica
-- ---------------------------------------------------------------------------

create table tour_departures (
  id             uuid primary key default gen_random_uuid(),
  tour_option_id uuid not null references tour_options (id) on delete cascade,
  -- timestamptz porque una salida SÍ es un instante (a diferencia de una
  -- noche de hospedaje, que es una fecha). La zona de presentación viene de
  -- locations.timezone del producto.
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  capacity       integer not null check (capacity > 0),
  -- Lugares comprometidos = holds vigentes + reservas confirmadas.
  -- Solo se modifica dentro de las funciones que bloquean esta fila.
  seats_taken    integer not null default 0 check (seats_taken >= 0),
  status         departure_status not null default 'open',
  guide_staff_id uuid references staff_users (id),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- ► LA GARANTÍA: aunque alguien escriba SQL a mano, no se puede sobrevender.
  constraint tour_departures_capacity_not_exceeded check (seats_taken <= capacity),
  unique (tour_option_id, starts_at)
);

create index tour_departures_calendar_idx
  on tour_departures (tour_option_id, starts_at)
  where status = 'open';

create trigger tour_departures_touch before update on tour_departures
  for each row execute function touch_updated_at();

comment on constraint tour_departures_capacity_not_exceeded on tour_departures is
  'Backstop de sobreventa. El orden entre peticiones lo da SELECT ... FOR UPDATE.';

-- Detalle de qué reserva tomó qué lugares. Permite reconstruir el contador
-- (ver la vista tour_departure_seat_audit en 0008) y liberar con precisión.
create table tour_seat_holds (
  id              uuid primary key default gen_random_uuid(),
  departure_id    uuid not null references tour_departures (id) on delete cascade,
  booking_item_id uuid,                        -- FK agregada en 0005
  seats           integer not null check (seats > 0),
  expires_at      timestamptz,                 -- null = ya confirmado
  confirmed_at    timestamptz,
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint tour_seat_holds_state_ok check (
    (confirmed_at is null and expires_at is not null)   -- hold vigente
    or (confirmed_at is not null and expires_at is null) -- confirmado
    or released_at is not null                           -- liberado
  )
);

create index tour_seat_holds_departure_idx on tour_seat_holds (departure_id)
  where released_at is null;
create index tour_seat_holds_expiry_idx on tour_seat_holds (expires_at)
  where confirmed_at is null and released_at is null;

commit;
