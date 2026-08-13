-- 0009_rate_lookup.sql
-- Sprint 2: el motor de cotización necesita, además de la tarifa por noche, las
-- restricciones que trae esa tarifa. Se amplía la función existente y se agrega
-- la consulta de la tarifa de un día suelto, que hace falta para validar el día
-- de salida.
--
-- La regla de resolución no cambia: cuando dos tarifas cubren la misma fecha
-- gana la de mayor `priority`. Así una tarifa de puente se define encima de la
-- temporada sin partir la temporada en pedazos.

begin;

-- Cambiar el tipo de retorno obliga a recrear la función; CREATE OR REPLACE no
-- puede hacerlo.
drop function if exists stay_nightly_rates(uuid, daterange);

create function stay_nightly_rates(p_unit_id uuid, p_stay daterange)
returns table (
  night               date,
  nightly_cents       bigint,
  rate_id             uuid,
  min_nights          integer,
  closed_to_arrival   boolean,
  closed_to_departure boolean
)
language sql stable as $$
  select
    d::date,
    r.nightly_cents,
    r.id,
    r.min_nights,
    coalesce(r.closed_to_arrival, false),
    coalesce(r.closed_to_departure, false)
  from generate_series(
         lower(p_stay)::timestamp,
         (upper(p_stay) - 1)::timestamp,
         interval '1 day'
       ) as d
  left join lateral (
    select sr.id, sr.nightly_cents, sr.min_nights, sr.closed_to_arrival, sr.closed_to_departure
    from stay_rates sr
    join stay_rate_plans rp on rp.id = sr.rate_plan_id
    where rp.unit_id = p_unit_id
      and rp.active
      and sr.season @> d::date
      and (sr.dows is null or extract(isodow from d)::smallint = any (sr.dows))
    order by sr.priority desc, sr.created_at desc
    limit 1
  ) r on true;
$$;

comment on function stay_nightly_rates(uuid, daterange) is
  'Tarifa y restricciones noche por noche. nightly_cents nulo = sin tarifa configurada: la aplicación debe negarse a cotizar en lugar de inventar un precio.';

-- Tarifa vigente para un día suelto. Se usa con el día de SALIDA, que no es una
-- noche y por lo tanto no aparece en stay_nightly_rates, pero cuya tarifa sí
-- decide si ese día admite salidas.
create or replace function stay_rate_at(p_unit_id uuid, p_date date)
returns table (
  rate_id             uuid,
  nightly_cents       bigint,
  min_nights          integer,
  closed_to_arrival   boolean,
  closed_to_departure boolean
)
language sql stable as $$
  select sr.id, sr.nightly_cents, sr.min_nights, sr.closed_to_arrival, sr.closed_to_departure
  from stay_rates sr
  join stay_rate_plans rp on rp.id = sr.rate_plan_id
  where rp.unit_id = p_unit_id
    and rp.active
    and sr.season @> p_date
    and (sr.dows is null or extract(isodow from p_date)::smallint = any (sr.dows))
  order by sr.priority desc, sr.created_at desc
  limit 1;
$$;

-- Disponibilidad de un rango, noche por noche, para pintar el calendario de la
-- ficha. Devuelve solo si la noche está ocupada, nunca el motivo: el huésped no
-- tiene por qué saber que la casa está en mantenimiento o que la está usando el
-- propietario.
create or replace function stay_availability_range(p_unit_id uuid, p_range daterange)
returns table (night date, available boolean, nightly_cents bigint)
language sql stable as $$
  select
    d::date,
    not exists (
      select 1 from stay_blocks sb
       where sb.unit_id = p_unit_id
         and sb.released_at is null
         and sb.stay @> d::date
    ),
    r.nightly_cents
  from generate_series(
         lower(p_range)::timestamp,
         (upper(p_range) - 1)::timestamp,
         interval '1 day'
       ) as d
  left join lateral (
    select sr.nightly_cents
    from stay_rates sr
    join stay_rate_plans rp on rp.id = sr.rate_plan_id
    where rp.unit_id = p_unit_id
      and rp.active
      and sr.season @> d::date
      and (sr.dows is null or extract(isodow from d)::smallint = any (sr.dows))
    order by sr.priority desc, sr.created_at desc
    limit 1
  ) r on true;
$$;

commit;
