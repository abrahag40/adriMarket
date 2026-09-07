# 0011 · El simulador de pagos es un permiso que se otorga

**Fecha:** 2026-09-07
**Estado:** aceptada

## Contexto

La pasarela se elige por configuración: con `STRIPE_SECRET_KEY` y
`STRIPE_WEBHOOK_SECRET` se usa Stripe, y sin ellas la local, que firma y
verifica con el mismo mecanismo pero no cobra. Esa decisión sigue siendo
correcta y no se toca.

Lo que estaba mal era lo que colgaba de ella. La página de la reserva mostraba
el panel de simulación —los botones "Simular pago exitoso" y "Simular pago
fallido"— con una sola condición:

```ts
const isLocalGateway = paymentProvider() instanceof LocalProvider;
const showSimulator = isLocalGateway && booking.status === "hold";
```

Y la Server Action que los atiende tenía la misma condición y ninguna otra.

**Producción corre con la pasarela local**, porque las llaves de Stripe nunca
llegaron: `vercel env ls production` no tiene ninguna de las dos y sí tiene
`LOCAL_WEBHOOK_SECRET`. Con `robots.txt` en `Allow: /` y 86 URLs en el sitemap,
eso quería decir que cualquiera que entrara a `adrimarket.vercel.app` podía
reservar, apretar "Simular pago exitoso" y salir con una reserva **confirmada**:
inventario real consumido, correo de confirmación real enviado, cero pesos
cobrados.

La condición no era incorrecta el día que se escribió —en el Sprint 3 la
pasarela local solo existía en desarrollo—. Se volvió incorrecta el día que
producción se desplegó sin llaves, y nada lo dijo, porque nada estaba mirando.

## Decisión

El simulador exige un permiso **propio y explícito**: `PAYMENT_SIMULATOR=si`.

Se introduce `gatewayState()`, que devuelve uno de tres estados y es lo único
que se consulta desde la aplicación:

| Estado | Cuándo | Qué significa |
|---|---|---|
| `stripe` | hay llaves reales | el dinero se mueve |
| `simulator` | pasarela local **y** `PAYMENT_SIMULATOR=si` | desarrollo y la barra |
| `closed` | pasarela local sin ese permiso | nadie cobra y nadie finge |

Tres consecuencias:

1. **El candado va en la Server Action**, no solo en la página. Que el botón no
   se dibuje no es un permiso —una Server Action se invoca por su identificador
   sin pasar por la página—, y el proyecto ya tenía escrito ese invariante:
   *cada acción vuelve a preguntar quién la pide*.
2. **El checkout se cierra en `closed`**, antes de crear nada. Tapar el
   simulador y no hacer esto dejaba un callejón peor de explicar: el huésped
   llenaba sus datos, se creaba un apartado real que ocupaba inventario, y
   aterrizaba en una página sin ninguna forma de pagar hasta que el apartado
   venciera solo. Un catálogo que todavía no puede vender lo dice antes de
   pedir el nombre.
3. **`/api/health` reporta el estado y nunca falla por él.** Los tres son
   configuraciones legítimas: producción sin llaves todavía no puede vender, y
   eso es un hecho, no una avería. Un chequeo que lleva meses en rojo enseña a
   ignorar el rojo. Está ahí para que "¿producción puede cobrar hoy?" no se
   conteste leyendo variables de entorno en el panel de Vercel.

## La alternativa descartada

**Una bandera de "modo producción"** —`NODE_ENV`, `VERCEL_ENV`, o una
`DEV_MODE` propia—. Se descartó por la dirección en la que se rompe.

Una bandera que hay que **quitar** para estar seguro falla abierta: el
despliegue que se olvida de algo queda expuesto, que es exactamente el error
que ya se cometió. Un permiso que hay que **poner** falla cerrado: el
despliegue olvidadizo se queda sin vender, que se nota en un minuto y no le
regala inventario a nadie.

Es la misma razón por la que la pasarela se elige por configuración y no por
una bandera de desarrollo, aplicada un nivel más abajo — donde faltaba.

## Cómo se comprobó

- `gateway-state.test.ts` · cinco casos, incluido que un `PAYMENT_SIMULATOR`
  con cualquier valor que no sea exactamente `si` deja el estado en `closed`.
- `simulator-guard.test.ts` · la Server Action se niega en las dos formas en
  que debe negarse. **Se verificó que falla con el defecto puesto**: restaurada
  la condición vieja, el primer caso se pone en rojo.
- Dos servidores sobre **el mismo build**, uno con la variable y otro sin ella,
  pidiendo la misma reserva en `hold`: el botón aparece una vez en el primero y
  cero veces en el segundo.
- La barra completa en verde, incluido `test:e2e`, que aprieta ese botón en el
  navegador y sigue pasando porque `.env` lleva el permiso.
