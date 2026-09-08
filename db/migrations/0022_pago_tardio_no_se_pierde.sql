-- 0022_pago_tardio_no_se_pierde.sql
--
-- Qué hacer cuando el dinero llega y la reserva ya no está.
--
-- ---------------------------------------------------------------------------
-- El defecto
-- ---------------------------------------------------------------------------
--
-- Stripe **no permite** una sesión de pago más corta que 30 minutos. El
-- apartado duraba 15. Entre el minuto 15 y el 30 el huésped podía pagar por
-- fechas que el latido ya había liberado, y entonces:
--
--   1. el webhook registraba el pago —el dinero es real—;
--   2. `booking_confirm` rechazaba con AM003, porque la reserva estaba en
--      `expired` y no en `hold`;
--   3. la excepción tumbaba la transacción entera, **borrando el registro del
--      pago y hasta el del evento**;
--   4. la ruta respondía 500, y Stripe reintentaba durante tres días fallando
--      idéntico.
--
-- Resultado: el huésped sin reserva, el dinero cobrado, y **ni un renglón en la
-- base que lo mencionara**. Solo Stripe lo sabía. Se reprodujo a mano antes de
-- escribir esto: `pagos registrados: 0, eventos registrados: 0`.
--
-- La causa raíz se cierra subiendo el apartado por encima del piso de Stripe
-- (35 minutos, ver `HOLD_MINUTES_MINIMO`). Esta función es lo otro: la red
-- debajo, para el pago que igual llegue tarde —un webhook demorado, un reloj
-- desfasado, una cancelación en el intervalo—.
--
-- ---------------------------------------------------------------------------
-- La decisión
-- ---------------------------------------------------------------------------
--
-- **El dinero que entró se registra siempre, aunque la reserva ya no exista.**
-- No confirmar es correcto —el inventario puede haberse vendido a otro—, pero
-- perder el rastro no lo es nunca.
--
-- Así que se anota el pago, se registra la devolución que corresponde, queda en
-- la bitácora de la reserva y se avisa a la administración. La devolución cae
-- en `/admin/reembolsos` como cualquier otra: cómo, cuándo y quién, con su
-- comprobante.

begin;

create or replace function booking_register_late_payment(
  p_booking_id   uuid,
  p_provider     text,
  p_provider_ref text,
  p_amount_cents bigint,
  p_currency     char(3)
) returns uuid
language plpgsql as $$
declare
  v_booking     bookings;
  v_payment_id  uuid;
  v_admin_email text;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'La reserva % no existe', p_booking_id using errcode = 'AM003';
  end if;

  -- El pago, tal cual entró. `on conflict` porque el proveedor reintenta.
  insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                        amount_cents, currency, paid_at)
  values (p_booking_id, 'deposit', 'succeeded', 'card', p_provider, p_provider_ref,
          p_amount_cents, p_currency, now())
  on conflict (provider, provider_ref) where provider_ref is not null do nothing
  returning id into v_payment_id;

  -- Si el insert no devolvió nada es que ya estaba: se busca.
  if v_payment_id is null then
    select id into v_payment_id from payments
     where provider = p_provider and provider_ref = p_provider_ref;
  end if;

  -- Y la devolución que le toca, por el total: el huésped no recibió nada.
  -- `on conflict` no aplica aquí porque `refunds` no tiene clave natural, así
  -- que se comprueba a mano para que un reintento no registre dos.
  if not exists (
    select 1 from refunds
     where payment_id = v_payment_id and reason = 'Pago recibido después de vencer el apartado'
  ) then
    insert into refunds (payment_id, amount_cents, currency, reason, status)
    values (v_payment_id, p_amount_cents, p_currency,
            'Pago recibido después de vencer el apartado', 'pending');
  end if;

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id, 'payment.late',
          jsonb_build_object('provider_ref', p_provider_ref,
                             'amount_cents', p_amount_cents,
                             'booking_status', v_booking.status),
          'provider', p_provider)
  on conflict do nothing;

  -- El aviso, con la misma disciplina que la garantía 21: solo si hay a dónde
  -- mandarlo. Una fila que no se puede entregar nunca no es un aviso pendiente.
  select nullif(trim(value ->> 'admin_email'), '') into v_admin_email
    from settings where key = 'notifications';

  if v_admin_email is not null then
    insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
    values ('email', 'payment_late_admin', 'es', v_admin_email,
            jsonb_build_object('booking_code', v_booking.code,
                               'amount_cents', p_amount_cents,
                               'booking_status', v_booking.status),
            p_booking_id,
            'booking:' || p_booking_id || ':late_payment:' || p_provider_ref)
    on conflict (dedupe_key) do nothing;
  end if;

  return v_payment_id;
end;
$$;

comment on function booking_register_late_payment is
  'Pago que llega cuando la reserva ya no está en hold: se registra, se devuelve y se avisa. Nunca se pierde.';

commit;
