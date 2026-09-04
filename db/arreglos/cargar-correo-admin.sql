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
--   SEED_FILE=db/arreglos/cargar-correo-admin.sql ./scripts/demo-content.sh --from-env
--
-- La dirección se pide aquí y no se escribe en el archivo a propósito: este
-- repositorio es público —tiene que serlo para que el latido de GitHub Actions
-- sea gratis— y un correo de una persona no se versiona.

\pset border 2
\pset format aligned

select coalesce(value ->> 'admin_email', '(sin cargar)') as correo_admin_actual
  from settings where key = 'notifications'
union all
select '(no existe la fila settings.notifications)'
 where not exists (select 1 from settings where key = 'notifications');

\prompt 'Correo que recibe el aviso de reserva nueva: ' correo

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

select value ->> 'admin_email' as correo_admin_cargado
  from settings where key = 'notifications';

select status, count(*) as filas from outbox group by status order by status;
