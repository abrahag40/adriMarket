-- 0015_tour_itinerary.sql
-- Horario del día para una opción de tour: "8:00 recolección, 9:00 primer
-- cenote…". Vive en su propia tabla, no en `product_translations`, por lo
-- mismo que `tour_options.name_es/name_en`: el horario depende de la
-- opción concreta (una salida matutina y una vespertina del mismo tour
-- pueden tener horarios distintos), no del producto completo.
--
-- Bilingüe en columnas, como `product_media.alt_es/alt_en`, no con una fila
-- por idioma: el orden de los pasos es el mismo en los dos idiomas, y una
-- tabla de traducciones aparte permitiría que se desincronizaran.

begin;

create table tour_itinerary_steps (
  id              uuid primary key default gen_random_uuid(),
  tour_option_id  uuid not null references tour_options (id) on delete cascade,
  position        integer not null default 0,
  -- Texto libre ("8:00", "Antes del mediodía"), no `time`: algunos pasos no
  -- tienen una hora exacta, y forzar un tipo de hora obligaría a inventar una.
  time_label      text,
  title_es        text not null,
  title_en        text,
  description_es  text,
  description_en  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tour_itinerary_steps_option_idx on tour_itinerary_steps (tour_option_id, position);

create trigger tour_itinerary_steps_touch before update on tour_itinerary_steps
  for each row execute function touch_updated_at();

commit;
