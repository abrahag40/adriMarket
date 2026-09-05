-- ---------------------------------------------------------------------------
-- Fotos de los tours
--
-- Hermano de `fotos_estancias.sql`, con una diferencia que decide el
-- resultado: **una consulta por tour**, no una genérica por posición. Lo que
-- vende cada uno es distinto —una tirolesa no es un arrecife, y un cenote no
-- es una laguna— así que una sola búsqueda para los veintisiete habría puesto
-- coral en la ruta de las tirolesas. Cinco fotos por tour, ninguna repetida
-- entre tours.
--
-- Las 145 URL se comprobaron una por una antes de escribir esto; las 145
-- responden. Un tour —Sian Ka'an— se quedó sin resultados con su primera
-- consulta y se le buscó aparte: quedarse con cuatro fotos habría dejado la
-- galería coja sin que nadie se enterara.
--
-- **Qué son y qué no son.** Fotos de Unsplash, bajo su licencia de uso
-- comercial libre (solo `images.unsplash.com`; las de `plus.` son de
-- suscripción). Ilustran la actividad, **no son de estos tours**: cuando el
-- cliente suba las suyas por el panel, estas se van.
--
-- **Solo pisa relleno.** `url like 'picsum%'` es lo que protege lo ya subido:
-- al escribir esto había cuatro fotos reales en Vercel Blob, cargadas por el
-- panel, y este guion no las toca.
--
--   npm run prod:sql -- db/seed/fotos_tours.sql
-- ---------------------------------------------------------------------------

begin;

update product_media m set url = v.url
  from (values
    ('buceo-en-el-arrecife-de-cozumel', 1, 'https://images.unsplash.com/photo-1708649290066-5f617003b93f'),
    ('buceo-en-el-arrecife-de-cozumel', 2, 'https://images.unsplash.com/photo-1544551763-46a013bb70d5'),
    ('buceo-en-el-arrecife-de-cozumel', 3, 'https://images.unsplash.com/photo-1682687981630-cefe9cd73072'),
    ('buceo-en-el-arrecife-de-cozumel', 4, 'https://images.unsplash.com/photo-1682687982502-1529b3b33f85'),
    ('buceo-en-el-arrecife-de-cozumel', 5, 'https://images.unsplash.com/photo-1637308109237-4ea1a7dd22f5'),
    ('catamaran-al-arrecife-de-playa-del-carmen', 1, 'https://images.unsplash.com/photo-1773594559238-1f4bcf8672a8'),
    ('catamaran-al-arrecife-de-playa-del-carmen', 2, 'https://images.unsplash.com/photo-1617566852666-c8346df97d5b'),
    ('catamaran-al-arrecife-de-playa-del-carmen', 3, 'https://images.unsplash.com/photo-1773593893090-27d17a880a07'),
    ('catamaran-al-arrecife-de-playa-del-carmen', 4, 'https://images.unsplash.com/photo-1771373119629-8f73d660cb7d'),
    ('catamaran-al-arrecife-de-playa-del-carmen', 5, 'https://images.unsplash.com/photo-1767984469128-73481dc3a7e9'),
    ('catamaran-arrecife-playa', 1, 'https://images.unsplash.com/photo-1758131081904-b50245dab0c2'),
    ('catamaran-arrecife-playa', 2, 'https://images.unsplash.com/photo-1758131081883-d0b0c52d3a82'),
    ('catamaran-arrecife-playa', 3, 'https://images.unsplash.com/photo-1758131081890-d2b893c2e919'),
    ('catamaran-arrecife-playa', 4, 'https://images.unsplash.com/photo-1757873780458-72143acc1c9a'),
    ('catamaran-arrecife-playa', 5, 'https://images.unsplash.com/photo-1757873780411-67026735ac1f'),
    ('snorkel-en-los-cenotes-de-tulum', 1, 'https://images.unsplash.com/photo-1548623826-a1aa0a4d8a5b'),
    ('snorkel-en-los-cenotes-de-tulum', 2, 'https://images.unsplash.com/photo-1659775226523-b31d25ddb5fa'),
    ('snorkel-en-los-cenotes-de-tulum', 3, 'https://images.unsplash.com/photo-1522093243371-296c79a66df4'),
    ('snorkel-en-los-cenotes-de-tulum', 4, 'https://images.unsplash.com/photo-1522094522800-6e0189c77a16'),
    ('snorkel-en-los-cenotes-de-tulum', 5, 'https://images.unsplash.com/photo-1601902726356-c536ab69488f'),
    ('snorkel-cenotes-tulum', 1, 'https://images.unsplash.com/photo-1719941463960-f3310fe64e46'),
    ('snorkel-cenotes-tulum', 2, 'https://images.unsplash.com/photo-1617647291464-31ac25fc42cd'),
    ('snorkel-cenotes-tulum', 3, 'https://images.unsplash.com/photo-1719941463990-bbc52886f678'),
    ('snorkel-cenotes-tulum', 4, 'https://images.unsplash.com/photo-1625054048777-046490b298a6'),
    ('snorkel-cenotes-tulum', 5, 'https://images.unsplash.com/photo-1546838849-6eb6269ae2db'),
    ('musa-snorkel-arrecife-manchones', 1, 'https://images.unsplash.com/photo-1623408998510-a52ef2fdb1fe'),
    ('musa-snorkel-arrecife-manchones', 2, 'https://images.unsplash.com/photo-1544642058-c5d172ab955c'),
    ('musa-snorkel-arrecife-manchones', 3, 'https://images.unsplash.com/photo-1544642058-31c903fce9e0'),
    ('musa-snorkel-arrecife-manchones', 4, 'https://images.unsplash.com/photo-1633332374497-185820eea198'),
    ('musa-snorkel-arrecife-manchones', 5, 'https://images.unsplash.com/photo-1708712373866-f52221679553'),
    ('isla-contoy-e-isla-mujeres', 1, 'https://images.unsplash.com/photo-1639600966747-a39b77cd266e'),
    ('isla-contoy-e-isla-mujeres', 2, 'https://images.unsplash.com/photo-1618578907040-e8e81b085dfb'),
    ('isla-contoy-e-isla-mujeres', 3, 'https://images.unsplash.com/photo-1586860249973-87f4c054f395'),
    ('isla-contoy-e-isla-mujeres', 4, 'https://images.unsplash.com/photo-1657205895605-e149ccabbd07'),
    ('isla-contoy-e-isla-mujeres', 5, 'https://images.unsplash.com/photo-1773412043094-453c9d983ffb'),
    ('chichen-itza-cenote-y-valladolid', 1, 'https://images.unsplash.com/photo-1568402102990-bc541580b59f'),
    ('chichen-itza-cenote-y-valladolid', 2, 'https://images.unsplash.com/photo-1518638150340-f706e86654de'),
    ('chichen-itza-cenote-y-valladolid', 3, 'https://images.unsplash.com/photo-1620636607286-087f5a7b5716'),
    ('chichen-itza-cenote-y-valladolid', 4, 'https://images.unsplash.com/photo-1695385246146-1e12a7479410'),
    ('chichen-itza-cenote-y-valladolid', 5, 'https://images.unsplash.com/photo-1595450653862-394dfc73053d'),
    ('cenotes-cristalino-azul-y-eden', 1, 'https://images.unsplash.com/photo-1766776341444-f8f5c95693cc'),
    ('cenotes-cristalino-azul-y-eden', 2, 'https://images.unsplash.com/photo-1613096108760-7cff29fceb15'),
    ('cenotes-cristalino-azul-y-eden', 3, 'https://images.unsplash.com/photo-1762360100428-ab39cdd068b1'),
    ('cenotes-cristalino-azul-y-eden', 4, 'https://images.unsplash.com/photo-1659571922634-0e4c626c737c'),
    ('cenotes-cristalino-azul-y-eden', 5, 'https://images.unsplash.com/photo-1532449637670-ba23a300b8ff'),
    ('sabores-de-la-quinta-avenida', 1, 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f'),
    ('sabores-de-la-quinta-avenida', 2, 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b'),
    ('sabores-de-la-quinta-avenida', 3, 'https://images.unsplash.com/photo-1552332386-f8dd00dc2f85'),
    ('sabores-de-la-quinta-avenida', 4, 'https://images.unsplash.com/photo-1564767655658-4e6b365884ff'),
    ('sabores-de-la-quinta-avenida', 5, 'https://images.unsplash.com/photo-1599488400918-5f5f96b3f463'),
    ('bautismo-de-buceo-playa', 1, 'https://images.unsplash.com/photo-1517627043994-b991abb62fc8'),
    ('bautismo-de-buceo-playa', 2, 'https://images.unsplash.com/photo-1602199926649-2e5e447bab97'),
    ('bautismo-de-buceo-playa', 3, 'https://images.unsplash.com/photo-1544551763-8dd44758c2dd'),
    ('bautismo-de-buceo-playa', 4, 'https://images.unsplash.com/photo-1682687982360-3fbab65f9d50'),
    ('bautismo-de-buceo-playa', 5, 'https://images.unsplash.com/photo-1727095388910-e09f14913505'),
    ('ruinas-de-tulum-al-amanecer', 1, 'https://images.unsplash.com/photo-1638552713889-2d678079d441'),
    ('ruinas-de-tulum-al-amanecer', 2, 'https://images.unsplash.com/photo-1675525934798-552bdc8c45ab'),
    ('ruinas-de-tulum-al-amanecer', 3, 'https://images.unsplash.com/photo-1665618980645-ca9cd5e68508'),
    ('ruinas-de-tulum-al-amanecer', 4, 'https://images.unsplash.com/photo-1733836851488-0c3b841476e3'),
    ('ruinas-de-tulum-al-amanecer', 5, 'https://images.unsplash.com/photo-1670353032525-6a18b5311627'),
    ('coba-en-bicicleta-y-dos-cenotes', 1, 'https://images.unsplash.com/photo-1665617529813-80903f36f1c3'),
    ('coba-en-bicicleta-y-dos-cenotes', 2, 'https://images.unsplash.com/photo-1681686587641-45cd5bd876d9'),
    ('coba-en-bicicleta-y-dos-cenotes', 3, 'https://images.unsplash.com/photo-1681686587163-d43e66063208'),
    ('coba-en-bicicleta-y-dos-cenotes', 4, 'https://images.unsplash.com/photo-1681686589384-b43106562e3d'),
    ('coba-en-bicicleta-y-dos-cenotes', 5, 'https://images.unsplash.com/photo-1681686586861-19013ef8be90'),
    ('buceo-palancar-y-colombia', 1, 'https://images.unsplash.com/photo-1510074232337-05d50fa189ba'),
    ('buceo-palancar-y-colombia', 2, 'https://images.unsplash.com/photo-1682686581663-179efad3cd2f'),
    ('buceo-palancar-y-colombia', 3, 'https://images.unsplash.com/photo-1682687982501-1e58ab814714'),
    ('buceo-palancar-y-colombia', 4, 'https://images.unsplash.com/photo-1683009427470-a36fee396389'),
    ('buceo-palancar-y-colombia', 5, 'https://images.unsplash.com/photo-1682686581295-7364cabf5511'),
    ('snorkel-el-cielo-colombia-y-palancar', 1, 'https://images.unsplash.com/photo-1770387755634-c5ceb4245545'),
    ('snorkel-el-cielo-colombia-y-palancar', 2, 'https://images.unsplash.com/photo-1690336608051-2b3ed79c4a10'),
    ('snorkel-el-cielo-colombia-y-palancar', 3, 'https://images.unsplash.com/photo-1664016423953-f4c8208f7463'),
    ('snorkel-el-cielo-colombia-y-palancar', 4, 'https://images.unsplash.com/photo-1788082578513-610be83d47f8'),
    ('snorkel-el-cielo-colombia-y-palancar', 5, 'https://images.unsplash.com/photo-1783950231870-b21ef4b1ae57'),
    ('cozumel-en-jeep-punta-sur-y-chen-rio', 1, 'https://images.unsplash.com/photo-1531000891902-d11b2b80a403'),
    ('cozumel-en-jeep-punta-sur-y-chen-rio', 2, 'https://images.unsplash.com/photo-1580432834936-24dbdd9c0dda'),
    ('cozumel-en-jeep-punta-sur-y-chen-rio', 3, 'https://images.unsplash.com/photo-1636138105000-6e8eb02a744e'),
    ('cozumel-en-jeep-punta-sur-y-chen-rio', 4, 'https://images.unsplash.com/photo-1660005487813-0a17f9ac3780'),
    ('cozumel-en-jeep-punta-sur-y-chen-rio', 5, 'https://images.unsplash.com/photo-1612911912526-bc8815e23812'),
    ('snorkel-el-farito-y-manchones', 1, 'https://images.unsplash.com/photo-1764499920643-7c15404c828e'),
    ('snorkel-el-farito-y-manchones', 2, 'https://images.unsplash.com/photo-1764499920647-78b5fedf92c6'),
    ('snorkel-el-farito-y-manchones', 3, 'https://images.unsplash.com/photo-1765415368149-78eaee96564d'),
    ('snorkel-el-farito-y-manchones', 4, 'https://images.unsplash.com/photo-1771521364782-b88e79c6a998'),
    ('snorkel-el-farito-y-manchones', 5, 'https://images.unsplash.com/photo-1764499920640-b6f06b5aed71'),
    ('vuelta-a-la-isla-en-carrito-de-golf', 1, 'https://images.unsplash.com/photo-1697744998861-23190bd3ec54'),
    ('vuelta-a-la-isla-en-carrito-de-golf', 2, 'https://images.unsplash.com/photo-1678973167977-28f7b7737cdd'),
    ('vuelta-a-la-isla-en-carrito-de-golf', 3, 'https://images.unsplash.com/photo-1740479772666-2e431ea28711'),
    ('vuelta-a-la-isla-en-carrito-de-golf', 4, 'https://images.unsplash.com/photo-1782556987577-8f6efdfdf9f3'),
    ('vuelta-a-la-isla-en-carrito-de-golf', 5, 'https://images.unsplash.com/photo-1767456992061-a9c02d7b33ca'),
    ('pesca-de-altura-isla-mujeres', 1, 'https://images.unsplash.com/photo-1625183656263-171183307b15'),
    ('pesca-de-altura-isla-mujeres', 2, 'https://images.unsplash.com/photo-1592132886027-b7bbc39a22e5'),
    ('pesca-de-altura-isla-mujeres', 3, 'https://images.unsplash.com/photo-1559036211-aac71e257f9c'),
    ('pesca-de-altura-isla-mujeres', 4, 'https://images.unsplash.com/photo-1537872384762-e785271d14f8'),
    ('pesca-de-altura-isla-mujeres', 5, 'https://images.unsplash.com/photo-1542809665-21a8657b97f3'),
    ('paseo-de-las-tres-islas-holbox', 1, 'https://images.unsplash.com/photo-1647440386146-4645654bc802'),
    ('paseo-de-las-tres-islas-holbox', 2, 'https://images.unsplash.com/photo-1760797057441-6072a4ccdb90'),
    ('paseo-de-las-tres-islas-holbox', 3, 'https://images.unsplash.com/photo-1758135005218-f18e2a3c3ce8'),
    ('paseo-de-las-tres-islas-holbox', 4, 'https://images.unsplash.com/photo-1758135005519-9e60fa133ebf'),
    ('paseo-de-las-tres-islas-holbox', 5, 'https://images.unsplash.com/photo-1758135005225-8305c069e7f4'),
    ('bioluminiscencia-en-punta-coco', 1, 'https://images.unsplash.com/photo-1579332550177-31a901024747'),
    ('bioluminiscencia-en-punta-coco', 2, 'https://images.unsplash.com/photo-1564052564443-b2bda4494a1f'),
    ('bioluminiscencia-en-punta-coco', 3, 'https://images.unsplash.com/photo-1588191512760-286c06f347d3'),
    ('bioluminiscencia-en-punta-coco', 4, 'https://images.unsplash.com/photo-1593547103424-4aa8c049b952'),
    ('bioluminiscencia-en-punta-coco', 5, 'https://images.unsplash.com/photo-1508178612945-6736504c248b'),
    ('kayak-en-el-manglar-de-holbox', 1, 'https://images.unsplash.com/photo-1589556183130-530470785fab'),
    ('kayak-en-el-manglar-de-holbox', 2, 'https://images.unsplash.com/photo-1612103183244-7598b792bb05'),
    ('kayak-en-el-manglar-de-holbox', 3, 'https://images.unsplash.com/photo-1618288389681-f135edea12db'),
    ('kayak-en-el-manglar-de-holbox', 4, 'https://images.unsplash.com/photo-1661707745074-7ac649196b26'),
    ('kayak-en-el-manglar-de-holbox', 5, 'https://images.unsplash.com/photo-1667885565182-072c68ad3c97'),
    ('velero-por-la-laguna-de-los-siete-colores', 1, 'https://images.unsplash.com/photo-1776347441311-d831b72fce5b'),
    ('velero-por-la-laguna-de-los-siete-colores', 2, 'https://images.unsplash.com/photo-1780415472374-a9dfff1a3608'),
    ('velero-por-la-laguna-de-los-siete-colores', 3, 'https://images.unsplash.com/photo-1776157583672-c3fd4f68a59e'),
    ('velero-por-la-laguna-de-los-siete-colores', 4, 'https://images.unsplash.com/photo-1759472287837-927ac19d1065'),
    ('velero-por-la-laguna-de-los-siete-colores', 5, 'https://images.unsplash.com/photo-1604729220139-314542b85436'),
    ('kayak-al-amanecer-canal-de-los-piratas', 1, 'https://images.unsplash.com/photo-1450500392544-c2cb0fd6e3b8'),
    ('kayak-al-amanecer-canal-de-los-piratas', 2, 'https://images.unsplash.com/photo-1569965335962-2317ff2a7658'),
    ('kayak-al-amanecer-canal-de-los-piratas', 3, 'https://images.unsplash.com/photo-1525721653822-f9975a57cd4c'),
    ('kayak-al-amanecer-canal-de-los-piratas', 4, 'https://images.unsplash.com/photo-1436162716854-dcb9157bfac1'),
    ('kayak-al-amanecer-canal-de-los-piratas', 5, 'https://images.unsplash.com/photo-1671550363244-eaaae0b16d43'),
    ('cenote-azul-los-rapidos-y-cocalitos', 1, 'https://images.unsplash.com/photo-1729563475971-596608abde22'),
    ('cenote-azul-los-rapidos-y-cocalitos', 2, 'https://images.unsplash.com/photo-1774977408230-c750e084c862'),
    ('cenote-azul-los-rapidos-y-cocalitos', 3, 'https://images.unsplash.com/photo-1603131747133-e95271822da5'),
    ('cenote-azul-los-rapidos-y-cocalitos', 4, 'https://images.unsplash.com/photo-1576246837439-dd0d7f347759'),
    ('cenote-azul-los-rapidos-y-cocalitos', 5, 'https://images.unsplash.com/photo-1715366291890-91f130f0952e'),
    ('snorkel-parque-nacional-puerto-morelos', 1, 'https://images.unsplash.com/photo-1720043792249-ce6ad74dda23'),
    ('snorkel-parque-nacional-puerto-morelos', 2, 'https://images.unsplash.com/photo-1642604024740-50d7abae650f'),
    ('snorkel-parque-nacional-puerto-morelos', 3, 'https://images.unsplash.com/photo-1568558490322-78fbc203f898'),
    ('snorkel-parque-nacional-puerto-morelos', 4, 'https://images.unsplash.com/photo-1583237559242-1c4e4764ad1f'),
    ('snorkel-parque-nacional-puerto-morelos', 5, 'https://images.unsplash.com/photo-1682829230193-74ddc0bdfff4'),
    ('ruta-de-los-cenotes-tirolesas-y-caverna', 1, 'https://images.unsplash.com/photo-1648853070657-6d58398bee93'),
    ('ruta-de-los-cenotes-tirolesas-y-caverna', 2, 'https://images.unsplash.com/photo-1637511077877-3c6a00eb32ba'),
    ('ruta-de-los-cenotes-tirolesas-y-caverna', 3, 'https://images.unsplash.com/photo-1712782516688-cbcbf93b1b7c'),
    ('ruta-de-los-cenotes-tirolesas-y-caverna', 4, 'https://images.unsplash.com/photo-1675259113512-db50297ce326'),
    ('ruta-de-los-cenotes-tirolesas-y-caverna', 5, 'https://images.unsplash.com/photo-1679117730976-cdb5f6b05b88'),
    ('amanecer-en-paddle-sobre-el-arrecife', 1, 'https://images.unsplash.com/photo-1749453841410-46944b876188'),
    ('amanecer-en-paddle-sobre-el-arrecife', 2, 'https://images.unsplash.com/photo-1761172889709-5431a9d59078'),
    ('amanecer-en-paddle-sobre-el-arrecife', 3, 'https://images.unsplash.com/photo-1667572389374-b8e01ee14059'),
    ('amanecer-en-paddle-sobre-el-arrecife', 4, 'https://images.unsplash.com/photo-1633604909631-14cc6fbca9e9'),
    ('amanecer-en-paddle-sobre-el-arrecife', 5, 'https://images.unsplash.com/photo-1667572389366-2181af745491')
,
    ('sian-kaan-canal-maya-de-muyil', 1, 'https://images.unsplash.com/photo-1634630183190-203e01d0e79f'),
    ('sian-kaan-canal-maya-de-muyil', 2, 'https://images.unsplash.com/photo-1714577419068-45189e7bda58'),
    ('sian-kaan-canal-maya-de-muyil', 3, 'https://images.unsplash.com/photo-1783503812345-a4ba70d76564'),
    ('sian-kaan-canal-maya-de-muyil', 4, 'https://images.unsplash.com/photo-1591057153717-8ef861f42032'),
    ('sian-kaan-canal-maya-de-muyil', 5, 'https://images.unsplash.com/photo-1759496959924-b2d79dcdda18')
  ) as v(slug, position, url)
  join products p on p.slug = v.slug
 where m.product_id = p.id
   and m.position = v.position
   -- Solo el relleno: una foto que ya subió el cliente no se toca.
   and m.url like 'https://picsum.photos/%';

-- Las variantes, que es lo que mantiene la página dentro del presupuesto: el
-- JPEG de 1200 px pesa 214 kB y el AVIF de 400 —el tamaño real de una
-- tarjeta— pesa 19. Los anchos caen justo encima de los que se usan: con
-- escalones por debajo, `srcset` salta al siguiente y la página engorda.
update product_media m
   set url = s.base || '?w=800&fit=crop&fm=jpg&q=65',
       variants = jsonb_build_object(
         'avif', jsonb_build_object(
           '400',  s.base || '?w=400&fit=crop&fm=avif&q=42',
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
declare reales integer; relleno integer; propias integer;
begin
  select count(*) into reales from product_media m join products p on p.id=m.product_id
   where p.kind='tour' and m.url like 'https://images.unsplash.com/%';
  select count(*) into relleno from product_media m join products p on p.id=m.product_id
   where p.kind='tour' and m.url like 'https://picsum.photos/%';
  select count(*) into propias from product_media m join products p on p.id=m.product_id
   where p.kind='tour' and m.url not like 'https://images.unsplash.com/%'
     and m.url not like 'https://picsum.photos/%';
  raise notice '── fotos de tours: % de Unsplash, % del cliente (intactas), % de relleno',
    reales, propias, relleno;
end;
$$;

commit;
