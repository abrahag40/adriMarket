# 0004 · Un cupón agotado se trata como inventario, no se degrada en silencio

**Estado:** decidido · **Sprint:** post-7 (canje de cupones en el checkout) ·
**Decide:** Developers

## Pregunta

Cuando dos huéspedes intentan canjear al mismo tiempo el último uso disponible
de un cupón con `max_redemptions`, ¿qué le pasa al que pierde la carrera? ¿Su
reserva se cae, o se completa igual mostrando que no aplica ya el cupón?

## Contexto

- `coupons.redemptions <= coupons.max_redemptions` es una restricción de la
  base desde el Sprint 3 (`coupons_redemptions_ok`); nunca se había canjeado
  nada, así que nunca se había ejercitado bajo concurrencia real.
- El canje ocurre dentro de la misma transacción que aparta el inventario
  (`createBookingWithHold`), igual que el cupo de un tour o las fechas de una
  estancia — mismo patrón, función nueva (`coupon_redeem`, ver
  `db/migrations/0014_coupon_redemption.sql`) con el mismo mecanismo de
  `for update` que `tour_hold_create`.
- Ese mismo módulo ya tiene una regla escrita para el cupo y las fechas: si el
  apartado falla, **no queda una reserva a medias** — la transacción entera se
  revierte y el huésped recibe un error honesto (AM001/AM002) para
  reintentar.

## Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **A. Tratar el cupón como el cupo o las fechas: si se agotó, la reserva entera falla (AM004)** | Un solo mecanismo para las cuatro categorías de inventario que compiten en el checkout. Nada que aprender de nuevo | El huésped pierde lo que ya llenó del formulario por perder la carrera de un descuento, no de la disponibilidad real |
| **B. Degradar en silencio: si el cupón se agotó a último momento, la reserva se completa sin el descuento** | Nunca se le niega al huésped el tour o la casa por un cupón | Exige recalcular la cotización **dentro** de una transacción que ya insertó filas con el total anterior, con un `savepoint` y una segunda composición de precio a medio camino. Mucho más código para un caso que en este volumen de negocio es raro: dos personas canjeando el último uso del mismo código en el mismo segundo |

## Decisión

**Opción A.** Un cupón agotado en la carrera final se comporta exactamente
igual que un cupo o unas fechas que se acaban de ocupar: la transacción entera
se revierte, `rethrowDomainError` lo traduce a `InventoryUnavailableError` con
código `AM004`, y el checkout le dice al huésped que ese cupón ya se agotó
(`t.couponRedeemedOut`). Puede reintentar de inmediato, con o sin el cupón.

**La diferencia con un código simplemente inválido o vencido queda intacta.**
Esos casos se resuelven mucho antes, en `resolveCoupon` (`service.ts`), sin
tocar la base más que una lectura: la reserva se completa al precio completo,
sin bloquear a nadie. Solo la carrera genuina —el cupón que sí tenía lugar
cuando se cotizó y ya no lo tiene cuando se paga— usa el camino de error.

## Por qué

1. **Consistencia.** Las cuatro categorías de inventario que compiten en este
   checkout —cupo de tour, fechas de estancia, anticipo efectivamente cobrado,
   y ahora el cupón— usan el mismo lenguaje de error (AM00x) y el mismo
   contrato: si algo se agotó entre la cotización y el pago, se dice la
   verdad y se pide reintentar. Un quinto comportamiento distinto solo para
   cupones sería una excepción que alguien va a tener que recordar.
2. **El caso es raro y el costo de equivocarse es bajo.** Perder la carrera
   por el último uso de un cupón exige que dos huéspedes lo canjeen en la
   misma ventana de milisegundos entre la cotización y el commit. Reintentar
   sin el cupón —o con uno que ya no aplica y así se lo dice la página— es una
   fricción menor comparada con la complejidad de recomponer un precio a
   medio camino de una transacción.
3. **No se inventa un mecanismo nuevo.** `for update` + una excepción con
   `errcode` es exactamente lo que ya hace `tour_hold_create` desde el
   Sprint 0. Reutilizar el patrón es lo que permitió escribir `coupon_redeem`
   en unas quince líneas.

## Consecuencias

- `InventoryUnavailableError` gana un cuarto código, `AM004`, en
  `src/modules/availability/holds.ts` — mismo tipo, mismo mensaje para el
  huésped, mismo camino de traducción que ya existía.
- La prueba de la carrera vive en `checkout.test.ts` con la misma técnica que
  ya prueba el cupo de un tour (`Promise.allSettled` de dos intentos reales
  contra la misma fila), y por separado en `db/tests/guarantees.sql` #23,
  que prueba `coupon_redeem` de forma aislada y determinista.

## Qué se rechazó explícitamente

Recalcular la cotización sin el cupón dentro de la misma transacción cuando el
canje falla (opción B). Habría exigido un `savepoint` alrededor de
`coupon_redeem`, una segunda llamada a `buildStayQuote`/`buildTourQuote` con
los datos que ya se leyeron antes de abrir la transacción, y reescribir la
fila de `bookings` que ya se había insertado con el total con descuento. El
volumen de negocio de este proyecto no justifica esa complejidad todavía; si
algún día el dato de no-shows o de reclamos dice lo contrario, este documento
es el punto de partida.
