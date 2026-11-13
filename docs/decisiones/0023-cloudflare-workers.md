# 0023 · El motor también corre en Cloudflare Workers

**Fecha:** 2026-11-12 · **Estado:** aceptada; corre en workers.dev en el plan gratuito (con la 0024) · **Decide:** ZaharDev

## Pregunta

Un sitio nuevo de ZaharDev va a vender con este motor desde un subdominio de
`zahardev.com`, que ya vive en Cloudflare. El plan gratuito de Vercel es solo
para uso personal y no comercial, así que ahí no puede vender. ¿Puede correr en
Workers sin romper los sitios que siguen en Vercel?

## Contexto

La [decisión 0002](0002-donde-vive-el-sistema.md) encontró tres choques con
Workers y los dejó anotados como la lista de lo que habría que resolver primero.
Cada uno tiene ahora su reemplazo, **elegido por configuración** como Stripe,
Resend y Blob: sin las piezas de Cloudflare conectadas, Node y Vercel siguen
exactamente igual.

| Choque (0002) | Reemplazo en Workers | Dónde |
|---|---|---|
| `postgres` por TCP | **Hyperdrive** hacia el mismo PostgreSQL, con **un cliente por petición** | `src/db/index.ts` |
| Fotos en disco o en Vercel Blob | **R2** (binding `MEDIA`), tercera implementación de `MediaStorage` | `src/modules/media/images.ts` |
| `sharp`, binario nativo | **Images** (binding `IMAGES`): mismos anchos, formatos y calidades | `images.ts`, `ImageCodec` |
| El latido por GitHub Actions (0005) | **Cron Trigger** en un entry propio que llama a `POST /api/jobs/tick` | `worker.ts`, `wrangler.jsonc` |

D1 sigue descartado por las mismas razones de 0002.

## Lo que hubo que entender, y no se veía leyendo

- **Un cliente global de Postgres truena en Workers a partir de la segunda
  visita.** workerd no deja usar en una petición un socket abierto en otra.
  `db` y `sqlClient` siguen siendo los mismos objetos para los 40-y-tantos
  módulos que los importan: un `Proxy` resuelve el cliente de la petición en
  curso, con su `ctx` como llave. OpenNext guarda `ctx` en un AsyncLocalStorage,
  así que dos peticiones simultáneas nunca comparten cliente.
- **`sharp` y `@vercel/blob` se importan al usarse.** Con un `import` estático,
  cualquier ruta que tocara `images.ts` —la de fotos o el panel— tronaba al
  cargar el módulo, antes de hacer nada.
- **OpenNext 1.20.15 exige Next ≥ 15.5.28**, y ese Next trae `sharp` 0.35, que ya
  no exporta el namespace `sharp.Metadata`. Por eso el salto de parche de Next
  está en este mismo cambio, cubierto por la barra completa.
- **OpenNext copia el `.env` dentro del Worker** (`.open-next/cloudflare/next-env.mjs`).
  Ver la trampa en `CLAUDE.md` y su guardián, `scripts/worker-sin-env.mjs`.
- **Hyperdrive en local exige contraseña en la cadena**, aunque el Postgres de
  desarrollo autentique por `trust`. Cualquier contraseña sirve.

## Lo medido (2026-11-12)

Contra `opennextjs-cloudflare preview` (workerd local, con Hyperdrive, R2 e
Images simulados por wrangler 4.156.0) y una base recreada desde cero:

| Barra | Resultado |
|---|---|
| `db:test` | 27 garantías ✔ |
| `test:integration` (Node, con el cliente nuevo) | 215 ✔ |
| `smoke.sh` contra el Worker | 169 ✔ |
| `test:e2e` · `:admin` · `:sme` · `:publicar` contra el Worker | 20 · 18 · 25 · 30 ✔ |
| `audit` contra el Worker | 38 ✔ |
| `db:bench` | sin sobreventa en salidas, estancias y barcos |
| Latido por el Cron Trigger (`/cdn-cgi/local/scheduled`) | `/api/health` pasa a `ok` |
| Foto subida desde el panel | variantes AVIF (`ftypavif`) y WebP (`RIFF…WEBP`) en R2, primer intento |

## Lo medido en Cloudflare (2026-11-13)

Vista previa de ZaharDev Tours en `zahardev-tours-vista-previa.abrahag40.workers.dev`
(entorno `vista-previa` de `wrangler.jsonc`, con `noindex`). La base es la rama
`vista-previa` del proyecto de Neon `zahardev-tours`, por Hyperdrive. Las fotos
van en el bucket `zahardev-tours-media-vista-previa`.

| Barra | Resultado |
|---|---|
| `db:test` · `test:integration` · `db:bench` contra Neon | 27 · 215 ✔ · sin sobreventa |
| `smoke.sh` contra el Worker | 169 ✔ |
| `test:e2e` · `:sme` · `:publicar` contra el Worker | 20 · 25 · 30 ✔. La foto se procesó con Images real y quedó en R2 |
| `test:e2e:admin` contra el Worker | 18 ✔ **después de apagar la caché de Hyperdrive** (ver abajo) |
| `audit` contra el Worker | ✘ al azar: ver «el plan gratuito no alcanza» |

**Hyperdrive guarda consultas en caché por omisión, 60 segundos**
([query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/)).
Recepción creaba un bloqueo y la lista del panel seguía sin él. Para este motor
la caché está mal, porque el panel, la disponibilidad y la salud leen lo de
ahora. Se apagó con `wrangler hyperdrive update <id> --caching-disabled`. Lo
vigila `scripts/hyperdrive-sin-cache.mjs`, porque la caché es del recurso en
Cloudflare y un Hyperdrive nuevo nace con ella encendida.

**El plan gratuito de Workers no alcanza.** Analítica de Workers del Worker de
vista previa, durante la barra:

| Respuesta | Peticiones | CPU p50 | CPU p90 | CPU p99 |
|---|---|---|---|---|
| bien | 1,059 | 13 ms | 131 ms | 233 ms |
| `exceededResources` | 38 | — | — | — |

El plan gratuito da 10 ms de CPU por petición
([precios](https://developers.cloudflare.com/workers/platform/pricing/)). Cuando
un Worker se pasa, Cloudflare responde `503 · error code: 1102`. Con
peticiones repetidas, la ficha de tour falló 7 de 12 veces. Por eso la
auditoría marcaba `link-in-text-block (2)` en páginas distintas cada corrida:
axe auditaba la página de error. **Hace falta Workers Paid** (USD 5 al mes, con
30 millones de ms de CPU incluidos). Lo decide quien paga.

**Actualización del mismo día:** con las páginas públicas servidas desde una
caché en R2 ([decisión 0024](0024-cache-de-paginas-en-r2.md)), la portada y las
fichas bajaron a 1 ms de CPU. La barra completa pasa en el plan gratuito,
`audit` incluida, con cero cortes. **Workers Paid deja de ser requisito para
salir.** Se contrata cuando `scripts/cpu-cloudflare.mjs` vea el primer corte.

## Lo que falta para cerrarla

1. **Stripe en sandbox dentro de workerd**: el webhook firma con HMAC de
   `node:crypto`. El simulador ya probó el camino del checkout; falta la
   pasarela real.
2. **Producción, un renglón por sitio** en `wrangler.jsonc` (`env`) y en la
   matriz de `desplegar.yml`. La compuerta corre `worker-sin-env.mjs` y
   `hyperdrive-sin-cache.mjs`, y el sitio necesita su bucket `PAGE_CACHE` con
   la regla de vencimiento.

## Alternativa descartada

**Cloudflare Containers** (opción B de 0002). Era el camino corto si portar
salía caro: corre el contenedor tal cual. No hizo falta. Los cambios caben en
cuatro módulos y la barra pasa entera sobre workerd, sin pagar un producto
más nuevo y con disco por resolver.
