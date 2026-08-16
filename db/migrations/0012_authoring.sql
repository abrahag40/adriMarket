-- 0012_authoring.sql
-- Sprint 6: el cliente publica y ajusta sin el equipo técnico.
--
-- Casi todo lo que hace falta ya existe en el esquema desde el Sprint 0: los
-- productos, sus traducciones, las tarifas por temporada y prioridad, los
-- cupones. Este sprint es sobre todo interfaz. Lo que sí falta en la base es
-- poco y concreto:
--
-- 1. **Variantes de imagen.** La decisión 0001 dice generar anchos al subir y
--    servirlos por CDN. `product_media` guardaba una sola URL, que es justo lo
--    que esa decisión rechazó.
-- 2. **Generar salidas por recurrencia**, sin que "todos los martes y jueves de
--    marzo a junio" sea un ciclo escrito en la aplicación.
-- 3. **Bitácora de cambios**, que la tabla ya soporta pero nadie escribía.

begin;

-- ---------------------------------------------------------------------------
-- Variantes de imagen
-- ---------------------------------------------------------------------------

-- Forma de `variants`:
--   {"avif": {"400": "/media/x-400.avif", ...}, "webp": {...}}
--
-- Se guarda como jsonb y no como una tabla por variante porque siempre se leen
-- todas juntas para armar un `srcset`, nunca una sola. Una tabla obligaría a un
-- join por imagen para no ganar nada.
alter table product_media
  add column if not exists variants jsonb not null default '{}'::jsonb,
  -- La imagen original se conserva: agregar un ancho nuevo obliga a reprocesar
  -- (consecuencia anotada en la decisión 0001) y sin el original no se puede.
  add column if not exists original_url text,
  add column if not exists bytes bigint,
  add column if not exists uploaded_by uuid references staff_users (id);

comment on column product_media.variants is
  'Anchos generados al subir, por formato. Ver docs/decisiones/0001-entrega-de-imagenes.md';

-- Cola de procesamiento de imágenes.
--
-- La decisión 0001 dice, textualmente, que la generación de variantes "se hace
-- en un job y no en la petición del panel, para que subir quince fotos no
-- bloquee la pantalla". No es una precaución teórica: codificar AVIF tarda
-- segundos por imagen, y quince fotos por cuatro anchos por dos formatos son
-- ciento veinte codificaciones. En la petición, eso es una pantalla colgada
-- varios minutos.
--
-- La foto se ve en cuanto se sube —se sirve el original— y las variantes
-- aparecen cuando el latido las genera.
create table if not exists media_jobs (
  id          uuid primary key default gen_random_uuid(),
  media_id    uuid not null references product_media (id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'done', 'failed')),
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists media_jobs_pending_idx on media_jobs (created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Salidas en lote
-- ---------------------------------------------------------------------------

-- "Todos los martes y jueves de marzo a junio, a las 9:00, cupo 12."
--
-- Se resuelve en la base y no en la aplicación por una razón concreta: la hora
-- de salida es local (9:00 de Cancún) y el rango puede cruzar un cambio de
-- horario. Postgres sabe convertir eso; un ciclo en JavaScript sumando 24 horas
-- no. Quintana Roo no tiene horario de verano, pero el sistema no debería
-- depender de que el cliente nunca opere fuera del estado.
--
-- Es idempotente: las salidas que ya existen se omiten, no se duplican ni
-- reescriben. Generar dos veces el mismo mes no puede cambiarle el cupo a una
-- salida que ya tiene pasajeros.
create or replace function departures_generate(
  p_option_id uuid,
  p_from      date,
  p_to        date,
  p_dows      smallint[],      -- 1 = lunes … 7 = domingo (ISO)
  p_time      time,
  p_capacity  integer,
  p_duration  interval default null,
  p_staff_id  uuid default null
) returns table (created int, skipped int)
language plpgsql as $$
declare
  v_tz       text;
  v_duration interval;
  v_created  int := 0;
  v_skipped  int := 0;
  v_day      date;
  v_start    timestamptz;
begin
  if p_from > p_to then
    raise exception 'El rango de fechas está invertido' using errcode = 'AM003';
  end if;

  if p_dows is null or array_length(p_dows, 1) is null then
    raise exception 'Hay que elegir al menos un día de la semana' using errcode = 'AM003';
  end if;

  if p_capacity is null or p_capacity <= 0 then
    raise exception 'El cupo tiene que ser mayor que cero' using errcode = 'AM003';
  end if;

  select coalesce(l.timezone, 'America/Cancun'),
         coalesce(p_duration, make_interval(mins => o.duration_minutes))
    into v_tz, v_duration
    from tour_options o
    join products pr on pr.id = o.product_id
    left join locations l on l.id = pr.location_id
   where o.id = p_option_id;

  if not found then
    raise exception 'La opción de tour % no existe', p_option_id using errcode = 'AM003';
  end if;

  for v_day in
    select d::date from generate_series(p_from, p_to, interval '1 day') d
     where extract(isodow from d)::smallint = any(p_dows)
  loop
    -- La hora es local: se compone la fecha con la hora y se ancla a la zona.
    v_start := (v_day + p_time) at time zone v_tz;

    if exists (select 1 from tour_departures
                where tour_option_id = p_option_id and starts_at = v_start) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
    values (p_option_id, v_start, v_start + v_duration, p_capacity);
    v_created := v_created + 1;
  end loop;

  insert into audit_log (actor_staff_id, action, entity, entity_id, after)
  values (p_staff_id, 'departures.generate', 'tour_option', p_option_id::text,
          jsonb_build_object('from', p_from, 'to', p_to, 'dows', p_dows,
                             'time', p_time::text, 'capacity', p_capacity,
                             'created', v_created, 'skipped', v_skipped));

  return query select v_created, v_skipped;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bitácora
-- ---------------------------------------------------------------------------

-- La tabla existe desde el Sprint 0 y nadie escribía en ella. Este ayudante
-- existe para que registrar un cambio cueste una línea: una bitácora que hay
-- que recordar llenar termina medio llena, y una bitácora medio llena es peor
-- que ninguna porque genera confianza que no merece.
create or replace function audit_record(
  p_staff_id uuid,
  p_action   text,
  p_entity   text,
  p_entity_id text,
  p_before   jsonb default null,
  p_after    jsonb default null
) returns bigint
language sql as $$
  insert into audit_log (actor_staff_id, actor_label, action, entity, entity_id, before, after)
  select p_staff_id,
         (select full_name from staff_users where id = p_staff_id),
         p_action, p_entity, p_entity_id, p_before, p_after
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- Anticipo global
-- ---------------------------------------------------------------------------

-- Cambiar el porcentaje por omisión es un UPDATE sobre settings, pero pasa por
-- una función para que **quede en la bitácora quién lo cambió**. Es dinero: el
-- día que alguien pregunte por qué el anticipo bajó al 10% en temporada alta,
-- la respuesta tiene que estar escrita.
--
-- No toca ninguna reserva existente y no puede: `bookings.deposit_pct` se
-- congela al reservar y esta función no lo mira.
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

commit;
