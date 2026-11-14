-- 0026_reventa.sql
--
-- Un sitio que **revende**: el catálogo guarda el precio del proveedor, tal
-- como él lo define, y el huésped paga ese precio más la comisión del sitio
-- más lo que cobra la pasarela. Es ZaharDev Tours: ZaharDev cobra el 100 % con
-- su cuenta de Stripe y le transfiere a mano al operador lo suyo.
--
-- Ver docs/decisiones/0025-reventa-el-precio-del-proveedor.md.
--
-- Lo que agrega:
--
--   1. `resale_price(cents, carries_fixed)`: **la única** implementación de la
--      fórmula. Todo lector de precios de tour que enseña o cobra algo al
--      huésped pasa por aquí —la tarjeta del listado, la ficha, el calendario,
--      los extras y la cotización—, así que no hay dos copias que se puedan
--      separar. Sin `settings.resale` devuelve el precio tal cual: adriMarket y
--      Conquest no se enteran.
--
--   2. `settings_set_resale(...)`: la configuración, con bitácora. Cambiarla
--      cambia el precio de todo el catálogo; tiene que quedar escrito quién y
--      cuándo.
--
--   3. En un sitio que revende, **el anticipo es siempre el 100 %**: la fórmula
--      supone que todo el dinero pasa por la pasarela. Un saldo en destino no
--      pagaría comisión de Stripe y el reparto dejaría de cuadrar.
--
--   4. En un sitio que revende, **los impuestos van dentro del precio**. Un
--      impuesto sumado aparte también pasaría por la pasarela, que cobraría su
--      tasa sobre él, y el sitio quedaría debajo de su comisión: con IVA
--      encima, una reserva de MXN 3,000 del proveedor deja 50.41 en lugar de
--      75.00. Medido el 2026-11-13 contra la base local.
--
--   5. `bookings.supplier_cents`: lo que se le debe al proveedor por esa
--      reserva, congelado al reservar. Es lo que se le transfiere.

begin;

-- 1. El precio al público -----------------------------------------------------
--
--   precio = ⌈ (proveedor × (1 + comisión) + fijo × (1 + IVA)) ÷ (1 − tasa × (1 + IVA)) ⌉, al peso
--
-- El divisor es lo que hace cuadrar el reparto: la pasarela cobra su tasa sobre
-- el TOTAL, no sobre el precio del proveedor, y el IVA va sobre su comisión.
-- Despejado así, después de que la pasarela se lleva lo suyo quedan exactamente
-- el precio del proveedor y la comisión del sitio.
--
-- **El cargo fijo va sólo en el precio "principal"** (`carries_fixed`): el de
-- adulto y el del barco. Es por cobro, no por persona, y toda reserva lleva al
-- menos uno de los dos —el motor no cotiza sin adulto, y un barco siempre lleva
-- su renglón—, así que se cobra siempre. Niños, infantes, extras y la cuota de
-- muelle llevan sólo la parte en porcentaje. Con más de un adulto se cobra más
-- de una vez: la diferencia es del sitio, nunca del huésped de más en un precio
-- que no se exhibió.
--
-- **Se redondea hacia arriba, al peso entero.** Hacia arriba, porque con el
-- redondeo normal el sitio podría quedar debajo de su comisión. Al peso, porque
-- el sitio exhibe los precios sin centavos (`formatMoney`): con centavos, la
-- ficha diría «$1,614» y se cobrarían 1,614.28, 28 centavos más que lo exhibido.
-- Medido el 2026-11-13 en el panel local. Al peso, lo exhibido y lo cobrado son
-- el mismo número; la diferencia (menos de un peso por precio) es del sitio.
create or replace function resale_price(p_cents bigint, p_carries_fixed boolean)
returns bigint
language sql stable as $$
  select case
    when r.cfg is null or p_cents is null or p_cents = 0 then p_cents
    else 100 * ceil(
      ( p_cents * (1 + (r.cfg ->> 'commission_pct')::numeric / 100)
        + case when p_carries_fixed
               then (r.cfg ->> 'gateway_fixed_cents')::numeric
                    * (1 + (r.cfg ->> 'gateway_vat_pct')::numeric / 100)
               else 0 end )
      / (1 - (r.cfg ->> 'gateway_pct')::numeric / 100
             * (1 + (r.cfg ->> 'gateway_vat_pct')::numeric / 100))
      / 100
    )::bigint
  end
  from (select (select value from settings where key = 'resale') as cfg) r;
$$;

comment on function resale_price(bigint, boolean) is
  'Precio al huésped a partir del precio del proveedor. Sin settings.resale, el mismo precio. Decisión 0025.';

-- 2. La configuración, con bitácora ------------------------------------------

create or replace function settings_set_resale(
  p_commission_pct      numeric,
  p_gateway_pct         numeric,
  p_gateway_fixed_cents bigint,
  p_gateway_vat_pct     numeric,
  p_staff_id            uuid default null
) returns jsonb
language plpgsql as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  if p_commission_pct is null or p_commission_pct < 0 or p_commission_pct >= 100
     or p_gateway_pct is null or p_gateway_pct < 0
     or p_gateway_fixed_cents is null or p_gateway_fixed_cents < 0
     or p_gateway_vat_pct is null or p_gateway_vat_pct < 0 or p_gateway_vat_pct > 100
     -- Con la tasa más su IVA en 100 % o más, no hay precio que alcance.
     or p_gateway_pct * (1 + p_gateway_vat_pct / 100) >= 100 then
    raise exception 'Reventa inválida: comisión %, tasa %, fijo %, IVA %',
      p_commission_pct, p_gateway_pct, p_gateway_fixed_cents, p_gateway_vat_pct
      using errcode = 'AM005';
  end if;

  if exists (select 1 from tax_rates
              where active and not included_in_price
                and (applies_to is null or applies_to = 'tour')) then
    raise exception 'Para revender, los impuestos de tour van dentro del precio (included_in_price): uno sumado aparte pasaría por la pasarela y el sitio cobraría menos que su comisión'
      using errcode = 'AM005';
  end if;

  v_after := jsonb_build_object(
    'commission_pct', p_commission_pct,
    'gateway_pct', p_gateway_pct,
    'gateway_fixed_cents', p_gateway_fixed_cents,
    'gateway_vat_pct', p_gateway_vat_pct);

  select value into v_before from settings where key = 'resale';

  insert into settings (key, value, description)
  values ('resale', v_after,
          'Reventa (decisión 0025): el catálogo guarda el precio del proveedor y resale_price() calcula el del huésped.')
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = p_staff_id;

  perform audit_record(p_staff_id, 'settings.resale', 'settings', 'resale', v_before, v_after);
  return v_after;
end;
$$;

-- 3. En reventa se cobra el total --------------------------------------------
--
-- Va en la resolución y no en un CHECK: el anticipo también se puede fijar por
-- producto, y así ningún camino —el global, el del producto, uno a mano— deja
-- un saldo en destino en un sitio que revende.
create or replace function resolve_deposit_pct(p_product_id uuid)
returns numeric
language sql stable as $$
  select case
    when exists (select 1 from settings where key = 'resale') then 100
    else coalesce(
      (select p.deposit_pct from products p where p.id = p_product_id),
      (select (value -> 'default_pct')::numeric from settings where key = 'deposit'),
      30
    )
  end;
$$;

-- Y el panel no puede decir otra cosa: bajar el anticipo global en un sitio que
-- revende se rechaza en lugar de guardarse y no aplicarse.
create or replace function settings_set_deposit_pct(
  p_pct      numeric,
  p_staff_id uuid default null
) returns numeric
language plpgsql as $$
declare
  v_before numeric;
begin
  if p_pct is null or p_pct <= 0 or p_pct > 100 then
    raise exception 'El anticipo tiene que estar entre 1 y 100 por ciento'
      using errcode = 'AM003';
  end if;

  if p_pct < 100 and exists (select 1 from settings where key = 'resale') then
    raise exception 'Este sitio revende: se cobra el 100 %% al reservar (decisión 0025)'
      using errcode = 'AM003';
  end if;

  select (value -> 'default_pct')::numeric into v_before from settings where key = 'deposit';

  insert into settings (key, value) values ('deposit', jsonb_build_object('default_pct', p_pct))
  on conflict (key) do update
    set value = settings.value || jsonb_build_object('default_pct', p_pct);

  perform audit_record(p_staff_id, 'settings.deposit_pct', 'settings', 'deposit',
                       jsonb_build_object('default_pct', v_before),
                       jsonb_build_object('default_pct', p_pct));
  return p_pct;
end;
$$;

-- 4. En reventa, los impuestos van dentro del precio ------------------------
--
-- El setter de arriba revisa lo que ya existe; este disparador cuida lo que
-- llegue después, por cualquier camino.
create or replace function tax_rates_resale_guard()
returns trigger
language plpgsql as $$
begin
  if new.active and not new.included_in_price
     and (new.applies_to is null or new.applies_to = 'tour')
     and exists (select 1 from settings where key = 'resale') then
    raise exception 'Este sitio revende: el impuesto «%» tiene que ir dentro del precio (decisión 0025)', new.name
      using errcode = 'AM005';
  end if;
  return new;
end;
$$;

create trigger tax_rates_resale_guard
  before insert or update on tax_rates
  for each row execute function tax_rates_resale_guard();

-- 5. Lo que se le debe al proveedor ------------------------------------------

alter table bookings
  add column supplier_cents bigint,
  add constraint bookings_supplier_cents_check check (supplier_cents is null or supplier_cents >= 0);

comment on column bookings.supplier_cents is
  'Reventa: lo que se le transfiere al proveedor por esta reserva (la suma de sus precios), congelado al reservar. Null en los sitios que no revenden. Decisión 0025.';

commit;
