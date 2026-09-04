-- ---------------------------------------------------------------------------
-- Catálogo del Caribe mexicano · ocho destinos, veinticuatro tours
--
-- Producción abrió con tres destinos y tres tours. Con eso no se puede juzgar
-- nada: el listado cabe en media pantalla, los filtros por ubicación tienen una
-- sola opción útil y el buscador de fechas nunca se topa con dos productos que
-- compitan. Este guion carga un catálogo del tamaño que el negocio pretende
-- tener, con contenido lo más cercano posible a lo que de verdad se vende en
-- Quintana Roo.
--
-- Nada aquí es genérico a propósito: los muelles, plazas y carreteras de los
-- puntos de encuentro existen; las horas de los itinerarios son las que impone
-- la logística real (Chichén Itzá se entra al abrir, la bioluminiscencia se ve
-- de noche, el mar de Puerto Morelos está plano al amanecer); los precios están
-- en el rango de mercado de 2026 en pesos, en centavos enteros.
--
-- **Lo que NO hace, a propósito:**
--
--   1. **No toca nada existente.** Solo inserta, y siempre con la llave natural
--      por delante (`on conflict do nothing` / `where not exists`). Los tours
--      que ya están publicados, sus fotos y sus textos se quedan como están.
--      Correrlo dos veces seguidas no duplica ni una fila.
--   2. **No toca `tax_rates`.** La base gravable de cada impuesto sigue siendo
--      una decisión abierta del cliente (ver CLAUDE.md), y la configuración
--      fiscal no es contenido de catálogo. Consecuencia visible: los destinos
--      nuevos exhiben el precio sin impuesto hasta que se decida y se cargue la
--      tasa que les toca. Se prefirió eso a inventar una base gravable — y a
--      arriesgar los montos exactos que la barra de verificación ya comprueba
--      sobre Tulum.
--   3. **No crea estancias.** El hueco era de tours; las casas se cargan por el
--      panel, que es donde el cliente escribe la copia de verdad.
--
-- Cómo correrlo:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/catalogo_caribe.sql
--
-- o por el envoltorio que enseña a qué servidor va antes de escribir:
--
--   SEED_FILE=db/seed/catalogo_caribe.sql ./scripts/demo-content.sh
--   SEED_FILE=db/seed/catalogo_caribe.sql ./scripts/demo-content.sh --from-env
--
-- Las fotos son de relleno (picsum.photos con semilla estable por slug, el
-- mismo patrón de `demo_content.sql`): **no son las fotos del negocio** y se
-- van en cuanto el cliente suba las suyas por `/admin/catalogo/[id]`. El texto
-- alternativo sí está escrito en los dos idiomas desde el principio, porque
-- agregarlo después nunca pasa.
--
-- Para deshacerlo, el camino es el panel: despublicar el producto. Borrar
-- filas a mano se lleva por delante cualquier reserva que ya cuelgue de ellas.
-- ---------------------------------------------------------------------------

begin;

-- 0. Dónde estoy y qué encuentro ---------------------------------------------
--
-- Misma razón que en `demo_content.sql`: un guion de relleno que trabaja en
-- silencio no dice si acertó la base.

do $$
declare
  destinos integer;
  tours    integer;
  salidas  integer;
begin
  select count(*) into destinos from locations;
  select count(*) into tours from products where kind = 'tour' and status = 'published';
  select count(*) into salidas from tour_departures where starts_at > now();

  raise notice '── base: % en %', current_database(), coalesce(host(inet_server_addr()), 'local');
  raise notice '── antes: % destino(s), % tour(s) publicado(s), % salida(s) futura(s)',
    destinos, tours, salidas;
end $$;

-- 1. Los destinos ------------------------------------------------------------
--
-- Todo Quintana Roo es America/Cancun: UTC−5 sin horario de verano, distinto
-- del resto del país. Las coordenadas son las del centro de cada localidad.

create temporary table cat_location (
  slug     text primary key,
  name     text not null,
  city     text not null,
  lat      numeric(9, 6),
  lng      numeric(9, 6)
) on commit drop;

insert into cat_location (slug, name, city, lat, lng) values
  ('cancun',           'Cancún',           'Cancún',                   21.161908,  -86.851528),
  ('playa-del-carmen', 'Playa del Carmen', 'Playa del Carmen',         20.629100,  -87.073800),
  ('tulum',            'Tulum',            'Tulum',                    20.211000,  -87.464400),
  ('cozumel',          'Cozumel',          'San Miguel de Cozumel',    20.510000,  -86.949722),
  ('isla-mujeres',     'Isla Mujeres',     'Isla Mujeres',             21.232500,  -86.731111),
  ('holbox',           'Holbox',           'Isla Holbox',              21.524167,  -87.376944),
  ('bacalar',          'Bacalar',          'Bacalar',                  18.677500,  -88.395000),
  ('puerto-morelos',   'Puerto Morelos',   'Puerto Morelos',           20.848056,  -86.875278);

-- Tulum y Playa del Carmen ya existen en cualquier ambiente sembrado: el
-- conflicto por slug los deja intactos, con sus coordenadas y su nombre.
insert into locations (name, slug, city, state, country, lat, lng, timezone)
select c.name, c.slug, c.city, 'Quintana Roo', 'MX', c.lat, c.lng, 'America/Cancun'
  from cat_location c
on conflict (slug) do nothing;

-- 2. Logística de cada tour --------------------------------------------------
--
-- Una fila por tour: dónde se junta la gente, cuánto dura, qué cupo tiene la
-- lancha o la camioneta, a qué hora sale y qué días. `dows` es null cuando la
-- salida es diaria, y si no lleva los días ISO (1 = lunes … 7 = domingo).
--
-- `infant_max_age` null significa **que ese tour no admite infantes** y por eso
-- no se le carga tarifa de infante: a un bebé no se le hace un bautismo de
-- buceo ni se le sube a una lancha de pesca de altura ocho horas. Es dato, no
-- omisión.
--
-- El cupo nunca llega a 49 a propósito: el criterio de `smoke.sh` que
-- comprueba "sin resultados se explica" filtra por 49 huéspedes y necesita que
-- nada del catálogo lo alcance.

create temporary table cat_tour (
  slug             text primary key,
  location_slug    text not null,
  position         integer not null,
  option_code      text not null,
  option_name_es   text not null,
  option_name_en   text not null,
  duration_minutes integer not null,
  meeting_point    text not null,
  capacity         integer not null,
  start_time       time not null,
  adult_cents      bigint not null,
  child_cents      bigint not null,
  child_min_age    integer not null,
  child_max_age    integer not null,
  infant_max_age   integer,
  dows             smallint[]
) on commit drop;

insert into cat_tour values
  -- Cancún -------------------------------------------------------------------
  ('musa-snorkel-arrecife-manchones', 'cancun', 20,
   'lancha-am', 'Lancha compartida 9:00', 'Shared boat 9:00 am', 180,
   'Muelle de Playa Tortugas, Blvd. Kukulcán km 6.5, Zona Hotelera',
   14, '09:00', 115000, 79000, 5, 11, 4, null),

  ('isla-contoy-e-isla-mujeres', 'cancun', 21,
   'catamaran-contoy', 'Catamarán compartido 8:30', 'Shared catamaran 8:30 am', 540,
   'Embarcadero de Playa Caracol, Blvd. Kukulcán km 8.5, Zona Hotelera',
   28, '08:30', 295000, 195000, 5, 11, 4, array[2,4,6,7]::smallint[]),

  ('chichen-itza-cenote-y-valladolid', 'cancun', 22,
   'camioneta-am', 'Camioneta compartida 7:00', 'Shared van 7:00 am', 720,
   'Estacionamiento de Plaza Kukulcán, Blvd. Kukulcán km 13, Zona Hotelera',
   16, '07:00', 189000, 119000, 5, 11, 4, null),

  -- Playa del Carmen ---------------------------------------------------------
  ('cenotes-cristalino-azul-y-eden', 'playa-del-carmen', 30,
   'van-am', 'Compartido 8:30', 'Shared 8:30 am', 360,
   'Parque Fundadores, Quinta Avenida esquina Benito Juárez',
   10, '08:30', 149000, 99000, 5, 11, 4, null),

  ('sabores-de-la-quinta-avenida', 'playa-del-carmen', 31,
   'caminata-pm', 'Caminata 17:30', 'Walking tour 5:30 pm', 210,
   'Plaza 28 de Julio, Quinta Avenida con calle 12',
   8, '17:30', 119000, 79000, 6, 11, 4, array[1,2,3,4,5,6]::smallint[]),

  ('bautismo-de-buceo-playa', 'playa-del-carmen', 32,
   'bautismo-am', 'Bautismo 9:00', 'Discover dive 9:00 am', 210,
   'Muelle de la calle 1 Sur, zona federal marítima, Playa del Carmen',
   8, '09:00', 195000, 165000, 10, 14, null, null),

  -- Tulum --------------------------------------------------------------------
  ('ruinas-de-tulum-al-amanecer', 'tulum', 40,
   'amanecer', 'Amanecer 7:40', 'Sunrise 7:40 am', 180,
   'Acceso peatonal de la Zona Arqueológica de Tulum, carretera federal 307 km 230',
   12, '07:40', 139000, 89000, 5, 11, 4, null),

  ('coba-en-bicicleta-y-dos-cenotes', 'tulum', 41,
   'compartido-am', 'Compartido 8:00', 'Shared 8:00 am', 480,
   'Parque Dos Aguas, avenida Tulum, Tulum centro',
   12, '08:00', 189000, 129000, 6, 11, 4, null),

  ('sian-kaan-canal-maya-de-muyil', 'tulum', 42,
   'comunitario-am', 'Compartido 8:30', 'Shared 8:30 am', 420,
   'Zona Arqueológica de Muyil, carretera federal 307 km 25 rumbo a Felipe Carrillo Puerto',
   10, '08:30', 235000, 165000, 6, 11, 4, array[1,2,3,4,5,6]::smallint[]),

  -- Cozumel ------------------------------------------------------------------
  ('buceo-palancar-y-colombia', 'cozumel', 50,
   'dos-tanques-am', 'Dos tanques 8:30', 'Two-tank 8:30 am', 300,
   'Muelle de la Marina Caleta, carretera Costera Sur km 3.5',
   12, '08:30', 245000, 225000, 10, 14, null, null),

  ('snorkel-el-cielo-colombia-y-palancar', 'cozumel', 51,
   'catamaran-pm', 'Catamarán 12:30', 'Catamaran 12:30 pm', 240,
   'Muelle de Puerto de Abrigo, San Miguel de Cozumel',
   24, '12:30', 139000, 89000, 5, 11, 4, null),

  ('cozumel-en-jeep-punta-sur-y-chen-rio', 'cozumel', 52,
   'jeep-am', 'Convoy 9:00', 'Convoy 9:00 am', 420,
   'Explanada del Muelle Fiscal, San Miguel de Cozumel',
   16, '09:00', 189000, 129000, 5, 11, 4, array[2,4,6]::smallint[]),

  -- Isla Mujeres -------------------------------------------------------------
  ('snorkel-el-farito-y-manchones', 'isla-mujeres', 60,
   'lancha-am', 'Lancha 9:30', 'Boat 9:30 am', 210,
   'Embarcadero de la avenida Rueda Medina, junto a la terminal de ferris',
   10, '09:30', 95000, 65000, 5, 11, 4, null),

  ('vuelta-a-la-isla-en-carrito-de-golf', 'isla-mujeres', 61,
   'caravana-am', 'Caravana 10:00', 'Convoy 10:00 am', 300,
   'Avenida Rueda Medina, frente a la terminal de ferris de Isla Mujeres',
   16, '10:00', 89000, 45000, 4, 11, 3, null),

  ('pesca-de-altura-isla-mujeres', 'isla-mujeres', 62,
   'charter-compartido', 'Lancha compartida 6:00', 'Shared charter 6:00 am', 480,
   'Muelle de la cooperativa de pescadores, avenida Rueda Medina',
   6, '06:00', 380000, 280000, 8, 15, null, null),

  -- Holbox -------------------------------------------------------------------
  ('paseo-de-las-tres-islas-holbox', 'holbox', 70,
   'lancha-am', 'Lancha 9:00', 'Boat 9:00 am', 240,
   'Muelle principal de Holbox, final de la calle Damero',
   12, '09:00', 145000, 95000, 5, 11, 4, null),

  ('bioluminiscencia-en-punta-coco', 'holbox', 71,
   'nocturno', 'Salida nocturna 20:30', 'Night departure 8:30 pm', 120,
   'Parque central de Holbox, calle Tiburón Ballena',
   8, '20:30', 85000, 55000, 6, 11, 4, null),

  ('kayak-en-el-manglar-de-holbox', 'holbox', 72,
   'kayak-am', 'Kayak 7:00', 'Kayak 7:00 am', 180,
   'Embarcadero de la laguna, calle Porfirio Díaz esquina Damero',
   10, '07:00', 125000, 85000, 7, 11, 4, array[1,3,5,7]::smallint[]),

  -- Bacalar ------------------------------------------------------------------
  ('velero-por-la-laguna-de-los-siete-colores', 'bacalar', 80,
   'velero-am', 'Velero 10:00', 'Sailboat 10:00 am', 240,
   'Muelle del Balneario Municipal de Bacalar, avenida Costera',
   12, '10:00', 129000, 79000, 5, 11, 4, null),

  ('kayak-al-amanecer-canal-de-los-piratas', 'bacalar', 81,
   'kayak-amanecer', 'Amanecer 6:00', 'Sunrise 6:00 am', 150,
   'Muelle del Balneario Municipal de Bacalar, avenida Costera',
   10, '06:00', 65000, 45000, 7, 11, 4, null),

  ('cenote-azul-los-rapidos-y-cocalitos', 'bacalar', 82,
   'compartido-am', 'Compartido 9:00', 'Shared 9:00 am', 360,
   'Fuerte de San Felipe, centro de Bacalar',
   14, '09:00', 149000, 99000, 5, 11, 4, array[1,2,3,4,5,6]::smallint[]),

  -- Puerto Morelos -----------------------------------------------------------
  ('snorkel-parque-nacional-puerto-morelos', 'puerto-morelos', 90,
   'lancha-am', 'Lancha 9:00', 'Boat 9:00 am', 150,
   'Muelle de la cooperativa de pescadores, frente a la plaza central',
   10, '09:00', 79000, 55000, 5, 11, 4, null),

  ('ruta-de-los-cenotes-tirolesas-y-caverna', 'puerto-morelos', 91,
   'compartido-am', 'Compartido 9:30', 'Shared 9:30 am', 300,
   'Entrada de la Ruta de los Cenotes, km 1 de la carretera Puerto Morelos–Leona Vicario',
   14, '09:30', 159000, 109000, 6, 11, 4, null),

  ('amanecer-en-paddle-sobre-el-arrecife', 'puerto-morelos', 92,
   'paddle-amanecer', 'Amanecer 6:30', 'Sunrise 6:30 am', 120,
   'Playa junto al faro inclinado, avenida Rafael Melgar, Puerto Morelos',
   6, '06:30', 69000, 49000, 8, 11, 4, null);

-- 3. El texto, en los dos idiomas --------------------------------------------
--
-- `product_translations` exige español e inglés desde el principio: un producto
-- con una sola traducción responde 404 en el otro idioma, que es correcto pero
-- no es lo que queremos aquí. El inglés no es la traducción literal del
-- español; es el mismo dato contado como lo contaría alguien que escribe en
-- inglés.
--
-- La forma de cada ficha es la de la referencia visual: cuatro puntos de "lo
-- mejor", cuatro o cinco de "qué incluye" y tres de "qué no incluye".

create temporary table cat_text (
  slug        text not null,
  locale      text not null,
  name        text not null,
  summary     text not null,
  description text not null,
  highlights  jsonb not null,
  included    jsonb not null,
  excluded    jsonb not null,
  primary key (slug, locale)
) on commit drop;

insert into cat_text values

-- Cancún · MUSA ---------------------------------------------------------------
('musa-snorkel-arrecife-manchones', 'es',
 'Snorkel en el MUSA y el arrecife Manchones',
 'Tres horas entre las esculturas sumergidas del museo y el arrecife de Manchones.',
 'El Museo Subacuático de Arte tiene más de cuatrocientas esculturas hundidas a ocho metros frente a Punta Nizuc; el coral lleva años tomándolas y hoy funcionan como arrecife artificial. Salimos del muelle de Playa Tortugas en lancha rápida, hacemos dos paradas —la galería de esculturas y el arrecife de Manchones, donde el agua rara vez pasa de los seis metros— y volvemos antes de que suba el viento de la tarde. Catorce personas por lancha, no más.',
 '["Más de 400 esculturas sumergidas", "Dos paradas: museo y arrecife natural", "Lancha rápida, no barco de doscientos pasajeros", "De regreso antes del viento de la tarde"]',
 '["Equipo de snorkel y chaleco", "Guía certificado dentro del agua", "Cuota del Parque Nacional Costa Occidental", "Agua y fruta a bordo"]',
 '["Transporte desde tu hotel", "Propinas", "Bebidas alcohólicas"]'),

('musa-snorkel-arrecife-manchones', 'en',
 'MUSA and Manchones Reef Snorkeling',
 'Three hours among the sunken sculptures of the underwater museum and Manchones reef.',
 'The Underwater Museum of Art holds more than four hundred sculptures sunk eight metres down off Punta Nizuc. Coral has been claiming them for years, and today they work as an artificial reef. We leave from the Playa Tortugas pier on a fast boat, make two stops — the sculpture gallery and Manchones reef, where the water rarely goes past six metres — and head back before the afternoon wind picks up. Fourteen people per boat, never more.',
 '["More than 400 sunken sculptures", "Two stops: the museum and a natural reef", "A fast boat, not a two-hundred-seat cruiser", "Back at the pier before the afternoon wind"]',
 '["Snorkel gear and life vest", "Certified guide in the water with you", "West Coast National Park fee", "Water and fruit on board"]',
 '["Hotel pickup", "Gratuities", "Alcoholic drinks"]'),

-- Cancún · Contoy -------------------------------------------------------------
('isla-contoy-e-isla-mujeres', 'es',
 'Isla Contoy e Isla Mujeres en catamarán',
 'Día completo al parque nacional de Contoy, con snorkel en Ixlaché y tarde en Isla Mujeres.',
 'Contoy es parque nacional y solo entran doscientos visitantes al día: se paga permiso, se camina por senderos marcados y no se puede llegar por cuenta propia. Navegamos dos horas desde Cancún, hacemos snorkel en el arrecife Ixlaché —donde arranca el arrecife Mesoamericano—, comemos pescado a la plancha en la playa de Contoy y regresamos por Isla Mujeres para las últimas horas de sol en Playa Norte.',
 '["Parque nacional con acceso limitado a 200 visitantes", "Snorkel en Ixlaché, el arranque del arrecife Mesoamericano", "Comida de pescado a la plancha en la isla", "Torre de observación y sendero de manglar"]',
 '["Permiso del Parque Nacional Isla Contoy", "Desayuno ligero y comida a bordo", "Barra de agua, refrescos y cerveza", "Equipo de snorkel", "Guía bilingüe"]',
 '["Transporte desde tu hotel", "Propinas", "Renta de traje de neopreno"]'),

('isla-contoy-e-isla-mujeres', 'en',
 'Isla Contoy and Isla Mujeres by Catamaran',
 'A full day in Contoy National Park, with snorkeling at Ixlaché and an afternoon on Isla Mujeres.',
 'Contoy is a national park that admits only two hundred visitors a day: there is a permit to pay, marked trails to stay on, and no way to get there on your own. We sail two hours out of Cancún, snorkel at Ixlaché reef — where the Mesoamerican reef begins — eat grilled fish on the beach at Contoy, and come back by way of Isla Mujeres for the last hours of sun on Playa Norte.',
 '["A national park capped at 200 visitors a day", "Snorkeling at Ixlaché, where the Mesoamerican reef starts", "Grilled fish lunch on the island", "Observation tower and mangrove boardwalk"]',
 '["Isla Contoy National Park permit", "Light breakfast and lunch on board", "Open bar: water, soft drinks and beer", "Snorkel gear", "Bilingual guide"]',
 '["Hotel pickup", "Gratuities", "Wetsuit rental"]'),

-- Cancún · Chichén Itzá -------------------------------------------------------
('chichen-itza-cenote-y-valladolid', 'es',
 'Chichén Itzá, cenote Ik Kil y Valladolid',
 'Día completo a la ciudad maya, con nado en cenote y parada en Valladolid.',
 'Salimos de madrugada para entrar a Chichén Itzá en cuanto abre y recorrer la explanada del Castillo, el Juego de Pelota y el Cenote Sagrado antes del calor y de los autobuses grandes. A mediodía nadamos en el cenote Ik Kil, a dos kilómetros de la zona arqueológica, y comemos comida yucateca. De regreso paramos una hora en Valladolid, en el convento de San Bernardino y la calzada de los Frailes.',
 '["Entrada a la zona arqueológica en cuanto abre", "Guía certificado por el INAH", "Nado en el cenote Ik Kil", "Hora libre en Valladolid"]',
 '["Camioneta con aire acondicionado", "Entradas a Chichén Itzá y al cenote", "Guía certificado", "Comida bufé yucateca", "Agua durante el trayecto"]',
 '["Propinas", "Permiso de video en la zona arqueológica", "Bebidas en la comida"]'),

('chichen-itza-cenote-y-valladolid', 'en',
 'Chichén Itzá, Ik Kil Cenote and Valladolid',
 'A full day at the Maya city, with a cenote swim and a stop in Valladolid.',
 'We leave before dawn so we are through the gate the moment Chichén Itzá opens, and walk the plaza of El Castillo, the Great Ball Court and the Sacred Cenote before the heat and the big coaches arrive. At midday we swim at Ik Kil cenote, two kilometres from the ruins, and sit down to a Yucatecan lunch. On the way back we stop for an hour in Valladolid, at the San Bernardino convent and the Calzada de los Frailes.',
 '["Through the gate as the site opens", "INAH-certified guide", "Swim at Ik Kil cenote", "A free hour in Valladolid"]',
 '["Air-conditioned van", "Chichén Itzá and cenote entrance fees", "Certified guide", "Yucatecan buffet lunch", "Water throughout the drive"]',
 '["Gratuities", "Video permit at the archaeological site", "Drinks with lunch"]'),

-- Playa del Carmen · cenotes ---------------------------------------------------
('cenotes-cristalino-azul-y-eden', 'es',
 'Cenote Cristalino, Azul y Jardín del Edén',
 'Tres cenotes abiertos sobre la carretera a Tulum, en un solo día.',
 'Los tres cenotes están a menos de un kilómetro entre sí, sobre la federal 307 rumbo a Tulum, y son abiertos: no hay que bucear ni entrar a cuevas para verlos. En el Cristalino hay un salto de tres metros; el Azul es el más ancho y el de agua más clara; el Jardín del Edén tiene una parte salobre donde se ven peces de mar. Vamos en ese orden porque es el orden en el que se llenan de gente.',
 '["Tres cenotes abiertos, sin cuevas ni lámpara", "Salto de tres metros en el Cristalino", "Grupos de máximo diez personas", "Salimos antes de las nueve"]',
 '["Transporte redondo desde Playa del Carmen", "Entradas a los tres cenotes", "Equipo de snorkel y chaleco", "Guía", "Fruta, agua y sándwiches"]',
 '["Propinas", "Toalla", "Casillero"]'),

('cenotes-cristalino-azul-y-eden', 'en',
 'Cristalino, Azul and Jardín del Edén Cenotes',
 'Three open cenotes on the road to Tulum, all in one day.',
 'The three cenotes sit within a kilometre of each other on Highway 307 toward Tulum, and all three are open-air: no diving, no caves, nothing technical. Cristalino has a three-metre jump; Azul is the widest and the clearest; Jardín del Edén has a brackish layer where you can spot sea fish inland. We do them in that order because that is the order in which they fill up.',
 '["Three open cenotes, no caves and no torches", "A three-metre jump at Cristalino", "Groups of ten people maximum", "On the road before nine"]',
 '["Round-trip transport from Playa del Carmen", "Entrance to all three cenotes", "Snorkel gear and life vest", "Guide", "Fruit, water and sandwiches"]',
 '["Gratuities", "Towel", "Locker"]'),

-- Playa del Carmen · comida ----------------------------------------------------
('sabores-de-la-quinta-avenida', 'es',
 'Sabores de la Quinta: tacos, marquesitas y mezcal',
 'Recorrido a pie de tres horas y media por seis paradas de comida del centro.',
 'No es un tour de restaurantes de la Quinta: caminamos hacia adentro, a las calles donde come quien trabaja en Playa. Seis paradas —cochinita, tacos al pastor de trompo, marquesitas de la esquina, ceviche de caracol, una mezcalería pequeña y pan de elote de postre—, con la historia de cada puesto y de quién lo atiende. Se caminan poco más de dos kilómetros, sin prisa.',
 '["Seis paradas, ninguna sobre la Quinta turística", "Cochinita, pastor, marquesitas y ceviche", "Cata de tres mezcales", "Grupos de máximo ocho personas"]',
 '["Todas las degustaciones", "Cata de tres mezcales", "Agua de horchata y de jamaica", "Guía local"]',
 '["Bebidas adicionales", "Propinas a los puestos", "Transporte al punto de reunión"]'),

('sabores-de-la-quinta-avenida', 'en',
 'Fifth Avenue Flavors: Tacos, Marquesitas and Mezcal',
 'A three-and-a-half-hour walk through six food stops in the town centre.',
 'This is not a tour of the restaurants on Fifth Avenue. We walk inland, to the streets where the people who work in Playa actually eat. Six stops — cochinita, al pastor carved off the spit, marquesitas from the corner cart, conch ceviche, a small mezcaleria and corn cake for dessert — with the story of each stall and whoever runs it. A little over two kilometres, walked slowly.',
 '["Six stops, none of them on the tourist strip", "Cochinita, al pastor, marquesitas and ceviche", "A tasting of three mezcales", "Groups of eight people maximum"]',
 '["Every tasting on the route", "Three mezcales to taste", "Horchata and hibiscus water", "Local guide"]',
 '["Extra drinks", "Tips for the stalls", "Transport to the meeting point"]'),

-- Playa del Carmen · bautismo de buceo ------------------------------------------
('bautismo-de-buceo-playa', 'es',
 'Bautismo de buceo en el arrecife de Playa',
 'Primera inmersión con instructor, sin certificación previa, en el arrecife de Chunzubul.',
 'Para quien nunca ha buceado. Empezamos con una hora de teoría y práctica en aguas someras —respirar, compensar, vaciar el visor— y después hacemos una inmersión de treinta y cinco minutos a doce metros en el arrecife de Chunzubul, frente a Playa del Carmen. Un instructor por cada dos personas. La edad mínima son diez años; no hace falta nadar bien, pero sí estar cómodo en el agua.',
 '["Sin certificación previa", "Un instructor por cada dos buzos", "Inmersión de 35 minutos a 12 metros", "Práctica previa en aguas someras"]',
 '["Equipo completo de buceo", "Instructor certificado", "Cuota del parque marino", "Agua y fruta", "Seguro de la inmersión"]',
 '["Fotos y video submarino", "Propinas", "Transporte al muelle"]'),

('bautismo-de-buceo-playa', 'en',
 'Discover Scuba Diving on the Playa Reef',
 'A first dive with an instructor, no certification needed, on Chunzubul reef.',
 'For people who have never dived. We start with an hour of theory and shallow-water practice — breathing, equalising, clearing the mask — and then make one thirty-five-minute dive to twelve metres on Chunzubul reef, straight out from Playa del Carmen. One instructor for every two divers. Minimum age is ten; you do not need to be a strong swimmer, but you do need to be comfortable in the water.',
 '["No certification required", "One instructor for every two divers", "A 35-minute dive at 12 metres", "Shallow-water practice first"]',
 '["Full scuba gear", "Certified instructor", "Marine park fee", "Water and fruit", "Dive insurance"]',
 '["Underwater photos and video", "Gratuities", "Transport to the pier"]'),

-- Tulum · ruinas al amanecer ----------------------------------------------------
('ruinas-de-tulum-al-amanecer', 'es',
 'Ruinas de Tulum al amanecer',
 'Entrada a la zona arqueológica en cuanto abre, con guía certificado por el INAH.',
 'La zona abre a las ocho y los primeros autobuses llegan pasadas las diez. Entramos con la primera tanda: el Castillo sobre el acantilado, el Templo del Dios Descendente y la muralla, con el mar todavía sin gente. Hora y media de recorrido con guía y después queda tiempo libre para bajar a la cala. Se camina sobre piedra pareja pero irregular: hace falta calzado cerrado.',
 '["Dentro a las 8:00, antes que los autobuses", "Guía certificado por el INAH", "Tiempo libre para bajar a la cala", "Grupos de máximo doce personas"]',
 '["Entrada a la zona arqueológica", "Guía certificado", "Tren interno del acceso", "Agua fría"]',
 '["Transporte desde tu hotel", "Propinas", "Permiso de video"]'),

('ruinas-de-tulum-al-amanecer', 'en',
 'Tulum Ruins at Sunrise',
 'Through the gate the moment the site opens, with an INAH-certified guide.',
 'The site opens at eight and the first coaches roll in after ten. We go through with the first group: El Castillo on the cliff, the Temple of the Descending God and the wall, with the sea still empty below. An hour and a half with the guide, then free time to walk down to the cove. The ground is stone, even but uneven underfoot: closed shoes are a must.',
 '["Inside at 8:00, ahead of the coaches", "INAH-certified guide", "Free time to walk down to the cove", "Groups of twelve people maximum"]',
 '["Archaeological site entrance", "Certified guide", "Shuttle train from the car park", "Cold water"]',
 '["Hotel pickup", "Gratuities", "Video permit"]'),

-- Tulum · Cobá -------------------------------------------------------------------
('coba-en-bicicleta-y-dos-cenotes', 'es',
 'Cobá en bicicleta y dos cenotes',
 'Los caminos blancos de Cobá en bici y dos cenotes de caverna de regreso.',
 'Cobá se recorre por sacbés, los caminos blancos de piedra que unían los grupos de la ciudad, y son varios kilómetros: se hacen en bicicleta o en triciclo con chofer. Después de la ciudad maya bajamos a dos cenotes de caverna cerca de Tulum, con escalera de madera y agua a veinticuatro grados todo el año. Comemos en un comedor del pueblo de Cobá antes de regresar.',
 '["Sacbés en bicicleta o en triciclo", "Dos cenotes de caverna", "Comida en el pueblo de Cobá", "Guía certificado por el INAH"]',
 '["Transporte redondo desde Tulum", "Entradas a Cobá y a los dos cenotes", "Renta de bicicleta", "Guía certificado", "Comida y agua"]',
 '["Triciclo con chofer", "Propinas", "Toalla"]'),

('coba-en-bicicleta-y-dos-cenotes', 'en',
 'Cobá by Bike and Two Cenotes',
 'The white roads of Cobá on two wheels, and two cavern cenotes on the way back.',
 'Cobá is covered on its sacbés, the raised white stone roads that linked the groups of the city, and they run for kilometres: you ride them by bicycle or in a pedicab with a driver. After the Maya city we drop into two cavern cenotes near Tulum, down wooden stairs into water that stays at twenty-four degrees all year. Lunch is at a family kitchen in the village of Cobá before the drive back.',
 '["Sacbés by bicycle or pedicab", "Two cavern cenotes", "Lunch in the village of Cobá", "INAH-certified guide"]',
 '["Round-trip transport from Tulum", "Entrance to Cobá and both cenotes", "Bicycle rental", "Certified guide", "Lunch and water"]',
 '["Pedicab with a driver", "Gratuities", "Towel"]'),

-- Tulum · Sian Kaan --------------------------------------------------------------
('sian-kaan-canal-maya-de-muyil', 'es',
 'Sian Ka''an: el canal maya de Muyil',
 'Zona arqueológica, pasarela de selva y flote por el canal maya de la reserva.',
 'Muyil está en el borde de la reserva de la biosfera de Sian Ka''an, patrimonio de la humanidad. Recorremos la zona arqueológica, caminamos un kilómetro de pasarela sobre el manglar hasta el mirador de la laguna y salimos en lancha a Chunyaxché. La parte que nadie olvida es el flote: se entra al canal que los mayas abrieron entre las dos lagunas y la corriente te lleva cuarenta minutos boca arriba.',
 '["Reserva de la biosfera, patrimonio de la humanidad", "Flote de 40 minutos por el canal maya", "Pasarela de un kilómetro sobre el manglar", "Grupos de máximo diez personas"]',
 '["Entrada a la zona arqueológica de Muyil", "Cuota de la reserva de Sian Ka''an", "Lancha y chaleco de flote", "Guía comunitario", "Comida ligera y agua"]',
 '["Transporte desde tu hotel", "Propinas", "Bloqueador biodegradable y repelente"]'),

('sian-kaan-canal-maya-de-muyil', 'en',
 'Sian Ka''an: The Maya Canal at Muyil',
 'Ruins, a jungle boardwalk and a float down the Maya canal inside the reserve.',
 'Muyil sits on the edge of the Sian Ka''an biosphere reserve, a World Heritage site. We walk the ruins, follow a kilometre of boardwalk over the mangrove to the lagoon lookout, and take a boat out onto Chunyaxché. The part nobody forgets is the float: you get into the canal the Maya cut between the two lagoons and the current carries you, face up, for forty minutes.',
 '["A World Heritage biosphere reserve", "A 40-minute float down the Maya canal", "A kilometre of boardwalk over the mangrove", "Groups of ten people maximum"]',
 '["Muyil archaeological site entrance", "Sian Ka''an reserve fee", "Boat and float vest", "Community guide", "Light lunch and water"]',
 '["Hotel pickup", "Gratuities", "Biodegradable sunscreen and repellent"]'),

-- Cozumel · buceo ------------------------------------------------------------------
('buceo-palancar-y-colombia', 'es',
 'Buceo en Palancar y Colombia, dos tanques',
 'Dos inmersiones de deriva en los arrecifes del sur, para buzos certificados.',
 'Cozumel se bucea a la deriva: la corriente del canal te lleva y el trabajo es flotar bien. Hacemos dos inmersiones dentro del Parque Nacional Arrecifes de Cozumel —Palancar Jardines, con sus cabezas de coral separadas por canales de arena, y Colombia Profundo, de paredes y columnas— con un intervalo de superficie de una hora entre las dos. Se pide certificación de aguas abiertas y al menos diez inmersiones registradas.',
 '["Dos inmersiones de deriva en el parque nacional", "Palancar Jardines y Colombia Profundo", "Máximo seis buzos por guía", "Tanques de aluminio de 80 y plomos incluidos"]',
 '["Dos tanques, plomos y cinturón", "Divemaster certificado", "Cuota del Parque Nacional Arrecifes de Cozumel", "Fruta, agua y refrescos a bordo", "Bitácora sellada"]',
 '["Renta de regulador, chaleco y computadora", "Propinas", "Nitrox"]'),

('buceo-palancar-y-colombia', 'en',
 'Palancar and Colombia Two-Tank Dive',
 'Two drift dives on the southern reefs, for certified divers.',
 'Cozumel is drift diving: the channel current carries you and the job is to hold good trim. We make two dives inside Cozumel Reefs National Park — Palancar Gardens, with coral heads separated by sand channels, and Colombia Deep, all walls and pinnacles — with an hour of surface interval between them. Open water certification and at least ten logged dives are required.',
 '["Two drift dives inside the national park", "Palancar Gardens and Colombia Deep", "Six divers per guide, maximum", "Aluminium 80 tanks and weights included"]',
 '["Two tanks, weights and belt", "Certified divemaster", "Cozumel Reefs National Park fee", "Fruit, water and soft drinks on board", "Stamped logbook"]',
 '["Regulator, BCD and computer rental", "Gratuities", "Nitrox"]'),

-- Cozumel · snorkel ----------------------------------------------------------------
('snorkel-el-cielo-colombia-y-palancar', 'es',
 'Snorkel en El Cielo, Colombia y Palancar',
 'Tres paradas en el sur de la isla, con el banco de arena de El Cielo al final.',
 'El Cielo no es arrecife: es un banco de arena de metro y medio de profundidad lleno de estrellas de mar, donde el barco se ancla y la gente se queda parada en el agua. Antes hacemos snorkel en Colombia y Palancar, que sí son arrecife y donde se ven morenas, peces loro y de vez en cuando una tortuga. Se navega en catamarán con sombra y baño, no en lancha abierta.',
 '["El banco de arena de El Cielo, con estrellas de mar", "Dos arrecifes del parque nacional", "Catamarán con sombra y baño", "Barra de agua, refrescos y cerveza"]',
 '["Equipo de snorkel y chaleco", "Cuota del parque nacional", "Guía dentro del agua", "Barra de agua, refrescos y cerveza", "Fruta y botanas"]',
 '["Transporte al muelle", "Propinas", "Comida"]'),

('snorkel-el-cielo-colombia-y-palancar', 'en',
 'Snorkeling at El Cielo, Colombia and Palancar',
 'Three stops along the south of the island, finishing on the El Cielo sandbar.',
 'El Cielo is not a reef: it is a sandbar a metre and a half deep, covered in starfish, where the boat anchors and everyone simply stands in the water. Before that we snorkel Colombia and Palancar, which are reef, and where you will see morays, parrotfish and now and then a turtle. We sail on a catamaran with shade and a head, not an open panga.',
 '["The El Cielo sandbar and its starfish", "Two national-park reefs", "Catamaran with shade and a bathroom", "Open bar: water, soft drinks and beer"]',
 '["Snorkel gear and life vest", "National park fee", "Guide in the water with you", "Open bar: water, soft drinks and beer", "Fruit and snacks"]',
 '["Transport to the pier", "Gratuities", "Lunch"]'),

-- Cozumel · jeep --------------------------------------------------------------------
('cozumel-en-jeep-punta-sur-y-chen-rio', 'es',
 'Cozumel en jeep: Punta Sur y Chen Río',
 'Vuelta al sur y a la costa salvaje: faro de Celarain, laguna de cocodrilos y playa Chen Río.',
 'Se maneja uno mismo, en convoy detrás del guía, con licencia vigente. Empezamos en el parque Punta Sur: el faro de Celarain, el mirador sobre la laguna Colombia —donde se ven cocodrilos desde la torre— y la playa del arrecife. Después cruzamos a la costa este, la que no tiene hoteles, y comemos pescado tikin xic en Chen Río, la única playa del lado salvaje donde se puede nadar sin peligro.',
 '["Jeep propio, en convoy detrás del guía", "Faro de Celarain y torre de la laguna", "La costa este, sin un solo hotel", "Comida de pescado en Chen Río"]',
 '["Jeep para hasta cuatro personas", "Entrada al Parque Punta Sur", "Guía en convoy", "Comida en Chen Río", "Gasolina del recorrido"]',
 '["Propinas", "Bebidas alcohólicas", "Seguro de cobertura amplia del jeep"]'),

('cozumel-en-jeep-punta-sur-y-chen-rio', 'en',
 'Cozumel by Jeep: Punta Sur and Chen Río',
 'A loop of the south and the wild coast: Celarain lighthouse, the crocodile lagoon and Chen Río beach.',
 'You drive, in convoy behind the guide, with a valid licence. We start in Punta Sur park: the Celarain lighthouse, the tower over Colombia lagoon — where the crocodiles are visible from the platform — and the reef beach. Then we cross to the east coast, the side with no hotels, and eat tikin xic fish at Chen Río, the one beach on the wild side where swimming is safe.',
 '["Your own jeep, in convoy behind the guide", "Celarain lighthouse and the lagoon tower", "The east coast, without a single hotel", "A fish lunch at Chen Río"]',
 '["Jeep for up to four people", "Punta Sur park entrance", "Guide leading the convoy", "Lunch at Chen Río", "Fuel for the route"]',
 '["Gratuities", "Alcoholic drinks", "Full-coverage jeep insurance"]'),

-- Isla Mujeres · snorkel -------------------------------------------------------------
('snorkel-el-farito-y-manchones', 'es',
 'Snorkel en El Farito y Manchones',
 'Dos arrecifes someros de la isla en lancha, en tres horas y media.',
 'El Farito está a cinco minutos del muelle, junto al faro viejo: tres metros de profundidad, mucha luz y bancos de peces que se acercan sin miedo. Manchones es el arrecife largo del sur, donde también está la parte de esculturas del museo subacuático. Se hacen las dos paradas en lancha con motor fuera de borda, sin música y con un guía que entra al agua con el grupo.',
 '["Dos arrecifes a menos de diez minutos del muelle", "Agua de tres a seis metros, muy clara", "Guía dentro del agua", "Lancha de hasta diez personas"]',
 '["Equipo de snorkel y chaleco", "Guía dentro del agua", "Cuota del parque marino", "Agua y fruta"]',
 '["Propinas", "Fotos submarinas", "Transporte al muelle"]'),

('snorkel-el-farito-y-manchones', 'en',
 'Snorkeling at El Farito and Manchones',
 'Two shallow reefs off the island by boat, in three and a half hours.',
 'El Farito is five minutes from the pier, next to the old lighthouse: three metres deep, full of light, with schools of fish that come right up to you. Manchones is the long reef to the south, where part of the underwater sculpture museum also sits. Both stops are done on an outboard panga, with no sound system and a guide who gets in the water with the group.',
 '["Two reefs less than ten minutes from the pier", "Three to six metres of very clear water", "A guide in the water with you", "A boat that takes ten people at most"]',
 '["Snorkel gear and life vest", "Guide in the water with you", "Marine park fee", "Water and fruit"]',
 '["Gratuities", "Underwater photos", "Transport to the pier"]'),

-- Isla Mujeres · carrito de golf ------------------------------------------------------
('vuelta-a-la-isla-en-carrito-de-golf', 'es',
 'Vuelta a la isla en carrito de golf',
 'Cinco horas por Punta Sur, Playa Lancheros y el centro, en caravana con guía.',
 'La isla mide siete kilómetros y se recorre entera en carrito. Vamos en caravana detrás del guía: primero Punta Sur, el punto más al oriente de México, donde el templo de Ixchel mira al amanecer; después la costa de sotavento, con parada en Playa Lancheros; y de regreso, el centro y los murales de la calle Hidalgo. Cada carrito lleva hasta cuatro personas.',
 '["Punta Sur, el punto más oriental de México", "Carrito para hasta cuatro personas", "Parada de comida en Playa Lancheros", "Guía en caravana, no un mapa en la mano"]',
 '["Carrito de golf con gasolina", "Entrada al parque de Punta Sur", "Guía en caravana", "Agua fría"]',
 '["Comida en Playa Lancheros", "Propinas", "Depósito del carrito (reembolsable)"]'),

('vuelta-a-la-isla-en-carrito-de-golf', 'en',
 'Island Loop by Golf Cart',
 'Five hours around Punta Sur, Playa Lancheros and the town, in convoy with a guide.',
 'The island is seven kilometres long and a cart covers all of it. We ride in convoy behind the guide: first Punta Sur, the easternmost point of Mexico, where the temple of Ixchel faces the sunrise; then the leeward coast, with a stop at Playa Lancheros; and on the way back, the town centre and the murals on Hidalgo street. Each cart carries up to four people.',
 '["Punta Sur, the easternmost point of Mexico", "A cart for up to four people", "A lunch stop at Playa Lancheros", "A guide leading the convoy, not a map in your hand"]',
 '["Golf cart with fuel", "Punta Sur park entrance", "Guide leading the convoy", "Cold water"]',
 '["Lunch at Playa Lancheros", "Gratuities", "Cart deposit (refundable)"]'),

-- Isla Mujeres · pesca ----------------------------------------------------------------
('pesca-de-altura-isla-mujeres', 'es',
 'Pesca de altura en Isla Mujeres',
 'Ocho horas de pesca de pico y dorado en el canal, con capitán y marinero.',
 'El canal frente a Isla Mujeres es paso de pez vela de diciembre a marzo, y hay dorado, wahoo y atún casi todo el año. Salimos de noche cerrada para llegar a la zona con la primera luz. La embarcación es de once metros, con torre y cuatro cañas armadas; el capitán decide dónde según el reporte del día. Con el pico se practica captura y liberación; el dorado y el atún se pueden llevar y en el muelle los limpian.',
 '["Salida antes del amanecer", "Cuatro cañas armadas y carnada viva", "Captura y liberación del pez de pico", "Máximo seis pescadores por lancha"]',
 '["Embarcación, capitán y marinero", "Cañas, carretes, señuelos y carnada", "Permiso de pesca deportiva", "Hielo, agua y refrescos", "Limpieza y fileteado de la captura"]',
 '["Comida", "Propinas a la tripulación", "Cerveza y licor"]'),

('pesca-de-altura-isla-mujeres', 'en',
 'Deep-Sea Fishing off Isla Mujeres',
 'Eight hours after sailfish and mahi-mahi in the channel, with captain and mate.',
 'The channel off Isla Mujeres is on the sailfish migration from December to March, and there is mahi-mahi, wahoo and tuna almost year round. We leave in the dark to be on the grounds at first light. The boat is eleven metres, with a tower and four rods rigged; the captain picks the spot from the day report. Billfish are catch and release; mahi-mahi and tuna you can keep, and they are cleaned at the dock.',
 '["Out before sunrise", "Four rods rigged and live bait", "Catch and release on billfish", "Six anglers per boat, maximum"]',
 '["Boat, captain and mate", "Rods, reels, lures and bait", "Sport fishing licence", "Ice, water and soft drinks", "Cleaning and filleting of your catch"]',
 '["Lunch", "Crew gratuities", "Beer and spirits"]'),

-- Holbox · tres islas ------------------------------------------------------------------
('paseo-de-las-tres-islas-holbox', 'es',
 'Paseo de las Tres Islas: Pasión, Pájaros y Punta Mosquito',
 'Cuatro horas en lancha por los tres puntos clásicos de la laguna de Yalahau.',
 'Tres paradas en la laguna: Isla Pasión, un banco de arena con palmeras donde no vive nadie; Isla Pájaros, donde no se baja de la lancha —es zona de anidación de fragatas, garzas y flamencos, y solo se sube al mirador de madera—; y Punta Mosquito, la lengua de arena del oriente de Holbox, con agua a la rodilla por trescientos metros. Entre una y otra se pasa por el ojo de agua de Yalahau.',
 '["Tres paradas y el ojo de agua de Yalahau", "Mirador de aves en Isla Pájaros", "El banco de arena de Punta Mosquito", "Lancha con techo, máximo doce personas"]',
 '["Lancha con capitán y guía", "Chalecos salvavidas", "Entrada al ojo de agua de Yalahau", "Fruta, agua y ceviche a bordo"]',
 '["Propinas", "Cuota de conservación de la isla", "Bebidas alcohólicas"]'),

('paseo-de-las-tres-islas-holbox', 'en',
 'Three Islands Tour: Pasión, Pájaros and Punta Mosquito',
 'Four hours by boat around the three classic stops on Yalahau lagoon.',
 'Three stops on the lagoon: Isla Pasión, an uninhabited sandbar with palms; Isla Pájaros, where nobody gets off the boat — it is a nesting ground for frigatebirds, herons and flamingos, and only the wooden lookout is open; and Punta Mosquito, the sand spit on the east end of Holbox, where the water stays knee-deep for three hundred metres. Between them we stop at the Yalahau freshwater spring.',
 '["Three stops plus the Yalahau spring", "A bird lookout on Isla Pájaros", "The Punta Mosquito sandbar", "A covered boat, twelve people maximum"]',
 '["Boat with captain and guide", "Life vests", "Entrance to the Yalahau spring", "Fruit, water and ceviche on board"]',
 '["Gratuities", "Island conservation fee", "Alcoholic drinks"]'),

-- Holbox · bioluminiscencia ---------------------------------------------------------------
('bioluminiscencia-en-punta-coco', 'es',
 'Bioluminiscencia nocturna en Punta Coco',
 'Dos horas en la única playa sin alumbrado de la isla, cuando el plancton se enciende.',
 'El plancton que brilla al moverse se ve en Punta Coco, la punta poniente de Holbox, porque es la única playa sin alumbrado público. Se sale en carrito desde el centro, se camina un tramo a oscuras para que la vista se acostumbre y se entra al agua hasta la cintura. No se ve todas las noches: depende de la luna y de la marea, y el guía lo dice antes de salir. Si la noche no da, se reprograma.',
 '["La única playa de la isla sin alumbrado", "Traslado en carrito desde el centro", "Grupos de máximo ocho personas", "Se reprograma si la luna no deja verlo"]',
 '["Traslado en carrito desde el centro", "Guía", "Toalla", "Té de hierbas al salir del agua"]',
 '["Cena", "Propinas", "Fotografía (con esta luz no sale)"]'),

('bioluminiscencia-en-punta-coco', 'en',
 'Nighttime Bioluminescence at Punta Coco',
 'Two hours on the only unlit beach on the island, when the plankton lights up.',
 'The plankton that glows when it is disturbed shows up at Punta Coco, the western tip of Holbox, because it is the only beach with no street lighting. We ride out by cart from the town centre, walk a stretch in the dark so your eyes adjust, and wade in waist-deep. It is not visible every night: it depends on the moon and the tide, and the guide says so before setting out. If the night is wrong, we reschedule.',
 '["The only unlit beach on the island", "Cart transfer from the town centre", "Groups of eight people maximum", "Rescheduled if the moon is too bright"]',
 '["Cart transfer from the town centre", "Guide", "Towel", "Herbal tea when you come out"]',
 '["Dinner", "Gratuities", "Photography (this light will not hold it)"]'),

-- Holbox · kayak ---------------------------------------------------------------------------
('kayak-en-el-manglar-de-holbox', 'es',
 'Kayak en el manglar de Holbox',
 'Tres horas remando por los túneles de mangle del norte de la laguna.',
 'Se entra por el canal detrás del pueblo y en diez minutos ya no se oye nada del centro. El mangle rojo cierra arriba y se rema por túneles de dos metros de ancho, donde hay garzas, cangrejos violinistas y de vez en cuando un mapache. Los kayaks son dobles y estables; no hace falta experiencia. Se sale temprano porque a esa hora hay más animales y menos calor.',
 '["Túneles de mangle rojo cerrados arriba", "Kayaks dobles y estables", "Guía biólogo del pueblo", "Salida a las 7:00, con los animales activos"]',
 '["Kayak doble, remo y chaleco", "Guía", "Binoculares para el grupo", "Agua y fruta"]',
 '["Propinas", "Bloqueador biodegradable", "Bolsa estanca"]'),

('kayak-en-el-manglar-de-holbox', 'en',
 'Kayaking Holbox Mangroves',
 'Three hours paddling the mangrove tunnels on the north side of the lagoon.',
 'We put in on the channel behind the village and within ten minutes you cannot hear the town at all. Red mangrove closes overhead and you paddle tunnels two metres wide, past herons, fiddler crabs and the occasional raccoon. The kayaks are doubles and very stable; no experience needed. We go early because that is when the animals are out and the heat is not.',
 '["Red mangrove tunnels that close overhead", "Stable double kayaks", "A biologist guide from the village", "A 7:00 start, with the wildlife active"]',
 '["Double kayak, paddle and life vest", "Guide", "Binoculars for the group", "Water and fruit"]',
 '["Gratuities", "Biodegradable sunscreen", "Dry bag"]'),

-- Bacalar · velero ---------------------------------------------------------------------------
('velero-por-la-laguna-de-los-siete-colores', 'es',
 'Velero por la laguna de los Siete Colores',
 'Cuatro horas a vela por los cenotes de la laguna y el Canal de los Piratas.',
 'Se navega a vela, sin motor la mayor parte del tiempo, y eso cambia el paseo: se oye el agua. El recorrido pasa por el Cenote Esmeralda y el Cenote Negro —cuarenta metros de profundidad, agua azul marino pegada al turquesa— y termina en el Canal de los Piratas, donde el fondo es arena blanca y el agua da a la cintura. Doce personas como máximo, y hay sombra.',
 '["A vela, sin ruido de motor", "Cenote Negro y Cenote Esmeralda", "Parada larga en el Canal de los Piratas", "Máximo doce personas, con sombra a bordo"]',
 '["Velero con capitán y guía", "Chalecos salvavidas", "Fruta, botanas y agua", "Barra de cerveza y refrescos"]',
 '["Propinas", "Comida", "Cuota de acceso al balneario"]'),

('velero-por-la-laguna-de-los-siete-colores', 'en',
 'Sailing the Seven-Colors Lagoon',
 'Four hours under sail past the lagoon cenotes and the Pirates Channel.',
 'We sail, with the engine off most of the way, and that changes the trip: you can hear the water. The route passes Cenote Esmeralda and Cenote Negro — forty metres deep, navy blue right up against turquoise — and ends at the Pirates Channel, where the bottom is white sand and the water is waist-deep. Twelve people maximum, and there is shade on board.',
 '["Under sail, with no engine noise", "Cenote Negro and Cenote Esmeralda", "A long stop at the Pirates Channel", "Twelve people maximum, with shade on board"]',
 '["Sailboat with captain and guide", "Life vests", "Fruit, snacks and water", "Open bar: beer and soft drinks"]',
 '["Gratuities", "Lunch", "Lakefront club entrance fee"]'),

-- Bacalar · kayak al amanecer ---------------------------------------------------------------
('kayak-al-amanecer-canal-de-los-piratas', 'es',
 'Kayak al amanecer por el Canal de los Piratas',
 'Dos horas y media remando con el sol saliendo sobre la laguna.',
 'A las seis de la mañana la laguna está como un espejo: no hay lanchas, no hay viento y el color cambia cada diez minutos. Se rema desde el muelle hacia el Canal de los Piratas, se para en el banco de arena a ver salir el sol y se regresa antes de las nueve, cuando empieza el tráfico de la laguna. Kayaks dobles; no hace falta experiencia.',
 '["Salida a las 6:00, con la laguna en calma", "Kayaks dobles y estables", "Parada en el banco de arena del canal", "Café de olla y pan al regresar"]',
 '["Kayak doble, remo y chaleco", "Guía", "Café de olla y pan dulce al regresar", "Bolsa estanca para el teléfono"]',
 '["Propinas", "Traslado desde tu hospedaje", "Fotografía profesional"]'),

('kayak-al-amanecer-canal-de-los-piratas', 'en',
 'Sunrise Kayak on the Pirates Channel',
 'Two and a half hours on the water with the sun coming up over the lagoon.',
 'At six in the morning the lagoon is a mirror: no boats, no wind, and the colour changes every ten minutes. We paddle from the pier toward the Pirates Channel, stop on the sandbar to watch the sun come up, and are back before nine, when the lagoon traffic starts. Double kayaks; no experience needed.',
 '["A 6:00 start, with the lagoon dead calm", "Stable double kayaks", "A stop on the channel sandbar", "Pot coffee and sweet bread on return"]',
 '["Double kayak, paddle and life vest", "Guide", "Pot coffee and sweet bread on return", "Dry bag for your phone"]',
 '["Gratuities", "Pickup from your lodging", "Professional photography"]'),

-- Bacalar · cenote azul y rápidos -------------------------------------------------------------
('cenote-azul-los-rapidos-y-cocalitos', 'es',
 'Cenote Azul, Los Rápidos y los estromatolitos',
 'Día completo por los tres balnearios del sur de la laguna, con comida.',
 'El Cenote Azul es el más profundo de la zona —noventa metros— y está pegado a la laguna, aunque no se mezclan. Los Rápidos es el estrecho donde el agua corre y uno se deja llevar por la corriente con chaleco; ahí crecen los estromatolitos, las formaciones de bacterias más antiguas del planeta, y por eso no se pisan ni se permite bloqueador. Cerramos en Cocalitos, con hamacas dentro del agua y comida de la casa.',
 '["Cenote Azul, noventa metros de profundidad", "Deriva por Los Rápidos con chaleco", "Estromatolitos vivos, con reglas para cuidarlos", "Hamacas dentro del agua en Cocalitos"]',
 '["Transporte redondo desde el centro de Bacalar", "Entradas a los tres balnearios", "Chaleco salvavidas", "Comida y agua", "Guía"]',
 '["Propinas", "Bloqueador (no se permite ninguno en Los Rápidos)", "Bebidas alcohólicas"]'),

('cenote-azul-los-rapidos-y-cocalitos', 'en',
 'Cenote Azul, Los Rápidos and the Stromatolites',
 'A full day around the three swimming spots south of the lagoon, lunch included.',
 'Cenote Azul is the deepest around — ninety metres — and sits right against the lagoon without mixing with it. Los Rápidos is the narrows where the water runs and you let the current carry you in a life vest; stromatolites grow there, the oldest bacterial formations on the planet, which is why nobody stands on them and no sunscreen is allowed. We finish at Cocalitos, with hammocks standing in the water and a home-cooked lunch.',
 '["Cenote Azul, ninety metres deep", "Drifting Los Rápidos in a life vest", "Living stromatolites, with rules to protect them", "Hammocks standing in the water at Cocalitos"]',
 '["Round-trip transport from downtown Bacalar", "Entrance to all three spots", "Life vest", "Lunch and water", "Guide"]',
 '["Gratuities", "Sunscreen (none is allowed at Los Rápidos)", "Alcoholic drinks"]'),

-- Puerto Morelos · snorkel ----------------------------------------------------------------------
('snorkel-parque-nacional-puerto-morelos', 'es',
 'Snorkel en el Parque Nacional Arrecife de Puerto Morelos',
 'Dos paradas de snorkel a seiscientos metros de la playa, con la cooperativa del pueblo.',
 'El arrecife de Puerto Morelos está a menos de un kilómetro de la orilla y es parque nacional desde 1998: por eso hay tan pocas lanchas y el coral está entero. Salimos con la cooperativa de pescadores del muelle del centro, hacemos dos paradas de snorkel de media hora cada una y regresamos. Todo el paseo son dos horas y media y casi nadie se marea: no se sale del arrecife.',
 '["Arrecife a menos de un kilómetro de la playa", "Parque nacional, con guías de la cooperativa local", "Dos paradas de media hora", "Lancha de máximo diez personas"]',
 '["Equipo de snorkel y chaleco", "Guía de la cooperativa", "Cuota del parque nacional", "Agua"]',
 '["Propinas", "Traje de neopreno", "Fotos submarinas"]'),

('snorkel-parque-nacional-puerto-morelos', 'en',
 'Snorkeling in Puerto Morelos Reef National Park',
 'Two snorkel stops six hundred metres off the beach, with the village cooperative.',
 'The Puerto Morelos reef is less than a kilometre from shore and has been a national park since 1998, which is why there are so few boats and the coral is intact. We go out with the fishermen cooperative from the town pier, make two half-hour snorkel stops and come back. The whole trip is two and a half hours and almost nobody gets seasick: we never leave the reef.',
 '["A reef less than a kilometre from the beach", "A national park, guided by the local cooperative", "Two half-hour stops", "A boat that takes ten people at most"]',
 '["Snorkel gear and life vest", "Cooperative guide", "National park fee", "Water"]',
 '["Gratuities", "Wetsuit", "Underwater photos"]'),

-- Puerto Morelos · ruta de los cenotes ------------------------------------------------------------
('ruta-de-los-cenotes-tirolesas-y-caverna', 'es',
 'Ruta de los Cenotes: tirolesas y nado en caverna',
 'Cinco horas en la carretera a Leona Vicario: dos cenotes, tirolesas y rappel.',
 'La carretera que sale de Puerto Morelos hacia Leona Vicario tiene más de cuarenta cenotes en veinte kilómetros. Vamos a dos: uno abierto, con cuatro tirolesas que lo cruzan de lado a lado y una plataforma de rappel de doce metros, y uno de caverna, al que se baja por escalera de madera y donde se nada con lámpara. Entre los dos hay comida de la cocina de la comunidad.',
 '["Cuatro tirolesas sobre un cenote abierto", "Rappel de doce metros", "Cenote de caverna, con lámpara", "Comida de la cocina comunitaria"]',
 '["Transporte redondo desde Puerto Morelos", "Arnés, casco y equipo de tirolesa", "Entradas a los dos cenotes", "Comida y agua", "Guía"]',
 '["Propinas", "Fotografía del recorrido", "Casillero"]'),

('ruta-de-los-cenotes-tirolesas-y-caverna', 'en',
 'Cenote Route: Ziplines and a Cavern Swim',
 'Five hours on the Leona Vicario road: two cenotes, ziplines and a rappel.',
 'The road out of Puerto Morelos toward Leona Vicario has more than forty cenotes in twenty kilometres. We visit two: an open one, with four ziplines crossing it side to side and a twelve-metre rappel platform, and a cavern one, reached down wooden stairs and swum with a torch. Lunch between them comes from the community kitchen.',
 '["Four ziplines over an open cenote", "A twelve-metre rappel", "A cavern cenote, swum with a torch", "Lunch from the community kitchen"]',
 '["Round-trip transport from Puerto Morelos", "Harness, helmet and zipline gear", "Entrance to both cenotes", "Lunch and water", "Guide"]',
 '["Gratuities", "Photos of the route", "Locker"]'),

-- Puerto Morelos · paddle -----------------------------------------------------------------------
('amanecer-en-paddle-sobre-el-arrecife', 'es',
 'Amanecer en paddle board sobre el arrecife',
 'Dos horas de remo de pie con el mar plano, antes de que abra el pueblo.',
 'A las seis y media el mar de Puerto Morelos está plano porque el arrecife rompe el oleaje: se rema de pie sobre agua de dos metros y se ve el fondo todo el tiempo. Salimos de la playa junto al faro inclinado, remamos hacia el sur y regresamos con el sol ya arriba. Las tablas son anchas, de principiante, y la clase de cinco minutos en la arena está incluida.',
 '["Mar plano gracias al arrecife", "Tablas anchas de principiante", "Salida junto al faro inclinado", "Grupos de máximo seis personas"]',
 '["Tabla, remo y chaleco de cintura", "Clase inicial en la arena", "Guía", "Café y fruta al terminar"]',
 '["Propinas", "Fotografía", "Traslado a la playa"]'),

('amanecer-en-paddle-sobre-el-arrecife', 'en',
 'Sunrise Paddleboarding over the Reef',
 'Two hours of stand-up paddling on flat water, before the town wakes up.',
 'At half past six the sea at Puerto Morelos is flat, because the reef takes the swell: you paddle standing over two metres of water and see the bottom the whole way. We start from the beach by the leaning lighthouse, paddle south and come back with the sun already up. The boards are wide beginner boards, and the five-minute lesson on the sand is included.',
 '["Flat water, thanks to the reef", "Wide beginner boards", "Start by the leaning lighthouse", "Groups of six people maximum"]',
 '["Board, paddle and waist belt vest", "Beginner lesson on the sand", "Guide", "Coffee and fruit afterwards"]',
 '["Gratuities", "Photography", "Transfer to the beach"]');

-- 4. El itinerario del día ---------------------------------------------------
--
-- Los pasos cuelgan de la opción de tour, no del producto: una salida matutina
-- y una vespertina del mismo tour tienen horarios distintos (ver la cabecera de
-- `0015_tour_itinerary.sql`). Las horas cuadran con `start_time` y
-- `duration_minutes` de la sección 2; si alguien cambia una, hay que mover la
-- otra.

create temporary table cat_step (
  slug           text not null,
  position       integer not null,
  time_label     text not null,
  title_es       text not null,
  title_en       text not null,
  description_es text not null,
  description_en text not null,
  primary key (slug, position)
) on commit drop;

insert into cat_step values

('musa-snorkel-arrecife-manchones', 0, '8:40', 'Registro en el muelle', 'Check-in at the pier',
 'Nos vemos en el muelle de Playa Tortugas, firmas la lista del parque nacional y se reparte el equipo.',
 'We meet at the Playa Tortugas pier, you sign the national park list and the gear is handed out.'),
('musa-snorkel-arrecife-manchones', 1, '9:00', 'Salida hacia Punta Nizuc', 'Out toward Punta Nizuc',
 'Veinte minutos de navegación por dentro de la bahía, con la plática de seguridad en el camino.',
 'Twenty minutes inside the bay, with the safety briefing given under way.'),
('musa-snorkel-arrecife-manchones', 2, '9:40', 'La galería del MUSA', 'The MUSA gallery',
 'Cuarenta minutos sobre las esculturas. El agua tiene ocho metros y se ve el conjunto entero desde arriba.',
 'Forty minutes over the sculptures. The water is eight metres deep and you can take in the whole set from the surface.'),
('musa-snorkel-arrecife-manchones', 3, '10:50', 'Arrecife de Manchones', 'Manchones reef',
 'Arrecife vivo, más somero y con más pez. Es la parada donde la gente se queda hasta que la llaman.',
 'Living reef, shallower and with far more fish. This is the stop people have to be called back from.'),
('musa-snorkel-arrecife-manchones', 4, '12:00', 'Regreso a Playa Tortugas', 'Back at Playa Tortugas',
 'Volvemos al mismo muelle antes de que el viento de la tarde pique el agua.',
 'Back to the same pier before the afternoon wind chops up the water.'),

('isla-contoy-e-isla-mujeres', 0, '8:00', 'Registro y permiso de Contoy', 'Check-in and Contoy permit',
 'Se registran los nombres para el permiso del parque: es nominal y por eso se pide con anticipación.',
 'Names go on the park permit: it is issued per person, which is why it is requested in advance.'),
('isla-contoy-e-isla-mujeres', 1, '8:30', 'Zarpe desde Playa Caracol', 'Casting off from Playa Caracol',
 'Desayuno ligero a bordo durante las dos horas de navegación hacia el norte.',
 'A light breakfast on board during the two-hour sail north.'),
('isla-contoy-e-isla-mujeres', 2, '10:30', 'Snorkel en el arrecife Ixlaché', 'Snorkeling at Ixlaché reef',
 'Cuarenta y cinco minutos en el punto donde arranca el arrecife Mesoamericano.',
 'Forty-five minutes at the point where the Mesoamerican reef begins.'),
('isla-contoy-e-isla-mujeres', 3, '12:30', 'Contoy: sendero, torre y comida', 'Contoy: trail, tower and lunch',
 'Desembarco en la isla. Sendero de manglar, torre de observación y pescado a la plancha en la playa.',
 'We land on the island. Mangrove trail, observation tower and grilled fish on the beach.'),
('isla-contoy-e-isla-mujeres', 4, '15:00', 'Isla Mujeres y Playa Norte', 'Isla Mujeres and Playa Norte',
 'Hora y media en Playa Norte, con el agua más somera y más caliente del día.',
 'An hour and a half at Playa Norte, the shallowest and warmest water of the day.'),
('isla-contoy-e-isla-mujeres', 5, '17:30', 'Regreso al embarcadero', 'Back at the dock',
 'Llegamos a Playa Caracol con luz todavía. El regreso al hotel corre por tu cuenta.',
 'We reach Playa Caracol while it is still light. Getting back to your hotel is on you.'),

('chichen-itza-cenote-y-valladolid', 0, '7:00', 'Salida de Plaza Kukulcán', 'Departure from Plaza Kukulcán',
 'Salimos de noche para llegar a la zona arqueológica cuando abren la puerta.',
 'We leave in the dark to reach the site as the gate opens.'),
('chichen-itza-cenote-y-valladolid', 1, '10:00', 'Chichén Itzá con guía', 'Chichén Itzá with the guide',
 'Dos horas de recorrido: el Castillo, el Juego de Pelota, el Observatorio y el Cenote Sagrado.',
 'Two hours on site: El Castillo, the Great Ball Court, the Observatory and the Sacred Cenote.'),
('chichen-itza-cenote-y-valladolid', 2, '13:00', 'Cenote Ik Kil', 'Ik Kil cenote',
 'Cenote circular de veintiséis metros de caída, con raíces colgando hasta el agua.',
 'A circular cenote with a twenty-six-metre drop and roots hanging down to the water.'),
('chichen-itza-cenote-y-valladolid', 3, '14:30', 'Comida yucateca', 'Yucatecan lunch',
 'Bufé de cochinita, relleno negro, sopa de lima y frijol con puerco.',
 'A buffet of cochinita, relleno negro, lime soup and pork and beans.'),
('chichen-itza-cenote-y-valladolid', 4, '16:00', 'Valladolid', 'Valladolid',
 'Una hora libre en el convento de San Bernardino y la calzada de los Frailes.',
 'A free hour at the San Bernardino convent and the Calzada de los Frailes.'),
('chichen-itza-cenote-y-valladolid', 5, '19:00', 'Regreso a la Zona Hotelera', 'Back to the hotel zone',
 'Dejamos en el mismo estacionamiento de Plaza Kukulcán donde salimos.',
 'We drop off at the same Plaza Kukulcán car park we left from.'),

('cenotes-cristalino-azul-y-eden', 0, '8:30', 'Salida del Parque Fundadores', 'Leaving Parque Fundadores',
 'Cuarenta minutos por la federal 307 rumbo al sur, antes del tráfico de la mañana.',
 'Forty minutes south on Highway 307, ahead of the morning traffic.'),
('cenotes-cristalino-azul-y-eden', 1, '9:15', 'Cenote Cristalino', 'Cristalino cenote',
 'El primero y el más chico. Tiene el salto de tres metros y a esta hora está vacío.',
 'The first and smallest. It has the three-metre jump, and at this hour it is empty.'),
('cenotes-cristalino-azul-y-eden', 2, '11:00', 'Cenote Azul', 'Azul cenote',
 'El más ancho de los tres, con zonas de un metro y otras de ocho.',
 'The widest of the three, with sections a metre deep and others eight.'),
('cenotes-cristalino-azul-y-eden', 3, '12:30', 'Jardín del Edén', 'Jardín del Edén',
 'El de agua salobre: se ven peces de mar tierra adentro. Aquí se come el sándwich.',
 'The brackish one, where you spot sea fish inland. This is where we eat the sandwiches.'),
('cenotes-cristalino-azul-y-eden', 4, '14:30', 'Regreso a Playa del Carmen', 'Back to Playa del Carmen',
 'Te dejamos en el Parque Fundadores, a menos que prefieras bajarte antes.',
 'We drop you at Parque Fundadores, unless you would rather get out earlier.'),

('sabores-de-la-quinta-avenida', 0, '17:30', 'Encuentro en la Plaza 28 de Julio', 'Meeting at Plaza 28 de Julio',
 'Nos juntamos junto al kiosco. El guía explica la ruta y por qué está armada así.',
 'We meet by the bandstand. The guide walks through the route and why it is built that way.'),
('sabores-de-la-quinta-avenida', 1, '18:00', 'Cochinita y panuchos', 'Cochinita and panuchos',
 'Primera parada en una cocina de barrio que abre solo por la tarde.',
 'First stop at a neighbourhood kitchen that only opens in the afternoon.'),
('sabores-de-la-quinta-avenida', 2, '19:00', 'Trompo de pastor', 'The al pastor spit',
 'Taquería de trompo con piña, en la calle 30. Dos tacos por persona.',
 'A spit-and-pineapple taquería on Calle 30. Two tacos each.'),
('sabores-de-la-quinta-avenida', 3, '19:45', 'Marquesitas y esquites', 'Marquesitas and esquites',
 'El carrito de la esquina: crepa dura con queso de bola, y esquites con chile.',
 'The corner cart: crisp crepe with Edam cheese, and esquites with chilli.'),
('sabores-de-la-quinta-avenida', 4, '20:15', 'Mezcalería', 'Mezcalería',
 'Tres mezcales de tres estados distintos, con sal de gusano y naranja.',
 'Three mezcales from three different states, with worm salt and orange.'),
('sabores-de-la-quinta-avenida', 5, '21:00', 'Pan de elote y cierre', 'Corn cake and goodbye',
 'Cerramos con pan de elote y café de olla, otra vez en la plaza.',
 'We finish with corn cake and pot coffee, back at the square.'),

('bautismo-de-buceo-playa', 0, '9:00', 'Papeleo y ajuste del equipo', 'Paperwork and gear fitting',
 'Cuestionario médico, talla de traje y ajuste del chaleco. Media hora.',
 'Medical questionnaire, wetsuit size and BCD fitting. Half an hour.'),
('bautismo-de-buceo-playa', 1, '9:45', 'Práctica en aguas someras', 'Shallow-water practice',
 'Una hora en dos metros de agua: respirar, compensar y vaciar el visor hasta que sale solo.',
 'An hour in two metres of water: breathing, equalising and clearing the mask until it is automatic.'),
('bautismo-de-buceo-playa', 2, '10:45', 'Salida al arrecife de Chunzubul', 'Out to Chunzubul reef',
 'Quince minutos de lancha desde el muelle de la calle 1 Sur.',
 'A fifteen-minute boat ride from the Calle 1 Sur pier.'),
('bautismo-de-buceo-playa', 3, '11:15', 'Inmersión de 35 minutos', 'The 35-minute dive',
 'Doce metros como máximo, siempre a la vista del instructor y de la mano si hace falta.',
 'Twelve metres at most, always within the instructor reach and hand in hand if needed.'),
('bautismo-de-buceo-playa', 4, '12:30', 'Regreso al muelle', 'Back at the pier',
 'Se entrega el equipo y se comenta la inmersión. Si quieres, aquí empieza el curso completo.',
 'Gear back, dive debriefed. If you want, the full course starts right here.'),

('ruinas-de-tulum-al-amanecer', 0, '7:40', 'Encuentro en el acceso peatonal', 'Meeting at the pedestrian entrance',
 'Nos vemos afuera de la taquilla, veinte minutos antes de que abran.',
 'We meet outside the ticket office, twenty minutes before opening.'),
('ruinas-de-tulum-al-amanecer', 1, '8:00', 'Entrada con la primera tanda', 'In with the first group',
 'Se abre a las ocho en punto. El tren interno deja en la entrada de la muralla.',
 'The gate opens at eight sharp. The shuttle train drops you at the wall.'),
('ruinas-de-tulum-al-amanecer', 2, '8:20', 'El Castillo y el Templo del Dios Descendente', 'El Castillo and the Temple of the Descending God',
 'Hora y media con el guía por el conjunto principal, con el mar de fondo y sin fila.',
 'An hour and a half with the guide through the main group, sea behind and no queue.'),
('ruinas-de-tulum-al-amanecer', 3, '9:30', 'Tiempo libre y bajada a la cala', 'Free time and the walk down to the cove',
 'Una hora por tu cuenta. La escalera a la playa está dentro de la zona.',
 'An hour on your own. The stairs down to the beach are inside the site.'),
('ruinas-de-tulum-al-amanecer', 4, '10:40', 'Cierre en el acceso', 'Goodbye at the entrance',
 'Nos despedimos en la taquilla, justo cuando llegan los primeros autobuses.',
 'We say goodbye at the ticket office, right as the first coaches pull in.'),

('coba-en-bicicleta-y-dos-cenotes', 0, '8:00', 'Salida de Tulum centro', 'Leaving downtown Tulum',
 'Hora y cuarto de camino tierra adentro, por la carretera a Nuevo Xcan.',
 'An hour and a quarter inland, on the road to Nuevo Xcan.'),
('coba-en-bicicleta-y-dos-cenotes', 1, '9:15', 'Cobá: sacbés en bicicleta', 'Cobá: sacbés by bike',
 'Se reparten las bicicletas en la entrada y se rueda por los caminos blancos.',
 'Bicycles are handed out at the entrance and you ride the white roads.'),
('coba-en-bicicleta-y-dos-cenotes', 2, '11:30', 'Nohoch Mul y el juego de pelota', 'Nohoch Mul and the ball court',
 'El grupo principal de la ciudad, con el guía explicando las estelas.',
 'The main group of the city, with the guide reading the stelae.'),
('coba-en-bicicleta-y-dos-cenotes', 3, '13:00', 'Comida en el pueblo de Cobá', 'Lunch in the village of Cobá',
 'Comedor familiar frente a la laguna: pollo pibil, arroz y agua de chaya.',
 'A family kitchen facing the lagoon: pollo pibil, rice and chaya water.'),
('coba-en-bicicleta-y-dos-cenotes', 4, '14:15', 'Dos cenotes de caverna', 'Two cavern cenotes',
 'Se baja por escalera de madera. El agua está a veinticuatro grados todo el año.',
 'Down wooden stairs. The water sits at twenty-four degrees all year.'),
('coba-en-bicicleta-y-dos-cenotes', 5, '16:00', 'Regreso a Tulum', 'Back to Tulum',
 'Te dejamos en el Parque Dos Aguas o en tu hospedaje si queda en el camino.',
 'We drop you at Parque Dos Aguas, or at your lodging if it is on the way.'),

('sian-kaan-canal-maya-de-muyil', 0, '8:30', 'Encuentro en Muyil', 'Meeting at Muyil',
 'Nos vemos en la entrada de la zona arqueológica, sobre la federal 307.',
 'We meet at the entrance to the archaeological site, on Highway 307.'),
('sian-kaan-canal-maya-de-muyil', 1, '8:45', 'Zona arqueológica', 'The ruins',
 'Una hora entre el Castillo de Muyil y el Templo 8, con el guía comunitario.',
 'An hour between the Castillo of Muyil and Structure 8, with the community guide.'),
('sian-kaan-canal-maya-de-muyil', 2, '10:00', 'Pasarela y mirador de la laguna', 'Boardwalk and lagoon lookout',
 'Un kilómetro de pasarela sobre el manglar hasta la torre que mira la laguna.',
 'A kilometre of boardwalk over the mangrove to the tower above the lagoon.'),
('sian-kaan-canal-maya-de-muyil', 3, '11:00', 'Lancha a Chunyaxché', 'Boat to Chunyaxché',
 'Se cruza la laguna hasta la boca del canal, con parada para ver aves.',
 'We cross the lagoon to the mouth of the canal, stopping to watch birds.'),
('sian-kaan-canal-maya-de-muyil', 4, '12:00', 'Flote por el canal maya', 'Float down the Maya canal',
 'Cuarenta minutos boca arriba, llevado por la corriente, sin remar.',
 'Forty minutes on your back, carried by the current, without paddling.'),
('sian-kaan-canal-maya-de-muyil', 5, '15:30', 'Cierre en Muyil', 'Goodbye at Muyil',
 'Regresamos por la laguna y cerramos donde empezamos.',
 'We come back across the lagoon and finish where we started.'),

('buceo-palancar-y-colombia', 0, '8:00', 'Registro y revisión de bitácora', 'Check-in and logbook review',
 'Se revisa la certificación y las últimas inmersiones. Sin bitácora no se sale.',
 'Certification and recent dives are checked. No logbook, no dive.'),
('buceo-palancar-y-colombia', 1, '8:30', 'Zarpe desde la Marina Caleta', 'Casting off from Marina Caleta',
 'Cuarenta minutos hacia el sur, armando el equipo en el camino.',
 'Forty minutes south, rigging gear under way.'),
('buceo-palancar-y-colombia', 2, '9:30', 'Palancar Jardines', 'Palancar Gardens',
 'Cuarenta minutos de deriva entre cabezas de coral y canales de arena, de 18 a 12 metros.',
 'Forty minutes of drift between coral heads and sand channels, from 18 to 12 metres.'),
('buceo-palancar-y-colombia', 3, '11:00', 'Intervalo de superficie', 'Surface interval',
 'Una hora fondeados, con fruta y agua. Es tiempo de descompresión, no relleno.',
 'An hour at anchor with fruit and water. This is off-gassing time, not filler.'),
('buceo-palancar-y-colombia', 4, '12:00', 'Colombia Profundo', 'Colombia Deep',
 'Paredes y columnas de coral, de 24 a 15 metros. Es donde salen las tortugas.',
 'Walls and coral pinnacles, from 24 to 15 metres. This is where the turtles show up.'),
('buceo-palancar-y-colombia', 5, '13:30', 'Regreso al muelle', 'Back at the pier',
 'Se sella la bitácora en la marina y se entrega el equipo rentado.',
 'Logbooks are stamped at the marina and rental gear is handed back.'),

('snorkel-el-cielo-colombia-y-palancar', 0, '12:30', 'Zarpe del Puerto de Abrigo', 'Casting off from Puerto de Abrigo',
 'Media hora navegando al sur, con la plática de seguridad y el ajuste del equipo.',
 'Half an hour sailing south, with the safety briefing and gear fitting.'),
('snorkel-el-cielo-colombia-y-palancar', 1, '13:15', 'Arrecife Palancar', 'Palancar reef',
 'Cuarenta minutos sobre las cabezas de coral, en cinco a diez metros de agua.',
 'Forty minutes over the coral heads, in five to ten metres of water.'),
('snorkel-el-cielo-colombia-y-palancar', 2, '14:15', 'Arrecife Colombia', 'Colombia reef',
 'La parada con más pez: peces loro, sargentos y de vez en cuando una barracuda.',
 'The stop with the most fish: parrotfish, sergeant majors and the odd barracuda.'),
('snorkel-el-cielo-colombia-y-palancar', 3, '15:15', 'El Cielo', 'El Cielo',
 'Banco de arena de metro y medio. Aquí se abre la barra y nadie se vuelve a subir al barco.',
 'A sandbar a metre and a half deep. The bar opens here and nobody gets back on the boat.'),
('snorkel-el-cielo-colombia-y-palancar', 4, '16:30', 'Regreso al muelle', 'Back at the pier',
 'Media hora de navegación de vuelta a San Miguel.',
 'Half an hour back to San Miguel.'),

('cozumel-en-jeep-punta-sur-y-chen-rio', 0, '9:00', 'Entrega de jeeps y plática de manejo', 'Jeep handover and driving briefing',
 'Se revisa la licencia, se asignan los jeeps y se explica cómo va la caravana.',
 'Licences are checked, jeeps assigned and the convoy rules explained.'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 1, '10:00', 'Faro de Celarain', 'Celarain lighthouse',
 'Subida al faro y museo de navegación, en la punta sur de la isla.',
 'Up the lighthouse and through the navigation museum, at the southern tip.'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 2, '11:30', 'Mirador de la laguna Colombia', 'Colombia lagoon lookout',
 'Torre de madera sobre el manglar. Los cocodrilos se ven desde arriba, nunca de cerca.',
 'A wooden tower over the mangrove. The crocodiles are seen from above, never up close.'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 3, '13:00', 'Comida en Chen Río', 'Lunch at Chen Río',
 'Pescado tikin xic en la playa protegida del lado salvaje.',
 'Tikin xic fish on the sheltered beach of the wild side.'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 4, '14:30', 'Costa este hasta el arco', 'The east coast up to the arch',
 'Se maneja la costa abierta, con parada en el arco de piedra y en El Mirador.',
 'Driving the open coast, stopping at the stone arch and El Mirador.'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 5, '16:00', 'Entrega en el Muelle Fiscal', 'Handover at the Muelle Fiscal',
 'Se devuelven los jeeps en la explanada donde empezamos.',
 'Jeeps are returned on the esplanade where we started.'),

('snorkel-el-farito-y-manchones', 0, '9:30', 'Salida del embarcadero', 'Leaving the dock',
 'Se ajustan visores y aletas en el muelle antes de zarpar.',
 'Masks and fins are fitted at the dock before casting off.'),
('snorkel-el-farito-y-manchones', 1, '9:45', 'El Farito', 'El Farito',
 'Cinco minutos de navegación. Tres metros de agua junto al faro viejo, con mucha luz.',
 'Five minutes out. Three metres of water beside the old lighthouse, full of light.'),
('snorkel-el-farito-y-manchones', 2, '11:00', 'Manchones', 'Manchones',
 'El arrecife largo del sur, con la parte de esculturas del museo subacuático.',
 'The long southern reef, including part of the underwater sculpture museum.'),
('snorkel-el-farito-y-manchones', 3, '12:15', 'Fruta y regreso', 'Fruit and the ride back',
 'Se sale del agua, se reparte fruta y se navega de vuelta pegados a la costa.',
 'Out of the water, fruit handed round, and back along the coast.'),
('snorkel-el-farito-y-manchones', 4, '13:00', 'Llegada al muelle', 'Back at the dock',
 'Regresamos al mismo embarcadero de la avenida Rueda Medina.',
 'We return to the same dock on Avenida Rueda Medina.'),

('vuelta-a-la-isla-en-carrito-de-golf', 0, '10:00', 'Entrega de carritos', 'Cart handover',
 'Se asignan los carritos, se revisa la batería y se explica la ruta.',
 'Carts are assigned, batteries checked and the route explained.'),
('vuelta-a-la-isla-en-carrito-de-golf', 1, '10:45', 'Punta Sur y el templo de Ixchel', 'Punta Sur and the temple of Ixchel',
 'El punto más oriental de México, con el sendero de esculturas sobre el acantilado.',
 'The easternmost point of Mexico, with the sculpture trail along the cliff.'),
('vuelta-a-la-isla-en-carrito-de-golf', 2, '12:15', 'Playa Lancheros', 'Playa Lancheros',
 'Parada de comida y baño en la costa de sotavento, donde el agua es más quieta.',
 'A lunch and swim stop on the leeward coast, where the water is calmest.'),
('vuelta-a-la-isla-en-carrito-de-golf', 3, '13:45', 'Centro y murales de Hidalgo', 'The centre and the Hidalgo murals',
 'Vuelta por el pueblo, con tiempo para los murales y para comprar algo.',
 'A loop through town, with time for the murals and for shopping.'),
('vuelta-a-la-isla-en-carrito-de-golf', 4, '15:00', 'Entrega de carritos', 'Carts returned',
 'Se devuelven los carritos frente a la terminal de ferris.',
 'Carts go back across from the ferry terminal.'),

('pesca-de-altura-isla-mujeres', 0, '5:45', 'Registro en el muelle de pescadores', 'Check-in at the fishermen dock',
 'Se firma el permiso de pesca deportiva y se sube el hielo.',
 'The sport fishing licence is signed and the ice goes on board.'),
('pesca-de-altura-isla-mujeres', 1, '6:00', 'Zarpe a oscuras', 'Casting off in the dark',
 'Una hora de navegación para estar en la zona con la primera luz.',
 'An hour out, to be on the grounds at first light.'),
('pesca-de-altura-isla-mujeres', 2, '7:00', 'Primera línea con la luz', 'First lines at first light',
 'Se arman cuatro cañas y se empieza a curricar. Es la mejor hora del día.',
 'Four rods go out and the trolling starts. This is the best hour of the day.'),
('pesca-de-altura-isla-mujeres', 3, '11:00', 'Cambio de zona', 'Moving grounds',
 'El capitán mueve la lancha según el reporte de la flota y la temperatura del agua.',
 'The captain moves the boat based on the fleet report and the water temperature.'),
('pesca-de-altura-isla-mujeres', 4, '13:00', 'Regreso navegando', 'Running back',
 'Se recogen las líneas y se navega de vuelta con el viento de la tarde.',
 'Lines come in and we run back with the afternoon wind.'),
('pesca-de-altura-isla-mujeres', 5, '14:00', 'Limpieza de la captura', 'Cleaning the catch',
 'En el muelle se limpia y filetea lo que se pueda llevar; el pico va y vuelve al agua.',
 'At the dock, whatever can be kept is cleaned and filleted; billfish went back in the water.'),

('paseo-de-las-tres-islas-holbox', 0, '9:00', 'Salida del muelle principal', 'Leaving the main pier',
 'Se reparten chalecos y se navega hacia el oeste por la laguna.',
 'Life vests are handed out and we head west across the lagoon.'),
('paseo-de-las-tres-islas-holbox', 1, '9:30', 'Ojo de agua de Yalahau', 'Yalahau spring',
 'Manantial de agua dulce dentro del manglar, con muelle de madera para entrar.',
 'A freshwater spring inside the mangrove, with a wooden dock to get in.'),
('paseo-de-las-tres-islas-holbox', 2, '10:30', 'Isla Pájaros, desde el mirador', 'Isla Pájaros, from the lookout',
 'Nadie baja de la lancha: es zona de anidación. Solo se sube al mirador de madera.',
 'Nobody leaves the boat: it is a nesting ground. Only the wooden lookout is open.'),
('paseo-de-las-tres-islas-holbox', 3, '11:15', 'Isla Pasión', 'Isla Pasión',
 'Banco de arena con palmeras, sin nadie viviendo ahí. Media hora de parada.',
 'A palm-covered sandbar where nobody lives. A half-hour stop.'),
('paseo-de-las-tres-islas-holbox', 4, '12:00', 'Punta Mosquito', 'Punta Mosquito',
 'La lengua de arena del oriente de la isla, con agua a la rodilla por trescientos metros.',
 'The sand spit at the east end, knee-deep for three hundred metres.'),
('paseo-de-las-tres-islas-holbox', 5, '13:00', 'Regreso al muelle', 'Back at the pier',
 'Volvemos al muelle principal del pueblo.',
 'We come back to the main village pier.'),

('bioluminiscencia-en-punta-coco', 0, '20:30', 'Encuentro en el parque central', 'Meeting at the main square',
 'El guía revisa la luna y la marea del día antes de salir: si no da, se reprograma.',
 'The guide checks the moon and the tide before setting out: if it is wrong, we reschedule.'),
('bioluminiscencia-en-punta-coco', 1, '20:45', 'Traslado en carrito a Punta Coco', 'Cart transfer to Punta Coco',
 'Quince minutos por el camino de arena hasta la punta poniente.',
 'Fifteen minutes down the sand road to the western tip.'),
('bioluminiscencia-en-punta-coco', 2, '21:00', 'Caminata a oscuras y entrada al agua', 'Walking in the dark and getting in',
 'Se camina sin lámpara para que la vista se acostumbre, y se entra hasta la cintura.',
 'We walk without torches so your eyes adjust, then wade in waist-deep.'),
('bioluminiscencia-en-punta-coco', 3, '22:00', 'Té y regreso', 'Tea and the ride back',
 'Se sale del agua, hay toalla y té de hierbas antes de subir al carrito.',
 'Out of the water, with a towel and herbal tea before getting back in the cart.'),
('bioluminiscencia-en-punta-coco', 4, '22:30', 'Cierre en el parque central', 'Goodbye at the main square',
 'Te dejamos donde empezamos, en el parque del pueblo.',
 'We drop you where we started, at the village square.'),

('kayak-en-el-manglar-de-holbox', 0, '7:00', 'Encuentro y ajuste de chalecos', 'Meeting and vest fitting',
 'Se explica cómo se rema en pareja y cómo se gira en un túnel angosto.',
 'How to paddle as a pair, and how to turn inside a narrow tunnel.'),
('kayak-en-el-manglar-de-holbox', 1, '7:20', 'Canal de salida', 'The exit channel',
 'Diez minutos por el canal detrás del pueblo, todavía con ruido de fondo.',
 'Ten minutes down the channel behind the village, still with some noise behind you.'),
('kayak-en-el-manglar-de-holbox', 2, '8:00', 'Túneles de mangle', 'The mangrove tunnels',
 'Dos metros de ancho y el mangle cerrado arriba. Aquí se apagan las voces.',
 'Two metres wide with the mangrove closed overhead. Everyone goes quiet here.'),
('kayak-en-el-manglar-de-holbox', 3, '9:15', 'Parada de fruta', 'Fruit stop',
 'Se amarran los kayaks en un claro y se sacan los binoculares.',
 'Kayaks are tied up in a clearing and the binoculars come out.'),
('kayak-en-el-manglar-de-holbox', 4, '10:00', 'Regreso al embarcadero', 'Back at the launch',
 'Volvemos por el mismo canal, ya con calor.',
 'Back down the same channel, with the heat coming on.'),

('velero-por-la-laguna-de-los-siete-colores', 0, '10:00', 'Zarpe del balneario municipal', 'Casting off from the municipal club',
 'Se iza la vela en el muelle y se apaga el motor en cuanto agarra viento.',
 'The sail goes up at the dock and the engine goes off as soon as it catches.'),
('velero-por-la-laguna-de-los-siete-colores', 1, '10:45', 'Cenote Esmeralda', 'Cenote Esmeralda',
 'El primero de los cenotes de la laguna, con el cambio de color más marcado.',
 'The first of the lagoon cenotes, with the sharpest change of colour.'),
('velero-por-la-laguna-de-los-siete-colores', 2, '11:30', 'Cenote Negro', 'Cenote Negro',
 'Cuarenta metros de profundidad. Se ancla en el borde y se nada del azul al turquesa.',
 'Forty metres deep. We anchor on the edge and you swim from navy into turquoise.'),
('velero-por-la-laguna-de-los-siete-colores', 3, '12:15', 'Canal de los Piratas', 'The Pirates Channel',
 'Parada larga con el agua a la cintura y arena blanca. Aquí se abre la barra.',
 'A long stop, waist-deep over white sand. The bar opens here.'),
('velero-por-la-laguna-de-los-siete-colores', 4, '14:00', 'Regreso al muelle', 'Back at the dock',
 'Volvemos a vela si el viento aguanta, y a motor si no.',
 'Back under sail if the wind holds, under engine if it does not.'),

('kayak-al-amanecer-canal-de-los-piratas', 0, '6:00', 'Encuentro en el muelle', 'Meeting at the dock',
 'Todavía de noche. Se ajustan chalecos y se explica el remo doble.',
 'Still dark. Vests fitted and the double paddle explained.'),
('kayak-al-amanecer-canal-de-los-piratas', 1, '6:20', 'Salida rumbo al canal', 'Out toward the channel',
 'Cuarenta minutos remando con la laguna como espejo.',
 'Forty minutes of paddling with the lagoon like glass.'),
('kayak-al-amanecer-canal-de-los-piratas', 2, '7:00', 'Amanecer en el banco de arena', 'Sunrise on the sandbar',
 'Se para en el banco a esperar el sol. El color cambia cada diez minutos.',
 'We stop on the bar and wait for the sun. The colour changes every ten minutes.'),
('kayak-al-amanecer-canal-de-los-piratas', 3, '7:45', 'Regreso remando', 'Paddling back',
 'De vuelta antes de las nueve, cuando empiezan a salir las lanchas.',
 'Back before nine, when the boats start going out.'),
('kayak-al-amanecer-canal-de-los-piratas', 4, '8:30', 'Café y pan en el muelle', 'Coffee and bread at the dock',
 'Café de olla y pan dulce en el muelle antes de despedirnos.',
 'Pot coffee and sweet bread at the dock before we say goodbye.'),

('cenote-azul-los-rapidos-y-cocalitos', 0, '9:00', 'Salida del Fuerte de San Felipe', 'Leaving the San Felipe fort',
 'Nos juntamos frente al fuerte y salimos al sur por la orilla de la laguna.',
 'We meet in front of the fort and head south along the lagoon shore.'),
('cenote-azul-los-rapidos-y-cocalitos', 1, '9:30', 'Cenote Azul', 'Cenote Azul',
 'Noventa metros de profundidad pegados a la laguna, sin mezclarse con ella.',
 'Ninety metres deep, right against the lagoon and never mixing with it.'),
('cenote-azul-los-rapidos-y-cocalitos', 2, '11:00', 'Los Rápidos y los estromatolitos', 'Los Rápidos and the stromatolites',
 'Deriva con chaleco por el estrecho. No se pisa el fondo: ahí crecen los estromatolitos.',
 'Drifting the narrows in a life vest. Nobody stands on the bottom: the stromatolites grow there.'),
('cenote-azul-los-rapidos-y-cocalitos', 3, '13:00', 'Comida en Cocalitos', 'Lunch at Cocalitos',
 'Comida de la casa frente al agua: pescado, arroz y agua de chaya.',
 'A home-cooked lunch on the water: fish, rice and chaya water.'),
('cenote-azul-los-rapidos-y-cocalitos', 4, '14:00', 'Hamacas dentro del agua', 'Hammocks in the water',
 'Última hora en las hamacas montadas sobre la laguna.',
 'The last hour in the hammocks strung out over the lagoon.'),
('cenote-azul-los-rapidos-y-cocalitos', 5, '15:00', 'Regreso al centro', 'Back to the centre',
 'Te dejamos otra vez en el Fuerte de San Felipe.',
 'We drop you back at the San Felipe fort.'),

('snorkel-parque-nacional-puerto-morelos', 0, '9:00', 'Registro con la cooperativa', 'Check-in with the cooperative',
 'Se firma la lista del parque nacional y se reparten visor, aletas y chaleco.',
 'You sign the national park list and mask, fins and vest are handed out.'),
('snorkel-parque-nacional-puerto-morelos', 1, '9:20', 'Salida al arrecife', 'Out to the reef',
 'Diez minutos de lancha. El arrecife está a seiscientos metros de la orilla.',
 'A ten-minute boat ride. The reef is six hundred metres from shore.'),
('snorkel-parque-nacional-puerto-morelos', 2, '9:40', 'Primera parada de snorkel', 'First snorkel stop',
 'Media hora sobre la cresta del arrecife, en tres metros de agua.',
 'Half an hour over the reef crest, in three metres of water.'),
('snorkel-parque-nacional-puerto-morelos', 3, '10:30', 'Segunda parada de snorkel', 'Second snorkel stop',
 'Media hora del lado de adentro, más protegido y con más pez chico.',
 'Half an hour on the inside, more sheltered and full of small fish.'),
('snorkel-parque-nacional-puerto-morelos', 4, '11:30', 'Regreso al muelle', 'Back at the pier',
 'Regresamos al muelle de la cooperativa, frente a la plaza.',
 'We return to the cooperative pier, across from the square.'),

('ruta-de-los-cenotes-tirolesas-y-caverna', 0, '9:30', 'Encuentro en el km 1', 'Meeting at km 1',
 'Nos vemos en la entrada de la Ruta de los Cenotes y se firma el deslinde.',
 'We meet at the head of the Cenote Route and the waiver is signed.'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 1, '10:00', 'Tirolesas sobre el cenote abierto', 'Ziplines over the open cenote',
 'Cuatro tirolesas que cruzan el cenote de lado a lado, con arnés y casco.',
 'Four ziplines crossing the cenote side to side, in harness and helmet.'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 2, '11:00', 'Rappel de doce metros', 'Twelve-metre rappel',
 'Se baja de espaldas desde la plataforma hasta el agua. Se puede pasar.',
 'You go down backwards from the platform to the water. Skipping it is fine.'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 3, '12:00', 'Comida de la cocina comunitaria', 'Lunch from the community kitchen',
 'Pollo asado, frijol, tortilla hecha a mano y agua de jamaica.',
 'Grilled chicken, beans, hand-made tortillas and hibiscus water.'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 4, '13:00', 'Cenote de caverna con lámpara', 'Cavern cenote with a torch',
 'Se baja por escalera de madera y se nada con lámpara entre las formaciones.',
 'Down wooden stairs, swimming with a torch among the formations.'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 5, '14:30', 'Cierre y regreso', 'Wrap-up and drive back',
 'Volvemos a Puerto Morelos por la misma carretera.',
 'Back to Puerto Morelos on the same road.'),

('amanecer-en-paddle-sobre-el-arrecife', 0, '6:30', 'Encuentro junto al faro inclinado', 'Meeting by the leaning lighthouse',
 'Nos vemos en la playa del faro viejo, con el mar todavía sin viento.',
 'We meet on the beach by the old lighthouse, with the sea still windless.'),
('amanecer-en-paddle-sobre-el-arrecife', 1, '6:40', 'Clase en la arena', 'Lesson on the sand',
 'Cinco minutos: cómo pararse, cómo remar y cómo caerse sin golpear la tabla.',
 'Five minutes: how to stand, how to paddle and how to fall without hitting the board.'),
('amanecer-en-paddle-sobre-el-arrecife', 2, '7:00', 'Remada hacia el sur', 'Paddling south',
 'Se rema paralelo a la costa sobre dos metros de agua, viendo el fondo todo el rato.',
 'You paddle parallel to the shore over two metres of water, seeing the bottom the whole way.'),
('amanecer-en-paddle-sobre-el-arrecife', 3, '8:00', 'Regreso con el sol arriba', 'Back with the sun up',
 'De vuelta antes de que empiece la brisa y se pique el agua.',
 'Back before the breeze starts and the water chops up.'),
('amanecer-en-paddle-sobre-el-arrecife', 4, '8:30', 'Café y fruta en la playa', 'Coffee and fruit on the beach',
 'Cerramos en la arena, con café y fruta, antes de que abra el pueblo.',
 'We finish on the sand with coffee and fruit, before the town opens.');

-- 5. Las fotos ---------------------------------------------------------------
--
-- Cinco por tour: la cuadrícula de la ficha es una principal más cuatro
-- miniaturas en 2×2, y con menos nunca se ve la cuadrícula. Son de relleno
-- (picsum.photos con semilla estable, el mismo patrón de `demo_content.sql`) y
-- **no son las fotos del negocio**: se van en cuanto el cliente suba las suyas.
--
-- El texto alternativo sí describe la foto que va a ir ahí, en los dos idiomas.
-- Se escribe ahora porque después no se escribe nunca, y porque es lo que
-- convierte una galería en algo que un lector de pantalla puede recorrer.

create temporary table cat_photo (
  slug     text not null,
  position integer not null,
  alt_es   text not null,
  alt_en   text not null,
  primary key (slug, position)
) on commit drop;

insert into cat_photo values
('musa-snorkel-arrecife-manchones', 0, 'Esculturas sumergidas cubiertas de coral', 'Sunken sculptures covered in coral'),
('musa-snorkel-arrecife-manchones', 1, 'Grupo de snorkel sobre la galería del museo', 'Snorkelers above the museum gallery'),
('musa-snorkel-arrecife-manchones', 2, 'Lancha rápida anclada sobre agua turquesa', 'Fast boat anchored over turquoise water'),
('musa-snorkel-arrecife-manchones', 3, 'Banco de peces sobre el arrecife de Manchones', 'A school of fish over Manchones reef'),
('musa-snorkel-arrecife-manchones', 4, 'Muelle de Playa Tortugas al mediodía', 'The Playa Tortugas pier at midday'),

('isla-contoy-e-isla-mujeres', 0, 'Catamarán navegando rumbo a Isla Contoy', 'Catamaran sailing toward Isla Contoy'),
('isla-contoy-e-isla-mujeres', 1, 'Playa desierta de Isla Contoy', 'The empty beach on Isla Contoy'),
('isla-contoy-e-isla-mujeres', 2, 'Fragatas sobre el manglar del parque nacional', 'Frigatebirds over the national park mangrove'),
('isla-contoy-e-isla-mujeres', 3, 'Snorkel en el arrecife Ixlaché', 'Snorkeling at Ixlaché reef'),
('isla-contoy-e-isla-mujeres', 4, 'Playa Norte de Isla Mujeres por la tarde', 'Playa Norte on Isla Mujeres in the afternoon'),

('chichen-itza-cenote-y-valladolid', 0, 'El Castillo de Chichén Itzá al abrir la zona', 'El Castillo at Chichén Itzá as the site opens'),
('chichen-itza-cenote-y-valladolid', 1, 'Juego de pelota con las gradas de piedra', 'The ball court and its stone walls'),
('chichen-itza-cenote-y-valladolid', 2, 'Raíces colgando sobre el agua del cenote Ik Kil', 'Roots hanging over the water at Ik Kil cenote'),
('chichen-itza-cenote-y-valladolid', 3, 'Comida yucateca servida en mesa larga', 'Yucatecan food served on a long table'),
('chichen-itza-cenote-y-valladolid', 4, 'Calzada de los Frailes en Valladolid', 'The Calzada de los Frailes in Valladolid'),

('cenotes-cristalino-azul-y-eden', 0, 'Agua clara del Cenote Cristalino entre la selva', 'The clear water of Cristalino cenote in the jungle'),
('cenotes-cristalino-azul-y-eden', 1, 'Salto de piedra sobre el cenote', 'The stone jump over the cenote'),
('cenotes-cristalino-azul-y-eden', 2, 'Cenote Azul visto desde la orilla', 'Cenote Azul seen from the bank'),
('cenotes-cristalino-azul-y-eden', 3, 'Peces sobre el fondo del Jardín del Edén', 'Fish over the bottom at Jardín del Edén'),
('cenotes-cristalino-azul-y-eden', 4, 'Grupo pequeño caminando entre los cenotes', 'A small group walking between the cenotes'),

('sabores-de-la-quinta-avenida', 0, 'Trompo de pastor con piña', 'An al pastor spit topped with pineapple'),
('sabores-de-la-quinta-avenida', 1, 'Panuchos de cochinita servidos en el puesto', 'Cochinita panuchos served at the stall'),
('sabores-de-la-quinta-avenida', 2, 'Carrito de marquesitas en la esquina', 'The marquesita cart on the corner'),
('sabores-de-la-quinta-avenida', 3, 'Tres copas de mezcal con sal de gusano', 'Three mezcal glasses with worm salt'),
('sabores-de-la-quinta-avenida', 4, 'Calle del centro de Playa del Carmen de noche', 'A street in downtown Playa del Carmen at night'),

('bautismo-de-buceo-playa', 0, 'Buzo principiante con el instructor bajo el agua', 'A first-time diver underwater with the instructor'),
('bautismo-de-buceo-playa', 1, 'Equipo de buceo listo en la cubierta', 'Scuba gear laid out on deck'),
('bautismo-de-buceo-playa', 2, 'Práctica en aguas someras junto a la playa', 'Shallow-water practice next to the beach'),
('bautismo-de-buceo-playa', 3, 'Arrecife de Chunzubul con abanicos de mar', 'Chunzubul reef with sea fans'),
('bautismo-de-buceo-playa', 4, 'Muelle de Playa del Carmen desde el agua', 'The Playa del Carmen pier seen from the water'),

('ruinas-de-tulum-al-amanecer', 0, 'El Castillo de Tulum sobre el acantilado', 'El Castillo at Tulum on the cliff'),
('ruinas-de-tulum-al-amanecer', 1, 'Zona arqueológica vacía con la primera luz', 'The empty archaeological site at first light'),
('ruinas-de-tulum-al-amanecer', 2, 'Templo del Dios Descendente de cerca', 'The Temple of the Descending God up close'),
('ruinas-de-tulum-al-amanecer', 3, 'Cala de arena al pie de las ruinas', 'The sandy cove below the ruins'),
('ruinas-de-tulum-al-amanecer', 4, 'Iguana sobre la muralla de piedra', 'An iguana on the stone wall'),

('coba-en-bicicleta-y-dos-cenotes', 0, 'Bicicletas sobre un sacbé de Cobá', 'Bicycles on a sacbé at Cobá'),
('coba-en-bicicleta-y-dos-cenotes', 1, 'Pirámide de Nohoch Mul entre la selva', 'The Nohoch Mul pyramid in the jungle'),
('coba-en-bicicleta-y-dos-cenotes', 2, 'Escalera de madera bajando a un cenote de caverna', 'Wooden stairs going down into a cavern cenote'),
('coba-en-bicicleta-y-dos-cenotes', 3, 'Estalactitas sobre el agua del cenote', 'Stalactites over the cenote water'),
('coba-en-bicicleta-y-dos-cenotes', 4, 'Comedor familiar en el pueblo de Cobá', 'A family kitchen in the village of Cobá'),

('sian-kaan-canal-maya-de-muyil', 0, 'Canal maya entre el manglar de Sian Kaan', 'The Maya canal through the Sian Kaan mangrove'),
('sian-kaan-canal-maya-de-muyil', 1, 'Pasarela de madera sobre el manglar', 'The wooden boardwalk over the mangrove'),
('sian-kaan-canal-maya-de-muyil', 2, 'Laguna de Chunyaxché desde la lancha', 'Chunyaxché lagoon seen from the boat'),
('sian-kaan-canal-maya-de-muyil', 3, 'Estructura de la zona arqueológica de Muyil', 'A structure at the Muyil archaeological site'),
('sian-kaan-canal-maya-de-muyil', 4, 'Garza sobre el borde del canal', 'A heron at the edge of the canal'),

('buceo-palancar-y-colombia', 0, 'Buzo sobre una pared de coral en Palancar', 'A diver over a coral wall at Palancar'),
('buceo-palancar-y-colombia', 1, 'Tanques listos en la cubierta del barco', 'Tanks ready on the dive deck'),
('buceo-palancar-y-colombia', 2, 'Tortuga marina sobre el arrecife de Colombia', 'A sea turtle over Colombia reef'),
('buceo-palancar-y-colombia', 3, 'Canales de arena entre cabezas de coral', 'Sand channels between coral heads'),
('buceo-palancar-y-colombia', 4, 'Marina de Cozumel al amanecer', 'The Cozumel marina at dawn'),

('snorkel-el-cielo-colombia-y-palancar', 0, 'Estrellas de mar en el banco de arena de El Cielo', 'Starfish on the El Cielo sandbar'),
('snorkel-el-cielo-colombia-y-palancar', 1, 'Catamarán fondeado sobre agua transparente', 'Catamaran anchored over transparent water'),
('snorkel-el-cielo-colombia-y-palancar', 2, 'Peces loro sobre el arrecife de Palancar', 'Parrotfish over Palancar reef'),
('snorkel-el-cielo-colombia-y-palancar', 3, 'Grupo de snorkel con chalecos amarillos', 'A snorkel group in yellow vests'),
('snorkel-el-cielo-colombia-y-palancar', 4, 'Costa sur de Cozumel desde el mar', 'The south coast of Cozumel from the water'),

('cozumel-en-jeep-punta-sur-y-chen-rio', 0, 'Jeep abierto en la carretera costera', 'An open jeep on the coast road'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 1, 'Faro de Celarain en Punta Sur', 'The Celarain lighthouse at Punta Sur'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 2, 'Torre de madera sobre la laguna Colombia', 'The wooden tower over Colombia lagoon'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 3, 'Playa Chen Río en la costa este', 'Chen Río beach on the east coast'),
('cozumel-en-jeep-punta-sur-y-chen-rio', 4, 'Pescado tikin xic servido en la playa', 'Tikin xic fish served on the beach'),

('snorkel-el-farito-y-manchones', 0, 'Faro viejo de Isla Mujeres desde el agua', 'The old Isla Mujeres lighthouse from the water'),
('snorkel-el-farito-y-manchones', 1, 'Peces sargento alrededor de un snorkelista', 'Sergeant major fish around a snorkeler'),
('snorkel-el-farito-y-manchones', 2, 'Lancha con motor fuera de borda en la bahía', 'An outboard panga in the bay'),
('snorkel-el-farito-y-manchones', 3, 'Esculturas del museo subacuático en Manchones', 'Underwater museum sculptures at Manchones'),
('snorkel-el-farito-y-manchones', 4, 'Muelle de la avenida Rueda Medina', 'The Avenida Rueda Medina dock'),

('vuelta-a-la-isla-en-carrito-de-golf', 0, 'Carrito de golf en el camino de Punta Sur', 'A golf cart on the Punta Sur road'),
('vuelta-a-la-isla-en-carrito-de-golf', 1, 'Acantilado de Punta Sur sobre el mar', 'The Punta Sur cliff above the sea'),
('vuelta-a-la-isla-en-carrito-de-golf', 2, 'Playa Lancheros con agua quieta', 'Playa Lancheros and its still water'),
('vuelta-a-la-isla-en-carrito-de-golf', 3, 'Mural de colores en la calle Hidalgo', 'A colourful mural on Hidalgo street'),
('vuelta-a-la-isla-en-carrito-de-golf', 4, 'Costa de sotavento de Isla Mujeres', 'The leeward coast of Isla Mujeres'),

('pesca-de-altura-isla-mujeres', 0, 'Cañas armadas en la popa antes del amanecer', 'Rods rigged on the stern before dawn'),
('pesca-de-altura-isla-mujeres', 1, 'Pez vela saltando junto a la lancha', 'A sailfish leaping beside the boat'),
('pesca-de-altura-isla-mujeres', 2, 'Torre de la embarcación contra el cielo', 'The boat tower against the sky'),
('pesca-de-altura-isla-mujeres', 3, 'Dorado recién subido a bordo', 'A mahi-mahi just brought on board'),
('pesca-de-altura-isla-mujeres', 4, 'Muelle de pescadores de Isla Mujeres', 'The fishermen dock on Isla Mujeres'),

('paseo-de-las-tres-islas-holbox', 0, 'Banco de arena de Punta Mosquito', 'The Punta Mosquito sandbar'),
('paseo-de-las-tres-islas-holbox', 1, 'Palmeras de Isla Pasión sobre la laguna', 'The palms of Isla Pasión over the lagoon'),
('paseo-de-las-tres-islas-holbox', 2, 'Aves anidando en Isla Pájaros', 'Birds nesting on Isla Pájaros'),
('paseo-de-las-tres-islas-holbox', 3, 'Ojo de agua de Yalahau con muelle de madera', 'The Yalahau spring and its wooden dock'),
('paseo-de-las-tres-islas-holbox', 4, 'Lancha con techo cruzando la laguna', 'A covered boat crossing the lagoon'),

('bioluminiscencia-en-punta-coco', 0, 'Playa a oscuras en Punta Coco', 'The dark beach at Punta Coco'),
('bioluminiscencia-en-punta-coco', 1, 'Destellos de plancton en el agua', 'Plankton flashing in the water'),
('bioluminiscencia-en-punta-coco', 2, 'Cielo estrellado sobre la laguna', 'A starry sky over the lagoon'),
('bioluminiscencia-en-punta-coco', 3, 'Carrito de golf en el camino de arena', 'A golf cart on the sand road'),
('bioluminiscencia-en-punta-coco', 4, 'Parque central de Holbox de noche', 'The Holbox main square at night'),

('kayak-en-el-manglar-de-holbox', 0, 'Kayak doble entrando a un túnel de mangle', 'A double kayak entering a mangrove tunnel'),
('kayak-en-el-manglar-de-holbox', 1, 'Raíces de mangle rojo sobre el agua', 'Red mangrove roots over the water'),
('kayak-en-el-manglar-de-holbox', 2, 'Garza blanca entre el manglar', 'A white heron among the mangroves'),
('kayak-en-el-manglar-de-holbox', 3, 'Canal abierto con la luz de la mañana', 'An open channel in the morning light'),
('kayak-en-el-manglar-de-holbox', 4, 'Embarcadero de la laguna de Holbox', 'The Holbox lagoon launch'),

('velero-por-la-laguna-de-los-siete-colores', 0, 'Velero sobre la laguna de Bacalar', 'A sailboat on the Bacalar lagoon'),
('velero-por-la-laguna-de-los-siete-colores', 1, 'Franjas de color en el agua de la laguna', 'Bands of colour in the lagoon water'),
('velero-por-la-laguna-de-los-siete-colores', 2, 'Cenote Negro visto desde la cubierta', 'Cenote Negro seen from the deck'),
('velero-por-la-laguna-de-los-siete-colores', 3, 'Canal de los Piratas con agua a la cintura', 'The Pirates Channel, waist-deep'),
('velero-por-la-laguna-de-los-siete-colores', 4, 'Muelle de madera del balneario municipal', 'The wooden dock at the municipal club'),

('kayak-al-amanecer-canal-de-los-piratas', 0, 'Kayak sobre la laguna en calma al amanecer', 'A kayak on the calm lagoon at sunrise'),
('kayak-al-amanecer-canal-de-los-piratas', 1, 'Sol saliendo sobre el agua de Bacalar', 'The sun rising over the water at Bacalar'),
('kayak-al-amanecer-canal-de-los-piratas', 2, 'Banco de arena del canal con luz baja', 'The channel sandbar in low light'),
('kayak-al-amanecer-canal-de-los-piratas', 3, 'Remo entrando al agua sin hacer ondas', 'A paddle entering the water without a ripple'),
('kayak-al-amanecer-canal-de-los-piratas', 4, 'Café de olla servido en el muelle', 'Pot coffee served at the dock'),

('cenote-azul-los-rapidos-y-cocalitos', 0, 'Cenote Azul rodeado de selva', 'Cenote Azul surrounded by jungle'),
('cenote-azul-los-rapidos-y-cocalitos', 1, 'Corriente de Los Rápidos entre las orillas', 'The current at Los Rápidos between the banks'),
('cenote-azul-los-rapidos-y-cocalitos', 2, 'Estromatolitos al borde de la laguna', 'Stromatolites at the lagoon edge'),
('cenote-azul-los-rapidos-y-cocalitos', 3, 'Hamacas montadas sobre el agua en Cocalitos', 'Hammocks strung over the water at Cocalitos'),
('cenote-azul-los-rapidos-y-cocalitos', 4, 'Comida servida frente a la laguna', 'Lunch served facing the lagoon'),

('snorkel-parque-nacional-puerto-morelos', 0, 'Arrecife de Puerto Morelos desde la superficie', 'The Puerto Morelos reef from the surface'),
('snorkel-parque-nacional-puerto-morelos', 1, 'Lancha de la cooperativa fondeada sobre el arrecife', 'A cooperative boat anchored over the reef'),
('snorkel-parque-nacional-puerto-morelos', 2, 'Coral cuerno de alce en aguas someras', 'Elkhorn coral in shallow water'),
('snorkel-parque-nacional-puerto-morelos', 3, 'Snorkelistas con chaleco sobre la cresta', 'Snorkelers in vests over the reef crest'),
('snorkel-parque-nacional-puerto-morelos', 4, 'Faro inclinado de Puerto Morelos', 'The leaning lighthouse of Puerto Morelos'),

('ruta-de-los-cenotes-tirolesas-y-caverna', 0, 'Tirolesa cruzando un cenote abierto', 'A zipline crossing an open cenote'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 1, 'Plataforma de rappel sobre el agua', 'The rappel platform over the water'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 2, 'Interior de un cenote de caverna con lámpara', 'Inside a cavern cenote, lit by torch'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 3, 'Carretera de la Ruta de los Cenotes entre la selva', 'The Cenote Route road through the jungle'),
('ruta-de-los-cenotes-tirolesas-y-caverna', 4, 'Comida servida en la cocina comunitaria', 'Lunch served at the community kitchen'),

('amanecer-en-paddle-sobre-el-arrecife', 0, 'Paddle board sobre el mar plano al amanecer', 'A paddleboard on flat water at sunrise'),
('amanecer-en-paddle-sobre-el-arrecife', 1, 'Fondo de arena visto a través del agua', 'The sandy bottom seen through the water'),
('amanecer-en-paddle-sobre-el-arrecife', 2, 'Faro inclinado con la primera luz', 'The leaning lighthouse at first light'),
('amanecer-en-paddle-sobre-el-arrecife', 3, 'Tablas anchas alineadas en la arena', 'Wide boards lined up on the sand'),
('amanecer-en-paddle-sobre-el-arrecife', 4, 'Playa de Puerto Morelos todavía vacía', 'The Puerto Morelos beach, still empty');

-- 6. Cargar el catálogo ------------------------------------------------------
--
-- De aquí para abajo no hay contenido, solo el trasvase. Cada insert lleva por
-- delante la llave natural de su tabla, así que correr el guion dos veces no
-- duplica nada y correrlo contra una base que ya tiene parte del catálogo solo
-- agrega lo que falta.

-- 6.1 Los productos.
--
-- La política de cancelación es la que el catálogo ya usa —la más frecuente
-- entre los productos que tienen una—, no una nueva: inventarle una política a
-- un producto es decidir por el cliente cuánto devuelve. Si no hay ninguna
-- cargada, el producto queda sin política y el checkout lo maneja (ver
-- `policyFor` en `src/modules/booking/create.ts`).
--
-- `deposit_pct` queda en null a propósito: hereda el 30 % global de `settings`.
insert into products (kind, slug, status, location_id, cancellation_policy_id, currency, position)
select 'tour', c.slug, 'published', l.id,
       (select p.cancellation_policy_id
          from products p
         where p.cancellation_policy_id is not null
         group by p.cancellation_policy_id
         order by count(*) desc, min(p.created_at)
         limit 1),
       'MXN', c.position
  from cat_tour c
  join locations l on l.slug = c.location_slug
on conflict (slug) do nothing;

-- 6.2 El texto.
--
-- `meta_title` y `meta_description` se derivan del nombre, del destino y del
-- resumen en vez de escribirse a mano cuarenta y ocho veces: son exactamente
-- eso, y escribirlos aparte solo abre la puerta a que se desincronicen.
insert into product_translations
  (product_id, locale, name, summary, description, highlights, included, excluded,
   meta_title, meta_description)
select p.id, t.locale, t.name, t.summary, t.description,
       t.highlights, t.included, t.excluded,
       t.name || ' · ' || l.name,
       t.summary
  from cat_text t
  join products p on p.slug = t.slug
  join cat_tour c on c.slug = t.slug
  join locations l on l.slug = c.location_slug
on conflict (product_id, locale) do nothing;

-- 6.3 La opción de tour: horario, punto de encuentro y cupo.
insert into tour_options
  (product_id, code, name_es, name_en, duration_minutes, meeting_point, default_capacity)
select p.id, c.option_code, c.option_name_es, c.option_name_en,
       c.duration_minutes, c.meeting_point, c.capacity
  from cat_tour c
  join products p on p.slug = c.slug
on conflict (product_id, code) do nothing;

-- 6.4 El precio por tipo de pasajero.
--
-- Sin al menos el precio de adulto el producto no es vendible: la ficha no
-- cotiza y el panel se niega a publicarlo. El infante va en cero y **no**
-- consume cupo —el bebé en brazos no ocupa asiento—, que es la regla que
-- `buildTourQuote` ya sabe aplicar; y solo se carga donde el tour admite
-- infantes.
insert into tour_pax_prices
  (tour_option_id, pax_type, price_cents, min_age, max_age, counts_toward_capacity)
select o.id, v.pax_type, v.price_cents, v.min_age, v.max_age, v.counts
  from cat_tour c
  join products p on p.slug = c.slug
  join tour_options o on o.product_id = p.id and o.code = c.option_code
 cross join lateral (values
   ('adult'::pax_type,  c.adult_cents, c.child_max_age + 1, null::integer,   true),
   ('child'::pax_type,  c.child_cents, c.child_min_age,     c.child_max_age, true),
   ('infant'::pax_type, 0::bigint,     null::integer,       c.infant_max_age, false)
 ) v(pax_type, price_cents, min_age, max_age, counts)
 where v.pax_type <> 'infant' or c.infant_max_age is not null
on conflict (tour_option_id, pax_type) do nothing;

-- 6.5 Las salidas de los próximos cuatro meses.
--
-- La hora es local del destino y se convierte con `locations.timezone`, no con
-- la del servidor: guardar 09:00 en UTC la correría cinco horas y el guía
-- llegaría a las cuatro de la mañana.
--
-- La ventana es móvil: correr el guion mañana agrega el día 121 y no toca los
-- 120 que ya existen. La ficha muestra doce meses de salidas, así que cuatro
-- caben de sobra.
insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
select o.id,
       (d::date + c.start_time) at time zone coalesce(l.timezone, 'America/Cancun'),
       (d::date + c.start_time + make_interval(mins => c.duration_minutes))
         at time zone coalesce(l.timezone, 'America/Cancun'),
       c.capacity
  from cat_tour c
  join products p on p.slug = c.slug
  join tour_options o on o.product_id = p.id and o.code = c.option_code
  join locations l on l.id = p.location_id
 cross join lateral generate_series(current_date + 1, current_date + 120, interval '1 day') d
 where c.dows is null
    or extract(isodow from d)::smallint = any (c.dows)
on conflict (tour_option_id, starts_at) do nothing;

-- 6.6 El itinerario.
--
-- Se llena solo si la opción no tiene ningún paso: un horario cargado a mano
-- desde el panel se queda como está.
insert into tour_itinerary_steps
  (tour_option_id, position, time_label, title_es, title_en, description_es, description_en)
select o.id, s.position, s.time_label, s.title_es, s.title_en,
       s.description_es, s.description_en
  from cat_step s
  join cat_tour c on c.slug = s.slug
  join products p on p.slug = s.slug
  join tour_options o on o.product_id = p.id and o.code = c.option_code
 where not exists (
   select 1 from tour_itinerary_steps x where x.tour_option_id = o.id
 );

-- 6.7 Las fotos.
--
-- Solo a los productos que no tienen ninguna: si el cliente ya subió las suyas,
-- no se le mete relleno en medio de la galería.
insert into product_media (product_id, url, alt_es, alt_en, width, height, position)
select p.id,
       'https://picsum.photos/seed/' || m.slug || '-' || m.position || '/1200/800',
       m.alt_es, m.alt_en, 1200, 800, m.position
  from cat_photo m
  join products p on p.slug = m.slug
 where not exists (
   select 1 from product_media x where x.product_id = p.id
 );

-- 7. Qué quedó ---------------------------------------------------------------
--
-- Un informe que solo dice "listo" no sirve. Aquí se cuenta lo que importa:
-- cuántos destinos hay con producto publicado, cuántos tours tiene cada uno, y
-- —lo único que de verdad puede salir mal— cuántos tours quedaron sin salidas
-- futuras o sin precio de adulto. Un tour sin cualquiera de las dos cosas se ve
-- en la vitrina y no se puede comprar, que es la peor forma de estar roto.
--
-- El conteo abarca todo el catálogo, pero **la excepción solo se levanta por
-- los tours de este guion**. Abortar por un producto que ya estaba mal antes de
-- correrlo dejaría la base sin catálogo por un defecto que no es de aquí; se
-- reporta con nombre y apellido y se sigue.

do $$
declare
  fila         record;
  destinos     integer;
  tours        integer;
  sin_salidas  integer;
  sin_precio   integer;
  mios_rotos   integer;
  sin_traducir integer;
  salidas      integer;
  fotos        integer;
  pasos        integer;
begin
  select count(distinct p.location_id) into destinos
    from products p where p.status = 'published' and p.location_id is not null;
  select count(*) into tours
    from products p where p.kind = 'tour' and p.status = 'published';

  raise notice '──';
  raise notice '── al terminar: % destino(s) con producto publicado, % tour(s) publicado(s)',
    destinos, tours;
  raise notice '──';

  for fila in
    select l.name as destino, count(*) as n
      from products p
      join locations l on l.id = p.location_id
     where p.kind = 'tour' and p.status = 'published'
     group by l.name
     order by l.name
  loop
    raise notice '──   % · % tour(s)', rpad(fila.destino, 18), fila.n;
  end loop;

  select count(*) into sin_salidas
    from products p
   where p.kind = 'tour' and p.status = 'published'
     and not exists (
       select 1 from tour_options o
         join tour_departures d on d.tour_option_id = o.id
        where o.product_id = p.id and o.active
          and d.status = 'open' and d.starts_at > now()
     );

  select count(*) into sin_precio
    from products p
   where p.kind = 'tour' and p.status = 'published'
     and not exists (
       select 1 from tour_options o
         join tour_pax_prices pp on pp.tour_option_id = o.id
        where o.product_id = p.id and o.active and pp.pax_type = 'adult'
     );

  select count(*) into sin_traducir
    from products p
   where p.status = 'published'
     and (select count(*) from product_translations t where t.product_id = p.id) < 2;

  select count(*) into salidas from tour_departures where starts_at > now();
  select count(*) into fotos from product_media;
  select count(*) into pasos from tour_itinerary_steps;

  raise notice '──';
  raise notice '── % salida(s) futura(s), % foto(s), % paso(s) de itinerario',
    salidas, fotos, pasos;
  raise notice '── tours sin salidas futuras: %  (debe ser 0)', sin_salidas;
  raise notice '── tours sin precio de adulto: %  (debe ser 0)', sin_precio;

  if sin_salidas > 0 or sin_precio > 0 then
    for fila in
      select p.slug
        from products p
       where p.kind = 'tour' and p.status = 'published'
         and (not exists (
               select 1 from tour_options o
                 join tour_departures d on d.tour_option_id = o.id
                where o.product_id = p.id and o.active
                  and d.status = 'open' and d.starts_at > now())
           or not exists (
               select 1 from tour_options o
                 join tour_pax_prices pp on pp.tour_option_id = o.id
                where o.product_id = p.id and o.active and pp.pax_type = 'adult'))
       order by p.slug
    loop
      raise notice '──   ▲ no se puede comprar: %', fila.slug;
    end loop;
  end if;

  if sin_traducir > 0 then
    raise notice '── ojo: % producto(s) publicado(s) tienen un solo idioma y responden 404', sin_traducir;
    raise notice '   en el otro. Si es el `depa-centro-tulum` del seed de desarrollo, es a propósito.';
  end if;

  -- La compuerta: solo por lo que cargó este guion.
  select count(*) into mios_rotos
    from cat_tour c
    join products p on p.slug = c.slug
   where not exists (
           select 1 from tour_options o
             join tour_departures d on d.tour_option_id = o.id
            where o.product_id = p.id and o.active
              and d.status = 'open' and d.starts_at > now())
      or not exists (
           select 1 from tour_options o
             join tour_pax_prices pp on pp.tour_option_id = o.id
            where o.product_id = p.id and o.active and pp.pax_type = 'adult')
      or p.status <> 'published';

  if mios_rotos > 0 then
    raise exception 'Quedaron % tour(s) de este catálogo sin poder venderse', mios_rotos;
  end if;
end $$;

commit;
