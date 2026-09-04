-- avisos-atorados.sql — por qué está degradada la salud de los avisos.
--
-- Solo lee. Se puede correr contra producción sin miedo, y se corre con la
-- misma protección que los seeds —enseña el servidor de destino antes de
-- tocar nada:
--
--   SEED_FILE=db/consultas/avisos-atorados.sql ./scripts/demo-content.sh --from-env
--
-- Existe porque /api/health dice cuántos avisos están muertos pero no cuáles:
-- el contador sirve para alertar, no para arreglar. El panel tampoco muestra
-- la bandeja de salida, así que sin esto la única forma de saber qué pasó es
-- abrir psql y acordarse de la forma de la tabla.
--
-- El destinatario va tapado a propósito: para diagnosticar basta saber si
-- había uno y de qué dominio era.

\pset border 2
\pset format aligned

select
  o.template,
  o.channel,
  o.status,
  o.attempts,
  case
    when o.to_address = '' then '(vacío)'
    when o.to_address like '%@%' then '***@' || split_part(o.to_address, '@', 2)
    else '***' || right(o.to_address, 4)
  end                                        as destinatario,
  b.code                                     as reserva,
  o.last_error,
  to_char(o.created_at, 'YYYY-MM-DD HH24:MI') as encolado,
  to_char(o.next_attempt_at, 'YYYY-MM-DD HH24:MI') as proximo_intento
from outbox o
left join bookings b on b.id = o.booking_id
where o.status in ('dead', 'failed')
   or (o.status = 'pending' and o.next_attempt_at < now() - interval '15 minutes')
order by o.status, o.created_at desc
limit 50;

-- Y el resumen, que es lo que lee /api/health.
select status, count(*) as filas
  from outbox
 group by status
 order by status;
