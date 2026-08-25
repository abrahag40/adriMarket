-- 0014_coupon_redemption.sql
-- Canje de cupones en el checkout.
--
-- Los cupones se administran desde el panel desde el Sprint 6 (S6-4), pero
-- nunca se pudieron usar al reservar: faltaba el campo en el checkout y la
-- forma de descontarlos del inventario del propio cupón. Este es ese segundo
-- half — la deuda quedó dicha en CLAUDE.md.
--
-- El canje sigue el mismo patrón que el cupo de un tour (tour_hold_create,
-- Sprint 0): se bloquea la fila con `for update`, se valida y se actualiza en
-- la misma sentencia. Dos huéspedes canjeando el último uso disponible al
-- mismo tiempo no pueden dejar `redemptions` por encima de `max_redemptions`
-- — el segundo espera el bloqueo del primero y, al tomarlo, ve el contador ya
-- al límite.

begin;

alter table bookings
  add column coupon_id uuid references coupons (id),
  -- El código se guarda aparte del id: si el cupón se desactiva o se borra
  -- algún día, el comprobante y la contabilidad siguen diciendo qué código se
  -- usó. Es la misma razón por la que la política de cancelación se congela
  -- en vez de solo referenciarse.
  add column coupon_code text;

-- ---------------------------------------------------------------------------
-- AM004 · cupón agotado
-- ---------------------------------------------------------------------------

comment on table coupons is
  'Cupones. AM004 = agotado (ver coupon_redeem), mismo mecanismo que AM001-3 en 0008_domain_functions.sql.';

create or replace function coupon_redeem(p_coupon_id uuid) returns void
language plpgsql as $$
declare
  v_redemptions     integer;
  v_max_redemptions integer;
begin
  select redemptions, max_redemptions
    into v_redemptions, v_max_redemptions
    from coupons
   where id = p_coupon_id
     for update;                                  -- ← serializa a los competidores

  if not found then
    raise exception 'El cupón % no existe', p_coupon_id using errcode = 'AM004';
  end if;

  if v_max_redemptions is not null and v_redemptions >= v_max_redemptions then
    raise exception 'Cupón agotado: ya se usó % de % veces',
      v_redemptions, v_max_redemptions using errcode = 'AM004';
  end if;

  update coupons set redemptions = redemptions + 1 where id = p_coupon_id;
end;
$$;

commit;
