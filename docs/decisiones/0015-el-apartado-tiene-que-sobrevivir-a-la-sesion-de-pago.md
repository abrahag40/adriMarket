# 0015 · El apartado tiene que sobrevivir a la sesión de pago

**Fecha:** 2026-09-08
**Estado:** aceptada

## Contexto

Al auditar la integración de Stripe —que **nunca se ha ejecutado contra
Stripe**, y el propio archivo lo advierte desde el Sprint 3— apareció un
desajuste que no está en ningún documento:

| | |
|---|---|
| Sesión de pago de Stripe | **mínimo 30 minutos**, impuesto por la API |
| Apartado de inventario | **15 minutos** |

El comentario del código declaraba el invariante correcto y la línea de abajo lo
violaba:

```ts
// El anticipo expira con el apartado: una sesión que sobrevive al hold
// permitiría pagar por fechas que ya se liberaron.
expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
```

Treinta a mano, mientras el apartado duraba quince.

### Lo que pasaba en esa ventana

Se reprodujo antes de escribir nada:

```
estado de la reserva: expired
LANZÓ: booking_confirm → AM003   → la ruta responde 500

RASTRO EN LA BASE tras el pago:
  pagos registrados:   0
  eventos registrados: 0
```

1. El huésped paga en el minuto 20.
2. El latido ya venció el apartado en el 15 y liberó el inventario.
3. El webhook registra el pago —el dinero es real— y llama a `booking_confirm`.
4. `booking_confirm` rechaza con `AM003`: la reserva está en `expired`, no en
   `hold`.
5. La excepción tumba la transacción entera, **borrando el registro del pago y
   hasta el del evento**.
6. La ruta no atrapa nada: responde `500`. Stripe reintenta durante tres días,
   fallando idéntico.

Resultado: el huésped sin reserva, el dinero cobrado, y **ni un renglón en la
base que lo mencione**. Solo Stripe lo sabe. `/api/health` no lo ve porque no
quedó nada que ver.

**Y no sería raro.** Quince minutos es poco para un pago real: buscar la
tarjeta, el 3-D Secure, la app del banco, una distracción. Hoy no ocurre solo
porque el simulador local es instantáneo — **aparece el día que se conecte
Stripe**.

## Decisión

**Dos arreglos, porque son dos problemas distintos.**

### La causa: el apartado dura más que la sesión

- `hold_minutes` por omisión pasa de 15 a **35**: los 30 que exige Stripe más
  margen para el desfase de reloj y para que el webhook llegue, que no es
  instantáneo.
- `HOLD_MINUTES_MINIMO = 30` sube cualquier ajuste menor. Un valor mal puesto
  no debe reabrir la ventana en silencio.
- `expires_at` **deriva del vencimiento real del apartado**, que ahora viaja en
  `DepositRequest`. La pasarela no inventa plazos; recibe el que rige.

### La red: un pago tardío nunca se pierde

Aunque el apartado dure más, un webhook demorado o una cancelación en el
intervalo pueden traer el dinero cuando la reserva ya no está. Ahora
`booking_register_late_payment` (migración 0022):

- registra el pago —**el dinero que entró se anota siempre**—;
- abre su devolución en `/admin/reembolsos`, como cualquier otra;
- lo deja en la bitácora de la reserva;
- avisa a la administración con un correo que dice qué hacer, en el orden en
  que hay que hacerlo, porque quien lo lee está en el mostrador;
- y el webhook responde **200**, para que el proveedor deje de reintentar algo
  que ya se atendió.

**No confirmar sigue siendo lo correcto** —el inventario pudo venderse a otro—.
Perder el rastro no lo es nunca.

Es la convergencia de dos trabajos del mismo día: el panel de devoluciones que
se construyó esta misma sesión resultó ser exactamente donde debía aterrizar un
pago que llegó tarde.

## La alternativa descartada

**Dejar el apartado en 15 y confiar en la red.** Técnicamente cierra el agujero
contable: el pago se registra y se devuelve. Se descartó porque convierte en
rutina lo que debe ser una excepción — se le cobraría a gente que no va a tener
reserva, con la comisión de la pasarela perdida en cada ida y vuelta, y una
llamada incómoda por cada una. La red existe para lo que se escapa, no para lo
que se puede prevenir.

## Dos defectos vecinos, encontrados al tirar del mismo hilo

**La página le mentía al huésped sobre su prisa.** `holdMinutes={15}` estaba
hardcodeado en dos lugares del checkout, desconectado del ajuste: aunque alguien
configurara otro valor, la página seguía prometiendo quince. Ahora sale de la
misma función que lo aplica al crear el apartado.

**Una prueba documentaba el silencio como virtud.** Existía *"el pago llega
tarde: debe fallar ruidosamente en lugar de resucitar una reserva cuyo
inventario ya se revendió"*. La primera mitad era cierta y se conserva. La
segunda era falsa: lanzar no fallaba ruidosamente, fallaba en el peor silencio
—borrando el rastro del dinero—. La prueba se reescribió **en su lugar**, y su
cuerpo explica por qué cambió de intención.

## Cómo se comprobó

- **Se reprodujo el defecto a mano antes de arreglarlo**, y la salida está
  arriba: `pagos: 0, eventos: 0`.
- La prueba reescrita cubre las dos mitades: que la reserva **no** se resucita, y
  que quedan las tres huellas del dinero —pago, devolución pendiente y aviso—,
  más que el reintento del proveedor no duplica nada.
- Barra completa sobre base recreada desde cero: 22 migraciones, 25 garantías,
  179 pruebas de integración, 129 criterios de smoke, el recorrido del checkout
  y 31 comprobaciones de auditoría.
- Y se agregó `npm run probar:stripe`, que ejercita la API **real** con llaves
  de prueba: crea la sesión, comprueba que `expires_at` es el del apartado y no
  uno inventado, y pasa por el verificador una firma legítima, una alterada y
  una vieja. **Se niega a correr sin llaves de Stripe**, igual que
  `probar:correo` se niega con el transporte local: una comprobación que no
  puede fallar no comprueba nada.

## Lo que hay que hacer en producción

El seed no se corre allá, así que el ajuste sigue en el valor viejo — la misma
trampa que dejó el aviso a la administración sin destinatario. El código se
defiende solo con `HOLD_MINUTES_MINIMO`, pero eso es la red, no la intención:

```bash
npm run prod:sql -- db/arreglos/apartado-35-minutos.sql
```
