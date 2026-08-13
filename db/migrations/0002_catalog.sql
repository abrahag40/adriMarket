-- 0002_catalog.sql
-- Catálogo compartido por tours y estancias.
--
-- 'products' es el tronco común: lo que el huésped ve como una ficha.
-- El inventario y las reglas de precio viven en módulos separados
-- (0003_stays.sql, 0004_tours.sql) porque no se parecen en nada.

begin;

-- ---------------------------------------------------------------------------
-- Ubicaciones
-- ---------------------------------------------------------------------------

create table locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  city       text,
  state      text,
  country    char(2) not null default 'MX',
  lat        numeric(9, 6),
  lng        numeric(9, 6),
  -- Quintana Roo es America/Cancun (UTC-5, SIN horario de verano), distinto
  -- del resto del país. Nunca se asume la zona del servidor.
  timezone   text not null default 'America/Cancun',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger locations_touch before update on locations
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Políticas de cancelación
-- ---------------------------------------------------------------------------

-- Las reglas se guardan como datos, no como código, y cada reserva se lleva
-- una copia congelada de la política vigente al momento de reservar.
create table cancellation_policies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  -- [{"hours_before": 168, "refund_pct": 100}, {"hours_before": 48, "refund_pct": 50}]
  rules              jsonb not null default '[]'::jsonb,
  deposit_refundable boolean not null default false,
  text_es            text,
  text_en            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger cancellation_policies_touch before update on cancellation_policies
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Impuestos
-- ---------------------------------------------------------------------------

-- ISH e IVA cambian por decreto: son configuración, no constantes.
create table tax_rates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  kind              tax_kind not null default 'percent',
  rate              numeric(8, 4) not null check (rate >= 0),
  applies_to        product_kind,                 -- null = ambos
  location_id       uuid references locations (id) on delete cascade,
  included_in_price boolean not null default false,
  active            boolean not null default true,
  valid_from        date,
  valid_to          date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger tax_rates_touch before update on tax_rates
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------

create table products (
  id                     uuid primary key default gen_random_uuid(),
  kind                   product_kind not null,
  slug                   text not null unique,
  status                 product_status not null default 'draft',
  location_id            uuid references locations (id),
  cancellation_policy_id uuid references cancellation_policies (id),
  currency               char(3) not null default 'MXN',
  -- Sobreescribe el porcentaje de anticipo global para este producto.
  -- null = usar el valor por omisión de 'settings'.
  deposit_pct            numeric(5, 2) check (deposit_pct >= 0 and deposit_pct <= 100),
  position               integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index products_kind_status_idx on products (kind, status);

create trigger products_touch before update on products
  for each row execute function touch_updated_at();

comment on column products.deposit_pct is
  'Anticipo en % para este producto. null hereda settings.deposit.default_pct';

-- El texto vive aparte para tener español e inglés sin duplicar el producto
-- ni su inventario.
create table product_translations (
  product_id       uuid not null references products (id) on delete cascade,
  locale           text not null check (locale in ('es', 'en')),
  name             text not null,
  summary          text,
  description      text,
  highlights       jsonb not null default '[]'::jsonb,
  included         jsonb not null default '[]'::jsonb,
  excluded         jsonb not null default '[]'::jsonb,
  meta_title       text,
  meta_description text,
  primary key (product_id, locale)
);

create table product_media (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  url        text not null,
  kind       text not null default 'image',
  alt_es     text,
  alt_en     text,
  width      integer,
  height     integer,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_media_product_idx on product_media (product_id, position);

create table tags (
  id     uuid primary key default gen_random_uuid(),
  slug   text not null unique,
  name_es text not null,
  name_en text
);

create table product_tags (
  product_id uuid not null references products (id) on delete cascade,
  tag_id     uuid not null references tags (id) on delete cascade,
  primary key (product_id, tag_id)
);

commit;
