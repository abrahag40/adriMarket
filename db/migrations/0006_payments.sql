-- 0006_payments.sql
-- Dinero. Dos hechos que el modelo tiene que soportar sin trampas:
--   1. En línea se cobra SOLO el anticipo; el saldo se cobra en destino.
--   2. La reserva se confirma con el webhook de la pasarela, no con el
--      regreso del navegador — y el mismo webhook puede llegar diez veces.

begin;

-- ---------------------------------------------------------------------------
-- Cupones
-- ---------------------------------------------------------------------------

create table coupons (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  kind            coupon_kind not null,
  value           numeric(12, 2) not null check (value > 0), -- % o centavos según kind
  currency        char(3),
  min_total_cents bigint not null default 0,
  max_redemptions integer,
  redemptions     integer not null default 0,
  valid_from      timestamptz,
  valid_to        timestamptz,
  applies_to      jsonb not null default '{}'::jsonb,  -- {"kind":"tour"} | {"product_ids":[...]}
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint coupons_fixed_needs_currency check (kind <> 'fixed' or currency is not null),
  constraint coupons_percent_range check (kind <> 'percent' or value <= 100),
  constraint coupons_redemptions_ok check (
    max_redemptions is null or redemptions <= max_redemptions
  )
);

create unique index coupons_code_key on coupons (upper(code));

create trigger coupons_touch before update on coupons
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pagos
-- ---------------------------------------------------------------------------

-- Una fila por intento de cobro. El anticipo (tarjeta) y el saldo (efectivo
-- en destino) son filas distintas del mismo tipo: así el saldo pendiente es
-- un pago 'pending', no un dato faltante.
create table payments (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references bookings (id) on delete cascade,
  purpose        payment_purpose not null,
  status         payment_status not null default 'pending',
  method         payment_method not null default 'card',
  provider       text,                         -- stripe | mercadopago | onsite
  -- Referencia del proveedor (PaymentIntent). Única: evita duplicar el cobro.
  provider_ref   text,
  amount_cents   bigint not null check (amount_cents >= 0),
  currency       char(3) not null,
  fee_cents      bigint,                       -- comisión de la pasarela
  net_cents      bigint,                       -- lo que realmente se deposita
  fx_rate        numeric(12, 6),
  paid_at        timestamptz,
  failed_reason  text,
  -- Quién cobró el saldo en el mostrador. Trazabilidad de efectivo.
  collected_by   uuid references staff_users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index payments_provider_ref_key on payments (provider, provider_ref)
  where provider_ref is not null;
create index payments_booking_idx on payments (booking_id, purpose);
create index payments_pending_balance_idx on payments (status)
  where purpose = 'balance' and status = 'pending';

create trigger payments_touch before update on payments
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Eventos del proveedor: la idempotencia vive aquí
-- ---------------------------------------------------------------------------

-- Todo webhook se guarda ANTES de procesarse, con su id de evento único.
-- Si el mismo evento llega otra vez, el insert falla por clave duplicada y el
-- procesamiento se salta: una reserva, un correo, sin importar cuántas veces
-- reintente Stripe.
create table payment_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  provider_event_id text not null,
  type              text not null,
  payment_id        uuid references payments (id) on delete set null,
  booking_id        uuid references bookings (id) on delete set null,
  payload           jsonb not null,
  signature_ok      boolean not null default false,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  process_error     text,
  unique (provider, provider_event_id)
);

create index payment_events_unprocessed_idx on payment_events (received_at)
  where processed_at is null;

comment on constraint payment_events_provider_provider_event_id_key on payment_events is
  'Idempotencia de webhooks: el mismo evento no se procesa dos veces.';

-- ---------------------------------------------------------------------------
-- Reembolsos
-- ---------------------------------------------------------------------------

create table refunds (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references payments (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  currency     char(3) not null,
  reason       text,
  provider_ref text,
  status       payment_status not null default 'pending',
  created_by   uuid references staff_users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index refunds_payment_idx on refunds (payment_id);

create trigger refunds_touch before update on refunds
  for each row execute function touch_updated_at();

commit;
