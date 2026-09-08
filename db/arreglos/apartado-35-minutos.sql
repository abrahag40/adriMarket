-- apartado-35-minutos.sql
--
-- Sube `settings.checkout.hold_minutes` a 35 en una base ya desplegada.
--
-- El seed lo trae así desde el 2026-09-08, pero **el seed no se corre en
-- producción** —y con razón—, así que allá el ajuste sigue en el valor viejo.
-- Es la misma trampa que dejó a producción encolando el aviso a la
-- administración con destinatario vacío: un ajuste que solo carga el seed no
-- existe en producción.
--
-- Por qué 35 y no 15:
--
--   Stripe **no permite** una sesión de pago menor a 30 minutos. Con el
--   apartado en 15, entre el minuto 15 y el 30 el huésped podía pagar por
--   fechas que el latido ya había liberado: se le cobraba, `booking_confirm`
--   rechazaba con AM003, la transacción rodaba atrás borrando hasta el registro
--   del pago, y el webhook respondía 500 en cada reintento durante tres días.
--   Ni reserva, ni rastro.
--
--   35 son los 30 que exige Stripe más margen para el desfase de reloj y para
--   que el webhook llegue, que no es instantáneo.
--
-- El código se defiende solo —`HOLD_MINUTES_MINIMO` sube a 30 cualquier ajuste
-- menor— pero eso es la red, no la intención. Este guion pone la intención.
--
--   npm run prod:sql -- db/arreglos/apartado-35-minutos.sql

begin;

do $$
declare
  v_antes int;
  v_despues int;
begin
  select (value -> 'hold_minutes')::int into v_antes from settings where key = 'checkout';

  update settings
     set value = jsonb_set(value, '{hold_minutes}', '35'::jsonb)
   where key = 'checkout';

  select (value -> 'hold_minutes')::int into v_despues from settings where key = 'checkout';

  if v_despues is null then
    raise exception 'No existe el ajuste settings.checkout: la base no está sembrada';
  end if;

  raise notice '── apartado: % → % minutos', coalesce(v_antes::text, '(sin valor)'), v_despues;
end;
$$;

commit;
