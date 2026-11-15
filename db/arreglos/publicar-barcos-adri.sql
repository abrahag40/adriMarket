-- ---------------------------------------------------------------------------
-- Publicar los barcos de Adri y retirar el catálogo de demostración
--
-- Decidido por Abraham el 2026-11-15, para mostrarle avance a Adri:
--
--   · Se publican los barcos que **ya tienen foto**, aunque falte su marina. El
--     punto de encuentro dice que se confirma por WhatsApp, y se reemplaza con
--     `marinas-embarcaciones.sql` cuando Adri lo mande, que reemplaza este
--     texto provisional.
--   · Se pasan a borrador los **tours y vehículos de demostración**. adriMarket
--     no vende vehículos (quizá en el futuro). Las estancias se quedan como
--     están: no se decidió nada sobre ellas.
--
-- En producción nadie puede pagar todavía: el checkout está cerrado porque
-- faltan las llaves reales de Stripe. Publicar enseña, no vende.
--
--   npm run prod:sql -- db/arreglos/publicar-barcos-adri.sql
--
-- Se niega a correr en cuatro casos, porque cada uno deja el sitio peor que
-- antes sin que nada truene:
--
--   1. Ningún barco en borrador tiene foto (faltan, o ya se publicaron) → se
--      retirarían los tours y no entraría ninguno.
--   2. Hay reventa configurada (`settings.resale`, decisión 0025) → el precio
--      al huésped ya no sería el de la ficha del PDF.
--   3. Algún producto a retirar vino del formulario de fichas
--      (`product_sources`) → no es de demostración.
--   4. Algún producto a retirar tiene reservas → tampoco lo es.
--
-- Deshacer: `update products set status = 'published' where …` con los slugs
-- que imprime al final. Nada se borra.
-- ---------------------------------------------------------------------------

begin;

create temporary table pub_barcos on commit drop as
select p.id, p.slug
  from products p
 where p.slug like 'barco-%'
   and p.status = 'draft'
   and exists (select 1 from product_media m where m.product_id = p.id);

create temporary table pub_retirar on commit drop as
select p.id, p.slug, p.kind
  from products p
 where p.status = 'published'
   and p.kind in ('tour', 'vehicle')
   and p.slug not like 'barco-%';

do $$
begin
  raise notice '── base: % · barcos con foto: % · a retirar: %',
    current_database(), (select count(*) from pub_barcos), (select count(*) from pub_retirar);

  if not exists (select 1 from pub_barcos) then
    raise exception 'Ningún barco en borrador tiene foto: o faltan las fotos, o ya se publicaron. Retirar la demostración dejaría el sitio sin tours.';
  end if;
  if exists (select 1 from settings where key = 'resale') then
    raise exception 'Hay reventa configurada (settings.resale): el precio no sería el de la ficha de Adri.';
  end if;
  if exists (select 1 from pub_retirar r join product_sources s on s.product_id = r.id) then
    raise exception 'Hay productos importados del formulario de fichas entre los que se retirarían.';
  end if;
  if exists (select 1 from pub_retirar r join booking_items i on i.product_id = r.id) then
    raise exception 'Hay productos con reservas entre los que se retirarían.';
  end if;
end $$;

-- El punto de encuentro, mientras llega la marina. Un solo texto en dos
-- idiomas porque la columna no tiene traducción.
update tour_options o
   set meeting_point = 'Marina por confirmar: te la enviamos por WhatsApp · Marina confirmed by WhatsApp'
  from pub_barcos b
 where o.product_id = b.id
   and o.meeting_point is null;

update products p set status = 'published' from pub_barcos b where p.id = b.id;
update products p set status = 'draft'     from pub_retirar r where p.id = r.id;

do $$
begin
  raise notice '── publicados: %', (select string_agg(slug, ', ' order by slug) from pub_barcos);
  raise notice '── a borrador: %', (select string_agg(slug, ', ' order by slug) from pub_retirar);
end $$;

commit;
