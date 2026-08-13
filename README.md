# adriMarket

Motor de reservas para tours en el Caribe y renta de inmuebles. Dos
inventarios que se compran igual y se operan distinto, con un solo checkout:
se cobra un anticipo en línea y el saldo se paga en destino.

Estado: **capa de datos** (Sprint 0) y **vitrina pública en dos idiomas**
(Sprint 1). Todavía no se puede reservar: el motor de cotización y el checkout
son los Sprints 2 y 3.

- Arquitectura y decisiones: [`docs/arquitectura.md`](docs/arquitectura.md)
- Esquema: [`docs/esquema.md`](docs/esquema.md)
- Plan de entrega en Scrum: [`docs/plan-de-entrega.md`](docs/plan-de-entrega.md)
- Sprint en curso: [`docs/sprint-01.md`](docs/sprint-01.md)

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
npm run build && npx next start &
./scripts/smoke.sh            # criterios de aceptación sobre el sitio construido
npm run db:bench              # prueba de carga: sobreventa bajo concurrencia
```

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

## Convenciones

- Identificadores en inglés, comentarios en español.
- Todo monto es un entero en centavos (`bigint`) con su moneda explícita.
  Nunca decimales flotantes.
- Las noches son `date` (una noche no es un instante); las salidas de tours son
  `timestamptz`. La zona viene de `locations.timezone`, no del servidor:
  Quintana Roo es `America/Cancun` (UTC−5, sin horario de verano).
- Liberar inventario es un `UPDATE` de `released_at`, nunca un `DELETE`.
