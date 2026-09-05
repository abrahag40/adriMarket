-- ---------------------------------------------------------------------------
-- Fotos de las ocho estancias
--
-- `estancias_caribe.sql` las creó con relleno de picsum, que devuelve paisajes
-- y abstracciones al azar: una casa cuyo "recámara principal" es una montaña
-- no se ve como una casa a medio cargar, se ve como un error. Esto cambia esas
-- cuarenta por fotos de Unsplash —casas, salas, recámaras, cocinas y
-- terrazas—, una por cada texto alternativo que ya estaba escrito.
--
-- **Qué son y qué no son.** Son fotos reales, bajo la Licencia de Unsplash:
-- uso comercial permitido, sin pedir permiso y sin atribución obligatoria.
-- Solo se tomaron las de `images.unsplash.com`; las de `plus.unsplash.com` son
-- de suscripción y quedaron fuera a propósito.
--
-- **No son fotos de estas casas**, porque estas casas no existen: son datos de
-- demostración. Sirven para juzgar el diseño y para enseñarle el sitio a
-- alguien; **no para vender**. El día que el negocio tenga propiedades reales,
-- sus fotos entran por `/admin/catalogo/[id]` y estas se van.
--
-- Las cuarenta URL se comprobaron una por una antes de escribir esto: las
-- cuarenta responden 200.
--
-- **Solo pisa relleno.** La condición `like 'https://picsum.photos/%'` es lo
-- que evita que, corriéndolo después de que el cliente suba las suyas, le
-- borre su trabajo.
--
--   npm run prod:sql -- db/seed/fotos_estancias.sql
-- ---------------------------------------------------------------------------

begin;

update product_media m set url = v.url
  from (values
    ('casa-arrecife-puerto-morelos', 1, 'https://images.unsplash.com/photo-1506126279646-a697353d3166?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('villa-cenote-tulum', 1, 'https://images.unsplash.com/photo-1455275505851-8e604db9675a?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('depa-quinta-avenida', 1, 'https://images.unsplash.com/photo-1771616555295-cbbed4df5360?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-laguna-bacalar', 1, 'https://images.unsplash.com/photo-1757361652977-218a1173e8d6?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('bungalow-holbox', 1, 'https://images.unsplash.com/photo-1771529173150-c3d266df0c0d?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-del-faro-isla-mujeres', 1, 'https://images.unsplash.com/photo-1771526087650-6c755f4e5639?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('penthouse-zona-hotelera', 1, 'https://images.unsplash.com/photo-1760067537086-0f0928fa7862?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-palapa-cozumel', 1, 'https://images.unsplash.com/photo-1770825039005-36c69ca35eac?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-arrecife-puerto-morelos', 2, 'https://images.unsplash.com/photo-1762529716272-b316f61502e7?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('villa-cenote-tulum', 2, 'https://images.unsplash.com/photo-1600493505873-cddd69453072?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('depa-quinta-avenida', 2, 'https://images.unsplash.com/photo-1600493504591-aa1849716b36?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-laguna-bacalar', 2, 'https://images.unsplash.com/photo-1787496994076-17355292b31d?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('bungalow-holbox', 2, 'https://images.unsplash.com/photo-1779903726439-5c27e3996c8a?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-del-faro-isla-mujeres', 2, 'https://images.unsplash.com/photo-1785962019614-ad3166482c9f?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('penthouse-zona-hotelera', 2, 'https://images.unsplash.com/photo-1779903726785-7cf25bed78f7?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-palapa-cozumel', 2, 'https://images.unsplash.com/photo-1774423864869-702b21c2490a?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-arrecife-puerto-morelos', 3, 'https://images.unsplash.com/photo-1613553474179-e1eda3ea5734?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('villa-cenote-tulum', 3, 'https://images.unsplash.com/photo-1519710889408-a67e1c7e0452?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('depa-quinta-avenida', 3, 'https://images.unsplash.com/photo-1635247049915-dff57098ea0f?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-laguna-bacalar', 3, 'https://images.unsplash.com/photo-1750420556288-d0e32a6f517b?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('bungalow-holbox', 3, 'https://images.unsplash.com/photo-1710224002849-a76ea1068b0d?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-del-faro-isla-mujeres', 3, 'https://images.unsplash.com/photo-1613977257441-dd57bd5aaf70?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('penthouse-zona-hotelera', 3, 'https://images.unsplash.com/photo-1718894071528-1108a094cc78?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-palapa-cozumel', 3, 'https://images.unsplash.com/photo-1718894071402-fb944e2a1849?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-arrecife-puerto-morelos', 4, 'https://images.unsplash.com/photo-1628745277862-bc0b2d68c50c?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('villa-cenote-tulum', 4, 'https://images.unsplash.com/photo-1649083048597-d7b4f1e8a386?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('depa-quinta-avenida', 4, 'https://images.unsplash.com/photo-1600684388091-627109f3cd60?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-laguna-bacalar', 4, 'https://images.unsplash.com/photo-1649083048428-3d8ed23a3ce0?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('bungalow-holbox', 4, 'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-del-faro-isla-mujeres', 4, 'https://images.unsplash.com/photo-1649083048391-1c9e82472f65?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('penthouse-zona-hotelera', 4, 'https://images.unsplash.com/photo-1628745277895-106fbff3caf7?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-palapa-cozumel', 4, 'https://images.unsplash.com/photo-1643949915134-73a4c880f7c7?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-arrecife-puerto-morelos', 5, 'https://images.unsplash.com/photo-1585549072145-99e4bc8854a1?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('villa-cenote-tulum', 5, 'https://images.unsplash.com/photo-1716460484589-9982dff13f84?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('depa-quinta-avenida', 5, 'https://images.unsplash.com/photo-1735964528533-e3cf139bbd7d?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-laguna-bacalar', 5, 'https://images.unsplash.com/photo-1697216563517-e48622ba218c?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('bungalow-holbox', 5, 'https://images.unsplash.com/photo-1666307580948-a2bac69a1dff?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-del-faro-isla-mujeres', 5, 'https://images.unsplash.com/photo-1609357973185-79e32a08df5a?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('penthouse-zona-hotelera', 5, 'https://images.unsplash.com/photo-1758192838598-a1de4da5dcaf?auto=format&fit=crop&w=1200&h=800&q=70'),
    ('casa-palapa-cozumel', 5, 'https://images.unsplash.com/photo-1680169301216-b84992e95440?auto=format&fit=crop&w=1200&h=800&q=70')
  ) as v(slug, position, url)
  join products p on p.slug = v.slug
 where m.product_id = p.id
   and m.position = v.position
   -- Solo el relleno: una foto que ya subió el cliente no se toca.
   and m.url like 'https://picsum.photos/%';

-- Y las variantes, que es lo que hace que esto quepa en el presupuesto.
--
-- Medido sobre una de estas fotos: el JPEG de 1200 px pesa **214 kB** —el
-- presupuesto entero de una página, en una sola imagen— y el AVIF de 400 px,
-- que es el tamaño al que de verdad se ve una tarjeta del listado, pesa
-- **19 kB**. Once veces menos por elegir el archivo correcto, no por
-- recortar calidad.
--
-- `ResponsiveImage` ya sabía servir `avif` y `webp` por ancho con `srcset`;
-- lo que faltaba era que estas fotos trajeran las suyas. Unsplash las genera
-- al vuelo con `fm=` y `w=`, así que no hay nada que procesar ni que guardar.
--
-- Se deriva de la URL ya guardada en vez de escribirlas a mano: son 240 URL
-- (40 fotos × 3 anchos × 2 formatos) y a mano se equivoca una.
update product_media m
   set url = s.base || '?w=800&fit=crop&fm=jpg&q=65',
       variants = jsonb_build_object(
         'avif', jsonb_build_object(
           -- El escalón de 400 es obligatorio: el teléfono con el que se
           -- audita mide 390 px de ancho, y `srcset` elige el **primero que
           -- alcanza**. Se probó 300/600/900 y el navegador saltó al de 600
           -- para llenar 390 — la página pasó de 280 kB a 325. Los anchos
           -- tienen que caer justo encima de los que se usan, no debajo.
           '400',  s.base || '?w=400&fit=crop&fm=avif&q=36',
           '800',  s.base || '?w=800&fit=crop&fm=avif&q=45',
           '1200', s.base || '?w=1200&fit=crop&fm=avif&q=50'),
         'webp', jsonb_build_object(
           '400',  s.base || '?w=400&fit=crop&fm=webp&q=52',
           '800',  s.base || '?w=800&fit=crop&fm=webp&q=55',
           '1200', s.base || '?w=1200&fit=crop&fm=webp&q=60')
       )
  from (
    select id, split_part(url, '?', 1) as base
      from product_media
     where url like 'https://images.unsplash.com/%'
  ) s
 where m.id = s.id;

do $$
declare quedan integer; puestas integer; con_variantes integer;
begin
  select count(*) into quedan from product_media m
    join products p on p.id = m.product_id
   where p.kind = 'stay' and m.url like 'https://picsum.photos/%';
  select count(*) into puestas from product_media m
    join products p on p.id = m.product_id
   where p.kind = 'stay' and m.url like 'https://images.unsplash.com/%';
  select count(*) into con_variantes from product_media m
    join products p on p.id = m.product_id
   where p.kind = 'stay' and m.variants ? 'avif';
  raise notice '── fotos de estancias: % reales (% con variantes), % de relleno todavía',
    puestas, con_variantes, quedan;
end;
$$;

commit;
