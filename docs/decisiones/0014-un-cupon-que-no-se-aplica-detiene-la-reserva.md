# 0014 · Un cupón que no se aplica detiene la reserva

**Fecha:** 2026-09-07
**Estado:** aceptada

## Contexto

La primera corrida de CI que llegó hasta las pruebas de integración destapó un
fallo **intermitente**: la prueba de la carrera por el último canje de un cupón
—dos reservas simultáneas, un solo canje disponible— a veces pasaba y a veces
reportaba que **las dos** se habían quedado con el cupón.

No era ruido. Era una contradicción que llevaba tiempo escrita en el
repositorio, manifestándose según el momento.

Convivían dos pruebas con intenciones opuestas:

| Prueba | Qué afirmaba |
|---|---|
| *"la que pierde la carrera recibe un no honesto (AM004)"* | un cupón no aplicable **detiene** la reserva |
| *"un código que no existe no bloquea la reserva: se cobra el precio completo"* | un cupón no aplicable **sigue en silencio** |

El código implementaba la segunda. `resolveCoupon` comprueba el cupón durante
el presupuesto —fuera de cualquier bloqueo— y ante un rechazo devuelve
`{ ok: false, reason }` **sin lanzar**; `createBookingWithHold` seguía adelante
con `couponId` en nulo.

De ahí la intermitencia, y de ahí el orden de los sucesos que importa:

- Si los dos presupuestos corren **antes** de que el primero confirme, las dos
  reservas ven el cupón disponible, las dos llegan a `coupon_redeem`, y el
  `SELECT … FOR UPDATE` rechaza a la segunda con **AM004**. La prueba pasaba.
- Si el segundo presupuesto corre **después**, ve el cupón agotado, se queda
  sin descuento y **la reserva se completa igual, a precio lleno**. Ganaban las
  dos. La prueba fallaba.

Lo grave no es el fallo de la prueba: es el segundo caso. **Un huésped escribe
un código esperando un descuento, se le cobra el precio completo y nadie se lo
dice.** Se entera cuando le llega el comprobante. Eso es material de
contracargo.

## Decisión

**Un cupón que el huésped pidió y no se pudo aplicar detiene la reserva, con su
motivo.** Vale para las siete razones de rechazo —`not_found`, `expired`,
`not_yet_valid`, `wrong_product`, `redeemed_out`, `currency_mismatch`,
`min_total`—, sin casos especiales.

- `QuoteErrorCode` estrena `coupon_rejected`, con la razón en `params.reason`.
- `createBookingWithHold` lo lanza **antes de abrir la transacción**, así que
  no queda ni una reserva a medias.
- El checkout traduce la razón: el huésped lee *"Ese cupón ya se agotó"*, no
  *"No pudimos crear tu reserva"*. Los siete mensajes ya existían en español e
  inglés desde que existe el campo de cupón; lo único que faltaba era llegar a
  ellos.

Es el mismo trato que ya recibían las otras tres categorías de inventario
(AM001-3), y lo que la [decisión 0004](0004-cupon-agotado-es-inventario.md)
declaró desde el principio: un cupón agotado es inventario. Quien no puede
completar no se completa a medias — recibe un no claro y decide.

Lo que se acepta a cambio: un error de dedo en el código obliga a corregir el
campo antes de reservar. Es un costo real y es el correcto: el huésped ve el
mensaje que explica qué pasó, y sigue.

## La alternativa descartada

**Detener solo cuando el cupón se agotó**, y seguir ignorando en silencio los
códigos inexistentes o vencidos. Cubría la carrera de la prueba y era más
indulgente con los errores de dedo.

Se descartó porque deja **dos comportamientos distintos que hay que explicar**,
y porque el daño es el mismo en los dos casos: al huésped se le cobra más de lo
que esperaba sin avisarle. Una sola regla se recuerda; dos se confunden.

## Las dos pruebas, después

**La que documentaba el comportamiento viejo se reescribió, no se borró**, y
dice en su cuerpo por qué cambió de intención. Una prueba que cambia de bando
sin explicarse es una trampa para quien la lea en seis meses.

**La de la carrera acepta ahora los dos caminos al mismo "no"**, que es lo que
la vuelve estable:

- presupuesto **antes** de que el primero confirme → llega a `coupon_redeem` y
  el `FOR UPDATE` la rechaza → `InventoryUnavailableError` **AM004**;
- presupuesto **después** → ya lo ve agotado y se detiene antes de la
  transacción → `QuoteError` **coupon_rejected / redeemed_out**.

Los dos son correctos. Exigir solo el primero era lo que volvía intermitente la
prueba: afirmaba un detalle de temporización en vez del invariante. Lo que se
comprueba ahora es lo que de verdad importa — que la que pierde recibe un no
que menciona el cupón agotado, y que el contador nunca pasa del máximo.

## Cómo se comprobó

- **20 corridas seguidas** de `checkout.test.ts` sin un solo fallo. Antes
  fallaba aproximadamente una de cada tres.
- Barra completa sobre base recreada desde cero: 21 migraciones, 25 garantías,
  179 pruebas de integración, 129 criterios de smoke y 31 de auditoría.
- El sistema de tipos ayudó: el `switch` de `describeQuoteError` es exhaustivo,
  así que agregar el código nuevo **no compiló** hasta traducirlo. Un error que
  el huésped nunca podría haber leído no llega a producción.
