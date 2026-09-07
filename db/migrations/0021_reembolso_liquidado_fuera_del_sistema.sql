-- 0021_reembolso_liquidado_fuera_del_sistema.sql
--
-- `refunds` registraba **cuánto** había que devolver y nada más. No decía cómo
-- salió el dinero, ni cuándo salió de verdad, ni quién lo mandó. Su `updated_at`
-- es un trigger de "última vez que se tocó la fila", que para un informe no
-- sirve: se mueve cuando alguien corrige una nota.
--
-- La tabla de al lado, `payments`, sí lo tiene todo —`method`, `provider_ref`,
-- `paid_at`, `collected_by` ("Quién cobró el saldo en el mostrador.
-- Trazabilidad de efectivo")—. El dinero que entra se puede auditar; el que
-- sale, no. Esta migración vuelve `refunds` simétrica con `payments`.
--
-- **No es un rodeo mientras llega Stripe.** El modelo de negocio cobra el
-- anticipo en línea y **el saldo en destino, en efectivo**: parte del dinero
-- nunca pasa por la pasarela, y lo que no entró por ahí no puede devolverse por
-- ahí. La liquidación manual —transferencia, SPEI, efectivo— hace falta
-- siempre, no hasta que la cuenta se apruebe. Cuando Stripe llegue será un
-- método más de los que ya existen en el enum `payment_method`, no un camino
-- distinto.
--
-- La restricción es lo que convierte el registro en un control: **una fila no
-- puede decir `succeeded` sin decir cómo, cuándo y quién**. Marcar dinero como
-- devuelto es una afirmación sobre el mundo, y una afirmación sin autor no se
-- puede revisar después.

begin;

alter table refunds
  -- Cómo salió. Reutiliza el enum de `payments`, que ya trae `spei`,
  -- `transfer`, `cash` y `card`: el vocabulario del dinero es el mismo entre y
  -- saliendo, y tener dos listas distintas garantiza que se separen.
  add column method payment_method,
  -- Cuándo salió **de verdad**, no cuándo se registró la cancelación. La
  -- diferencia contra `created_at` es el tiempo de devolución, que es lo que
  -- el huésped percibe y lo único que se puede mejorar a propósito.
  add column settled_at timestamptz,
  -- Quién la ejecutó. Distinto de `created_by`, que es quien canceló: en el
  -- mostrador cancela recepción y liquida gerencia, y esa separación es
  -- justamente el control.
  add column settled_by uuid references staff_users (id),
  -- Banco, referencia, "se pagó en dos partes", lo que haga falta explicar.
  add column notes text,
  -- El comprobante de la transferencia. `receipt_url` apunta al mismo almacén
  -- que las fotos —disco local o Vercel Blob, por configuración— y el mime se
  -- guarda porque aquí sí hay PDF, no solo imágenes.
  add column receipt_url text,
  add column receipt_mime text;

-- Una devolución liquidada tiene que poder explicarse. Se comprueba solo en
-- `succeeded` para no estorbar a `pending` ni a `failed`, que legítimamente no
-- saben nada de esto todavía.
alter table refunds
  add constraint refunds_succeeded_esta_explicado check (
    status <> 'succeeded'
    or (settled_at is not null and method is not null and settled_by is not null)
  );

-- El informe pregunta "qué se devolvió este mes y por qué medio". Sin esto es
-- un recorrido completo de la tabla cada vez.
create index refunds_settled_idx on refunds (settled_at, method)
  where settled_at is not null;

-- Y la operación pregunta lo contrario: "qué falta por pagar". Es la consulta
-- que alimenta /admin/reembolsos y el chequeo `refunds` de /api/health.
create index refunds_pendientes_idx on refunds (created_at)
  where status = 'pending';

comment on constraint refunds_succeeded_esta_explicado on refunds is
  'Marcar dinero como devuelto exige cómo, cuándo y quién. Una afirmación sin autor no se audita.';

commit;
