-- 0016_aviso_admin_exige_destinatario.sql
--
-- Problema que resuelve, encontrado en producción el 2026-09-04:
-- `/api/health` reportaba un aviso muerto por cada reserva confirmada. No era
-- una falla de entrega —el transporte local no falla— sino de configuración:
-- `settings.notifications` no existe en esa base, así que el aviso al
-- administrador se encolaba con `to_address = ''`, agotaba sus seis intentos y
-- moría. Con una reserva es una fila; vendiendo, es una por reserva, y ese
-- ruido tapa los avisos muertos que sí importan.
--
-- La garantía 21 —"toda confirmación se encola con destinatario"— pasaba en
-- verde todo este tiempo **porque el seed de desarrollo carga ese ajuste**. Una
-- garantía que depende del seed no es una garantía; se corrige en el mismo
-- commit para que corra también sin el ajuste.
--
-- Por qué el aviso del huésped NO lleva la misma guarda: son fallas distintas.
-- Un huésped sin correo es un dato faltante de esa reserva, y ahí morir ruidoso
-- es lo correcto —alguien tiene que hablarle por teléfono, y así está escrito
-- en operacion.md §3.1. Un administrador sin correo es configuración ausente:
-- no se arregla reserva por reserva, se arregla una vez. Por eso se omite el
-- encolado y `/api/health` lo dice como lo que es, un ajuste que falta.
--
-- Es la misma forma que ya tenía `outbox_enqueue_whatsapp`, que no encola
-- cuando no hay número.

begin;

create or replace function booking_confirm(
  p_booking_id uuid,
  p_actor      text default 'system'
) returns booking_status
language plpgsql as $$
declare
  v_booking     bookings;
  v_customer    customers;
  v_deposit     bigint;
  v_admin_email text;
begin
  select * into v_booking from bookings where id = p_booking_id for update;

  if not found then
    raise exception 'La reserva % no existe', p_booking_id using errcode = 'AM003';
  end if;

  if v_booking.status = 'confirmed' then
    return v_booking.status;                       -- idempotente
  end if;

  if v_booking.status <> 'hold' then
    raise exception 'No se puede confirmar una reserva en estado %', v_booking.status
      using errcode = 'AM003';
  end if;

  -- El anticipo tiene que estar efectivamente cobrado.
  select coalesce(sum(amount_cents), 0) into v_deposit
    from payments
   where booking_id = p_booking_id
     and purpose = 'deposit'
     and status = 'succeeded';

  if v_deposit < v_booking.deposit_cents then
    raise exception 'Anticipo insuficiente: cobrado %, requerido %',
      v_deposit, v_booking.deposit_cents using errcode = 'AM003';
  end if;

  -- Las noches apartadas pasan de hold a ocupación firme.
  update stay_blocks sb
     set reason = 'booking', expires_at = null
   where sb.released_at is null
     and sb.reason = 'hold'
     and sb.booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  -- Los lugares apartados quedan confirmados (siguen contando en seats_taken).
  update tour_seat_holds tsh
     set confirmed_at = now(), expires_at = null
   where tsh.released_at is null
     and tsh.confirmed_at is null
     and tsh.booking_item_id in (select id from booking_items where booking_id = p_booking_id);

  update bookings
     set status = 'confirmed',
         confirmed_at = now(),
         deposit_due_at = null
   where id = p_booking_id;

  -- El saldo pendiente se registra como pago por cobrar, no como faltante.
  if v_booking.balance_cents > 0 then
    insert into payments (booking_id, purpose, status, method, provider, amount_cents, currency)
    values (p_booking_id, 'balance', 'pending', 'cash', 'onsite',
            v_booking.balance_cents, v_booking.currency);
  end if;

  insert into booking_events (booking_id, type, payload, actor_type, actor_id)
  values (p_booking_id, 'booking.confirmed',
          jsonb_build_object('deposit_cents', v_deposit,
                             'balance_cents', v_booking.balance_cents),
          'provider', p_actor);

  -- Avisos: mismo commit que la confirmación.
  select * into v_customer from customers where id = v_booking.customer_id;

  insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
  values (
    'email', 'booking_confirmed_guest', v_booking.locale,
    coalesce(v_customer.email, ''),
    jsonb_build_object('booking_code', v_booking.code),
    p_booking_id,
    'booking:' || p_booking_id || ':confirmed:guest'
  )
  on conflict (dedupe_key) do nothing;

  -- El aviso a la administración solo si hay a dónde mandarlo. Sin el ajuste
  -- cargado no se encola nada: una fila que no se puede entregar nunca no es un
  -- aviso pendiente, es basura que se hace pasar por falla de entrega.
  select nullif(trim(value ->> 'admin_email'), '') into v_admin_email
    from settings where key = 'notifications';

  if v_admin_email is not null then
    insert into outbox (channel, template, locale, to_address, payload, booking_id, dedupe_key)
    values (
      'email', 'booking_confirmed_admin', 'es', v_admin_email,
      jsonb_build_object('booking_code', v_booking.code),
      p_booking_id,
      'booking:' || p_booking_id || ':confirmed:admin'
    )
    on conflict (dedupe_key) do nothing;
  end if;

  -- Y por WhatsApp, si dejó número. Es el canal por el que este negocio ya se
  -- comunica: un correo se le pierde entre las promociones.
  perform outbox_enqueue_whatsapp(
    p_booking_id, 'booking_confirmed_guest',
    jsonb_build_object('booking_code', v_booking.code)
  );

  return 'confirmed'::booking_status;
end;
$$;

commit;
