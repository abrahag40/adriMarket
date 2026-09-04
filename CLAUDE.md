# adriMarket · instrucciones para trabajar en este repositorio

Motor de reservas para tours en el Caribe y renta de inmuebles. Dos inventarios
que se compran igual y se operan distinto, con un solo checkout: se cobra un
anticipo en línea y el saldo se paga en destino.

**Estado:** Sprints 0 a 7 entregados y verificados. El producto está completo.
Lo que impide vender no es código —son tres cuentas del cliente— y está en
[`docs/puesta-en-produccion.md`](docs/puesta-en-produccion.md).

El plan maestro es [`docs/plan-de-entrega.md`](docs/plan-de-entrega.md): **una
sola fuente de verdad**. Si algo contradice ese documento, ese documento gana o
se corrige.

---

## Idioma

- **Comentarios, documentación y textos de interfaz en español (es-MX).**
- **Identificadores en inglés** (`bookingId`, `stay_blocks`, `deposit_cents`).
- Los mensajes de commit, en español.

No es una preferencia estética: quien opera este sistema y quien lo mantiene
leen español, y el código se explica a sí mismo en el idioma de quien lo lee.

---

## Levantar el entorno local

Necesitas **PostgreSQL 16+** con `btree_gist` disponible, **Node 22+** y `psql`
en el `PATH`.

```bash
cp .env.example .env          # y apuntar DATABASE_URL a tu Postgres
npm install

npm run db:migrate            # aplica las 16 migraciones en orden
npm run db:seed               # datos de desarrollo
npm run dev                   # http://localhost:3000
```

`npm run db:reset` recrea todo desde cero. **Se niega a correr contra una URL
que no sea local**, a propósito.

Todos los scripts cargan `.env` solos (`--env-file-if-exists`). No hace falta
exportar nada a mano.

### Si no tienes Postgres instalado

Un clúster desechable, sin tocar el sistema:

```bash
export PGDIR=/tmp/ampg
initdb -D $PGDIR/pgdata -U postgres
mkdir -p $PGDIR/pgrun
pg_ctl -D $PGDIR/pgdata -l $PGDIR/pg.log \
  -o "-k $PGDIR/pgrun -p 5433 -c listen_addresses=127.0.0.1" start
createdb -h 127.0.0.1 -p 5433 -U postgres adrimarket
# DATABASE_URL=postgres://postgres@127.0.0.1:5433/adrimarket
```

---

## La barra de verificación

Es lo mismo que corre el pipeline, y **está pensada para correrse entera**:

```bash
npm run db:test               # 23 garantías del inventario, en transacción
npm run test:integration      # 117 casos del dominio
npm run typecheck
npm run lint
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
npx next start -p 3100 &
BASE_URL=http://127.0.0.1:3100 ./scripts/smoke.sh          # 124 criterios
BASE_URL=http://127.0.0.1:3100 npm run test:e2e            #  8 · el checkout
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:admin      # 18 · un día de recepción
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:sme        # 25 · cierran el puerto
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:publicar   # 29 · publicar un tour
BASE_URL=http://127.0.0.1:3100 npm run audit               # 25 · accesibilidad y peso
npm run db:bench              # sobreventa bajo concurrencia real
```

**Última corrida completa: todo en verde, sobre una base recreada desde cero.**
Si vas a tocar algo del dominio, corre `db:test` y `test:integration` antes y
después: son rápidas y son las que atrapan lo caro.

---

## Cómo está construido, y por qué

### El SQL manda y los tipos se generan

Al revés de lo habitual. Las garantías del negocio están **declaradas en la
base**, no verificadas en la aplicación, y eso necesita SQL que ningún generador
expresa: restricciones de exclusión sobre rangos de fechas, bloqueos de fila,
funciones transaccionales.

- `db/migrations/*.sql` es la **fuente de verdad**, escrito a mano, aplicado en
  orden de nombre y registrado en `schema_migrations`.
- `npm run db:pull` introspecta la base y reescribe `src/db/generated/`.
- `scripts/patch-generated.mjs` corrige lo que drizzle-kit no sabe leer
  (`daterange` y los `DEFAULT` que llaman funciones). Es idempotente y avisa si
  algún día deja de haber algo que parchar.
- **No se usan las migraciones de drizzle-kit**: el script las descarta para que
  no compitan con las escritas a mano.

**Nunca edites una migración ya aplicada.** Se agrega una nueva.

### Las dos garantías del inventario

Mecanismos distintos porque los inventarios se agotan distinto:

| | Estancias | Tours |
|---|---|---|
| Se agota por | traslape de rangos de fechas | conteo de lugares |
| Garantía | `EXCLUDE USING gist (unit_id =, stay &&)` | `CHECK (seats_taken <= capacity)` |
| Orden entre peticiones | la da la restricción de exclusión | `SELECT … FOR UPDATE` |
| Probado en | `db/tests/guarantees.sql` 1–4 | `db/tests/guarantees.sql` 5–7 |

Ninguna depende de que la aplicación se acuerde de revisar.

### Códigos de error del dominio

La base los emite como SQLSTATE propios; `src/modules/availability/holds.ts` los
traduce a `InventoryUnavailableError`.

| Código | Significado |
|---|---|
| `AM001` | cupo agotado en la salida |
| `AM002` | fechas ya ocupadas en la unidad |
| `AM003` | transición de estado inválida |

### Proveedores intercambiables

`src/modules/payments` y `src/modules/notifications` hablan con Stripe, Resend y
la Cloud API de Meta detrás de una interfaz. Sin llaves configuradas se usan
proveedores locales que **no son dobles de prueba**: firman y verifican con el
mismo mecanismo que los reales, y guardan el aviso renderizado en lugar de
enviarlo. El camino que se ejercita —firma, idempotencia, confirmación
transaccional, reintentos— es el de producción.

La selección es **por configuración, no por una bandera de "modo desarrollo"**.

---

## Invariantes que no se negocian

- **Ningún precio se calcula en el navegador.** Hay una sola fuente autorizada,
  en el servidor.
- **Todo monto es un entero en centavos** (`bigint`) con su moneda explícita.
  Nunca decimales flotantes.
- **Las noches son `date`** (una noche no es un instante); **las salidas de
  tours son `timestamptz`**. La zona viene de `locations.timezone`, no del
  servidor: Quintana Roo es `America/Cancun` (UTC−5, sin horario de verano).
- **Liberar inventario es un `UPDATE` de `released_at`**, nunca un `DELETE`.
- **Los permisos se resuelven en el servidor.** Ocultar un botón no es un
  permiso: cada acción vuelve a preguntar quién la pide.
- **El reembolso sale de la política congelada en la reserva**, nunca de la
  vigente hoy.
- **Una cancelación del operador no es una cancelación del huésped**: se
  devuelve todo y no aplica la política.
- **El encolado de avisos ocurre en la misma transacción** que confirma o
  cancela. Si la reserva existe, el aviso existe.

---

## Trampas que ya costaron caro

Están aquí porque cada una se pagó una vez.

- **`NEXT_PUBLIC_SITE_URL` se fija al construir, no al arrancar.** Next reemplaza
  esas variables durante la compilación. La pasarela recibe una URL de retorno
  absoluta: si no coincide con el puerto donde se sirve, el huésped vuelve de
  pagar a un servidor que no existe. Cambiarla exige volver a construir.
- **El middleware de idioma excluye `/api` y `/admin` a propósito.** Un proveedor
  de pagos no sigue redirecciones ni vuelve a firmar la URL nueva. En el Sprint 3
  esa exclusión faltaba y **ninguna reserva se confirmaba**. El webhook tiene que
  responder `400` a una firma inválida, **nunca `3xx`**.
- **Las fotos viven fuera de `public/`** (en `var/media`, configurable con
  `MEDIA_DIR`) y se sirven por `src/app/media/[...path]/route.ts`. Next resuelve
  `public/` en tiempo de compilación: una foto escrita ahí después del build
  responde 404 hasta el siguiente despliegue.
- **Las variantes de imagen las genera el latido**, no la petición del panel.
  Codificar AVIF tarda segundos; quince fotos serían una pantalla colgada.
- **El worker falla en silencio.** Sin `POST /api/jobs/tick` cada minuto no
  expiran los apartados, no salen los avisos y no hay recordatorios. Nada da
  error. Por eso `/api/health` responde **503** —no un `{"ok":true}`— cuando el
  último latido tiene más de diez minutos.
- **Cada recorrido en navegador tiene su propio año**, porque consumen inventario
  y no lo devuelven: **2026 para `smoke.sh`, 2027 para el checkout, 2028 para el
  panel**. El rango **2026-09-17 → 20 de la Casa Akumal está reservado para
  `smoke.sh`**; si otro recorrido lo vende, la barra falla.
- **`checkout.test.ts` blanquea `to_address` a propósito** en el caso del aviso
  que falla, y ahora borra sus filas al salir. Si vuelve a dejarlas, `/api/health`
  reporta avisos muertos que **parecen un defecto de producción y no lo son**.
  Costó una investigación entera. La pista que lo delata: una fila de WhatsApp
  sin destinatario es imposible desde `outbox_enqueue_whatsapp`.
- **Cancelar en una prueba deja un reembolso que caduca a las 24 h.** Registrar
  el reembolso sin ejecutarlo es deuda declarada y correcta; dejar la fila en la
  base de desarrollo no lo es. Al día siguiente `/api/health` reporta
  `refunds: { ok: false, "N sin procesar por más de 24 h" }`, la salud pasa a
  `degraded` y **falla el criterio de `/api/health` de `smoke.sh`** — la barra se
  cae sola, sin que nadie haya tocado el código. Por eso `e2e-sme.mjs` y
  `cancel.test.ts` **borran al salir los reembolsos que ellos crearon**, acotados
  a los códigos de reserva y a los productos de su propia corrida, nunca a la
  tabla entera. La pista que lo delata: los reembolsos atorados cuelgan de
  reservas con motivo "Cierre de puerto por mal tiempo" o de productos en
  borrador con slug `s5-…`, y una reserva de verdad no compra sin publicar.
- **`smoke.sh` provoca un latido antes de preguntar por la salud.** Sobre una
  base recién creada, `/api/health` responde 503 con "nunca ha latido" — y eso es
  correcto, no un fallo.
- **Ninguna prueba debe tomar una fila compartida por posición.** Las garantías
  5, 6 y 7 elegían una salida del seed con `order by starts_at offset N limit 1`
  y le sobreescribían `capacity` y `seats_taken` con un `update` crudo. Solo
  funcionaba sobre una base recién sembrada: en cuanto un recorrido vendía
  lugares en esa salida, el contador quedaba en 0 con apartados vivos y la vista
  `tour_departure_seat_audit` reportaba un desajuste —correctamente— que parecía
  un defecto del inventario. Ahora cada una crea la suya con `test_departure()`.
  La misma lección estaba escrita en la cabecera del archivo desde el Sprint 2,
  pero solo se le había aplicado a las estancias.
- **`scripts/db.sh` cargaba `.env` encima de la `DATABASE_URL` exportada.** El
  §1 de puesta en producción dice `DATABASE_URL=<neon> npm run db:migrate`, y en
  una máquina con `.env` eso decía "aplicando…" mientras migraba la base local.
  En un contenedor limpio funcionaba; en la máquina de quien desarrolla, no —y
  sin decirlo. Ahora la variable exportada manda.
- **Enseñar el destino no evita apuntarle a la base equivocada.** El mismo día,
  con el destino impreso en pantalla y completo, se pegó la cadena de **otro
  proyecto de Neon**: se crearon las 16 migraciones en una base ajena y vacía
  mientras producción seguía sin migrar. Dos cadenas de Neon se diferencian en
  ocho caracteres a media línea (`ep-late-king-avk9v1d6` contra
  `ep-bitter-feather-aro32vx5`) y el ojo lee lo que espera. **Leer no es
  verificar.** Ahora `db.sh` y `demo-content.sh` **tapan** el identificador del
  servidor y piden escribirlo: quien no sabe en qué base está, no puede
  copiarlo de la pantalla. Y `db:migrate` grita cuando la primera migración
  está pendiente —una base ya desplegada nunca lo está—, que era la pista que
  estaba a la vista y nadie leyó.

  Pero la guarda no es la lección: **la cadena que no se teclea no se
  equivoca.** Contra producción se usa `npm run prod:migrate` y
  `npm run prod:sql -- <archivo>`, que la leen de `.env.production.local` y
  verifican contra el servidor anclado ahí; o la pestaña Actions de GitHub →
  *Migrar producción*, que la lee de un secreto del repositorio. Ninguna
  automatización puede estrenar un esquema en una base remota: eso exige
  `DB_BOOTSTRAP=si` a mano, porque una base de producción vacía siempre es un
  destino equivocado.
- **Un ajuste que solo carga el seed no existe en producción.** El seed **no**
  se corre allá, y con razón. Pero `settings.notifications.admin_email` viajaba
  ahí dentro, así que producción encolaba el aviso a la administración con
  destinatario vacío y lo mataba tras seis intentos —uno por reserva—. La
  garantía 21 pasaba en verde todo ese tiempo **porque el seed sí lo carga en
  desarrollo**: una garantía que depende del seed comprueba el seed. Ahora la 21
  corre también sin el ajuste, `booking_confirm` no encola lo que no puede
  entregar y `/api/health` reporta la configuración faltante por su nombre.
- **Las capturas `*.png` de la raíz están en `.gitignore`.** Son evidencia de una
  corrida concreta; se regeneran con `npm run test:e2e*`.

---

## Dónde vive el sistema

**El sitio corre en Vercel** (`https://adrimarket.vercel.app`, plan gratuito,
sin dominio propio por ahora — decisión del cliente), con **PostgreSQL
gestionado en Neon**. El detalle está en
[`docs/decisiones/0005-vercel-y-blob.md`](docs/decisiones/0005-vercel-y-blob.md).

Antes vivía en Render + Cloudflare
([`docs/decisiones/0002-donde-vive-el-sistema.md`](docs/decisiones/0002-donde-vive-el-sistema.md),
histórica, no se reescribió). Lo que esa decisión sí sigue explicando: por qué
**Cloudflare Workers/Pages no puede correr esto** (`sharp` es un binario
nativo, `postgres` habla TCP) y por qué **D1 no sirve como base** (las
garantías anti-sobreventa son `EXCLUDE USING gist`, 29 funciones plpgsql y
`FOR UPDATE SKIP LOCKED`, que SQLite no tiene). Vercel sí corre Node.js
completo — no comparte los problemas de Workers — pero tiene sus propios dos
límites en el plan gratuito, ya resueltos en la decisión 0005:

- **Las fotos se guardan en Vercel Blob**, no en disco: el sistema de
  archivos de una función es efímero y no se comparte entre invocaciones.
  Selección por configuración (`BLOB_READ_WRITE_TOKEN`), igual que
  Stripe/Resend/WhatsApp — ver `src/modules/media/images.ts`.
- **El latido corre por GitHub Actions** (`.github/workflows/heartbeat.yml`),
  no por el cron nativo de Vercel: ese es de máximo una vez al día en el plan
  gratuito. **No es un `schedule` de cada N minutos** — se probó a `*/5 * * * *`
  y GitHub lo corrió cada 4 a 10 horas, no cada 5 minutos: los cron de alta
  frecuencia no son confiables ahí. La solución es un job que se autosostiene
  en un bucle de un minuto hasta su límite de tiempo, reiniciado por un
  `schedule` de baja frecuencia (esos sí son puntuales). Solo es gratis
  porque el repositorio es público — ver decisión 0005.

---

## Mapa del repositorio

```
db/
  migrations/       SQL a mano, en orden. Fuente de verdad del esquema.
  seed/             datos de desarrollo
  tests/            garantías (22) y concurrencia
src/
  app/[locale]/     rutas públicas; el prefijo de idioma es parte de la URL
  app/admin/        panel de operación; sin prefijo y sin indexar
  app/api/health/   estado del sistema; 503 de verdad cuando algo está mal
  app/api/jobs/     el latido
  app/media/        entrega de fotos subidas (no van en public/)
  components/       componentes de la vitrina
  db/               cliente, tipos propios y esquema generado por introspección
  i18n/             idiomas, segmentos traducidos y etiquetas
  modules/          módulos de dominio, con frontera explícita entre ellos
scripts/            ciclo de vida de la base, verificación y generación
docs/               plan maestro, arquitectura, esquema, sprints y decisiones
```

### Documentación

| Documento | Para quién |
|---|---|
| [`docs/plan-de-entrega.md`](docs/plan-de-entrega.md) | columna vertebral del proyecto |
| [`docs/arquitectura.md`](docs/arquitectura.md) | decisiones técnicas |
| [`docs/esquema.md`](docs/esquema.md) | el modelo de datos |
| [`docs/puesta-en-produccion.md`](docs/puesta-en-produccion.md) | el día del despliegue |
| [`docs/operacion.md`](docs/operacion.md) | qué hacer cuando algo falla |
| [`docs/manual-del-panel.md`](docs/manual-del-panel.md) | el equipo del cliente |
| `docs/sprint-0N.md` | qué se hizo, qué se encontró y qué quedó pendiente |
| [`docs/bitacora-2026-09-04.md`](docs/bitacora-2026-09-04.md) | la sesión que revisó el correo y migró la base equivocada, con sus errores |
| `docs/decisiones/` | decisiones con su alternativa descartada |

---

## Deuda declarada al cierre del Sprint 7

Ninguna impide vender; todas tienen un rodeo conocido y están dichas en
`docs/puesta-en-produccion.md`.

- **Los reembolsos se registran, no se ejecutan.** Paso manual documentado.
- ~~Los cupones se administran pero no se canjean (falta el campo en checkout).~~
  **Cerrada.** El checkout tiene el campo, descuenta antes de impuestos y el
  canje se registra en la misma transacción que el apartado — ver
  [decisión 0004](docs/decisiones/0004-cupon-agotado-es-inventario.md). Lo que
  el panel no tiene todavía es dónde restringir un cupón por producto o poner
  un mínimo de compra: hoy solo se configura por código a mano en la base.
- ~~El panel no crea opciones de tour ni unidades de estancia.~~ **Cerrada.**
  Opciones de tour —horario, punto de encuentro, cupo, precio por pasajero—
  desde `/admin/catalogo/[id]/opciones`, y unidades de estancia —capacidad,
  recámaras, cuotas, su primer plan de tarifa— desde
  `/admin/catalogo/[id]/unidades`. Ambas agregadas después del Sprint 7.
  Publicar un producto ahora exige tener algo vendible: una opción de tour con
  precio de adulto, o una unidad de estancia con al menos una tarifa cargada.
- **No hay colchón de rotación entre estancias** (se bloquea el día a mano).
- **El cobro parcial del saldo se rechaza a propósito**: no hay regla de negocio.
- **Stripe, correo y WhatsApp no se han ejecutado contra el servicio real.**
  Para el correo hay sonda: `npm run probar:correo -- alguien@ejemplo.com`
  manda una confirmación de verdad por Resend, con las mismas funciones que
  usa el worker, y se niega a correr sin llaves —con el transporte local
  pasaría siempre. Falta el dominio propio: sin él Resend solo entrega a la
  dirección dueña de la cuenta.

## Decisiones del cliente que siguen abiertas

Bloquean trabajo real, no son trámites:

1. **Base gravable de cada impuesto** (¿IVA sobre subtotal, o sobre subtotal +
   ISH?). Hoy es un supuesto marcado en el código y afecta toda reserva.
2. **Porcentajes y plazos de la política de cancelación.** El mecanismo está
   construido y espera los números.
3. **Quién opera el panel y desde qué aparato.** Se asumió recepción desde el
   celular y así se construyó.

---

## Cómo trabajar aquí

- **Escribe la decisión cuando la tomes**, con su alternativa descartada, en
  `docs/decisiones/`. En seis meses nadie recuerda por qué, y re-litigar cuesta
  más que escribir diez líneas.
- **Si tocas inventario o pagos, corre la prueba de concurrencia.** Está en la
  Definition of Done y no se negocia bajo presión de fecha.
- **No marques una casilla por confianza.** El defecto de `robots.txt` del
  Sprint 7 existió porque alguien dio por hecho algo que nunca comprobó.
- **Un dato de prueba no debe parecerse a un síntoma de producción.** Si una
  prueba ensucia, que recoja.
