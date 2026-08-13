-- 0001_foundation.sql
-- Extensiones, tipos y piezas de plataforma.
--
-- Convención del proyecto: identificadores en inglés, comentarios en español.
-- Todo monto es un entero en centavos (bigint) con su moneda explícita.
-- Nunca se usan decimales flotantes para dinero.

begin;

-- btree_gist permite combinar '=' sobre uuid con '&&' sobre daterange
-- dentro de una misma restricción de exclusión (ver 0003_stays.sql).
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type product_kind as enum ('tour', 'stay');
create type product_status as enum ('draft', 'published', 'archived');

create type booking_status as enum (
  'hold',        -- inventario apartado, esperando el anticipo
  'confirmed',   -- anticipo cobrado
  'in_progress', -- check-in hecho / tour en curso
  'completed',   -- servicio prestado y saldo cobrado
  'cancelled',   -- cancelada por el huésped o por el staff
  'expired',     -- el hold venció sin pago
  'no_show'      -- confirmada, pero el huésped no llegó
);

create type block_reason as enum (
  'hold',        -- apartado temporal durante el checkout
  'booking',     -- reserva confirmada
  'maintenance', -- mantenimiento
  'owner_use',   -- uso del propietario
  'other'
);

create type departure_status as enum ('open', 'closed', 'cancelled');

create type pax_type as enum ('adult', 'child', 'infant');

create type payment_purpose as enum ('deposit', 'balance', 'penalty');

create type payment_status as enum (
  'pending', 'processing', 'succeeded', 'failed',
  'cancelled', 'refunded', 'partially_refunded'
);

create type payment_method as enum (
  'card', 'cash', 'transfer', 'oxxo', 'spei', 'other'
);

create type staff_role as enum ('owner', 'manager', 'front_desk', 'guide');

create type coupon_kind as enum ('percent', 'fixed');

create type tax_kind as enum ('percent', 'fixed_per_night', 'fixed_per_pax');

create type notification_channel as enum ('email', 'whatsapp', 'sms');

create type notification_status as enum ('pending', 'sending', 'sent', 'failed', 'dead');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Mantiene updated_at sin depender de que la aplicación lo recuerde.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuración editable desde el panel
-- ---------------------------------------------------------------------------

-- Valores que el cliente cambia sin redeploy. El porcentaje de anticipo vive
-- aquí como valor por omisión; cada producto puede sobreescribirlo y cada
-- reserva guarda el suyo congelado (ver resolve_deposit_pct en 0008).
create table settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

comment on table settings is
  'Ajustes editables en caliente. Una fila por concepto, valor en jsonb.';

-- ---------------------------------------------------------------------------
-- Staff y bitácora
-- ---------------------------------------------------------------------------

create table staff_users (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,                       -- id del proveedor de identidad
  email        text not null,
  full_name    text not null,
  role         staff_role not null default 'front_desk',
  active       boolean not null default true,
  last_login_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index staff_users_email_key on staff_users (lower(email));

create trigger staff_users_touch before update on staff_users
  for each row execute function touch_updated_at();

-- Quién cambió qué. Se escribe desde la frontera de cada módulo, nunca
-- desde el navegador.
create table audit_log (
  id             bigserial primary key,
  actor_staff_id uuid references staff_users (id),
  actor_label    text,                            -- 'system', 'webhook:stripe', etc.
  action         text not null,                   -- 'booking.refund', 'rate.update'
  entity         text not null,
  entity_id      text,
  before         jsonb,
  after          jsonb,
  ip             inet,
  created_at     timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);

commit;
