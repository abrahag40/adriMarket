# 0025 · Reventa: el catálogo guarda el precio del proveedor

**Fecha:** 2026-11-13 · **Estado:** aceptada; probada en local y en la CI · **Decide:** ZaharDev (Abraham, 2026-11-12)

## Pregunta

ZaharDev Tours revende los tours de Alexis Marin. Alexis define su precio, que
ya trae su ganancia. ZaharDev cobra el 100 % con su propia cuenta de Stripe,
sin Connect. Encima del precio de Alexis se suma su 2.5 % **y la comisión de
Stripe**, para que Stripe no se coma el 2.5 %. Después, ZaharDev le transfiere
a mano el 100 % de su precio.

¿Cómo se pone eso en un motor que cobra exactamente lo que dice el catálogo?

## Decisión

**El catálogo guarda el precio del proveedor, tal como él lo define, y una sola
función de la base calcula el del huésped:** `resale_price(cents, carries_fixed)`
(migración 0026).

```
precio = ⌈ (proveedor × (1 + comisión) + fijo × (1 + IVA)) ÷ (1 − tasa × (1 + IVA)) ⌉
```

Con la configuración de ZaharDev Tours (2.5 %, Stripe al 4.1 % + MXN 3, IVA del
16 % sobre la comisión), una entrada de MXN 1,500 se vende en **1,617.93**.
Después de que Stripe se lleva lo suyo quedan **1,500 para Alexis y 37.50 para
ZaharDev**.

### Por qué en la base y una sola vez

Los precios se leen en seis lugares, varios en SQL y con agregados:

- la tarjeta del listado (`min()` por producto);
- la ficha;
- el selector de opciones del calendario;
- los extras;
- la cotización;
- y, a través de ella, el checkout, el comprobante y los correos.

Una copia de la fórmula en TypeScript y otra en SQL acabarían diciendo números
distintos. La consecuencia sería exhibir un precio y cobrar otro, que es justo
lo que prohíbe el art. 7 Bis de la LFPC.

**Sin `settings.resale`, `resale_price()` devuelve el precio tal cual.**
adriMarket y Conquest no cambian: su barra completa pasa igual.

### Por qué guardar el del proveedor y no el del huésped

- **El panel y la carga de fichas no cambian.** Abraham captura lo que dice
  Alexis, y `zahardev-intake` carga sus fichas tal como llegan.
- **Si Stripe cambia su tasa,** se cambia un renglón de `settings` y no todo el
  catálogo.
- **Se descartó guardar los dos números con un disparador.** Cada escritura
  tendría que decir cuál de los dos está escribiendo. Un `UPDATE` que tocara
  otra columna podría volver a aplicar la comisión sobre un precio que ya la
  traía.

### El cargo fijo, una vez por cobro

Stripe cobra MXN 3 por cobro, no por persona. **Va sólo en el precio
"principal": el de adulto y el del barco.** Toda reserva lleva al menos uno: el
motor no cotiza sin adulto, y un barco siempre lleva su renglón. Niños,
infantes, extras y la cuota de muelle llevan sólo la parte en porcentaje.

Con más de un adulto, el fijo se cobra más de una vez. Esa diferencia es de
ZaharDev; el huésped paga siempre el número que vio por cada persona. La
alternativa, un cargo aparte por reserva, sería un cargo que no se exhibió.

Se redondea **hacia arriba**, al centavo: con el redondeo normal, ZaharDev podría
quedar medio centavo debajo de su comisión.

### Lo que la base no deja hacer en un sitio que revende

| Regla | Por qué | Dónde |
|---|---|---|
| **El anticipo es el 100 %**, diga lo que diga el producto | Un saldo en destino no pasaría por Stripe y el reparto no cuadraría | `resolve_deposit_pct()`; el panel no puede bajarlo (`settings_set_deposit_pct`) |
| **Los impuestos de tour van dentro del precio** | Un impuesto sumado aparte también pasa por Stripe. Medido en local: con IVA encima, una reserva de MXN 3,000 del proveedor deja 50.41 en lugar de 75.00 | `settings_set_resale()` revisa lo que hay; el disparador `tax_rates_resale_guard` cuida lo que llegue |
| **La configuración es posible** | Con la tasa más su IVA en 100 % o más no hay precio que alcance | `settings_set_resale()`, con bitácora |

### Lo que se le debe al proveedor

`quoteTour()` corre el **mismo motor** una segunda vez, con los precios del
proveedor, sin cupón y sin impuestos. Así, las cantidades tienen una sola
definición:

- el infante que no paga;
- los pasajeros incluidos en el barco;
- los extras por lugar ocupado.

El resultado, `supplierCents`, se congela en `bookings.supplier_cents` al
reservar y se actualiza al reprogramar. **Va fuera de `quote` a propósito:**
`quote` viaja al navegador, y esto es el precio neto de Alexis.

## Cómo se prueba

- **Garantía 28** (`db/tests/guarantees.sql`). Sin configuración no cambia nada.
  1,500 da 1,617.93. Se rechazan:
  - el impuesto sumado aparte, al activar y después;
  - el anticipo menor al 100 %;
  - una configuración imposible.

  Y queda bitácora.
- **`src/modules/pricing/resale.test.ts`**:
  - el caso de la tabla de D7, hasta el centavo;
  - la tarjeta, la ficha, el calendario, los extras y el cobro dicen el mismo
    número;
  - **el piso**: en 64 combinaciones de grupo y extras, con tarjeta extranjera y
    mexicana, ZaharDev nunca gana menos del 2.5 %;
  - el barco y el anticipo del 100 %.

  Se vio fallar quitando la fórmula de cada uno de los siete lugares donde se
  aplica, uno por uno.

  Corre dentro de una transacción con una sola conexión: `settings.resale` es
  global, y los archivos de prueba corren en paralelo. La última prueba confirma
  desde otra conexión que nada se escapa.
- **Comprobado a mano contra la base local:** una reserva de un adulto y una niña
  guardó `supplier_cents` = 3,000.00 (1,800 + 1,200) y anticipo del 100 %.

## Lo que queda abierto

- **Un cupón lo absorbe ZaharDev.** El proveedor cobra siempre su precio
  completo, porque así lo decidió Abraham. Un cupón mayor que el margen hace
  perder dinero; la liquidación lo va a enseñar.
- **La cuota de muelle lleva la comisión de ZaharDev,** como todo lo que se le
  paga al proveedor. Es de la marina, así que puede decidirse distinto.
- **Stripe no publica en qué paso redondea.** `gatewayFeeCents()` es un modelo
  (en la tabla de D7, 46.88 contra 46.89 con tarjeta mexicana). La liquidación
  guardará la comisión real de cada cargo.
- **Reprogramar no conserva los extras ni el cupón.** Es un defecto anterior a
  esta decisión: `reschedule.ts` vuelve a cotizar sin ellos. Está anotado aparte.
