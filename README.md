# adriMarket

Motor de reservas para tours en el Caribe y renta de inmuebles. Dos
inventarios que se compran igual y se operan distinto, con un solo checkout:
se cobra un anticipo en línea y el saldo se paga en destino.

Este repositorio contiene, por ahora, la **capa de datos**: el esquema, las
operaciones donde la corrección no es negociable, y las pruebas que lo
demuestran. La propuesta de arquitectura completa está en
[`docs/arquitectura.md`](docs/arquitectura.md).

## Cómo correrlo

Se necesita PostgreSQL 16 o superior, Node 22 y `psql` en el `PATH`.

```bash
cp .env.example .env          # y apuntar DATABASE_URL a tu base
npm install

npm run db:migrate            # aplica las migraciones pendientes
npm run db:seed               # datos de desarrollo
npm run db:test               # pruebas de garantías (en transacción, sin dejar rastro)
npm run test:integration      # pruebas de la capa de acceso
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
  db/               cliente, tipos propios y esquema generado por introspección
  modules/          módulos de dominio (frontera explícita entre ellos)
scripts/            ciclo de vida de la base y post-proceso de la generación
docs/               arquitectura y referencia del esquema
```

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
