# Arquitectura

Registro de las decisiones tomadas y por qué. La versión presentable de este
documento, con diagramas, está publicada como página:
<https://claude.ai/code/artifact/5835f56f-8d43-4e4d-a5c3-f235dc06eeae>

## El producto en una frase

Tres capas que suelen venir en tres productos distintos: la vitrina (Airbnb),
el checkout (Shopify) y la operación de inventario y tarifas (CloudBeds). La
vitrina y el checkout se construyen a medida. La capa de operación es donde
vive la complejidad real y donde un error cuesta dinero.

## Decisiones

### Un monolito modular, no microservicios

Una sola aplicación Next.js en TypeScript sirve la vitrina pública y el panel
`/admin`, con módulos de dominio internos y frontera explícita entre ellos
(cada módulo expone funciones, no tablas). Un despliegue, una sesión, una base
de datos. Con este volumen, separar servicios agrega operación sin resolver
nada; la disciplina de módulos deja la puerta abierta a separarlos cuando
exista una razón medible.

### PostgreSQL, y no es negociable

Es la única pieza sin alternativa. Los tipos de rango de fechas, las
restricciones de exclusión y las transacciones son lo que convierte la
sobreventa en algo imposible en lugar de improbable. Una base sin rangos ni
transacciones haría de la doble reserva un problema permanente de la
aplicación.

### Un núcleo compartido, dos inventarios separados

El eje de reutilización es la decisión de diseño más importante del proyecto:

- **Se comparte todo lo posterior a elegir:** reserva, pax, pagos, cupones,
  avisos, bitácora, panel. Un tour y una estancia producen el mismo expediente.
- **Se separa lo que decide disponibilidad y precio:** ahí las reglas no se
  parecen. Cada inventario implementa la misma interfaz —consultar, cotizar,
  apartar, liberar— y el checkout no sabe cuál está usando.

Forzar los dos en una sola tabla de "producto reservable" termina en columnas
nulas y condicionales; construirlos como dos sistemas duplica todo el núcleo.

### El SQL manda, los tipos se generan

Ver [README](../README.md#por-qué-el-sql-se-escribe-a-mano).

### La reserva se confirma con el webhook, no con el navegador

El huésped puede cerrar la pestaña o perder señal. La confirmación llega por
webhook firmado y se procesa de forma idempotente: `payment_events` guarda el
id del evento del proveedor con restricción única, y `booking_confirm()` no
hace nada si la reserva ya está confirmada. El mismo evento diez veces produce
una reserva, un saldo y dos avisos — probado.

### Los avisos se encolan en la misma transacción

Bandeja de salida transaccional (`outbox`). Confirmar la reserva y encolar sus
correos ocurre en el mismo commit; el envío lo hace un worker con reintentos.
Un proveedor de correo caído retrasa la confirmación, no la pierde.

## Alcance definido con el cliente

Tres respuestas recortaron el alcance de forma concreta:

| Pregunta | Respuesta | Consecuencia |
|---|---|---|
| ¿Inventario propio o de terceros? | **Propio** | Sin proveedores, sin reparto de ingresos, sin estados de cuenta. El modelo queda notablemente más chico. |
| ¿Porcentaje de anticipo? | **Editable** | Se resuelve en tres niveles y se congela por reserva (ver abajo). |
| ¿Siguen en Airbnb o Booking? | **No, solo administración interna** | Fuera la sincronización iCal y el channel manager completo. |

### El anticipo editable, en tres niveles

1. **Global:** `settings.deposit.default_pct`, editable desde el panel sin
   redeploy.
2. **Por producto:** `products.deposit_pct` sobreescribe el global. Un tour de
   medio día y una villa de una semana no justifican el mismo compromiso.
3. **Por reserva:** `bookings.deposit_pct` guarda el valor **congelado** al
   momento de reservar. Cambiar la configuración después no altera reservas ya
   tomadas.

`resolve_deposit_pct(product_id)` implementa la cascada. Verificado en las
pruebas: el tour hereda 30% del global, la casa aplica su 40% propio.

## Lo que sigue

La capa de datos está construida y probada. Falta, en este orden:

1. **Motor de cotización** sobre `stay_nightly_rates` y `tour_pax_prices`:
   impuestos, cupones, huésped extra, descuento por estancia larga. Una sola
   función autoritativa en el servidor; el navegador nunca suma.
2. **Andamiaje de la aplicación:** Next.js, sesión de staff y de huésped,
   sistema de diseño, rutas `/es` y `/en`.
3. **Checkout con Stripe:** anticipo, webhook firmado, `booking_confirm`.
4. **Worker:** expiración de holds cada minuto, envío de la bandeja de salida,
   recordatorios a 72 y 24 horas.
5. **Panel mínimo:** reservas, calendario, bloqueos, cobro del saldo.

## Riesgo abierto: el no-show

Cobrar solo el anticipo traslada al cliente el riesgo de que nadie llegue. El
modelo ya soporta las tres mitigaciones, pero son decisión de negocio y hay que
definirlas con números reales:

- anticipo no reembolsable, con política aceptada en el checkout
  (`cancellation_policies.deposit_refundable`);
- tarjeta guardada para cargar penalización o saldo (`payments.purpose =
  'penalty'`);
- recordatorios automáticos a 72 y 24 horas, que es la medida más barata y la
  que más funciona.
