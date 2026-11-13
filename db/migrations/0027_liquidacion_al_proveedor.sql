-- 0027_liquidacion_al_proveedor.sql
--
-- En un sitio que revende (decisión 0025), el dinero entra completo a la cuenta
-- del sitio y **lo del proveedor sale a mano**: Abraham le transfiere a Alexis,
-- por SPEI, el 100 % de su precio por cada reserva cobrada. Es dinero que sale,
-- y se audita igual que una devolución (migración 0021): una transferencia no
-- puede registrarse sin decir cuánto, cuándo, cómo, con qué referencia y quién.
--
-- Lo que agrega:
--
--   1. `payments.card_country`: el país de la tarjeta, leído del cargo. Junto
--      con `fee_cents` y `net_cents` —que existían desde la 0006 y nadie
--      llenaba—, dice cuánto se quedó la pasarela **de verdad**. El precio se
--      calcula con la tasa de tarjeta extranjera (4.1 %); con una mexicana
--      (3.6 %) la diferencia es del sitio, y aquí se ve venta por venta.
--
--   2. `supplier_payouts`: una transferencia al proveedor por reserva.
--
--   3. `supplier_payout_record(...)`: el único camino para registrarla. **El
--      monto no se captura: es `bookings.supplier_cents`**, el que se congeló
--      al reservar. Un formulario que pidiera el monto invitaría a escribirlo
--      mal; aquí no hay nada que escribir.
--
-- Ver docs/decisiones/0026-la-liquidacion-al-proveedor.md.

begin;

-- 1. El país de la tarjeta ----------------------------------------------------

alter table payments
  add column card_country char(2),
  add constraint payments_card_country_check
    check (card_country is null or card_country ~ '^[A-Z]{2}$'),
  add constraint payments_fee_cents_check
    check (fee_cents is null or fee_cents >= 0);

comment on column payments.card_country is
  'País emisor de la tarjeta (ISO 3166-1), leído del cargo de la pasarela. Con fee_cents dice cuánto cobró la pasarela de verdad.';
comment on column payments.fee_cents is
  'Lo que se quedó la pasarela de este cobro, impuestos incluidos, leído de su registro contable (balance transaction).';

-- 2. Las transferencias al proveedor -------------------------------------------

create table supplier_payouts (
  id           uuid primary key default gen_random_uuid(),
  -- Una por reserva: se le paga una vez lo que se le debe por ella.
  booking_id   uuid not null unique references bookings (id),
  amount_cents bigint not null check (amount_cents > 0),
  currency     char(3) not null,
  method       payment_method not null,
  -- La clave de rastreo del SPEI o el folio: con lo que se localiza en el banco.
  reference    text not null check (length(btrim(reference)) > 0),
  -- Cuándo salió el dinero de verdad, no cuándo se registró.
  paid_on      date not null,
  paid_by      uuid not null references staff_users (id),
  notes        text,
  created_at   timestamptz not null default now()
);

comment on table supplier_payouts is
  'Reventa: lo que se le transfirió al proveedor por cada reserva, con cómo, cuándo, referencia y quién. Decisión 0026.';

-- El monto es el que se le debe, también por SQL a mano: la función de abajo es
-- el camino del panel, pero no el único camino a la tabla —el procedimiento
-- viejo de las devoluciones era un UPDATE contra producción (migración 0021)—.
create or replace function supplier_payouts_amount_guard()
returns trigger
language plpgsql as $$
declare
  v_debe bigint;
begin
  select supplier_cents into v_debe from bookings where id = new.booking_id;
  if v_debe is null or new.amount_cents <> v_debe then
    raise exception 'Se le debe % al proveedor por esta reserva, no %', v_debe, new.amount_cents
      using errcode = 'AM006';
  end if;
  return new;
end;
$$;

create trigger supplier_payouts_amount_guard
  before insert or update of amount_cents, booking_id on supplier_payouts
  for each row execute function supplier_payouts_amount_guard();

-- 3. El único camino para registrarla ------------------------------------------

create or replace function supplier_payout_record(
  p_booking_id uuid,
  p_paid_on    date,
  p_method     payment_method,
  p_reference  text,
  p_notes      text,
  p_staff_id   uuid
) returns uuid
language plpgsql as $$
declare
  v_booking record;
  v_id      uuid;
begin
  select id, status, supplier_cents, currency into v_booking
    from bookings where id = p_booking_id for update;

  if v_booking.id is null then
    raise exception 'La reserva no existe' using errcode = 'AM006';
  end if;
  if v_booking.supplier_cents is null then
    raise exception 'Esta reserva no es de reventa: no hay nada que transferirle al proveedor'
      using errcode = 'AM006';
  end if;
  -- Sólo lo cobrado se liquida. Una cancelada se resuelve con su política, y lo
  -- que le toque al proveedor ahí es otra conversación.
  if v_booking.status not in ('confirmed', 'in_progress', 'completed', 'no_show') then
    raise exception 'La reserva está en «%»: sólo se le transfiere al proveedor lo cobrado', v_booking.status
      using errcode = 'AM006';
  end if;
  if not exists (select 1 from payments
                  where booking_id = p_booking_id and status = 'succeeded') then
    raise exception 'La reserva no tiene un cobro registrado' using errcode = 'AM006';
  end if;
  if p_staff_id is null then
    raise exception 'Una transferencia necesita a quien la registra' using errcode = 'AM006';
  end if;
  if p_reference is null or length(btrim(p_reference)) = 0 then
    raise exception 'Una transferencia necesita su clave de rastreo o folio' using errcode = 'AM006';
  end if;
  -- Un día de holgura por la zona horaria: en Cancún todavía puede ser ayer.
  if p_paid_on is null or p_paid_on > current_date + 1 then
    raise exception 'La fecha de la transferencia no puede ser futura' using errcode = 'AM006';
  end if;

  insert into supplier_payouts (booking_id, amount_cents, currency, method, reference,
                                paid_on, paid_by, notes)
  values (p_booking_id, v_booking.supplier_cents, v_booking.currency, p_method,
          btrim(p_reference), p_paid_on, p_staff_id, nullif(btrim(p_notes), ''))
  returning id into v_id;

  perform audit_record(p_staff_id, 'supplier_payout.record', 'booking', p_booking_id::text, null,
                       jsonb_build_object('amount_cents', v_booking.supplier_cents,
                                          'method', p_method, 'reference', btrim(p_reference),
                                          'paid_on', p_paid_on));
  return v_id;
end;
$$;

commit;
