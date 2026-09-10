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

npm run db:migrate            # aplica las 22 migraciones en orden
npm run db:seed               # datos de desarrollo
npm run dev                   # http://localhost:3000
```

`npm run db:reset` recrea todo desde cero. **Se niega a correr contra una URL
que no sea local**, a propósito.

Todos los scripts cargan `.env` solos (`--env-file-if-exists`). No hace falta
exportar nada a mano.

### Si no tienes Postgres instalado

Un clúster propio del proyecto, sin tocar el Postgres del sistema ni mezclarse
con las bases de otros proyectos:

```bash
./scripts/pg-local.sh crear
./scripts/pg-local.sh start
createdb -h 127.0.0.1 -p 5444 -U postgres adrimarket
# DATABASE_URL=postgres://postgres@127.0.0.1:5444/adrimarket
```

Después de reiniciar la máquina hay que volver a levantarlo con
`./scripts/pg-local.sh start`. Si la aplicación responde 500 con
`ECONNREFUSED ... 5444`, es eso.

**Vive en `~/.local/share/adrimarket/pg`, fuera de `/tmp`, y el guion explica
por qué** — ver también la trampa de abajo.

---

## La barra de verificación

Es lo mismo que corre el pipeline, y **está pensada para correrse entera**:

```bash
npm run db:test               # 25 garantías del inventario, en transacción
npm run test:integration      # 165 casos del dominio
npm run typecheck
npm run lint
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
npx next start -p 3100 &
BASE_URL=http://127.0.0.1:3100 ./scripts/smoke.sh          # 140 criterios
BASE_URL=http://127.0.0.1:3100 npm run test:e2e            # 11 · el checkout
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:admin      # 18 · un día de recepción
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:sme        # 25 · cierran el puerto
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:publicar   # 30 · publicar un tour
BASE_URL=http://127.0.0.1:3100 npm run audit               # 31 · accesibilidad y peso
npm run db:bench              # sobreventa bajo concurrencia real
```

**Última corrida completa: todo en verde, sobre una base recreada desde cero.**

Desde el 2026-09-07 esto también corre solo: **commit → PR → CI → merge →
migrar → desplegar → comprobar**. La CI (`ci.yml`) es la compuerta del PR;
`desplegar.yml` se dispara cuando la CI termina en verde sobre la rama por
defecto, aplica las migraciones pendientes **antes** de desplegar y después
comprueba contra el sitio real que la salud esté limpia y que **el simulador
de pagos no esté activo** — el incidente del mismo día, vuelto compuerta.
No se despliega a mano; ver [decisión 0013](docs/decisiones/0013-desplegar-desde-ci-no-desde-la-laptop.md).
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

`src/modules/payments` y `src/modules/notifications` hablan con Stripe, Resend,
SMTP y la Cloud API de Meta detrás de una interfaz. Sin llaves configuradas se usan
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
  `npm run prod:sql -- <archivo>`, que la leen de `.env.neon` y
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
- **Un archivo de entorno llamado `.env.production.local` secuestra el build.**
  Next carga `.env`, `.env.local`, `.env.<NODE_ENV>` y `.env.<NODE_ENV>.local`,
  y **los de `NODE_ENV` ganan**. La cadena de producción se guardó ahí y a
  partir de entonces `npm run build` local la tomó en lugar de la de `.env`: el
  servidor de verificación quedó hablando con **producción** y `smoke.sh`
  reportó 50 fallos que no eran del código. El archivo se llama `.env.neon`,
  que no coincide con ningún patrón de Next, y `produccion.sh` se niega a
  correr si encuentra el viejo. La pista que lo delata: el build imprime
  `- Environments: …` con los archivos que cargó.
- **Una captura de página completa de la portada sale con los rieles vacíos, y
  la portada está bien.** Los carruseles usan `content-visibility: auto` para
  que la carga diferida funcione dentro de un riel —sin eso el teléfono se
  traía las veintiuna fotos de golpe, 475 kB contra 194—. Chromium compone
  `fullPage: true` fuera de la ventana sin volver a decidir qué es relevante,
  así que lo aplazado no se pinta. En una ventana de verdad las tarjetas están
  ahí: se comprobó con `getBoundingClientRect`, con las fotos cargadas y con
  axe en los dos temas. Para una captura que sirva de evidencia hay que forzar
  `content-visibility: visible` antes de disparar; al imprimir ya lo hace una
  regla `@media print`. Ninguna prueba de la barra captura una página con
  rieles —`p5-en-el-sitio.png` es la búsqueda, que no los tiene—, así que esto
  solo muerde a quien tome una captura a mano y crea que rompió el sitio.
- **Un clúster de Postgres en `/tmp` no se muere: se queda a medio comer.** La
  base de desarrollo vivió en `/tmp/ampg` hasta el 2026-09-07, cuando el
  limpiador periódico de macOS borró los archivos sueltos del directorio de
  datos —`PG_VERSION`, `postgresql.conf`, `pg_hba.conf` y, lo que lo volvió
  irrecuperable, `global/pg_filenode.map` y los catálogos del sistema—. Los
  directorios quedaron, con 228 archivos de tablas y ninguna forma de saber qué
  era cada uno. **Lo caro no fue perder los datos** —son de prueba y se
  regeneran con `db:reset` más los seeds del Caribe— **sino el rato de
  diagnóstico**: la aplicación responde 500, la barra reporta fallos que no
  existen, y hay que llegar hasta el log de Postgres para entender por qué.
  Ahora vive en `~/.local/share/adrimarket/pg`; lo gestiona
  `scripts/pg-local.sh`, que también lleva el `LC_ALL=C` sin el cual el
  postmaster de Homebrew aborta con "postmaster became multithreaded during
  startup" y no dice nada más.
- **Preguntar por el tipo en vez de por el mecanismo deja a los vehículos sin
  precio.** `listCatalog` sacaba el cupo y el "desde" con
  `case p.kind when 'stay' then … else …`, así que **un vehículo caía en el
  `else` de los tours** y buscaba su capacidad en `tour_options` y su precio en
  `tour_pax_prices`, donde no tiene nada. Resultado: toda camioneta salía con
  los dos en nulo — sin precio en su tarjeta, invisible para `?guests=`, y sin
  las facetas de Personas y Precio en su sección, que desaparecían por no tener
  dos opciones que ofrecer. **Nada fallaba; solo faltaba**, y por eso vivió
  desde que entraron los vehículos hasta que el filtro lateral lo hizo visible.
  `isRental()` existe exactamente para esto y el mismo archivo ya lo usaba bien
  en la ficha; el listado se había quedado atrás. En SQL se escribe
  `p.kind <> 'tour'`. Lo cubren cuatro criterios de `smoke.sh` — tres de los
  cuales se comprobó que **fallan** con el defecto puesto; el cuarto es un
  `expect_absent` y pasa en vacío, que es lo que hace una comprobación de
  ausencia cuando no hay nada.
- **Un build puede salir con el manifiesto de cliente incompleto, y se ve como
  un defecto de accesibilidad.** Pasó el 2026-09-07 con un `.next` recién
  borrado: la compilación dijo "Compiled successfully", el sitio público sirvió
  200 en todo —incluida la hoja de estilos, que es lo que comprueba la guarda
  de más abajo— y **`/admin/ajustes` respondía 500** con
  `Could not find the module "…settings-forms.tsx#DepartureBatchForm" in the
  React Client Manifest`. Lo que reportó la barra no fue eso: `test:e2e:publicar`
  se colgó treinta segundos esperando `#optionId`, y la auditoría dijo
  **`panel · ajustes: document-title (1), html-has-lang (1)`** — porque la
  página de error de Next no trae ni título ni `lang`, no porque falte nada en
  el panel. Buscar un `<title>` en el layout del panel es el camino
  equivocado. Se arregla con `rm -rf .next` y volver a construir; para
  descartarlo en un minuto: `grep -i "client manifest"` en el log del servidor.
- **Un `next start` olvidado en el 3100 hace que la barra mida el build de
  ayer.** `npx next start -p 3100 &` falla con `EADDRINUSE` si ya hay uno
  escuchando, pero como va al fondo nadie lee su error: `curl` responde 200,
  `smoke.sh` y `audit` corren contra el servidor viejo y reportan sobre código
  que no es el que se acaba de escribir. Costó una investigación de doce
  fallos de accesibilidad que no existían en el código nuevo —y habría podido
  costar lo contrario, que es peor: una barra en verde sobre un cambio sin
  probar. Antes de creerle a la barra: `lsof -nP -iTCP:3100 -sTCP:LISTEN`, o
  comprobar que el HTML servido tiene lo que se acaba de escribir.
- **El simulador de pagos es un permiso, y producción no lo tiene.** El panel
  con "Simular pago exitoso" se mostraba con la única condición de que la
  pasarela fuera la local — y **producción corre con la local**, porque las
  llaves de Stripe nunca llegaron. Con `robots.txt` en `Allow: /`, cualquiera
  que entrara al sitio podía confirmar una reserva sin pagar: inventario
  consumido, correo enviado, cero pesos. Ahora hace falta `PAYMENT_SIMULATOR=si`
  y el candado vive en la Server Action, no en la página: **ocultar un botón no
  es un permiso**, una acción se invoca por su identificador. Sin ese permiso y
  sin llaves, `gatewayState()` es `closed` y el checkout se cierra antes de
  crear el apartado, en vez de dejar al huésped en una página sin forma de
  pagar. `/api/health` dice en cuál de los tres estados está y **no falla por
  ello**: los tres son legítimos y un chequeo siempre en rojo enseña a ignorar
  el rojo. Ver [decisión 0011](docs/decisiones/0011-el-simulador-es-un-permiso.md).
  Si `npm run test:e2e` se cuelga esperando el botón, falta la variable en `.env`.
- **`vercel --prod` desde la laptop sube tu `.env`, aunque esté en
  `.gitignore`.** El 2026-09-07 el despliegue que iba a cerrar el hueco del
  simulador lo mantuvo abierto por otra puerta: el CLI empaquetó el `.env`
  local y el log del build lo dijo —`- Environments: .env`—. Next lo carga, y
  aunque **las variables definidas en Vercel ganan** (`DATABASE_URL` y las
  demás siguieron siendo las de producción), las que Vercel **no** define se
  llenan con el valor local: `PAYMENT_SIMULATOR=si` viajó de la máquina de
  desarrollo a producción. Es la misma lección que la de
  `.env.production.local`, por otro camino: **`.gitignore` protege el
  repositorio, no el paquete que sube el CLI.** Ahora existe `.vercelignore`,
  pero la defensa real es no desplegar desde la laptop: **el runner no tiene
  `.env` porque git nunca lo tuvo.** Para descartarlo en un despliegue:
  `vercel inspect --logs <url> | grep -i environments` — no debe salir nada.
- **Una prueba intermitente puede ser dos pruebas que se contradicen.** La de
  la carrera por el último canje de un cupón fallaba una de cada tres veces, y
  no era ruido: convivía con otra que afirmaba lo contrario —"un código que no
  existe no bloquea la reserva: se cobra el precio completo"— y el código
  implementaba esa. Ganaba una u otra según **cuándo** corriera el segundo
  presupuesto. Lo caro no era el fallo sino lo que tapaba: un huésped que pedía
  un descuento y pagaba de más **sin que nadie se lo dijera**. Hoy un cupón que
  no se aplica detiene la reserva con su motivo, para las siete razones, y la
  prueba de la carrera acepta los dos caminos al mismo "no" en vez de exigir un
  detalle de temporización. Ver
  [decisión 0014](docs/decisiones/0014-un-cupon-que-no-se-aplica-detiene-la-reserva.md).
- **Stripe no permite sesiones de pago menores a 30 minutos, y el apartado
  duraba 15.** Entre el minuto 15 y el 30 el huésped podía pagar por fechas ya
  liberadas: se le cobraba, `booking_confirm` rechazaba con AM003, **la
  transacción rodaba atrás borrando hasta el registro del pago**, y la ruta
  respondía 500 en cada reintento de Stripe durante tres días. Ni reserva, ni
  rastro — `/api/health` no lo veía porque no quedaba nada que ver. No ocurría
  solo porque el simulador local es instantáneo. Ahora el apartado son 35
  minutos, `HOLD_MINUTES_MINIMO` impide bajarlo de 30, `expires_at` deriva del
  apartado real, y un pago que llegue tarde igual **se registra, se devuelve y
  se avisa** en vez de perderse. Ver
  [decisión 0015](docs/decisiones/0015-el-apartado-tiene-que-sobrevivir-a-la-sesion-de-pago.md).
  **En producción hay que correr `db/arreglos/apartado-35-minutos.sql`**: el
  seed no se corre allá.
- **Un layout no se vuelve a renderizar en una navegación de cliente, así que
  no puede decidir nada que dependa de la URL.** El enlace activo del menú se
  calculaba en `layout.tsx` con `x-pathname` + `x-search` de las cabeceras, y
  se congelaba en el primer render: la URL cambiaba a `?kind=stay`, el título
  de la pestaña cambiaba, el listado cambiaba, **y el punto se quedaba en
  "Inicio"**. Recargar lo arreglaba, que es lo que lo volvía difícil de creer.
  Y **`smoke.sh` no podía verlo nunca**: pide con `curl`, y una petición nueva
  siempre acierta — el defecto solo existe entre dos renders. Ahora lo decide
  `NavLinks` con `usePathname`/`useSearchParams`, envuelto en `<Suspense>`
  porque `useSearchParams` lo exige o falla el build. El criterio vive en
  `e2e.mjs`, que navega sin recargar. Ver
  [decisión 0018](docs/decisiones/0018-el-enlace-activo-se-decide-en-el-cliente.md).
- **`/es` significaba "la portada" y "sin filtros" a la vez.** Quitar el último
  filtro devolvía al huésped a la portada —arriba del hero, sin listado— porque
  el listado solo se renderiza cuando hay filtros y **no existía ninguna
  dirección con el significado "listado completo"**. Ni el ancla: los enlaces
  iban a `/es#resultados` y ese `id` no se renderiza en la portada. Ahora es
  `?kind=all`, que no es un filtro sino "estoy en el listado y no filtro por
  tipo". La lección de fondo es otra: **el código ya conocía la mitad del
  defecto** —hay un comentario que lo explica— y el arreglo anterior escondió
  la fila del panel lateral dejando intactos los chips y "Quitar filtros", que
  son los que se usan en el teléfono, donde la barra está cerrada. Tratar el
  sitio donde se vio el problema no es tratarlo. Ver
  [decisión 0017](docs/decisiones/0017-todo-el-catalogo-necesita-su-propia-direccion.md).
- **Una prueba que publica un producto y no lo recoge empuja el catálogo real a
  la página 2.** `checkout.test.ts` crea sus productos **publicados** —no le
  queda otra, el checkout solo vende lo publicado— y `e2e-publicar.mjs` publica
  un catamarán por corrida. Ninguno los recogía, así que la base de desarrollo
  acumulaba dos por `test:integration` y uno por recorrido. Con seis por página,
  eso desplaza productos de verdad fuera de la primera: un criterio de
  `smoke.sh` que buscaba "SUV familiar" en el listado completo empezó a fallar
  **sin que nadie tocara el código**, y el diagnóstico natural —"rompí el
  listado"— era el equivocado. Ahora los dos **vuelven a `draft` al salir**, que
  es mejor que borrarlos: `booking_items` los referencia y las reservas de la
  corrida son evidencia legítima; un borrador simplemente no sale en el
  catálogo. `cancel.test.ts` nunca tuvo el problema porque los suyos nacen en
  borrador — de ahí los `s5-…` que menciona la trampa de los reembolsos.
  Para comprobarlo: `select count(*) from products where status='published'`
  antes y después de la barra debe dar lo mismo.
- **Un criterio que busca un producto por nombre en un listado paginado mide la
  paginación, no lo que dice medir.** Es el mismo error, del otro lado: el
  criterio de arriba era frágil aunque la base estuviera limpia, porque bastaba
  con que el seed creciera. Lo que sí aguanta es comprobar la faceta —que
  ofrece los tres tipos con su cuenta, sacada del catálogo entero— en vez de
  qué tarjeta cayó en la página 1.
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

- **Los reembolsos se liquidan a mano, y no es provisional.** El movimiento
  —transferencia, SPEI o efectivo— lo hace la agencia en su banco; el panel lo
  **registra** desde `/admin/reembolsos` con cómo, cuándo, quién, la clave de
  rastreo y el comprobante. No es un rodeo mientras llega Stripe: **el saldo se
  cobra en destino en efectivo**, así que parte del dinero nunca pasa por la
  pasarela y no puede volver por ella. Cuando Stripe llegue será un `method` más
  del enum que ya existe. Lo que sigue faltando es que la devolución a tarjeta se
  dispare sola. Ver [decisión 0012](docs/decisiones/0012-el-dinero-que-sale-tambien-se-audita.md).
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
- **Stripe está verificado contra la API real, pero en una cuenta *sandbox*.**
  El 2026-09-09 se ejercitó el camino entero con llaves de prueba: sesión de
  cobro, pago con tarjeta, webhook firmado **por Stripe**, `booking_confirm`,
  cancelación y `refund()` —incluida la comprobación de que dos llamadas
  devuelven el mismo reembolso, que con la llave aleatoria anterior habría
  devuelto el dinero dos veces—. **Del lado del código no falta nada para
  cobrar**; falta que el cliente entregue su información fiscal para activar la
  cuenta real. Ver
  [decisión 0016](docs/decisiones/0016-stripe-se-queda-en-sandbox-hasta-tener-la-fiscal-del-cliente.md).
  La trampa que apareció y muerde el día del despliegue: **el `whsec_` tiene que
  ser de la misma cuenta que la llave**. Con el CLI escuchando otra cuenta, el
  pago se cobró y el webhook nunca llegó — el dinero entra y el sistema no se
  entera, idéntico a un webhook roto.
- **WhatsApp no se ha ejecutado contra el servicio real.** El correo
  sí: el 2026-09-04 se mandó el primero de verdad y llegó. La sonda es
  `npm run probar:correo -- alguien@ejemplo.com`, que arma el mensaje con las
  mismas funciones del worker y **se niega a correr con el transporte local**,
  porque así pasaría siempre.
- **Sin dominio propio, Resend solo entrega a la dirección dueña de la cuenta.**
  Por eso existe `SmtpTransport`: mandando por el SMTP de la propia cuenta de
  correo, SPF y DKIM alinean con el remitente y se le puede escribir a
  cualquiera. Es un rodeo económico, no técnico. **Resend gana cuando su llave
  está presente**, para que el día del dominio tome el relevo sin que nadie
  tenga que acordarse de quitar lo anterior.

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
