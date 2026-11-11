-- ---------------------------------------------------------------------------
-- Embarcaciones de Adri · dieciséis barcos que se rentan enteros
--
-- Fuente: las fichas en PDF que mandó el cliente el 2026-11-10 (una por barco;
-- "SEARAY 55" y "SEARAY SEDAN 40" llegaron duplicadas y se cargan una vez).
-- Cada precio, cupo, cuota de muelle y renglón de "incluye" sale de ahí. Lo que
-- la ficha NO dice y hubo que suponer está marcado con «SUPUESTO» y se repite
-- en docs/decisiones/0022: se confirma con Adri antes de publicar.
--
-- Cómo se cobra (decisión 0022): el precio de cada opción es **el barco**, para
-- hasta `incluidos` personas; de ahí en adelante cada persona paga el precio de
-- pasajero extra, y todas pagan la cuota de muelle. Por eso un barco sin
-- pasajero extra lleva `extra_adulto = 0` y `cupo = incluidos`.
--
-- **Lo que NO hace, a propósito:**
--
--   1. **No publica.** Todo nace en borrador. Publicar exige foto (la regla del
--      panel) y el punto de encuentro, y los dos faltan: las marinas varían por
--      barco y no vienen en las fichas. Se publica desde el panel, uno por uno.
--   2. **No pone destino ni punto de encuentro.** Se cargan con
--      `db/arreglos/marinas-embarcaciones.sql` cuando Adri diga de dónde zarpa
--      cada uno. Sin destino, la zona horaria es la de Quintana Roo
--      (America/Cancun), que es la de cualquier marina del Caribe mexicano.
--   3. **No toca nada existente.** Solo inserta, con la llave natural por
--      delante. Correrlo otra vez agrega el día 121 de salidas y nada más.
--
-- Cómo correrlo:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/embarcaciones_adri.sql
--   npm run prod:sql -- db/seed/embarcaciones_adri.sql      # producción
-- ---------------------------------------------------------------------------

begin;

do $$
begin
  raise notice '── base: % en %', current_database(), coalesce(host(inet_server_addr()), 'local');
  raise notice '── antes: % barco(s) de Adri',
    (select count(*) from products where slug like 'barco-%');
end $$;

-- 1. Los barcos ---------------------------------------------------------------

create temporary table emb_barco (
  slug           text primary key,
  position       integer not null,
  cupo           integer not null,   -- personas que caben
  incluidos      integer not null,   -- personas que cubre el precio del barco
  muelle_cents   bigint  not null,   -- cuota de muelle por persona
  nino_min       integer,            -- edad del "niño" con tarifa propia, si la hay
  nino_max       integer,
  name_es        text not null,
  name_en        text not null,
  summary_es     text not null,
  summary_en     text not null,
  description_es text not null,
  description_en text not null,
  highlights_es  jsonb not null,
  highlights_en  jsonb not null,
  included_es    jsonb not null,
  included_en    jsonb not null,
  excluded_es    jsonb not null default '[]',
  excluded_en    jsonb not null default '[]'
) on commit drop;

insert into emb_barco values
  ('barco-bertram-46', 300, 10, 10, 1000, null, null,
   'Bertram 46 · pesca deportiva y paseo',
   'Bertram 46 · sport fishing and cruise',
   'Yate de pesca deportiva de 46 pies, privado para hasta 10 personas, con capitán, tripulación y equipo de pesca.',
   '46-ft sport-fishing yacht, private for up to 10 guests, with captain, crew and fishing gear.',
   'Un Bertram de 46 pies solo para tu grupo, para salir a pescar o a pasear. El precio es por el barco completo, hasta 10 personas, y ya incluye capitán, tripulación, cañas, carnada y equipo de snorkel. Hay salidas de 4, 6 y 8 horas y una ruta de día completo a Cozumel; en las de 6 y 8 horas el snack incluye sándwiches.',
   'A 46-ft Bertram just for your group, for fishing or cruising. The price is for the whole boat, up to 10 guests, and already includes captain, crew, rods, bait and snorkel gear. Choose 4, 6 or 8 hours or a full-day trip to Cozumel; 6 and 8-hour trips add sandwiches to the snack.',
   '["Barco privado: solo va tu grupo", "Capitán y tripulación incluidos", "Cañas, carnada y equipo de snorkel a bordo"]',
   '["Private boat: just your group", "Captain and crew included", "Rods, bait and snorkel gear on board"]',
   '["Agua, refrescos y cervezas", "Tequila", "Ceviche o sashimi", "Snack (sándwiches solo en 6 y 8 horas)", "Chalecos salvavidas", "Aletas y visores", "Cañas de pesca y carnada", "Capitán y tripulación"]',
   '["Water, soft drinks and beer", "Tequila", "Ceviche or sashimi", "Snack (sandwiches on 6 and 8-hour trips only)", "Life jackets", "Fins and masks", "Fishing rods and bait", "Captain and crew"]',
   '[]', '[]'),

  ('barco-catamaran-65', 301, 100, 10, 1500, null, null,
   'Catamarán 65 pies para grupos',
   '65-ft catamaran for groups',
   'Catamarán de 65 pies para grupos de 10 a 100 personas, con comida a elegir y barra libre.',
   '65-ft catamaran for groups of 10 to 100 guests, with a choice of meal and open bar.',
   'El catamarán de 65 pies es para grupos grandes: el precio cubre a las primeras 10 personas y cada persona adicional paga su lugar, hasta 100. Cada quien elige su plato —hamburguesa, NY steak, filete de pescado o pechuga de pollo— con ensalada mixta y papas al horno, y la barra libre va todo el recorrido.',
   'The 65-ft catamaran is built for big groups: the price covers the first 10 guests and each additional guest pays their own seat, up to 100. Everyone picks a main —burger, NY steak, fish fillet or chicken breast— with mixed salad and baked potatoes, and the open bar runs the whole trip.',
   '["Hasta 100 personas a bordo", "Menú de cuatro platos a elegir", "Barra libre todo el recorrido"]',
   '["Up to 100 guests on board", "Choice of four main dishes", "Open bar the whole trip"]',
   '["Menú a elegir: hamburguesa con o sin queso, NY steak, filete de pescado o pechuga de pollo", "Guarnición: ensalada mixta y papas al horno", "Barra libre: vino tinto y blanco, cerveza, ron, vodka y tequila", "Coca-Cola, Fresca, Sprite, agua mineral, agua natural, jugos y hielo"]',
   '["Choice of main: burger with or without cheese, NY steak, fish fillet or chicken breast", "Sides: mixed salad and baked potatoes", "Open bar: red and white wine, beer, rum, vodka and tequila", "Coca-Cola, Fresca, Sprite, sparkling and still water, juices and ice"]',
   '["Hora extra: US$650, se arregla a bordo"]',
   '["Extra hour: US$650, arranged on board"]'),

  ('barco-catamaran-fontaine-46', 302, 20, 15, 2000, null, null,
   'Catamarán Fontaine 46',
   'Fontaine 46 catamaran',
   'Catamarán de 46 pies, privado para hasta 15 personas (20 con pasajeros extra), con menú tropical y barra libre.',
   '46-ft catamaran, private for up to 15 guests (20 with extra guests), with tropical menu and open bar.',
   'Un catamarán de vela de 46 pies para tu grupo: el precio cubre hasta 15 personas y caben 20. Sale 4, 6 u 8 horas por la Riviera Maya, o 8 horas a Cozumel. A bordo hay guacamole y ceviche de camarón con barra libre; en las salidas de 6 y 8 horas se suman fruta de temporada y hamburguesas.',
   'A 46-ft sailing catamaran for your group: the price covers up to 15 guests and it fits 20. Sail for 4, 6 or 8 hours along the Riviera Maya, or 8 hours to Cozumel. Guacamole and shrimp ceviche with open bar on board; 6 and 8-hour trips add seasonal fruit and burgers.',
   '["Catamarán de vela privado", "Ruta Riviera Maya o Cozumel", "Barra libre con whisky y vino"]',
   '["Private sailing catamaran", "Riviera Maya or Cozumel route", "Open bar with whisky and wine"]',
   '["Menú tropical: guacamole y ceviche de camarón", "Barra libre: cerveza, ron, vodka, tequila, whisky, vino blanco y tinto", "Agua, refrescos, agua mineral y jugos", "En 6 y 8 horas: fruta de temporada y hamburguesas"]',
   '["Tropical menu: guacamole and shrimp ceviche", "Open bar: beer, rum, vodka, tequila, whisky, white and red wine", "Water, soft drinks, sparkling water and juices", "On 6 and 8-hour trips: seasonal fruit and burgers"]',
   '["Hora extra: US$300, se arregla a bordo"]',
   '["Extra hour: US$300, arranged on board"]'),

  ('barco-catamaran-leopard-47', 303, 35, 15, 2000, 2, 6,
   'Catamarán Leopard 47',
   'Leopard 47 catamaran',
   'Catamarán de 47 pies con cabina con aire, 4 camarotes y 4 baños, privado para hasta 15 personas y con lugar para 35.',
   '47-ft catamaran with air-conditioned cabin, 4 cabins and 4 bathrooms, private for up to 15 guests with room for 35.',
   'El Leopard 47 es un catamarán totalmente equipado: cabina con aire acondicionado, cocina, sala, cuatro camarotes y cuatro baños con regadera. En la proa hay camastros, y a bordo van equipo de snorkel, paddle board y equipo de pesca. El precio cubre hasta 15 personas; cada persona extra paga su lugar hasta 35, y los niños de 2 a 6 años pagan la mitad.',
   'The Leopard 47 is a fully equipped catamaran: air-conditioned cabin, galley, lounge, four cabins and four bathrooms with showers. Loungers on the bow, plus snorkel gear, paddle board and fishing gear on board. The price covers up to 15 guests; each extra guest pays their seat up to 35, and children aged 2 to 6 pay half.',
   '["Cabina con aire, 4 camarotes y 4 baños", "Snorkel, paddle board y pesca a bordo", "Niños de 2 a 6 años pagan la mitad"]',
   '["Air-conditioned cabin, 4 cabins and 4 bathrooms", "Snorkel, paddle board and fishing on board", "Children 2 to 6 pay half"]',
   '["Menú tropical: guacamole y ceviche de camarón", "Fruta de temporada, carnes frías y quesos", "Canapés de salmón y ensalada clásica", "Fajitas de pollo o res, totopos y papas", "Para niños: mini sándwiches", "Barra libre: tequila, ron, vodka, whisky y coctelería clásica", "Refrescos, agua mineral, agua natural y jugos", "Equipo de snorkel, paddle board y equipo de pesca", "Audio con Bluetooth"]',
   '["Tropical menu: guacamole and shrimp ceviche", "Seasonal fruit, cold cuts and cheese", "Salmon canapés and classic salad", "Chicken or beef fajitas, tortilla chips and crisps", "For kids: mini sandwiches", "Open bar: tequila, rum, vodka, whisky and classic cocktails", "Soft drinks, sparkling and still water, and juices", "Snorkel gear, paddle board and fishing gear", "Bluetooth audio"]',
   '[]', '[]'),

  -- SUPUESTO: la ficha dice "1–4 PAX" y da precio de persona extra, pero no el
  -- máximo. Hasta que Adri lo diga, no se venden lugares extra en línea.
  ('barco-velero-cracovia', 304, 4, 4, 1000, null, null,
   'Velero Cracovia',
   'Cracovia sailboat',
   'Velero privado para hasta 4 personas: de 4 a 10 horas navegando, o un día a Cozumel.',
   'Private sailboat for up to 4 guests: 4 to 10 hours under sail, or a day trip to Cozumel.',
   'El Cracovia es un velero para salir a navegar en pareja o en grupo chico, de 4 a 10 horas o un día completo a Cozumel. Incluye agua, refrescos y 24 cervezas; en las salidas de 8 y 10 horas son 48 cervezas, con menú tropical y fruta de temporada. En las salidas cortas el menú tropical y la barra libre se agregan aparte.',
   'Cracovia is a sailboat for couples and small groups: 4 to 10 hours under sail or a full day to Cozumel. Water, soft drinks and 24 beers included; 8 and 10-hour trips include 48 beers, tropical menu and seasonal fruit. On shorter trips, tropical menu and open bar can be added.',
   '["Velero privado para grupos chicos", "De 4 a 10 horas, o a Cozumel", "Menú y barra libre como extra"]',
   '["Private sailboat for small groups", "4 to 10 hours, or to Cozumel", "Menu and open bar as add-ons"]',
   '["Agua, refrescos y 24 cervezas", "En 8 y 10 horas: 48 cervezas, menú tropical (guacamole y ceviche de camarón) y fruta de temporada"]',
   '["Water, soft drinks and 24 beers", "On 8 and 10-hour trips: 48 beers, tropical menu (guacamole and shrimp ceviche) and seasonal fruit"]',
   '[]', '[]'),

  ('barco-bruce-roberts-72', 305, 80, 15, 2000, null, null,
   'Yate Bruce Roberts 72',
   'Bruce Roberts 72 yacht',
   'Yate de 72 pies para grupos de hasta 80 personas, con barra libre y comida mexicana.',
   '72-ft yacht for groups of up to 80 guests, with open bar and Mexican food.',
   'Un yate de 72 pies para celebraciones y grupos grandes: el precio cubre a las primeras 15 personas y cada persona adicional paga su lugar, hasta 80. La barra libre lleva margaritas, cocteles, shots y cerveza, y la comida es pollo asado al fuego con guacamole, salsa mexicana, frijoles, arroz y tortillas.',
   'A 72-ft yacht for celebrations and big groups: the price covers the first 15 guests and each additional guest pays their seat, up to 80. Open bar with margaritas, mixed cocktails, shots and beer; the meal is fire-grilled chicken with guacamole, salsa, beans, rice and tortillas.',
   '["Hasta 80 personas a bordo", "Barra libre con margaritas y cocteles", "Pollo asado al fuego"]',
   '["Up to 80 guests on board", "Open bar with margaritas and cocktails", "Fire-grilled chicken"]',
   '["Barra libre: margaritas, cocteles mixtos, shots, cervezas y bebidas sin alcohol", "Guacamole y totopos", "Pollo sazonado y asado al fuego", "Salsa mexicana, frijoles, arroz y tortillas"]',
   '["Open bar: margaritas, mixed cocktails, shots, beer and soft drinks", "Guacamole and tortilla chips", "Seasoned fire-grilled chicken", "Salsa, beans, rice and tortillas"]',
   '[]', '[]'),

  ('barco-burger-80', 306, 80, 15, 2000, null, null,
   'Yate Burger 80',
   'Burger 80 yacht',
   'Yate de 80 pies con camarotes, para grupos de hasta 80 personas, con barra libre y comida mexicana.',
   '80-ft yacht with cabins, for groups of up to 80 guests, with open bar and Mexican food.',
   'El Burger de 80 pies es el más grande de la flota: el precio cubre a las primeras 15 personas y cada persona adicional paga su lugar, hasta 80. La barra libre lleva margaritas, cocteles, shots y cerveza, y la comida es pollo asado al fuego con guacamole, salsa mexicana, frijoles, arroz y tortillas.',
   'The 80-ft Burger is the largest boat in the fleet: the price covers the first 15 guests and each additional guest pays their seat, up to 80. Open bar with margaritas, mixed cocktails, shots and beer; the meal is fire-grilled chicken with guacamole, salsa, beans, rice and tortillas.',
   '["El yate más grande de la flota", "Hasta 80 personas a bordo", "Barra libre y comida mexicana"]',
   '["The largest yacht in the fleet", "Up to 80 guests on board", "Open bar and Mexican food"]',
   '["Barra libre: margaritas, cocteles mixtos, shots, cervezas y bebidas sin alcohol", "Guacamole y totopos", "Pollo sazonado y asado al fuego", "Salsa mexicana, frijoles, arroz y tortillas"]',
   '["Open bar: margaritas, mixed cocktails, shots, beer and soft drinks", "Guacamole and tortilla chips", "Seasoned fire-grilled chicken", "Salsa, beans, rice and tortillas"]',
   '[]', '[]'),

  ('barco-cabo-31', 307, 10, 10, 1000, null, null,
   'Cabo 31 · pesca y paseo',
   'Cabo 31 · fishing and cruise',
   'Lancha de 31 pies para pescar o pasear, privada para hasta 10 personas, con bebidas y menú tropical.',
   '31-ft boat for fishing or cruising, private for up to 10 guests, with drinks and tropical menu.',
   'Una Cabo de 31 pies para tu grupo, hasta 10 personas, de 4 a 8 horas. Las bebidas crecen con la salida: 12 aguas y 12 refrescos en 4 horas, 18 en 6 y 24 en 8, siempre con 24 cervezas, hielo, fruta y guacamole con ceviche de camarón.',
   'A 31-ft Cabo for your group, up to 10 guests, for 4 to 8 hours. Drinks scale with the trip: 12 waters and 12 soft drinks on 4 hours, 18 on 6 and 24 on 8, always with 24 beers, ice, fruit, guacamole and shrimp ceviche.',
   '["Lancha privada para 10", "Pesca o paseo, de 4 a 8 horas", "Guacamole y ceviche de camarón"]',
   '["Private boat for 10", "Fishing or cruising, 4 to 8 hours", "Guacamole and shrimp ceviche"]',
   '["24 cervezas, hielo y fruta", "Agua y refrescos: 12 y 12 en 4 horas, 18 y 18 en 6, 24 y 24 en 8", "Menú tropical: guacamole y ceviche de camarón"]',
   '["24 beers, ice and fruit", "Water and soft drinks: 12 + 12 on 4 hours, 18 + 18 on 6, 24 + 24 on 8", "Tropical menu: guacamole and shrimp ceviche"]',
   '[]', '[]'),

  ('barco-dusky-33', 308, 10, 10, 1000, null, null,
   'Dusky 33 · pesca y paseo',
   'Dusky 33 · fishing and cruise',
   'Lancha de 33 pies, privada para hasta 10 personas de paseo u 8 de pesca, con bebidas y menú tropical.',
   '33-ft boat, private for up to 10 guests cruising or 8 fishing, with drinks and tropical menu.',
   'Una Dusky de 33 pies para tu grupo: caben 10 de paseo y 8 si van a pescar. Sale 4, 6 u 8 horas, con 24 cervezas, hielo, fruta y guacamole con ceviche de camarón; el agua y los refrescos crecen con la salida.',
   'A 33-ft Dusky for your group: 10 guests cruising, 8 if fishing. Go out for 4, 6 or 8 hours with 24 beers, ice, fruit, guacamole and shrimp ceviche; water and soft drinks scale with the trip.',
   '["Lancha privada para 10 (8 de pesca)", "Pesca o paseo, de 4 a 8 horas", "Guacamole y ceviche de camarón"]',
   '["Private boat for 10 (8 fishing)", "Fishing or cruising, 4 to 8 hours", "Guacamole and shrimp ceviche"]',
   '["24 cervezas, hielo y fruta", "Agua y refrescos: 12 y 12 en 4 horas, 18 y 18 en 6, 24 y 24 en 8", "Menú tropical: guacamole y ceviche de camarón"]',
   '["24 beers, ice and fruit", "Water and soft drinks: 12 + 12 on 4 hours, 18 + 18 on 6, 24 + 24 on 8", "Tropical menu: guacamole and shrimp ceviche"]',
   '["De pesca caben 8 personas, no 10"]',
   '["Fishing trips take 8 guests, not 10"]'),

  ('barco-grady-white-27', 309, 10, 10, 1000, null, null,
   'Grady-White 27 · pesca y paseo',
   'Grady-White 27 · fishing and cruise',
   'Lancha de 27 pies, privada para hasta 10 personas de paseo u 8 de pesca, con bebidas y menú tropical.',
   '27-ft boat, private for up to 10 guests cruising or 8 fishing, with drinks and tropical menu.',
   'Una Grady-White de 27 pies con doble motor, para pescar o pasear con tu grupo: caben 10 de paseo y 8 de pesca. Sale 4, 6 u 8 horas, con 24 cervezas, hielo, fruta y guacamole con ceviche; en 6 y 8 horas el ceviche puede ser de camarón o de pescado.',
   'A twin-engine 27-ft Grady-White for fishing or cruising with your group: 10 guests cruising, 8 fishing. Go out for 4, 6 or 8 hours with 24 beers, ice, fruit, guacamole and ceviche; on 6 and 8 hours the ceviche can be shrimp or fish.',
   '["Lancha privada para 10 (8 de pesca)", "Pesca o paseo, de 4 a 8 horas", "Ceviche de camarón o pescado"]',
   '["Private boat for 10 (8 fishing)", "Fishing or cruising, 4 to 8 hours", "Shrimp or fish ceviche"]',
   '["24 cervezas, hielo y fruta", "Agua y refrescos: 12 y 12 en 4 horas, 18 y 18 en 6, 24 y 24 en 8", "Menú tropical: guacamole y ceviche (de camarón o de pescado en 6 y 8 horas)"]',
   '["24 beers, ice and fruit", "Water and soft drinks: 12 + 12 on 4 hours, 18 + 18 on 6, 24 + 24 on 8", "Tropical menu: guacamole and ceviche (shrimp, or fish on 6 and 8 hours)"]',
   '["De pesca caben 8 personas, no 10"]',
   '["Fishing trips take 8 guests, not 10"]'),

  -- SUPUESTO: la ficha lista "COZUMEL" sin precio; no se vende esa ruta en
  -- línea hasta tenerlo.
  ('barco-hatteras-50', 310, 18, 15, 1000, null, null,
   'Hatteras 50 · pesca y paseo',
   'Hatteras 50 · fishing and cruise',
   'Yate de 50 pies con camarotes y sala, privado para hasta 15 personas y con lugar para 18.',
   '50-ft yacht with cabins and lounge, private for up to 15 guests with room for 18.',
   'La Hatteras de 50 pies sirve igual para pescar que para pasear: tiene sala, camarotes y una proa amplia para asolearse. El precio cubre hasta 15 personas y caben 18. Incluye bebidas, hielo, fruta y guacamole con ceviche de camarón o pescado; en la salida de 8 horas se suma comida con carne asada.',
   'The 50-ft Hatteras works for fishing and for cruising: lounge, cabins and a wide bow for sunbathing. The price covers up to 15 guests and it fits 18. Drinks, ice, fruit and guacamole with shrimp or fish ceviche included; the 8-hour trip adds a grilled-beef lunch.',
   '["Yate de pesca y paseo de 50 pies", "Sala y camarotes a bordo", "Carne asada en la salida de 8 horas"]',
   '["50-ft fishing and cruising yacht", "Lounge and cabins on board", "Grilled beef on the 8-hour trip"]',
   '["Agua, refrescos, cervezas, hielo y fruta", "Menú tropical: guacamole y ceviche de camarón o pescado", "En 8 horas: comida con carne asada"]',
   '["Water, soft drinks, beer, ice and fruit", "Tropical menu: guacamole and shrimp or fish ceviche", "On 8 hours: lunch with grilled beef"]',
   '["Hora extra: US$250, se arregla a bordo"]',
   '["Extra hour: US$250, arranged on board"]'),

  ('barco-sea-ray-sundancer-48', 311, 14, 14, 2000, null, null,
   'Sea Ray Sundancer 48',
   'Sea Ray Sundancer 48',
   'Yate de 48 pies, privado para hasta 14 personas, con barra libre de marca y snorkel.',
   '48-ft yacht, private for up to 14 guests, with branded open bar and snorkeling.',
   'Un Sea Ray Sundancer de 48 pies para tu grupo, hasta 14 personas, de 4 a 8 horas. La barra libre es de marca —Bacardí, José Cuervo, Smirnoff, Black & White y vino— y a bordo hay guacamole y ceviche de camarón; en la salida de 8 horas se suman fajitas de pollo, fruta y snacks. Se puede pescar y hacer snorkel.',
   'A 48-ft Sea Ray Sundancer for your group, up to 14 guests, for 4 to 8 hours. Branded open bar —Bacardí, José Cuervo, Smirnoff, Black & White and wine— with guacamole and shrimp ceviche; the 8-hour trip adds chicken fajitas, fruit and snacks. Fishing and snorkeling on board.',
   '["Yate privado para 14", "Barra libre de marca", "Pesca y snorkel"]',
   '["Private yacht for 14", "Branded open bar", "Fishing and snorkeling"]',
   '["Agua, refrescos, cervezas y jugos (arándano, piña y naranja)", "Barra libre: ron Bacardí blanco, tequila José Cuervo, vodka Smirnoff, whisky Black & White, vino tinto y blanco", "Menú tropical: guacamole y ceviche de camarón", "En 8 horas: fajitas de pollo, fruta de temporada y snacks", "Pesca y snorkel"]',
   '["Water, soft drinks, beer and juices (cranberry, pineapple and orange)", "Open bar: Bacardí white rum, José Cuervo tequila, Smirnoff vodka, Black & White whisky, red and white wine", "Tropical menu: guacamole and shrimp ceviche", "On 8 hours: chicken fajitas, seasonal fruit and snacks", "Fishing and snorkeling"]',
   '[]', '[]'),

  ('barco-wellcraft-35', 312, 10, 10, 1000, null, null,
   'Wellcraft 35 · pesca y paseo',
   'Wellcraft 35 · fishing and cruise',
   'Lancha de 35 pies, privada para hasta 10 personas de paseo u 8 de pesca, con bebidas y menú tropical.',
   '35-ft boat, private for up to 10 guests cruising or 8 fishing, with drinks and tropical menu.',
   'Una Wellcraft de 35 pies con torre de pesca, para salir con tu grupo: caben 10 de paseo y 8 de pesca. Sale 4, 6 u 8 horas, con 24 cervezas, hielo, fruta y guacamole con ceviche de camarón; el agua y los refrescos crecen con la salida.',
   'A 35-ft Wellcraft with fishing tower for your group: 10 guests cruising, 8 fishing. Go out for 4, 6 or 8 hours with 24 beers, ice, fruit, guacamole and shrimp ceviche; water and soft drinks scale with the trip.',
   '["Lancha privada para 10 (8 de pesca)", "Pesca o paseo, de 4 a 8 horas", "Guacamole y ceviche de camarón"]',
   '["Private boat for 10 (8 fishing)", "Fishing or cruising, 4 to 8 hours", "Guacamole and shrimp ceviche"]',
   '["24 cervezas, hielo y fruta", "Agua y refrescos: 12 y 12 en 4 horas, 18 y 18 en 6, 24 y 24 en 8", "Menú tropical: guacamole y ceviche de camarón"]',
   '["24 beers, ice and fruit", "Water and soft drinks: 12 + 12 on 4 hours, 18 + 18 on 6, 24 + 24 on 8", "Tropical menu: guacamole and shrimp ceviche"]',
   '["De pesca caben 8 personas, no 10"]',
   '["Fishing trips take 8 guests, not 10"]'),

  -- SUPUESTO: la ficha dice "1-12 PAX" y da precio de pasajero extra y de
  -- niño, pero no el máximo. Hasta que Adri lo diga, no se venden extra.
  ('barco-sea-ray-55', 313, 12, 12, 2000, 2, 6,
   'Sea Ray 55',
   'Sea Ray 55',
   'Yate de 55 pies con aire acondicionado y wifi, privado para hasta 12 personas, con paddle board y alfombra flotante.',
   '55-ft yacht with air conditioning and wifi, private for up to 12 guests, with paddle board and floating mat.',
   'El yate de 55 pies es el más equipado para pasar el día en el agua: aire acondicionado, música por Bluetooth, wifi, alfombra flotante, paddle board, equipo de snorkel y toallas. Sale de 4 a 8 horas o a Cozumel, con snacks, ceviche de camarón, guacamole, bruschetta y barra libre de tequila, ron, vodka y cerveza.',
   'The 55-ft yacht is the best equipped for a day on the water: air conditioning, Bluetooth music, wifi, floating mat, paddle board, snorkel gear and towels. Trips from 4 to 8 hours or to Cozumel, with snacks, shrimp ceviche, guacamole, bruschetta and an open bar of tequila, rum, vodka and beer.',
   '["Aire acondicionado, wifi y música", "Paddle board y alfombra flotante", "Barra libre y snacks"]',
   '["Air conditioning, wifi and music", "Paddle board and floating mat", "Open bar and snacks"]',
   '["Música por Bluetooth y wifi", "Aire acondicionado", "Alfombra flotante, paddle board, equipo de snorkel y toallas", "Hielo, refrescos (Coca-Cola, Sprite, Squirt), agua mineral y natural", "Jugos de naranja, mango, piña y calahua", "Snacks: ensalada de pollo, ceviche de camarón, guacamole, bruschetta al pomodoro, papas, Doritos y totopos", "Barra libre: tequila José Cuervo, ron Bacardí, vodka y cervezas", "Menú tropical y fruta de temporada"]',
   '["Bluetooth music and wifi", "Air conditioning", "Floating mat, paddle board, snorkel gear and towels", "Ice, soft drinks (Coca-Cola, Sprite, Squirt), sparkling and still water", "Orange, mango, pineapple and calahua juices", "Snacks: chicken salad, shrimp ceviche, guacamole, bruschetta al pomodoro, crisps, Doritos and tortilla chips", "Open bar: José Cuervo tequila, Bacardí rum, vodka and beer", "Tropical menu and seasonal fruit"]',
   '[]', '[]'),

  ('barco-sea-ray-flybridge-47', 314, 20, 16, 2000, null, null,
   'Sea Ray Flybridge 47',
   'Sea Ray Flybridge 47',
   'Yate de 47 pies con flybridge, privado para hasta 16 personas y con lugar para 20, con barra libre de marca.',
   '47-ft flybridge yacht, private for up to 16 guests with room for 20, with branded open bar.',
   'Un Sea Ray de 47 pies con flybridge, para pescar o pasear: el precio cubre hasta 16 personas y caben 20. Tiene sala, cocina y camarote, y sale de 4 a 8 horas con barra libre de marca —Bacardí, José Cuervo, Smirnoff, Black & White y vino— y guacamole con ceviche de camarón.',
   'A 47-ft Sea Ray with flybridge, for fishing or cruising: the price covers up to 16 guests and it fits 20. Lounge, galley and cabin, with trips from 4 to 8 hours, branded open bar —Bacardí, José Cuervo, Smirnoff, Black & White and wine— and guacamole with shrimp ceviche.',
   '["Flybridge con vista abierta", "Hasta 20 personas", "Barra libre de marca"]',
   '["Flybridge with open views", "Up to 20 guests", "Branded open bar"]',
   '["Agua, refrescos, cervezas y jugos (arándano, piña y naranja)", "Barra libre: ron Bacardí blanco, tequila José Cuervo, vodka Smirnoff, whisky Black & White, vino tinto y blanco", "Menú tropical: guacamole y ceviche de camarón"]',
   '["Water, soft drinks, beer and juices (cranberry, pineapple and orange)", "Open bar: Bacardí white rum, José Cuervo tequila, Smirnoff vodka, Black & White whisky, red and white wine", "Tropical menu: guacamole and shrimp ceviche"]',
   '[]', '[]'),

  -- SUPUESTO: la ficha dice "1 – 15 PAX" sin pasajero extra ni máximo.
  ('barco-sea-ray-sedan-40', 315, 15, 15, 2000, null, null,
   'Sea Ray Sedan 40',
   'Sea Ray Sedan 40',
   'Yate de 40 pies, privado para hasta 15 personas, con barra libre premium y hamburguesas en las salidas largas.',
   '40-ft yacht, private for up to 15 guests, with premium open bar and burgers on longer trips.',
   'Un Sea Ray Sedan de 40 pies con flybridge y camarote, para tu grupo de hasta 15 personas. La barra libre es premium —Don Julio, Absolut, Jack Daniel''s, Bacardí, Malibu, Captain Morgan y Corona— con fruta y menú tropical, y en las salidas de 6 y 8 horas se suman hamburguesas. Sale por la costa o a Cozumel.',
   'A 40-ft Sea Ray Sedan with flybridge and cabin, for your group of up to 15. Premium open bar —Don Julio, Absolut, Jack Daniel''s, Bacardí, Malibu, Captain Morgan and Corona— with fruit and tropical menu; 6 and 8-hour trips add burgers. Cruise the coast or go to Cozumel.',
   '["Barra libre premium", "Costa o Cozumel", "Hamburguesas en 6 y 8 horas"]',
   '["Premium open bar", "Coast or Cozumel", "Burgers on 6 and 8-hour trips"]',
   '["Fruta de temporada", "Menú tropical: guacamole y ceviche de camarón", "Cerveza Corona", "Ron Bacardí, Malibu y Captain Morgan", "Tequila Don Julio blanco y José Cuervo", "Vodka Absolut y whisky Jack Daniel''s", "Vino blanco y tinto", "Agua mineral y natural, refrescos y jugos", "En 6 y 8 horas: hamburguesas"]',
   '["Seasonal fruit", "Tropical menu: guacamole and shrimp ceviche", "Corona beer", "Bacardí, Malibu and Captain Morgan rum", "Don Julio blanco and José Cuervo tequila", "Absolut vodka and Jack Daniel''s whiskey", "White and red wine", "Sparkling and still water, soft drinks and juices", "On 6 and 8 hours: burgers"]',
   '["Hora extra: US$300, se arregla a bordo"]',
   '["Extra hour: US$300, arranged on board"]');

-- 2. Las opciones: duración o ruta, con el precio del barco --------------------
--
-- SUPUESTO en toda "Cozumel" sin horas en la ficha: día completo de 8 horas
-- (10 en el Cracovia, que la cotiza por encima de sus 10 horas). La duración
-- importa porque es el rango que el barco queda apartado.

create temporary table emb_opcion (
  slug           text not null,
  code           text not null,
  name_es        text not null,
  name_en        text not null,
  minutos        integer not null,
  barco_cents    bigint not null,
  extra_cents    bigint not null,   -- pasajero extra adulto; 0 si no hay
  nino_cents     bigint,            -- pasajero extra niño, si la ficha lo da
  primary key (slug, code)
) on commit drop;

insert into emb_opcion values
  ('barco-bertram-46', '4h',        '4 horas', '4 hours', 240, 115000, 0, null),
  ('barco-bertram-46', '6h',        '6 horas', '6 hours', 360, 145000, 0, null),
  ('barco-bertram-46', '8h',        '8 horas', '8 hours', 480, 165000, 0, null),
  ('barco-bertram-46', 'cozumel',   'Cozumel, día completo', 'Cozumel, full day', 480, 180000, 0, null),

  ('barco-catamaran-65', '4h',      '4 horas', '4 hours', 240, 285000, 13000, null),

  ('barco-catamaran-fontaine-46', '4h',      '4 horas', '4 hours', 240, 220000, 18000, null),
  ('barco-catamaran-fontaine-46', '6h',      '6 horas', '6 hours', 360, 280000, 18000, null),
  ('barco-catamaran-fontaine-46', '8h',      '8 horas · Riviera Maya', '8 hours · Riviera Maya', 480, 300000, 18000, null),
  ('barco-catamaran-fontaine-46', 'cozumel', '8 horas · Cozumel', '8 hours · Cozumel', 480, 335000, 18000, null),

  ('barco-catamaran-leopard-47', '4h',      '4 horas', '4 hours', 240, 230000, 10000, 5000),
  ('barco-catamaran-leopard-47', '5h',      '5 horas', '5 hours', 300, 255000, 10000, 5000),
  ('barco-catamaran-leopard-47', '6h',      '6 horas', '6 hours', 360, 285000, 12000, 6000),
  ('barco-catamaran-leopard-47', '8h',      '8 horas · Riviera Maya', '8 hours · Riviera Maya', 480, 340000, 12000, 6000),
  ('barco-catamaran-leopard-47', 'cozumel', '8 horas · Cozumel', '8 hours · Cozumel', 480, 400000, 12000, 6000),

  ('barco-velero-cracovia', '4h',      '4 horas', '4 hours', 240, 45000, 3500, null),
  ('barco-velero-cracovia', '6h',      '6 horas', '6 hours', 360, 55000, 4000, null),
  ('barco-velero-cracovia', '8h',      '8 horas', '8 hours', 480, 70000, 5000, null),
  ('barco-velero-cracovia', '10h',     '10 horas', '10 hours', 600, 82000, 8000, null),
  ('barco-velero-cracovia', 'cozumel', 'Cozumel, día completo', 'Cozumel, full day', 600, 87000, 8000, null),

  ('barco-bruce-roberts-72', '4h', '4 horas', '4 hours', 240, 300000, 10000, null),
  ('barco-bruce-roberts-72', '6h', '6 horas', '6 hours', 360, 410000, 10000, null),
  ('barco-bruce-roberts-72', '8h', '8 horas', '8 hours', 480, 520000, 10000, null),

  ('barco-burger-80', '4h', '4 horas', '4 hours', 240, 300000, 10000, null),
  ('barco-burger-80', '6h', '6 horas', '6 hours', 360, 410000, 10000, null),
  ('barco-burger-80', '8h', '8 horas', '8 hours', 480, 520000, 10000, null),

  ('barco-cabo-31', '4h', '4 horas', '4 hours', 240,  95000, 0, null),
  ('barco-cabo-31', '6h', '6 horas', '6 hours', 360, 120000, 0, null),
  ('barco-cabo-31', '8h', '8 horas', '8 hours', 480, 140000, 0, null),

  ('barco-dusky-33', '4h', '4 horas', '4 hours', 240,  80000, 0, null),
  ('barco-dusky-33', '6h', '6 horas', '6 hours', 360, 100000, 0, null),
  ('barco-dusky-33', '8h', '8 horas', '8 hours', 480, 140000, 0, null),

  ('barco-grady-white-27', '4h', '4 horas', '4 hours', 240,  80000, 0, null),
  ('barco-grady-white-27', '6h', '6 horas', '6 hours', 360, 100000, 0, null),
  ('barco-grady-white-27', '8h', '8 horas', '8 hours', 480, 140000, 0, null),

  ('barco-hatteras-50', '4h', '4 horas', '4 hours', 240, 180000, 6000, null),
  ('barco-hatteras-50', '6h', '6 horas', '6 hours', 360, 230000, 6000, null),
  ('barco-hatteras-50', '8h', '8 horas', '8 hours', 480, 270000, 6000, null),

  ('barco-sea-ray-sundancer-48', '4h', '4 horas', '4 hours', 240, 179000, 0, null),
  ('barco-sea-ray-sundancer-48', '5h', '5 horas', '5 hours', 300, 207000, 0, null),
  ('barco-sea-ray-sundancer-48', '6h', '6 horas', '6 hours', 360, 237000, 0, null),
  ('barco-sea-ray-sundancer-48', '8h', '8 horas', '8 hours', 480, 295000, 0, null),

  ('barco-wellcraft-35', '4h', '4 horas', '4 hours', 240,  80000, 0, null),
  ('barco-wellcraft-35', '6h', '6 horas', '6 hours', 360, 100000, 0, null),
  ('barco-wellcraft-35', '8h', '8 horas', '8 hours', 480, 140000, 0, null),

  ('barco-sea-ray-55', '4h',      '4 horas', '4 hours', 240, 225000, 10000, 5000),
  ('barco-sea-ray-55', '5h',      '5 horas', '5 hours', 300, 240000, 10000, 5000),
  ('barco-sea-ray-55', '6h',      '6 horas', '6 hours', 360, 278000, 10000, 5000),
  ('barco-sea-ray-55', '8h',      '8 horas', '8 hours', 480, 345000, 12000, 6000),
  ('barco-sea-ray-55', 'cozumel', 'Cozumel, día completo', 'Cozumel, full day', 480, 400000, 12000, 6000),

  ('barco-sea-ray-flybridge-47', '4h', '4 horas', '4 hours', 240, 185000, 7000, null),
  ('barco-sea-ray-flybridge-47', '5h', '5 horas', '5 hours', 300, 215000, 7000, null),
  ('barco-sea-ray-flybridge-47', '6h', '6 horas', '6 hours', 360, 245000, 7000, null),
  ('barco-sea-ray-flybridge-47', '8h', '8 horas', '8 hours', 480, 309000, 7000, null),

  ('barco-sea-ray-sedan-40', '4h',      '4 horas', '4 hours', 240, 195000, 0, null),
  ('barco-sea-ray-sedan-40', '6h',      '6 horas', '6 hours', 360, 230000, 0, null),
  ('barco-sea-ray-sedan-40', '8h',      '8 horas · costa', '8 hours · coast', 480, 249000, 0, null),
  ('barco-sea-ray-sedan-40', 'cozumel', '8 horas · Cozumel', '8 hours · Cozumel', 480, 280000, 0, null);

-- 3. Productos y textos -------------------------------------------------------

insert into products (kind, slug, status, currency, position)
select 'tour', b.slug, 'draft', 'USD', b.position
  from emb_barco b
on conflict (slug) do nothing;

insert into product_translations
  (product_id, locale, name, summary, description, highlights, included, excluded, meta_title, meta_description)
select p.id, v.locale, v.name, v.summary, v.description, v.highlights, v.included, v.excluded,
       v.name, v.summary
  from emb_barco b
  join products p on p.slug = b.slug
 cross join lateral (values
   ('es', b.name_es, b.summary_es, b.description_es, b.highlights_es, b.included_es, b.excluded_es),
   ('en', b.name_en, b.summary_en, b.description_en, b.highlights_en, b.included_en, b.excluded_en)
 ) v(locale, name, summary, description, highlights, included, excluded)
on conflict (product_id, locale) do nothing;

-- 4. Opciones, precio del pasajero extra y salidas ----------------------------

insert into tour_options
  (product_id, code, name_es, name_en, duration_minutes, default_capacity,
   pricing_mode, private_price_cents, private_included_pax, per_pax_fee_cents)
select p.id, o.code, o.name_es, o.name_en, o.minutos, b.cupo,
       'private', o.barco_cents, b.incluidos, b.muelle_cents
  from emb_opcion o
  join emb_barco b on b.slug = o.slug
  join products p on p.slug = o.slug
on conflict (product_id, code) do nothing;

-- El adulto siempre lleva renglón, aunque sea 0: publicar exige "precio de
-- adulto" y la cotización de un barco sin pasajero extra nunca lo cobra,
-- porque su cupo es igual a lo incluido.
insert into tour_pax_prices (tour_option_id, pax_type, price_cents, min_age, max_age, counts_toward_capacity)
select t.id, 'adult', o.extra_cents, case when b.nino_max is null then null else b.nino_max + 1 end, null, true
  from emb_opcion o
  join emb_barco b on b.slug = o.slug
  join products p on p.slug = o.slug
  join tour_options t on t.product_id = p.id and t.code = o.code
on conflict (tour_option_id, pax_type) do nothing;

insert into tour_pax_prices (tour_option_id, pax_type, price_cents, min_age, max_age, counts_toward_capacity)
select t.id, 'child', o.nino_cents, b.nino_min, b.nino_max, true
  from emb_opcion o
  join emb_barco b on b.slug = o.slug
  join products p on p.slug = o.slug
  join tour_options t on t.product_id = p.id and t.code = o.code
 where o.nino_cents is not null
on conflict (tour_option_id, pax_type) do nothing;

-- SUPUESTO: todas zarpan a las 9:00. Con eso un barco se vende una vez al día
-- por opción y la exclusión por horas impide encimar las 4 y las 8 horas. Si
-- Adri tiene turno de tarde, es una opción más ("4 horas · tarde") con su hora.
insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
select t.id,
       (d::date + time '09:00') at time zone coalesce(l.timezone, 'America/Cancun'),
       (d::date + time '09:00' + make_interval(mins => t.duration_minutes))
         at time zone coalesce(l.timezone, 'America/Cancun'),
       t.default_capacity
  from emb_barco b
  join products p on p.slug = b.slug
  join tour_options t on t.product_id = p.id
  left join locations l on l.id = p.location_id
 cross join lateral generate_series(current_date + 1, current_date + 120, interval '1 day') d
on conflict (tour_option_id, starts_at) do nothing;

-- 5. Extras del Cracovia ------------------------------------------------------
--
-- Su ficha los cobra aparte en las salidas cortas: "COSTO EXTRA 12 USD X PAX"
-- el menú tropical y 15 la barra libre. Es exactamente un extra por lugar.
insert into tour_extras (product_id, code, name_es, name_en, note_es, note_en, price_cents, position)
select p.id, v.code, v.name_es, v.name_en, v.note_es, v.note_en, v.cents, v.pos
  from products p
 cross join (values
   ('menu-tropical', 'Menú tropical', 'Tropical menu',
    'Guacamole y ceviche de camarón. Ya va incluido en 8 y 10 horas.',
    'Guacamole and shrimp ceviche. Already included on 8 and 10 hours.', 1200, 1),
   ('barra-libre', 'Barra libre', 'Open bar',
    'Ron, vodka, whisky y tequila.', 'Rum, vodka, whisky and tequila.', 1500, 2)
 ) v(code, name_es, name_en, note_es, note_en, cents, pos)
 where p.slug = 'barco-velero-cracovia'
on conflict (product_id, code) do nothing;

do $$
begin
  raise notice '── después: % barco(s), % opción(es), % salida(s) futura(s)',
    (select count(*) from products where slug like 'barco-%'),
    (select count(*) from tour_options o join products p on p.id = o.product_id where p.slug like 'barco-%'),
    (select count(*) from tour_departures d join tour_options o on o.id = d.tour_option_id
       join products p on p.id = o.product_id where p.slug like 'barco-%' and d.starts_at > now());
end $$;

commit;
