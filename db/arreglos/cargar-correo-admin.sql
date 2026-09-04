-- cargar-correo-admin.sql — carga a quién se le avisa de una reserva nueva.
--
-- Se corre una vez por base. Producción se desplegó sin `settings.notifications`
-- —ese ajuste solo lo carga `dev_seed.sql`, que allá nunca corrió— así que cada
-- confirmación encolaba el aviso a la administración con destinatario vacío y
-- moría tras seis intentos.
--
-- Desde la migración 0016 ese aviso ya no se encola sin destinatario, y
-- /api/health dice que falta el ajuste en vez de reportarlo como aviso muerto.
-- Este guion es la otra mitad: cargar el ajuste y revivir lo que quedó atorado.
--
-- A mano:
--   npm run prod:sql -- db/arreglos/cargar-correo-admin.sql     (lo pregunta)
--
-- Desde el workflow, sin nadie delante:
--   psql … -v correo="$ADMIN_EMAIL" -f db/arreglos/cargar-correo-admin.sql
--
-- Un solo archivo para los dos casos a propósito: dos copias del mismo SQL se
-- separan en cuanto alguien toca una, y la que se rompe es siempre la que
-- corre sin nadie mirando.
--
-- La dirección no se escribe aquí: este repositorio es público —tiene que
-- serlo para que el latido de GitHub Actions sea gratis— y el correo de una
-- persona no se versiona.

\if :{?correo}
\else
\prompt 'Correo que recibe el aviso de reserva nueva: ' correo
\endif

begin;

insert into settings (key, value, description)
values (
  'notifications',
  jsonb_build_object('admin_email', trim(:'correo'), 'reminder_hours', jsonb_build_array(72, 24)),
  'Avisos: a quién se le notifica y con cuánta anticipación'
)
on conflict (key) do update
   set value = settings.value || jsonb_build_object('admin_email', trim(:'correo')),
       updated_at = now();

-- Y los que murieron por no tener a dónde ir vuelven a la cola. No se tocan los
-- muertos por otra causa: un aviso al huésped sin correo es un dato faltante de
-- esa reserva y se atiende a mano (operacion.md §3.1), no reencolándolo.
update outbox
   set to_address = (select value ->> 'admin_email' from settings where key = 'notifications'),
       status = 'pending',
       attempts = 0,
       next_attempt_at = now(),
       last_error = null
 where status = 'dead'
   and template = 'booking_confirmed_admin'
   and coalesce(to_address, '') = '';

commit;

\echo
select value ->> 'admin_email' as correo_admin_cargado
  from settings where key = 'notifications';

select status, count(*) as filas from outbox group by status order by status;
