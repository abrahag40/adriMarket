-- 0007_notifications.sql
-- Bandeja de salida transaccional.
--
-- Problema que resuelve: si se confirma la reserva y luego se intenta enviar
-- el correo, un proveedor caído deja una reserva cobrada sin aviso — o peor,
-- se reintenta todo y se duplica la reserva.
--
-- Solución: confirmar la reserva y ENCOLAR el aviso ocurren en la misma
-- transacción. El envío real lo hace un worker aparte, con reintentos.
-- La confirmación puede tardar treinta segundos, pero no se pierde.

begin;

create table outbox (
  id              uuid primary key default gen_random_uuid(),
  channel         notification_channel not null,
  template        text not null,               -- 'booking_confirmed', 'reminder_72h'
  locale          text not null default 'es',
  to_address      text not null,               -- correo o teléfono E.164
  payload         jsonb not null default '{}'::jsonb,
  booking_id      uuid references bookings (id) on delete cascade,
  -- Segunda línea de defensa contra duplicados: aunque una transición se
  -- ejecute dos veces, el aviso se encola una sola vez.
  dedupe_key      text not null,
  status          notification_status not null default 'pending',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at         timestamptz,
  last_error      text,
  provider_ref    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dedupe_key)
);

-- El worker toma trabajo con esta consulta, así que el índice va sobre ella.
create index outbox_due_idx on outbox (next_attempt_at)
  where status in ('pending', 'failed');
create index outbox_booking_idx on outbox (booking_id);

create trigger outbox_touch before update on outbox
  for each row execute function touch_updated_at();

comment on column outbox.dedupe_key is
  'Ej: booking:<uuid>:confirmed:guest. Único, así el aviso no se duplica.';

commit;
