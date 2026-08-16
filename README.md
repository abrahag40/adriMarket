# adriMarket

Motor de reservas para tours en el Caribe y renta de inmuebles. Dos
inventarios que se compran igual y se operan distinto, con un solo checkout:
se cobra un anticipo en línea y el saldo se paga en destino.

Estado: **se puede reservar, cobrar el anticipo, operar el día a día, resolver
cancelaciones y cambios de fecha, y publicar catálogo desde el panel**
(Sprints 0 a 6), verificado de extremo a extremo. Falta la cuenta de la pasarela
para ejecutarlo contra el servicio real.

- **Plan maestro** (columna vertebral, una sola fuente de verdad): [`docs/plan-de-entrega.md`](docs/plan-de-entrega.md)
- Arquitectura y decisiones: [`docs/arquitectura.md`](docs/arquitectura.md)
- Esquema: [`docs/esquema.md`](docs/esquema.md)
- Cerrados: [`sprint-01.md`](docs/sprint-01.md) · [`sprint-02.md`](docs/sprint-02.md) · [`sprint-03.md`](docs/sprint-03.md) · [`sprint-04.md`](docs/sprint-04.md) · [`sprint-05.md`](docs/sprint-05.md) · [`sprint-06.md`](docs/sprint-06.md)

## Cómo correrlo

Se necesita PostgreSQL 16 o superior, Node 22 y `psql` en el `PATH`.

```bash
cp .env.example .env          # y apuntar DATABASE_URL a tu base
npm install

npm run db:migrate            # aplica las migraciones pendientes
npm run db:seed               # datos de desarrollo
npm run dev                   # el sitio en http://localhost:3000
```

Verificación, que es lo mismo que corre el pipeline:

```bash
npm run db:test               # garantías del inventario (en transacción, sin dejar rastro)
npm run test:integration      # capa de acceso: traducción de errores del dominio
npm run typecheck
npm run lint
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
npx next start -p 3100 &
BASE_URL=http://127.0.0.1:3100 ./scripts/smoke.sh   # criterios sobre el sitio construido
BASE_URL=http://127.0.0.1:3100 npm run test:e2e        # el checkout, en navegador real
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:admin  # un día de operación en el panel
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:sme    # el día que cierran el puerto
BASE_URL=http://127.0.0.1:3100 npm run test:e2e:publicar # publicar un tour sin ayuda
npm run db:bench              # prueba de carga: sobreventa bajo concurrencia
```

`NEXT_PUBLIC_SITE_URL` se fija **al construir**, no al arrancar: Next reemplaza
esas variables durante la compilación. La pasarela recibe una URL de retorno
absoluta, así que si no coincide con el puerto donde se sirve, el navegador
vuelve de pagar a un servidor que no existe.

`npm run db:reset` recrea todo desde cero. Se niega a correr contra una URL que
no sea local.

## Estructura

```
db/
  migrations/       SQL escrito a mano, en orden. Fuente de verdad del esquema.
  seed/             datos de desarrollo
  tests/            pruebas de las garantías y de concurrencia
src/
  app/[locale]/     rutas públicas; el prefijo de idioma es parte de la URL
  app/admin/        panel de operación; sin prefijo de idioma y sin indexar
  app/media/        entrega de las fotos subidas (no van en public/, ver abajo)
  components/       componentes de la vitrina
  db/               cliente, tipos propios y esquema generado por introspección
  i18n/             idiomas, segmentos traducidos y etiquetas de interfaz
  modules/          módulos de dominio (frontera explícita entre ellos)
scripts/            ciclo de vida de la base, verificación y generación
docs/               arquitectura, esquema, plan de entrega y decisiones
```

## Decisiones de la vitrina

- **Cada idioma tiene su propia URL** (`/es`, `/en`), con el segmento de
  colección traducido (`/es/estancias/…` ↔ `/en/stays/…`). Si las dos versiones
  compartieran dirección, solo una posicionaría en buscadores — y el tráfico
  orgánico en inglés es justo el que evita pagar comisión a un intermediario.
- **Un producto sin traducción responde 404** en ese idioma, en lugar de mostrar
  contenido a medio traducir.
- **Los filtros viven en la URL** y el formulario funciona sin JavaScript: la
  búsqueda se puede compartir, recargar y renderizar en el servidor.
- **El precio de la vitrina es un "desde"**. El total exacto depende de fechas y
  personas, y tiene una sola fuente autorizada en el servidor (Sprint 2).
  Mostrar un aproximado que después cambia es la forma más rápida de perder la
  confianza del huésped.
- **`canonical` y `hreflang` se emiten absolutos**: los buscadores ignoran
  `hreflang` relativo. Verificado en `scripts/smoke.sh`, no supuesto.

## Por qué el SQL se escribe a mano

Las garantías del negocio están declaradas en la base, no verificadas en la
aplicación, y eso necesita SQL que ningún generador expresa: restricciones de
exclusión sobre rangos de fechas, bloqueos de fila, funciones transaccionales.

El flujo es al revés de lo habitual: **el SQL manda y los tipos se generan**.
`npm run db:pull` introspecta la base y reescribe `src/db/generated/`, así el
código no puede desviarse del esquema real. `scripts/patch-generated.mjs`
corrige después las dos cosas que drizzle-kit no sabe leer (`daterange` y los
`DEFAULT` que llaman funciones de Postgres); es idempotente y avisa si algún
día deja de haber algo que parchar.

No se usan las migraciones de drizzle-kit: el script las descarta para que no
compitan con las escritas a mano.

## Las dos garantías del inventario

Son mecanismos distintos porque los dos inventarios se agotan distinto:

| | Estancias | Tours |
|---|---|---|
| Se agota por | traslape de rangos de fechas | conteo de lugares |
| Garantía | `EXCLUDE USING gist (unit_id =, stay &&)` | `CHECK (seats_taken <= capacity)` |
| Orden entre peticiones | lo da la restricción de exclusión | `SELECT … FOR UPDATE` |
| Verificado en | `db/tests/guarantees.sql` 1–4 | `db/tests/guarantees.sql` 5–7 |

Ninguna de las dos depende de que la aplicación se acuerde de revisar. Están
probadas con clientes concurrentes de verdad (`npm run db:bench`), no solo en
secuencia:

```
A) 200 intentos de 40 clientes sobre 20 lugares  →  20 apartados, 180 rechazados, drift 0
B) 80 intentos de 40 clientes, mismo rango       →  1 apartado
C) 40 clientes, rangos contiguos                 →  40 apartados, 0 falsos conflictos
```

## Códigos de error del dominio

La base los emite como SQLSTATE propios y `src/modules/availability/holds.ts`
los traduce a `InventoryUnavailableError` con un mensaje que se le puede
mostrar al huésped.

| Código | Significado |
|---|---|
| `AM001` | cupo agotado en la salida |
| `AM002` | fechas ya ocupadas en la unidad |
| `AM003` | transición de estado inválida |

## Cancelar, devolver y mover

Tres reglas que vienen del SME y no del esquema:

- **Una cancelación del operador no es una cancelación del huésped.** Cuando la
  capitanía cierra el puerto se devuelve todo lo pagado y la política de
  cancelación no aplica. Cobrarle una penalización a alguien por un huracán es el
  error que el diseño existe para impedir.
- **El reembolso sale de la política congelada en la reserva**, nunca de la
  vigente. El huésped aceptó un texto concreto en el checkout; que el cliente la
  edite después no cambia lo ya acordado.
- **Mover una reserva conserva el anticipo cobrado.** La diferencia de tarifa se
  ajusta en el saldo que se paga en destino, y todo ocurre en una transacción: si
  las fechas nuevas no están libres, el huésped no se queda sin las que tenía.

Los reembolsos se **registran** en la base a la espera de que la pasarela ejecute
el movimiento, igual que los cobros.

## Pagos y avisos: proveedores intercambiables

`src/modules/payments` y `src/modules/notifications` hablan con Stripe y Resend
por HTTP, detrás de una interfaz. Sin llaves configuradas se usan proveedores
locales que **no son dobles de prueba**: firman y verifican con el mismo
mecanismo que los reales, y el aviso se guarda renderizado en la bandeja en lugar
de enviarse. El camino que se ejercita —firma, idempotencia, confirmación
transaccional, reintentos— es el de producción; lo único que no ocurre es el
cobro y el envío.

Con `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` presentes se usa Stripe. La
selección es por configuración y no por una bandera de "modo desarrollo": sin
llaves no hay nada que cobrar, y con llaves siempre se usa la real.

## El panel de operación

Vive en `/admin`, **fuera del árbol de idioma**: es una herramienta interna, en
español, que no se indexa. El middleware de idioma lo excluye explícitamente —sin
esa exclusión el panel responde 307 hacia `/es/admin`, que no existe, y la
operación no puede entrar.

- **Se entra con un enlace por correo, no con contraseña.** No se guardan
  contraseñas: un operador chico no tiene cómo responder a una filtración, y la
  mejor forma de no tener ese problema es no tener el dato. De enlace y sesión
  solo se guarda el hash.
- **La sesión vive en la base**, no solo en una cookie firmada, porque una cookie
  firmada no se puede revocar y aquí hace falta cerrarle el acceso a alguien el
  mismo día que se va.
- **Los permisos se resuelven en el servidor.** Ocultar un botón no es un
  permiso: cada acción vuelve a preguntar quién la pide.
- **Está diseñado móvil primero** —tarjetas en vez de tablas, 44 px de alto en
  todo lo que se toca, teléfonos como enlaces `tel:`— por un supuesto declarado:
  recepción lo opera desde el celular. Un panel pensado para el celular funciona
  en un escritorio; al revés no.

## Las fotos

Se generan **al subir**, no al leer: anchos de 400, 800, 1600 y 2400 px en AVIF
con respaldo en WebP, y la vitrina emite `<picture>` con `srcset`. El porqué está
en [`docs/decisiones/0001-entrega-de-imagenes.md`](docs/decisiones/0001-entrega-de-imagenes.md):
se paga almacenamiento, que crece con el catálogo, en lugar de cómputo, que crece
con el tráfico justo cuando el negocio va bien.

Dos cosas que no son obvias:

- **Viven fuera de `public/`** (en `var/media` por omisión, configurable con
  `MEDIA_DIR`) y se sirven por `src/app/media/[...path]/route.ts`. Next resuelve
  el contenido de `public/` en tiempo de compilación, así que una foto escrita ahí
  después del build responde 404 hasta el siguiente despliegue. En producción esa
  ruta la reemplaza el CDN sobre el mismo almacén, sin cambiar las URL.
- **Las variantes las genera el latido**, no la petición del panel. Codificar AVIF
  tarda segundos por imagen; quince fotos serían ciento veinte codificaciones y
  una pantalla colgada. La foto se ve en cuanto se sube; los tamaños llegan
  después.

## Convenciones

- Identificadores en inglés, comentarios en español.
- Todo monto es un entero en centavos (`bigint`) con su moneda explícita.
  Nunca decimales flotantes.
- Las noches son `date` (una noche no es un instante); las salidas de tours son
  `timestamptz`. La zona viene de `locations.timezone`, no del servidor:
  Quintana Roo es `America/Cancun` (UTC−5, sin horario de verano).
- Liberar inventario es un `UPDATE` de `released_at`, nunca un `DELETE`.
