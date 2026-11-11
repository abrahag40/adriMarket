-- ---------------------------------------------------------------------------
-- De dónde zarpa cada barco de Adri
--
-- Las fichas en PDF no lo dicen, y sin eso un barco no tiene destino (no sale en
-- el filtro por lugar, no tiene la zona horaria de su marina) ni punto de
-- encuentro (el huésped no sabe a dónde llegar). Ver decisión 0022, supuesto 1.
--
-- Se llena un renglón por barco con lo que diga Adri y se corre:
--
--   npm run prod:sql -- db/arreglos/marinas-embarcaciones.sql
--
-- El destino tiene que existir en `locations` (cancun, playa-del-carmen,
-- tulum, cozumel, isla-mujeres, puerto-morelos…). Si es uno nuevo —Puerto
-- Aventuras, por ejemplo— se agrega primero con su zona horaria.
--
-- Solo escribe donde todavía no hay nada: un punto de encuentro corregido a mano
-- desde el panel no se pisa. Se niega a correr con la lista vacía, porque "no
-- pasó nada" se lee igual que "salió bien".
-- ---------------------------------------------------------------------------

begin;

create temporary table emb_marina (
  slug          text primary key,
  location_slug text not null,
  meeting_point text not null
) on commit drop;

insert into emb_marina (slug, location_slug, meeting_point)
select * from (values
  -- ('barco-catamaran-leopard-47', 'playa-del-carmen', 'Marina …, muelle …'),
  (null::text, null::text, null::text)
) v(slug, location_slug, meeting_point)
where v.slug is not null;

do $$
declare
  v_faltan text;
begin
  if not exists (select 1 from emb_marina) then
    raise exception 'La lista de marinas está vacía: no hay nada que cargar.';
  end if;

  select string_agg(m.location_slug, ', ') into v_faltan
    from emb_marina m
   where not exists (select 1 from locations l where l.slug = m.location_slug);
  if v_faltan is not null then
    raise exception 'Destinos que no existen en locations: %', v_faltan;
  end if;
end $$;

update products p
   set location_id = l.id
  from emb_marina m
  join locations l on l.slug = m.location_slug
 where p.slug = m.slug
   and p.location_id is null;

update tour_options o
   set meeting_point = m.meeting_point
  from emb_marina m
  join products p on p.slug = m.slug
 where o.product_id = p.id
   and o.meeting_point is null;

-- Las salidas se generaron con la zona de Quintana Roo, que es la de cualquier
-- marina del Caribe mexicano: cambiar el destino no las corre de hora.

commit;
