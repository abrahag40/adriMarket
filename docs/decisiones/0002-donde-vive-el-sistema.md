# 0002 · Dónde vive el sistema

**Estado:** decidido · **Sprint:** 7 (cierre) · **Decide:** cliente, con el
análisis de los Developers

## Pregunta

El cliente tiene cuenta de Cloudflare y pidió desplegar ahí. ¿Puede este sistema
correr en Cloudflare, y si no, qué parte sí?

## Contexto

- El producto está terminado y verificado; falta ponerlo en algún lado.
- El cliente ya administra su dominio en Cloudflare y quiere consolidar.
- El presupuesto de infraestructura del MVP es de 75 a 100 USD al mes.
- Es el primer despliegue: estrenar producto **y** plataforma a la vez duplica
  las cosas que pueden salir mal, justo cuando hay que estar mirando reservas.

## Lo que se encontró al revisar el código

Tres cosas del sistema chocan con el runtime de Workers, y no son de
configuración:

| Qué usa el sistema | Dónde | Por qué no corre en Workers |
|---|---|---|
| `sharp` para generar AVIF/WebP | `src/modules/media/images.ts` | Es un binario nativo de Node; no existe en Workers |
| Sistema de archivos para las fotos | `images.ts`, `app/media/[...path]/route.ts` | Workers no tiene disco; exige R2 y reescribir la entrega |
| `postgres` (postgres.js) por TCP | `src/db/index.ts` | Workers necesita Hyperdrive o un driver por HTTP |

El propio `next.config.ts` lo dice desde el Sprint 1: *"las páginas de catálogo
leen de Postgres en el servidor, así que el runtime de Node es obligatorio (no
edge)"*. `serverExternalPackages: ["postgres"]` está ahí por lo mismo.

### D1 queda descartado, y esto es lo importante

Cloudflare no ofrece PostgreSQL. Su base es **D1, que es SQLite**, y el esquema
de este proyecto no es portable a SQLite ni con esfuerzo:

- una restricción `EXCLUDE USING gist` sobre `daterange` con `btree_gist`, que es
  **lo único que impide dos reservas sobre la misma noche**;
- **29 funciones en plpgsql** repartidas en 7 migraciones, que son donde viven la
  confirmación, la cancelación, el reembolso y el encolado transaccional;
- **5 usos de `FOR UPDATE` / `SKIP LOCKED`**, que son lo que ordena las peticiones
  simultáneas por los lugares de una salida;
- SQLSTATE propios (`AM001`, `AM002`, `AM003`) emitidos desde la base.

Migrar a D1 significaría **volver a verificar en la aplicación lo que hoy la base
hace imposible**: exactamente el diseño que este proyecto rechazó en el Sprint 0,
y con él las 22 garantías y la prueba de concurrencia.

## Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **A. Cloudflare Workers + OpenNext** | Despliegue nativo de Cloudflare; todo en una plataforma | Exige Hyperdrive, mover fotos a R2 y **reemplazar `sharp`** por Cloudflare Images. Días de trabajo y hay que reverificar la barra completa. Sigue necesitando Postgres externo |
| **B. Cloudflare Containers** | Corre un contenedor real: Node, `sharp` y el disco funcionan como están. Casi sin cambios de código | Producto más nuevo y menos rodado; hay que resolver el volumen persistente para `MEDIA_DIR`. Sigue necesitando Postgres externo |
| **C. Cloudflare como DNS y CDN**, delante de un host con runtime de Node | Cero migración: el código funciona tal cual. Se puede desplegar hoy. Se conserva Cloudflare para dominio, caché y protección | El cómputo se factura en otro proveedor; son dos paneles en vez de uno |

Las tres necesitan Postgres fuera de Cloudflare.

## Decisión

**Opción C para arrancar**, con **Neon** como PostgreSQL gestionado.

Cloudflare queda al frente con el dominio, el caché y la protección —que es para
lo que el cliente ya lo usa— y el sitio corre donde el código ya está probado.

La opción B queda **anotada, no descartada**: si más adelante conviene consolidar
todo en Cloudflare, Containers es el camino corto, porque no obliga a tocar
`sharp` ni el modelo de datos. Se decide con tráfico real, no antes.

Neon en particular porque soporta `btree_gist` y plpgsql —requisito no
negociable—, tiene capa gratuita para arrancar, y si algún día se va a Workers,
es el que se integra con Hyperdrive.

## Consecuencias

- **No hace falta cambiar una línea de código para desplegar.** Lo que se probó
  es lo que se sube.
- Hay que apuntar `DATABASE_URL` a Neon y aplicar las 13 migraciones ahí. La
  conexión **directa** para migraciones; si el runtime usa el pooler en modo
  transacción, `DATABASE_POOL_MAX` bajo.
- `MEDIA_DIR` tiene que quedar en un **volumen persistente** y entrar en las
  copias de seguridad: las fotos no están en la base ni en el repositorio.
- El cron del latido se configura en el host, cada minuto, con `x-job-secret`.
- Cloudflare **no debe cachear** `/admin`, `/api` ni `/media` con reglas propias
  que se peleen con las cabeceras que ya emite la aplicación.
- Si algún día se evalúa Workers, este documento es el punto de partida y la
  lista de lo que habría que resolver primero.

## Alternativa que se consideró y se descartó explícitamente

**Reescribir el esquema para D1 y quedarse enteramente en Cloudflare.** Se
descartó porque la ventaja competitiva de este producto es que la sobreventa es
imposible por diseño, y esa propiedad la sostiene PostgreSQL, no la aplicación.
Cambiar de base para simplificar la factura sería pagar la infraestructura con la
garantía que el negocio compró.
