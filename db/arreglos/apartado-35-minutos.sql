-- apartado-35-minutos.sql
--
-- Deja `settings.checkout.hold_minutes` en 35 en una base ya desplegada.
--
-- ---------------------------------------------------------------------------
-- Por qué 35 y no 15
-- ---------------------------------------------------------------------------
--
-- Stripe **no permite** una sesión de pago menor a 30 minutos. Con el apartado
-- en 15, entre el minuto 15 y el 30 el huésped podía pagar por fechas que el
-- latido ya había liberado: se le cobraba, `booking_confirm` rechazaba con
-- AM003, la transacción rodaba atrás borrando hasta el registro del pago, y el
-- webhook respondía 500 en cada reintento durante tres días. Ni reserva, ni
-- rastro. Ver decisión 0015.
--
-- 35 son los 30 que exige Stripe más margen para el desfase de reloj y para
-- que el webhook llegue, que no es instantáneo.
--
-- ---------------------------------------------------------------------------
-- Por qué hace UPSERT y no UPDATE
-- ---------------------------------------------------------------------------
--
-- La primera versión de este guion hacía `update … where key = 'checkout'` y
-- **habría fallado en producción**, porque allá ese ajuste no existe: el seed
-- no se corre en producción, y `settings.checkout` solo lo crea el seed. Se
-- descubrió al verificar la base después de migrar — la consulta devolvió cero
-- filas.
--
-- Que no exista no es una avería: `holdMinutes()` cae en su valor por omisión,
-- que ya son 35. O sea que **producción está bien por omisión, no por
-- configuración**. Este guion convierte eso en una decisión escrita, que es
-- distinto: el día que alguien edite ese ajuste desde el panel, verá un número
-- y no un hueco.
--
--   npm run prod:sql -- db/arreglos/apartado-35-minutos.sql

begin;

do $$
declare
  v_antes   text;
  v_despues int;
  v_existia boolean;
begin
  select value ->> 'hold_minutes' into v_antes from settings where key = 'checkout';
  v_existia := found;

  insert into settings (key, value)
  values ('checkout', jsonb_build_object('hold_minutes', 35))
  on conflict (key) do update
     set value = jsonb_set(settings.value, '{hold_minutes}', '35'::jsonb);

  select (value -> 'hold_minutes')::int into v_despues from settings where key = 'checkout';

  if v_despues is distinct from 35 then
    raise exception 'El ajuste quedó en % y no en 35', v_despues;
  end if;

  if v_existia then
    raise notice '── apartado: % → 35 minutos', coalesce(v_antes, '(sin valor)');
  else
    raise notice '── el ajuste no existía; se crea con 35 minutos';
    raise notice '   (el código ya usaba 35 por omisión: esto lo vuelve explícito)';
  end if;
end;
$$;

commit;
