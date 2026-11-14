# 0024 · Las páginas públicas se sirven desde una caché en R2

**Fecha:** 2026-11-13 · **Estado:** aceptada y medida en workers.dev · **Decide:** ZaharDev

## Pregunta

En Cloudflare Workers ([decisión 0023](0023-cloudflare-workers.md)), el plan
gratuito da 10 ms de CPU por petición y Cloudflare corta con `error code: 1102`
lo que se pasa. ZaharDev todavía no tiene capital para Workers Paid (USD 5 al
mes). ¿Se puede caber en el plan gratuito sin romper nada?

## Dónde se iba la CPU (medido, una ruta por minuto)

| Ruta | CPU p50 en caliente | p99 (arranques en frío) |
|---|---|---|
| `/robots.txt` (casi nada) | 3.4 ms | 115 ms |
| `/api/health` (consultas, sin página) | 7.8 ms | 46 ms |
| `/es` (la portada) | **27 ms** | 147 ms |
| Ficha de tour | **45 ms** | 164 ms |

La base cuesta poco (unos 5 ms). Lo caro es armar el HTML con React, de 3 a 4
veces el tope. Optimizar el render no iba a bajar a la tercera parte; dejar de
armar la misma página para cada visitante, sí.

## Decisión

**Las páginas públicas se guardan armadas en R2** y se sirven desde ahí:
`src/edge/page-cache.ts`, conectado en `worker.ts` y probado en
`page-cache.test.ts`.

- **Qué se guarda.** Una lista cerrada: la portada y sus listados, destinos y
  las fichas, sólo con GET. Nunca el checkout, los extras, una reserva, el
  panel, la API ni las fotos. Una ruta nueva no entra por accidente.
- **La llave.** Lleva el id del despliegue (`CF_VERSION_METADATA`), una
  **versión del catálogo**, la URL con su consulta y las cabeceras por las que
  Next varía (`rsc` y `next-router-*`).
- **Cuándo deja de valer.** Toda escritura que salió bien (código < 400) sube
  la versión **antes de responder**. Eso incluye una reserva, un pago, una
  acción del panel y el latido. La ficha enseña los lugares que quedan, y así
  el cupo nunca queda viejo.
  - Una escritura fallida no invalida. Si invalidara, cualquiera podría vaciar
    la caché con un POST basura y devolvernos al límite de CPU.
  - Ninguna copia se sirve con más de 10 minutos, por si alguien cambia la base
    a mano con `prod:sql`, que no pasa por aquí.
- **La carrera.** La llave se calcula **antes** de armar la página. Una página
  armada con datos de antes de una reserva queda guardada con la versión
  anterior y nunca se sirve. Hay una prueba que lo demuestra, y se vio fallar
  con el defecto puesto.

## Lo medido (2026-11-13, workers.dev, plan gratuito)

| | Antes | Con la caché |
|---|---|---|
| Portada, CPU p50 | 27 ms | **1.0 ms** |
| Ficha de tour, CPU p50 | 45 ms | **1.0 ms** |
| Cortes 1102 en ráfagas de un minuto por ruta | 5 de 128 (portada), 10 de 61 (ficha) | **0 de 506** |
| Cortes 1102 durante la barra completa | 38 de 1,097 | **0 de 697** |
| `audit` | ✘ al azar | **38 ✔** |
| `smoke.sh` y los cuatro recorridos | — | 169 · 20 · 18 · 25 · 30 ✔ |

`scripts/cpu-cloudflare.mjs <worker> [horas]` cuenta los cortes con la analítica
de Workers. Después de desplegar la caché, cero.

## Lo que la caché NO resuelve, dicho claro

El checkout, los extras, el panel y el latido no se pueden guardar, y siguen
pasando de 10 ms: p75 de 31 ms y p90 de 112 ms durante la barra. Cloudflare los
toleró en esta medición, pero no hay garantía. Un 1102 en el checkout es un
turista que no pudo pagar. Por eso:

- **Se lanza en el plan gratuito y se mide.** `cpu-cloudflare.mjs` sale en rojo
  con el primer corte; en la medición diaria, ese rojo es la señal para
  contratar Workers Paid.
- **Workers Paid se contrata cuando el rojo aparezca** o cuando las primeras
  comisiones lo cubran (unas 3 ventas al mes), lo que pase primero.

## Costos

R2, capa gratuita: 10 millones de lecturas (clase B) y 1 millón de escrituras
(clase A) al mes. Cada página servida desde la caché lee dos objetos (la versión
y la página): unos 5 millones de visitas al mes antes de pagar. Cada página
armada y cada escritura del sitio son una escritura de R2. Lo guardado vence a
los 2 días por una regla del bucket (`borrar-paginas-viejas`, prefijo
`paginas/`).

## Alternativas descartadas

- **`caches.default`, la caché de Cloudflare.** Es por centro de datos. Con pocas
  visitas, cada visitante cae en un centro distinto y casi nunca acierta.
  Además, borrar una entrada sólo la borra de un centro: no hay forma de
  invalidar en todo el mundo cuando cambia el cupo.
- **ISR de Next con la caché incremental de OpenNext.** Las páginas leen
  `searchParams`, y en Next 15 eso las vuelve dinámicas siempre. Habría que
  rehacer las rutas para separar lo estático de lo que depende de la consulta.
- **Cargar el servidor de Next al arrancar el Worker**, para sacar el arranque
  en frío (~110 ms) de la primera petición. No ataca el costo de armar la
  página en caliente, que es el que corta, y Cloudflare no documenta si el
  arranque cuenta contra los 10 ms. Queda anotado por si los cortes vuelven
  en lo que no se puede guardar.
