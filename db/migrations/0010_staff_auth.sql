-- 0010_staff_auth.sql
-- Sprint 4: acceso del staff al panel.
--
-- Se elige **enlace por correo en lugar de contraseña**, por tres razones que
-- pesan en este negocio concreto:
--
-- 1. No se guardan contraseñas. Un operador turístico chico no tiene cómo
--    responder a una filtración de credenciales, y la mejor forma de no tener
--    ese problema es no tener el dato.
-- 2. El staff es de tres a seis personas con alta rotación estacional. Dar y
--    quitar acceso es activar o desactivar una fila, no un trámite.
-- 3. Recepción entra desde el teléfono. Un enlace que se toca es menos fricción
--    que una contraseña escrita con una mano mientras se atiende a alguien.
--
-- La sesión vive en la base y no solo en una cookie firmada: una cookie firmada
-- no se puede revocar, y aquí hace falta poder cerrarle la sesión a alguien que
-- dejó de trabajar el mismo día que se va.

begin;

-- ---------------------------------------------------------------------------
-- Enlaces de acceso
-- ---------------------------------------------------------------------------

create table staff_login_tokens (
  id            uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references staff_users (id) on delete cascade,
  -- Solo el hash. Quien lea la base no puede entrar con lo que encuentre.
  token_hash    text not null unique,
  expires_at    timestamptz not null,
  -- Un enlace sirve una vez. Reenviar el correo genera uno nuevo.
  used_at       timestamptz,
  requested_ip  inet,
  created_at    timestamptz not null default now()
);

create index staff_login_tokens_pending_idx on staff_login_tokens (expires_at)
  where used_at is null;

-- ---------------------------------------------------------------------------
-- Sesiones
-- ---------------------------------------------------------------------------

create table staff_sessions (
  id            uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references staff_users (id) on delete cascade,
  token_hash    text not null unique,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  user_agent    text,
  ip            inet,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index staff_sessions_active_idx on staff_sessions (staff_user_id)
  where revoked_at is null;

comment on table staff_sessions is
  'Sesión con estado en la base para poder revocarla. Una cookie firmada sola no se puede cancelar.';

-- ---------------------------------------------------------------------------
-- Cobro del saldo en destino
-- ---------------------------------------------------------------------------

-- El saldo se registra al confirmar como un pago pendiente (ver booking_confirm).
-- Cobrarlo es marcarlo, dejando rastro de quién y cómo. La mayoría se paga en
-- efectivo, y el efectivo sin rastro es la diferencia entre un faltante
-- explicable y uno que no lo es.
create or replace function booking_collect_balance(
  p_booking_id uuid,
  p_staff_id   uuid,
  p_method     payment_method,
  p_amount     bigint default null
) returns bigint
language plpgsql as $$
declare
  v_payment  payments;
  v_booking  bookings;
  v_amount   bigint;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'La reserva % no existe', p_booking_id using errcode = 'AM003';
  end if;

  if v_booking.status not in ('confirmed', 'in_progress', 'completed') then
    raise exception 'No se puede cobrar el saldo de una reserva en estado %', v_booking.status
      using errcode = 'AM003';
  end if;

  select * into v_payment
    from payments
   where booking_id = p_booking_id and purpose = 'balance' and status = 'pending'
   order by created_at
   limit 1
     for update;

  if not found then
    raise exception 'Esta reserva no tiene saldo pendiente' using errcode = 'AM003';
  end if;

  v_amount := coalesce(p_amount, v_payment.amount_cents);

  if v_amount <> v_payment.amount_cents then
    -- Un cobro parcial es un caso real, pero necesita decisión de negocio que
    -- todavía no existe. Se rechaza en lugar de inventar una regla.
    raise exception 'El cobro parcial del saldo no está soportado: se esperaban % centavos', v_payment.amount_cents
      using errcode = 'AM003';
  end if;

  update payments
     set status = 'succeeded',
         method = p_method,
         paid_at = now(),
         collected_by = p_staff_id
   where id = v_payment.id;

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id, 'balance.collected',
          jsonb_build_object('amount_cents', v_amount, 'method', p_method::text),
          'staff', p_staff_id::text);

  return v_amount;
end;
$$;

commit;
