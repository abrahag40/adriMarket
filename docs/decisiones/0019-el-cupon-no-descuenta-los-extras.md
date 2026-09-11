# 0019 · El cupón no descuenta los extras, pero los extras cuentan para el mínimo

**Fecha:** 2026-09-10
**Estado:** aceptada

## Contexto

Los tours se venden con complementos: una tirolesa, un kayak, un buffet de
tacos. Hasta hoy no existían en el esquema —`grep -niE "addon|extra|upsell"`
sobre las migraciones solo devolvía `extract(...)` y `extra_guest_fee_cents`—
y la agencia los cobraba por fuera.

La petición fue un paso de venta antes del checkout: una lista de casillas, el
total que sube conforme se marcan, y el detalle arrastrado hasta el resumen de
"Confirma tu reserva".

Eso deja cuatro preguntas de negocio, y una de ellas se discutió a fondo.

## Lo que se decidió, y lo que no se construyó

| Pregunta | Respuesta |
|---|---|
| ¿Tienen cupo? | **No.** Nada que apartar, nada que sobrevender. |
| ¿Por persona o por reserva? | **Por persona**, y la persona es el **lugar ocupado**. |
| ¿Llevan impuestos? | **Sí**, sobre su importe completo. |
| ¿El cupón los descuenta? | **No por omisión**, y se puede invertir por cupón. |

**Por persona significa por lugar que consume cupo.** La cantidad de un extra
es `seatsNeeded`, el mismo número que ya calcula el motor de precios leyendo
`counts_toward_capacity`. Un infante que va en brazos no ocupa asiento y
tampoco sube a la tirolesa: es el único criterio que este dominio ya tenía para
distinguir a un participante de un acompañante, y reusarlo evita inventar un
segundo.

**No se construyó el cobro por reserva** (un fotógrafo privado, un transporte
para el grupo). Sería una columna y una regla de cálculo más. No se agregó
porque nadie la pidió y porque una columna con un solo valor posible es ruido
que hay que explicar.

**Tampoco se construyó el cupo.** Si un día hay ocho kayaks, apartarlos exige
el mismo aparato transaccional que los lugares de una salida —bloqueo de fila,
garantía en la base, prueba de concurrencia— y eso no se improvisa encima de
esto.

## La decisión de fondo: el cupón no descuenta los extras

Fue la única que se debatió, porque el argumento en contra es bueno.

**El argumento a favor de descontarlos**, dicho en su versión más fuerte: el
huésped no lee renglones, lee el número de abajo. Si el cupón dice "15% de
descuento" y el total baja menos de lo que esperaba, hemos vuelto a construir
exactamente la herida que cerró la
[decisión 0014](0014-un-cupon-que-no-se-aplica-detiene-la-reserva.md) — pedir
un descuento, pagar de más, y enterarse después.

Ese argumento es cierto. Lo que no se sostiene es la conclusión.

**1. La aritmética del margen: el upsell se anularía a sí mismo.**

Tour para dos adultos a $1,200, tirolesa a $450 por persona, cupón del 15%:

| | Cupón solo al tour | Cupón a todo |
|---|---|---|
| Tour | $2,400 | $2,400 |
| Tirolesa × 2 | $900 | $900 |
| Descuento 15% | −$360 | −$495 |
| **Diferencia** | — | **$135** |

Si la agencia le compra esa tirolesa al operador a $400 y la vende a $450, en
esas dos personas gana **$100**. El descuento sobre el extra sería **$135**.
Vender la tirolesa con cupón **le costaría dinero**. No le bajaría el margen:
lo volvería negativo, en una función que existe para subirlo.

La condición honesta: esto vale cuando el extra es **reventa** de un tercero.
Si lo produce la agencia —el buffet lo cocinan ellos, el guía ya está en
nómina— el margen es holgado y el argumento se debilita. Por eso la decisión
es reversible por cupón, ver abajo.

**2. El cupón se ganó antes de que el extra existiera.** El cupón es un
instrumento de captación: se emite para que el huésped elija *este* tour y no
otro. Cuando llega al paso de extras esa decisión ya está tomada. La tirolesa
la elige después, a un precio que vio y aceptó. Descontarla no es cumplir una
promesa: es una promesa que nadie hizo.

**3. Un rincón chico pero real.** Un cupón de monto fijo se topa al subtotal
(`Math.min(coupon.value, subtotal)`). Un "$500 de bienvenida" sobre un snorkel
de $300 hoy entrega $300; con un extra de $450 en la base entregaría los $500
completos. Es angosto —solo muerde cuando el subtotal queda bajo el valor del
cupón— pero es dinero que sale por una puerta que nadie abrió a propósito.

### Y sin embargo el huésped tenía razón en algo

**La herida de la 0014 fue el silencio, no la regla.** Así que la regla se
mantiene y el silencio se quita:

- La línea del descuento **dice su alcance**: "Cupón AGOSTO15 · solo el tour",
  no "Cupón AGOSTO15". Solo cuando hay extras en la cotización: en una reserva
  sin extras la aclaración sobraría y el renglón se lee como siempre.
- El paso de extras lo advierte **antes** de que se marque la casilla.

Nadie se sorprende, y no se paga con margen.

## Los extras sí cuentan para el mínimo del cupón

Leyendo `applyCoupon` apareció que la intuición traía **dos ideas pegadas** que
el código no podía separar: *recibir* el descuento y *contar* para
`min_total_cents`. Las dos salían del mismo subtotal, así que poner los extras
antes o después de la llamada decidía ambas a la vez.

La mejor combinación es una de cada una: **los extras cuentan para el mínimo y
no reciben el descuento.** Así "válido en compras mayores a $3,000" se vuelve
*una razón para agregar la tirolesa* en lugar de un obstáculo. El upsell empuja
al cupón en vez de que el cupón se coma al upsell.

Costó un parámetro:

```ts
applyCoupon(descontables, coupon, { minimoSobre: todasLasLineas })
```

`minimoSobre` cae por omisión en `descontables`, así que el camino de las
estancias —que no tiene extras— no cambia de comportamiento ni una línea.

## La reversa, sin redespliegue

`coupons.applies_to_extras boolean not null default false`.

El día que el cliente quiera "10% en todo, fin de temporada", es un valor en
una fila. Las restricciones de cupón hoy ya se configuran a mano en la base
—está declarado en la deuda de `CLAUDE.md`—, así que esto no estrena un
mecanismo, se suma al que hay. Y como el cupón se congela en la cotización,
ninguna reserva vieja se mueve al cambiarlo.

Se prefirió una columna propia a extender el `applies_to jsonb` existente:
ese campo significa **a qué productos** aplica el cupón, y meterle una tercera
idea lo vuelve un cajón.

## La alternativa descartada

**Descontar los extras como cualquier otra línea** —empujarlos antes de
`applyCoupon` y no tocar nada más—. Era dos líneas de código, una regla sola
que no hay que explicar, y el total que el huésped espera.

Se descartó por la aritmética de arriba: en el caso normal —un extra revendido
con margen delgado— la agencia pierde dinero por cada extra que vende bajo
cupón. Una función de upsell que baja el margen no es un upsell.

## Lo que se acepta a cambio

- **El anticipo sube con los extras.** `close()` deriva el anticipo del total,
  así que una tirolesa de $900 agrega ~$270 a lo que se paga en línea hoy. Es
  bueno para el flujo de caja y es fricción justo en el momento del upsell. Se
  deja así: cualquier excepción exige una segunda base de cálculo para algo
  que todavía no sabemos si se vende.
- **Los extras se dan de alta a mano en la base**, como las restricciones de
  cupón. El panel los **muestra** en el detalle de la reserva —el guía necesita
  saber que lleva dos kayaks— pero todavía no los edita.
- **No se pueden agregar en el mostrador**, que es donde más se venderían. El
  sistema ya cobra el saldo ahí; falta la acción en el panel y el recálculo.
  Queda como deuda declarada, no como olvido.
