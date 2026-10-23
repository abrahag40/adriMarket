-- ---------------------------------------------------------------------------
-- Fotos de relleno para Conquest Tours
--
-- Los tours de Abel llegaron sin fotos y la portada se veía en gris. Se toman
-- las mismas fotos de Unsplash del catálogo de demostración de adriMarket
-- (`fotos_tours.sql`), empatadas por actividad: el cenote con un cenote, las
-- ruinas con ruinas. No son datos de otro cliente: son fotos con licencia de
-- uso comercial libre que ya vivían en este repositorio.
--
-- **Ilustran la actividad, no son de estos tours.** Cuando Abel mande las
-- suyas, se borran con:
--   delete from product_media where url like 'https://images.unsplash.com/%';
-- La portada es la posición 0; una foto subida después queda detrás, así que
-- hay que borrar el relleno para que la del cliente pase al frente.
--
-- **Solo llena tours sin fotos.** Isla Mujeres y Sian Ka'an ya tienen las de
-- Abel y no se tocan. Repetirlo no duplica.
--
--   SITIO=conquest-tours ./scripts/produccion.sh sql db/seed/fotos_relleno_conquest.sql
-- ---------------------------------------------------------------------------

begin;

with nuevas (slug, pos, base, alt) as (values
    ('aktunchen', 0, 'https://images.unsplash.com/photo-1648853070657-6d58398bee93', 'Cenote y caverna en la selva de Quintana Roo'),
    ('aktunchen', 1, 'https://images.unsplash.com/photo-1637511077877-3c6a00eb32ba', 'Cenote y caverna en la selva de Quintana Roo'),
    ('aktunchen', 2, 'https://images.unsplash.com/photo-1712782516688-cbcbf93b1b7c', 'Cenote y caverna en la selva de Quintana Roo'),
    ('aktunchen', 3, 'https://images.unsplash.com/photo-1675259113512-db50297ce326', 'Cenote y caverna en la selva de Quintana Roo'),
    ('aktunchen', 4, 'https://images.unsplash.com/photo-1679117730976-cdb5f6b05b88', 'Cenote y caverna en la selva de Quintana Roo'),
    ('chichen-itza', 0, 'https://images.unsplash.com/photo-1568402102990-bc541580b59f', 'Zona arqueológica de Chichén Itzá'),
    ('chichen-itza', 1, 'https://images.unsplash.com/photo-1518638150340-f706e86654de', 'Zona arqueológica de Chichén Itzá'),
    ('chichen-itza', 2, 'https://images.unsplash.com/photo-1620636607286-087f5a7b5716', 'Zona arqueológica de Chichén Itzá'),
    ('chichen-itza', 3, 'https://images.unsplash.com/photo-1695385246146-1e12a7479410', 'Zona arqueológica de Chichén Itzá'),
    ('chichen-itza', 4, 'https://images.unsplash.com/photo-1595450653862-394dfc73053d', 'Zona arqueológica de Chichén Itzá'),
    ('coba', 0, 'https://images.unsplash.com/photo-1665617529813-80903f36f1c3', 'Pirámide y selva de Cobá'),
    ('coba', 1, 'https://images.unsplash.com/photo-1681686587641-45cd5bd876d9', 'Pirámide y selva de Cobá'),
    ('coba', 2, 'https://images.unsplash.com/photo-1681686587163-d43e66063208', 'Pirámide y selva de Cobá'),
    ('coba', 3, 'https://images.unsplash.com/photo-1681686589384-b43106562e3d', 'Pirámide y selva de Cobá'),
    ('coba', 4, 'https://images.unsplash.com/photo-1681686586861-19013ef8be90', 'Pirámide y selva de Cobá'),
    ('cozumel-cielito', 0, 'https://images.unsplash.com/photo-1770387755634-c5ceb4245545', 'Agua cristalina para snorkel en Cozumel'),
    ('cozumel-cielito', 1, 'https://images.unsplash.com/photo-1690336608051-2b3ed79c4a10', 'Agua cristalina para snorkel en Cozumel'),
    ('cozumel-cielito', 2, 'https://images.unsplash.com/photo-1664016423953-f4c8208f7463', 'Agua cristalina para snorkel en Cozumel'),
    ('cozumel-cielito', 3, 'https://images.unsplash.com/photo-1788082578513-610be83d47f8', 'Agua cristalina para snorkel en Cozumel'),
    ('cozumel-cielito', 4, 'https://images.unsplash.com/photo-1783950231870-b21ef4b1ae57', 'Agua cristalina para snorkel en Cozumel'),
    ('dos-ojos', 0, 'https://images.unsplash.com/photo-1548623826-a1aa0a4d8a5b', 'Snorkel en un cenote de Tulum'),
    ('dos-ojos', 1, 'https://images.unsplash.com/photo-1659775226523-b31d25ddb5fa', 'Snorkel en un cenote de Tulum'),
    ('dos-ojos', 2, 'https://images.unsplash.com/photo-1522093243371-296c79a66df4', 'Snorkel en un cenote de Tulum'),
    ('dos-ojos', 3, 'https://images.unsplash.com/photo-1522094522800-6e0189c77a16', 'Snorkel en un cenote de Tulum'),
    ('dos-ojos', 4, 'https://images.unsplash.com/photo-1601902726356-c536ab69488f', 'Snorkel en un cenote de Tulum'),
    ('laguna-de-los-7-colores', 0, 'https://images.unsplash.com/photo-1776347441311-d831b72fce5b', 'Laguna de los siete colores en Bacalar'),
    ('laguna-de-los-7-colores', 1, 'https://images.unsplash.com/photo-1780415472374-a9dfff1a3608', 'Laguna de los siete colores en Bacalar'),
    ('laguna-de-los-7-colores', 2, 'https://images.unsplash.com/photo-1776157583672-c3fd4f68a59e', 'Laguna de los siete colores en Bacalar'),
    ('laguna-de-los-7-colores', 3, 'https://images.unsplash.com/photo-1759472287837-927ac19d1065', 'Laguna de los siete colores en Bacalar'),
    ('laguna-de-los-7-colores', 4, 'https://images.unsplash.com/photo-1604729220139-314542b85436', 'Laguna de los siete colores en Bacalar'),
    ('snorkel-en-akumal', 0, 'https://images.unsplash.com/photo-1720043792249-ce6ad74dda23', 'Snorkel en el arrecife del Caribe mexicano'),
    ('snorkel-en-akumal', 1, 'https://images.unsplash.com/photo-1642604024740-50d7abae650f', 'Snorkel en el arrecife del Caribe mexicano'),
    ('snorkel-en-akumal', 2, 'https://images.unsplash.com/photo-1568558490322-78fbc203f898', 'Snorkel en el arrecife del Caribe mexicano'),
    ('snorkel-en-akumal', 3, 'https://images.unsplash.com/photo-1583237559242-1c4e4764ad1f', 'Snorkel en el arrecife del Caribe mexicano'),
    ('snorkel-en-akumal', 4, 'https://images.unsplash.com/photo-1682829230193-74ddc0bdfff4', 'Snorkel en el arrecife del Caribe mexicano'),
    ('zona-arqueologica-de-tulum', 0, 'https://images.unsplash.com/photo-1638552713889-2d678079d441', 'Ruinas de Tulum frente al mar Caribe'),
    ('zona-arqueologica-de-tulum', 1, 'https://images.unsplash.com/photo-1675525934798-552bdc8c45ab', 'Ruinas de Tulum frente al mar Caribe'),
    ('zona-arqueologica-de-tulum', 2, 'https://images.unsplash.com/photo-1665618980645-ca9cd5e68508', 'Ruinas de Tulum frente al mar Caribe'),
    ('zona-arqueologica-de-tulum', 3, 'https://images.unsplash.com/photo-1733836851488-0c3b841476e3', 'Ruinas de Tulum frente al mar Caribe'),
    ('zona-arqueologica-de-tulum', 4, 'https://images.unsplash.com/photo-1670353032525-6a18b5311627', 'Ruinas de Tulum frente al mar Caribe')
)
insert into product_media (product_id, url, kind, alt_es, width, height, position, variants)
select p.id,
       n.base || '?w=800&fit=crop&fm=jpg&q=65',
       'image', n.alt, 1200, 800, n.pos,
       jsonb_build_object(
         'avif', jsonb_build_object(
           '400',  n.base || '?w=400&fit=crop&fm=avif&q=36',
           '800',  n.base || '?w=800&fit=crop&fm=avif&q=45',
           '1200', n.base || '?w=1200&fit=crop&fm=avif&q=50'),
         'webp', jsonb_build_object(
           '400',  n.base || '?w=400&fit=crop&fm=webp&q=52',
           '800',  n.base || '?w=800&fit=crop&fm=webp&q=55',
           '1200', n.base || '?w=1200&fit=crop&fm=webp&q=60'))
  from nuevas n
  join products p on p.slug = n.slug
 where not exists (select 1 from product_media m where m.product_id = p.id);

do $$
declare sin_foto text;
begin
  select string_agg(p.slug, ', ') into sin_foto
    from products p
   where p.status = 'published'
     and not exists (select 1 from product_media m where m.product_id = p.id);
  raise notice '── tours publicados sin foto: %', coalesce(sin_foto, 'ninguno');
end;
$$;

commit;
