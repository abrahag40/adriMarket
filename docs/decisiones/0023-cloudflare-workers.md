# 0023 · El motor también corre en Cloudflare Workers

**Fecha:** 2026-11-12 · **Estado:** aceptada en local (falta la vista previa en workers.dev) · **Decide:** ZaharDev

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

## Lo que falta para cerrarla

1. **Vista previa en `workers.dev`**: crear la base en Neon, la configuración de
   Hyperdrive y el bucket de R2. Son recursos en cuentas de ZaharDev: los
   autoriza quien paga.
2. **Medir la CPU por petición allá.** El plan gratuito da 10 ms por petición y
   el de pago, 30 s. En local no se puede medir: workerd no impone el límite.
3. **Stripe en sandbox dentro de workerd**: el webhook firma con HMAC de
   `node:crypto`. El simulador ya probó el camino del checkout; falta la
   pasarela real.
4. **Leer el precio de Images** antes de activarlo en producción. Se cobra por
   transformación única al mes; en local no cuesta.
5. **Un renglón por sitio** en `wrangler.jsonc` (`env`) y en la matriz de
   `desplegar.yml`, con `npm run cf:deploy`.

## Alternativa descartada

**Cloudflare Containers** (opción B de 0002). Era el camino corto si portar
salía caro: corre el contenedor tal cual. No hizo falta. Los cambios caben en
cuatro módulos y la barra pasa entera sobre workerd, sin pagar un producto
más nuevo y con disco por resolver.
