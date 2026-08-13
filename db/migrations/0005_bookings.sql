-- 0005_bookings.sql
-- Núcleo compartido: una reserva de tour y una de estancia producen
-- exactamente el mismo expediente. Es el eje de reutilización del sistema.

begin;

-- ---------------------------------------------------------------------------
-- Huéspedes que compran
-- ---------------------------------------------------------------------------

create table customers (
  id                uuid primary key default gen_random_uuid(),
  email             text,
  phone             text,
  full_name         text not null,
  locale            text not null default 'es' check (locale in ('es', 'en')),
  country           char(2),
  marketing_opt_in  boolean not null default false,
  -- Se guarda el consentimiento, no solo la casilla: fecha y versión del aviso.
  privacy_accepted_at timestamptz,
  privacy_version   text,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index customers_email_key on customers (lower(email)) where email is not null;
create index customers_phone_idx on customers (phone) where phone is not null;

create trigger customers_touch before update on customers
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------------

-- Código corto para decir por teléfono: sin caracteres ambiguos (0/O, 1/I).
create or replace function generate_booking_code() returns text
language plpgsql as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
begin
  loop
    v_code := 'AM-' || (
      select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from bookings where code = v_code);
  end loop;
  return v_code;
end;
$$;

create table bookings (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default generate_booking_code(),
  customer_id  uuid not null references customers (id),
  status       booking_status not null default 'hold',
  currency     char(3) not null default 'MXN',

  -- Dinero. Enteros en centavos, siempre.
  total_cents   bigint not null check (total_cents >= 0),
  -- Porcentaje de anticipo CONGELADO al momento de reservar. Se resuelve con
  -- resolve_deposit_pct() (producto → settings) y el staff puede ajustarlo
  -- antes de cobrar. Cambiarlo después no altera reservas ya tomadas.
  deposit_pct   numeric(5, 2) not null check (deposit_pct >= 0 and deposit_pct <= 100),
  deposit_cents bigint not null check (deposit_cents >= 0),
  -- Lo que se cobra en destino. Derivado, para que no pueda desalinearse.
  balance_cents bigint generated always as (total_cents - deposit_cents) stored,

  -- Desglose completo de la cotización, no solo el total: en seis meses
  -- alguien va a preguntar por qué esa noche costó eso, y la tarifa de
  -- temporada ya habrá cambiado. Formato en docs/esquema.md.
  quote        jsonb not null,
  fx_rate      numeric(12, 6),                 -- si se cotizó en otra moneda
  fx_base      char(3),

  -- Copia congelada de la política vigente al reservar.
  cancellation_policy_id       uuid references cancellation_policies (id),
  cancellation_policy_snapshot jsonb,

  -- Vencimiento del hold: si el anticipo no llega antes, el job lo expira.
  deposit_due_at timestamptz,
  confirmed_at   timestamptz,
  cancelled_at   timestamptz,
  cancel_reason  text,

  source       text not null default 'web',    -- web | admin | phone
  locale       text not null default 'es',
  guest_note   text,
  staff_note   text,
  created_by   uuid references staff_users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint bookings_deposit_within_total check (deposit_cents <= total_cents),
  constraint bookings_hold_has_due_date check (
    status <> 'hold' or deposit_due_at is not null
  )
);

create index bookings_status_idx on bookings (status, created_at desc);
-- Índice que usa el job de expiración cada minuto.
create index bookings_expiring_idx on bookings (deposit_due_at)
  where status = 'hold';
create index bookings_customer_idx on bookings (customer_id, created_at desc);

create trigger bookings_touch before update on bookings
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Renglones: una reserva puede llevar un tour Y dos noches
-- ---------------------------------------------------------------------------

create table booking_items (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings (id) on delete cascade,
  kind          product_kind not null,
  product_id    uuid not null references products (id),

  -- Solo para kind = 'stay'
  stay_unit_id  uuid references stay_units (id),
  stay_range    daterange,
  guests        integer check (guests > 0),

  -- Solo para kind = 'tour'
  tour_departure_id uuid references tour_departures (id),
  seats             integer check (seats > 0),
  pax_breakdown     jsonb,                    -- {"adult": 2, "child": 1}

  subtotal_cents bigint not null check (subtotal_cents >= 0),
  quote          jsonb not null,              -- desglose de este renglón
  created_at     timestamptz not null default now(),

  -- Un renglón es de estancia o de tour, nunca ambos ni ninguno.
  constraint booking_items_shape check (
    (kind = 'stay'
      and stay_unit_id is not null and stay_range is not null and guests is not null
      and tour_departure_id is null and seats is null)
    or
    (kind = 'tour'
      and tour_departure_id is not null and seats is not null
      and stay_unit_id is null and stay_range is null)
  )
);

create index booking_items_booking_idx on booking_items (booking_id);
create index booking_items_stay_idx on booking_items (stay_unit_id) where stay_unit_id is not null;
create index booking_items_departure_idx on booking_items (tour_departure_id) where tour_departure_id is not null;

-- Ahora que existe booking_items, cerramos las FK del inventario.
alter table stay_blocks
  add constraint stay_blocks_booking_item_fk
  foreign key (booking_item_id) references booking_items (id) on delete set null;

alter table tour_seat_holds
  add constraint tour_seat_holds_booking_item_fk
  foreign key (booking_item_id) references booking_items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Pax
-- ---------------------------------------------------------------------------

-- Datos de las personas. Son datos personales: acceso por rol, retención
-- acotada y documentos solo si el negocio lo exige.
create table booking_guests (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings (id) on delete cascade,
  booking_item_id uuid references booking_items (id) on delete cascade,
  is_lead         boolean not null default false,
  full_name       text not null,
  pax_type        pax_type not null default 'adult',
  birthdate       date,
  email           text,
  phone           text,
  doc_type        text,
  doc_last4       text,                        -- nunca el documento completo
  dietary_note    text,
  created_at      timestamptz not null default now()
);

create index booking_guests_booking_idx on booking_guests (booking_id);
create unique index booking_guests_one_lead_idx on booking_guests (booking_id)
  where is_lead;

-- ---------------------------------------------------------------------------
-- Bitácora de la reserva
-- ---------------------------------------------------------------------------

-- Append-only. Cada transición escribe aquí el HECHO que la provocó, no el
-- cambio que produjo: es lo que permite reconstruir después qué pasó.
create table booking_events (
  id          bigserial primary key,
  booking_id  uuid not null references bookings (id) on delete cascade,
  type        text not null,                  -- 'hold.created', 'deposit.paid'
  payload     jsonb not null default '{}'::jsonb,
  actor_type  text not null default 'system', -- system | staff | guest | provider
  actor_id    text,
  created_at  timestamptz not null default now()
);

create index booking_events_booking_idx on booking_events (booking_id, created_at);

commit;
