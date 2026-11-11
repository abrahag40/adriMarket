-- ---------------------------------------------------------------------------
-- Barcos publicados · solo para desarrollo y la barra de verificación
--
-- `embarcaciones_adri.sql` deja los dieciséis barcos en borrador, que es lo
-- correcto en producción: les faltan foto y marina. Pero la barra necesita al
-- menos uno a la venta para comprobar lo que no se ve en una prueba unitaria
-- —que la tarjeta diga "por embarcación", que la ficha ofrezca elegir la
-- duración, que la cotización cobre el barco—, y una prueba que depende de un
-- seed que no se carga pasa en vacío (ver el comentario de los vehículos en
-- scripts/db.sh). Dos, a propósito distintos:
--
--   · Leopard 47: varias duraciones, pasajero extra y tarifa de niño.
--   · Bertram 46: sin pasajero extra ni niño, así que no pregunta por niños.
--
-- **Nunca se corre contra producción**: ahí se publica desde el panel, con foto.
-- ---------------------------------------------------------------------------

update products
   set status = 'published',
       location_id = (select id from locations where slug = 'playa-del-carmen')
 where slug in ('barco-catamaran-leopard-47', 'barco-bertram-46')
   and status = 'draft';
