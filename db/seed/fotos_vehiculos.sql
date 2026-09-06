-- ---------------------------------------------------------------------------
-- Quinta foto y textos alternativos de los vehículos
--
-- `vehiculos_caribe.sql` los cargó con cuatro fotos y **un solo texto
-- alternativo para las veinticuatro**: "Foto del vehículo". Comparado contra
-- los otros dos inventarios el hueco salta —cinco fotos y cinco textos
-- distintos en estancias, cinco y 121 en tours— y no es cosmético: quien
-- navega con lector de pantalla oía "Foto del vehículo" cuatro veces
-- seguidas, que es lo mismo que no oír nada.
--
-- La auditoría de accesibilidad no lo atrapó, y hace bien: axe comprueba que
-- exista `alt`, no que diga algo. Es la clase de defecto que solo se ve
-- comparando un inventario contra otro.
--
-- Este guion:
--
--   1. Agrega una quinta foto a cada vehículo, comprobada una por una.
--   2. Reescribe los textos alternativos por posición, en los dos idiomas.
--
-- Idempotente: la foto solo entra si ese vehículo no tiene ya cinco.
--
--   npm run prod:sql -- db/seed/fotos_vehiculos.sql
-- ---------------------------------------------------------------------------

begin;

create temporary table nueva_foto (slug text, position integer, url text) on commit drop;
insert into nueva_foto values
  ('scooter-vespa-tulum', 5, 'https://images.unsplash.com/photo-1519750292352-c9fc17322ed7'),
  ('moto-adventure-bacalar', 5, 'https://images.unsplash.com/photo-1567613074247-5e2564e1b90a'),
  ('auto-compacto-cancun', 5, 'https://images.unsplash.com/photo-1667893591090-19729ae8fee3'),
  ('suv-familiar-playa', 5, 'https://images.unsplash.com/photo-1616196334411-1d8d09708ca6'),
  ('van-grupos-cozumel', 5, 'https://images.unsplash.com/photo-1787444824402-f267ba0435fa'),
  ('jeep-techo-abierto-cozumel', 5, 'https://images.unsplash.com/photo-1612911912327-57b3aff278c4');

insert into product_media (product_id, url, alt_es, alt_en, width, height, position, variants)
select p.id,
       f.url || '?w=800&fit=crop&fm=jpg&q=65',
       'El vehículo en la carretera', 'The vehicle on the road',
       1200, 800, f.position,
       jsonb_build_object(
         'avif', jsonb_build_object(
           '400',  f.url || '?w=400&fit=crop&fm=avif&q=36',
           '800',  f.url || '?w=800&fit=crop&fm=avif&q=45',
           '1200', f.url || '?w=1200&fit=crop&fm=avif&q=50'),
         'webp', jsonb_build_object(
           '400',  f.url || '?w=400&fit=crop&fm=webp&q=52',
           '800',  f.url || '?w=800&fit=crop&fm=webp&q=55',
           '1200', f.url || '?w=1200&fit=crop&fm=webp&q=60'))
  from nueva_foto f
  join products p on p.slug = f.slug
 where (select count(*) from product_media x where x.product_id = p.id) < 5;

-- Los textos alternativos, por posición. Se emparejan por **orden** y no por
-- el número de `position`, que es la lección de las portadas de los tours: ahí
-- las fotos se numeran desde cero y emparejar por número dejó sin cambiar
-- justo la que más se mira.
with textos (n, es, en) as (values
  (1, 'El vehículo por fuera',              'The vehicle from outside'),
  (2, 'El interior',                        'The interior'),
  (3, 'Tablero y controles',                'Dashboard and controls'),
  (4, 'Detalle del vehículo',               'Detail of the vehicle'),
  (5, 'El vehículo en la carretera',        'The vehicle on the road')
),
ordenadas as (
  select m.id, row_number() over (partition by m.product_id order by m.position, m.id) as n
    from product_media m
    join products p on p.id = m.product_id
   where p.kind = 'vehicle'
)
update product_media m
   set alt_es = t.es, alt_en = t.en
  from ordenadas o join textos t on t.n = o.n
 where m.id = o.id;

do $$
declare fotos integer; distintos integer;
begin
  select count(*), count(distinct alt_es) into fotos, distintos
    from product_media m join products p on p.id = m.product_id
   where p.kind = 'vehicle';
  raise notice '── vehículos: % fotos, % textos alternativos distintos', fotos, distintos;
  if distintos < 5 then
    raise exception 'FALLO: se esperaban al menos 5 textos distintos, hay %', distintos;
  end if;
end;
$$;

commit;
