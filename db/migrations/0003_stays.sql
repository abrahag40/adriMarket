-- 0003_stays.sql
-- Inventario de estancias: se agota por TRASLAPE DE RANGOS DE FECHAS.
--
-- La garantía anti-doble-reserva no está en la aplicación: está declarada en
-- la tabla stay_blocks como restricción de exclusión. La aplicación no puede
-- olvidarse de revisar, porque el traslape es imposible por definición.

begin;

-- ---------------------------------------------------------------------------
-- Unidades rentables
-- ---------------------------------------------------------------------------

-- Un 'product' de tipo stay puede tener una o varias unidades (una casa
-- completa, o tres departamentos del mismo edificio).
create table stay_units (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references products (id) on delete cascade,
  code                  text not null,
  max_guests            integer not null check (max_guests > 0),
  base_guests           integer not null check (base_guests > 0),
  extra_guest_fee_cents bigint not null default 0 check (extra_guest_fee_cents >= 0),
  cleaning_fee_cents    bigint not null default 0 check (cleaning_fee_cents >= 0),
  bedrooms              integer not null default 1,
  beds                  integer not null default 1,
  bathrooms             numeric(3, 1) not null default 1,
  min_nights            integer not null default 1 check (min_nights > 0),
  checkin_time          time not null default '15:00',
  checkout_time         time not null default '11:00',
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (product_id, code),
  constraint stay_units_guests_ok check (base_guests <= max_guests)
);

create trigger stay_units_touch before update on stay_units
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Tarifas
-- ---------------------------------------------------------------------------

create table stay_rate_plans (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references stay_units (id) on delete cascade,
  name       text not null,
  currency   char(3) not null default 'MXN',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger stay_rate_plans_touch before update on stay_rate_plans
  for each row execute function touch_updated_at();

-- Una fila por temporada (y opcionalmente por días de la semana).
-- Cuando dos filas cubren la misma noche gana la de mayor 'priority':
-- así un puente o Navidad se define encima de la temporada alta sin
-- tener que partir la temporada en pedazos.
create table stay_rates (
  id                 uuid primary key default gen_random_uuid(),
  rate_plan_id       uuid not null references stay_rate_plans (id) on delete cascade,
  name               text,
  season             daterange not null,
  -- ISO: 1 = lunes … 7 = domingo. null = todos los días.
  dows               smallint[],
  nightly_cents      bigint not null check (nightly_cents >= 0),
  min_nights         integer check (min_nights > 0),
  closed_to_arrival  boolean not null default false,
  closed_to_departure boolean not null default false,
  priority           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint stay_rates_season_not_empty check (not isempty(season)),
  constraint stay_rates_dows_valid check (
    dows is null or (
      array_length(dows, 1) between 1 and 7
      and dows <@ array[1,2,3,4,5,6,7]::smallint[]
    )
  )
);

create index stay_rates_lookup_idx on stay_rates using gist (rate_plan_id, season);

create trigger stay_rates_touch before update on stay_rates
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Ocupación: la pieza crítica
-- ---------------------------------------------------------------------------

-- Una sola tabla para TODO lo que ocupa una unidad: holds del checkout,
-- reservas confirmadas, mantenimiento y uso del propietario. Al compartir
-- tabla comparten la restricción de exclusión, así que un bloqueo de
-- mantenimiento también impide vender esas noches.
--
-- El rango es daterange, que Postgres normaliza a [entrada, salida):
-- cerrado al inicio, abierto al final. Por eso la salida de un huésped y la
-- llegada del siguiente el MISMO DÍA no cuentan como traslape — una línea de
-- diseño que evita una categoría entera de bugs de calendario.
create table stay_blocks (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references stay_units (id) on delete cascade,
  stay            daterange not null,
  reason          block_reason not null,
  booking_item_id uuid,                       -- FK agregada en 0005
  -- Solo para reason='hold': cuándo deja de apartar inventario.
  expires_at      timestamptz,
  -- Marcar released_at saca la fila de la restricción de exclusión.
  -- Liberar inventario es un UPDATE, nunca un DELETE: la historia se conserva.
  released_at     timestamptz,
  note            text,
  created_by      uuid references staff_users (id),
  created_at      timestamptz not null default now(),

  constraint stay_blocks_not_empty check (not isempty(stay)),
  constraint stay_blocks_hold_has_expiry check (
    (reason = 'hold' and expires_at is not null)
    or (reason <> 'hold' and expires_at is null)
  ),

  -- ► LA GARANTÍA:
  -- dos filas activas de la misma unidad no pueden traslapar fechas.
  constraint stay_blocks_no_overlap
    exclude using gist (unit_id with =, stay with &&)
    where (released_at is null)
);

create index stay_blocks_unit_idx on stay_blocks (unit_id) where released_at is null;
create index stay_blocks_expiry_idx on stay_blocks (expires_at)
  where reason = 'hold' and released_at is null;

comment on constraint stay_blocks_no_overlap on stay_blocks is
  'Impide sobreventa a nivel de base de datos. No depende del código de la app.';

commit;
