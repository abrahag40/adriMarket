# Sprint 2 · semanas 3–4 · refinamiento

> **Sprint Goal propuesto**
> El visitante ve disponibilidad y precio exactos para sus fechas y su número de
> personas, antes de dar un solo dato.

**Pronóstico de capacidad:** 22 puntos (*yesterday's weather* — es lo que el
equipo terminó en el Sprint 1, no una meta).
**Trabajo refinado y listo:** 24 puntos en seis elementos.

Los 24 puntos exceden el pronóstico a propósito: **la selección la hacen los
Developers en el Planning**, no este documento. Los elementos están en orden de
prioridad del PO, así que lo que sobra se corta por abajo. El plan de release
estimaba 21 puntos para este sprint; al refinar aparecieron dos criterios que no
estaban a la vista —restricciones de estancia y la zona horaria en el cálculo de
"hoy"— y eso lo sube a 24. Refinar sirve justamente para descubrir eso antes de
comprometerse.

Este es el sprint donde el sistema empieza a decir cifras que alguien va a
pagar. La barra de verificación sube en consecuencia.

---

## Antes del Planning: tres decisiones

Ninguna es técnica. Las tres bloquean criterios de aceptación, así que sin ellas
los elementos afectados **no cumplen la Definition of Ready**.

| # | Decisión | Dueño | Fecha límite | Qué bloquea |
|---|---|---|---|---|
| 1 | ¿Los precios se muestran con impuestos incluidos o se agregan al final? | PO | antes del Planning | S2-1, S2-2 |
| 2 | ¿Sobre qué base se calcula cada impuesto? ¿El IVA va sobre el subtotal, o sobre subtotal + ISH? | PO con el contador | antes del Planning | S2-1 |
| 3 | Tarifas y temporadas reales del año | PO / SME | antes del Planning | S2-1, S2-3 |

**Recomendación sobre la 1:** mostrar el precio con impuestos incluidos y el
desglose desplegable. En México la ley de protección al consumidor obliga a
exhibir precios totales al consumidor, y el turista nacional lo espera así. El
esquema ya lo soporta con `tax_rates.included_in_price`, así que la decisión no
cuesta trabajo — cuesta acordarla.

**Sobre la 2**, vale la pena insistir: es una pregunta de dos minutos para el
contador y de una migración con reservas vivas si se descubre después. El
sistema no puede adivinar el orden de las bases gravables, y equivocarse
significa cobrar de menos o de más en cada reserva.

---

## Hallazgo del refinamiento: el descuento por estancia larga no tiene esquema

El plan de release mencionaba "descuento por estancia larga" dentro del motor de
precios. Al revisar el esquema, **no existe**: `stay_rates` tiene tarifa por
noche, temporada, día de la semana y mínimo de noches, pero nada que exprese
"7 noches, 10% menos".

Tres caminos:

| Opción | Costo | Consecuencia |
|---|---|---|
| **A. Fuera del MVP** (recomendada) | 0 | Es una palanca comercial, no un requisito para vender. Entra al Release 2 con datos de uso que digan si hace falta |
| B. Tabla propia `stay_los_discounts` | +3 pts y una migración | Reglas por unidad y por temporada; es la forma correcta si el cliente ya lo usa hoy |
| C. Cargarlo como cupón manual | 0 | Funciona, pero obliga a la operación a aplicarlo a mano en cada reserva larga: trabajo manual disfrazado de función |

**Recomendación: A**, salvo que el SME confirme que hoy ya da descuentos por
estancia larga de forma sistemática. En ese caso es B, y el sprint pierde otros
3 puntos por abajo.

---

## S2-1 · Cotización de una estancia

**8 puntos** · Developers · *bloqueada por las decisiones 1, 2 y 3*

> **Como** huésped que encontró la casa que quiere, **quiero** ver el precio
> total de mis fechas antes de dar mis datos, **para** saber cuánto pago hoy y
> cuánto pago al llegar.

```gherkin
Dado la Casa Akumal con tarifa base de 3,200, fin de semana de 3,900,
      cargo por huésped extra de 600 por noche sobre 4 personas y limpieza de 800
Cuando el huésped cotiza del jueves 17 al domingo 20 de septiembre para 5 personas
Entonces ve tres noches: jueves a 3,200 y viernes y sábado a 3,900
Y ve un cargo de 600 por el quinto huésped en cada una de las tres noches
Y ve la limpieza una sola vez
Y ve los impuestos aplicables según la configuración vigente
Y ve el anticipo a pagar hoy, que es el 40% del total de esta casa
Y ve el saldo a pagar en destino

Dado cualquier cotización
Cuando se suman los importes de todas las líneas del desglose
Entonces el resultado es exactamente igual al total, sin diferencias de centavos

Dado una noche del rango sin tarifa configurada
Cuando se cotiza ese rango
Entonces el sistema se niega a cotizar y lo dice
Y no se muestra un precio aproximado

Dado un rango de fechas que ya pasó en la zona horaria de la propiedad
Cuando se intenta cotizar
Entonces se rechaza
Y son las 23:30 del día de hoy en Cancún cuando se hace la prueba

Dado un número de personas mayor que la capacidad de la unidad
Cuando se intenta cotizar
Entonces se rechaza explicando la capacidad máxima
```

**Notas técnicas.** Se apoya en `stay_nightly_rates`, que ya resuelve temporada,
día de la semana y prioridad, y ya devuelve nulo cuando falta tarifa. El cálculo
nuevo es la composición: huéspedes extra, cargos fijos, impuestos y anticipo.

El desglose que se produce aquí es **el mismo objeto** que el Sprint 3 va a
congelar en `bookings.quote`; su formato está en
[`docs/esquema.md`](esquema.md#el-desglose-de-la-cotización). Definirlo bien
ahora es lo que evita reescribir el checkout después.

Dos reglas de implementación que no se negocian:

- **La aritmética vive en una función pura**, separada de las lecturas a la base.
  Así se puede probar con una tabla de casos —incluidos los de redondeo— sin
  levantar Postgres, y las pruebas corren en milisegundos.
- **El penúltimo criterio se prueba con la hora congelada.** "Hoy" se calcula en
  `locations.timezone`, no en la del servidor: a las 23:30 en Cancún un servidor
  en UTC ya cree que es mañana, y con eso se rechazaría una noche válida o se
  aceptaría una que ya pasó.

---

## S2-2 · Cotización de un tour por tipo de pasajero

**3 puntos** · Developers · *bloqueada por la decisión 1*

> **Como** familia con un bebé, **quiero** que el precio refleje que mi bebé no
> ocupa lugar, **para** no pagar por un asiento que no vamos a usar.

```gherkin
Dado el snorkel en cenotes con adulto a 1,800, menor a 1,200 e infante sin costo
Cuando se cotizan 2 adultos, 1 menor y 1 infante
Entonces el total de servicio es 4,800 más los impuestos aplicables
Y el desglose muestra una línea por tipo de pasajero con su cantidad

Dado que el infante no consume cupo
Cuando se cotizan 2 adultos, 1 menor y 1 infante en una salida con 3 lugares libres
Entonces la cotización se permite, porque solo 3 pasajeros ocupan lugar

Dado una salida con 2 lugares libres
Cuando se cotizan 3 adultos
Entonces se rechaza indicando cuántos lugares quedan
Y no se aparta nada: cotizar no reserva

Dado una salida cerrada o cancelada
Cuando se intenta cotizar
Entonces se rechaza
```

**Notas técnicas.** `tour_pax_prices.counts_toward_capacity` ya modela al
infante; el error frecuente es sumar personas en lugar de sumar lugares
ocupados, y el segundo criterio existe para bloquear ese error.

Cotizar **no aparta inventario**: el apartado es del Sprint 3, en el checkout.
El tercer criterio lo fija por escrito para que nadie lo "adelante" y aparte
lugares cada vez que alguien mueve un selector.

---

## S2-3 · Calendario de disponibilidad en la ficha

**5 puntos** · Developers · *bloqueada por la decisión 3*

> **Como** visitante con fechas flexibles, **quiero** ver de un golpe qué días
> están libres, **para** ajustar mi viaje sin adivinar a base de intentos.

```gherkin
Dado una unidad con una reserva confirmada del 14 al 17
Cuando se abre el calendario del mes
Entonces las noches 14, 15 y 16 se ven ocupadas
Y la noche 17 se ve libre, porque la salida no ocupa la noche

Dado una unidad con un bloqueo de mantenimiento
Cuando se abre el calendario
Entonces esas noches se ven no disponibles
Y no se dice el motivo del bloqueo

Dado un tour
Cuando se abre su calendario
Entonces cada día muestra si hay salida y cuántos lugares quedan
Y los días sin salida se ven sin disponibilidad

Dado un mes completo
Cuando se pide su disponibilidad
Entonces se resuelve en una sola consulta a la base
```

**Notas técnicas.** El primer criterio es la prueba de que el calendario respeta
la semántica de `[entrada, salida)` del esquema. Es el bug de calendario más
común de este dominio y aquí queda cubierto desde el primer día.

El segundo criterio es de privacidad operativa: el huésped no tiene por qué
saber que la casa está en mantenimiento o que el dueño la está usando. Se
expone disponibilidad, no motivos.

---

## S2-4 · Selector de fechas y personas que cotiza de verdad

**3 puntos** · Developers

> **Como** huésped en el teléfono, **quiero** elegir fechas y personas y ver el
> precio actualizarse, **para** decidir sin recargar la página a ciegas.

```gherkin
Dado la ficha de una estancia
Cuando el huésped elige entrada, salida y número de personas
Entonces ve el desglose y el total sin recargar la página
Y el precio lo calcula el servidor, nunca el navegador

Dado que el huésped selecciona un rango no disponible
Entonces se le dice que no está disponible antes de intentar reservar

Dado un huésped sin JavaScript disponible
Cuando envía las fechas
Entonces la página se recarga con la cotización hecha en el servidor
Y no queda con una pantalla inservible

Dado un rango y un número de personas seleccionados
Cuando el huésped comparte la URL
Entonces quien la abre ve la misma cotización
```

**Notas técnicas.** Igual que los filtros del Sprint 1, la selección vive en la
URL: se comparte, se recarga y el servidor la puede renderizar completa. El
tercer criterio mantiene la vitrina utilizable en el peor caso de red, que en un
hotel del Caribe no es hipotético.

"El precio lo calcula el servidor" no es una preferencia de arquitectura: es lo
que impide que alguien manipule el total desde el navegador y lo que garantiza
que el número mostrado sea el mismo que va a cobrar la pasarela.

---

## S2-5 · Restricciones de estancia aplicadas y explicadas

**2 puntos** · Developers

> **Como** huésped que eligió dos noches en temporada alta, **quiero** que me
> digan de inmediato que el mínimo son cuatro, **para** no descubrirlo al final
> del proceso.

```gherkin
Dado una temporada con mínimo de cuatro noches
Cuando el huésped selecciona tres noches dentro de esa temporada
Entonces se rechaza indicando el mínimo aplicable
Y se indica en el idioma de la página

Dado una tarifa marcada como cerrada a la llegada
Cuando el huésped intenta llegar ese día
Entonces se rechaza explicando que ese día no admite llegadas

Dado un rango que cruza dos temporadas con mínimos distintos
Cuando se valida
Entonces aplica el mínimo más alto de las temporadas que toca
```

**Notas técnicas.** `stay_rates` ya tiene `min_nights`, `closed_to_arrival` y
`closed_to_departure`; falta aplicarlos y explicarlos. El tercer criterio es la
decisión que el esquema no toma por nosotros y que hay que dejar escrita: cuando
el rango cruza temporadas, **gana el mínimo más alto**. Es lo conservador y lo
que hace la industria.

---

## S2-6 · Cupones aplicados a la cotización

**3 puntos** · Developers · *primer candidato a quedar fuera*

> **Como** operación que manda una promoción por WhatsApp, **quiero** que el
> cupón se aplique al cotizar, **para** que el huésped vea el descuento antes de
> decidir.

```gherkin
Dado un cupón vigente de 10% con tope de canjes
Cuando el huésped lo aplica a una cotización que cumple el mínimo
Entonces el descuento aparece como una línea negativa en el desglose
Y el anticipo se recalcula sobre el total ya con descuento

Dado un cupón vencido, agotado o de otro tipo de producto
Cuando se aplica
Entonces se rechaza diciendo cuál de las tres razones fue

Dado un cupón aplicado
Cuando se cotiza
Entonces no se consume ningún canje: el canje ocurre al confirmar la reserva
```

**Notas técnicas.** El último criterio evita un agujero real: si cotizar
consumiera canjes, un cupón de cien usos se agotaría con cien curiosos moviendo
el selector. El consumo pertenece al Sprint 3, junto con la confirmación.

Va al final de la lista porque es la única historia del sprint que no hace falta
para cumplir el Sprint Goal. Si el equipo llega a 22 puntos en el Planning, esta
es la que se queda.

---

## Estrategia de pruebas

Tres niveles, cada uno donde cuesta menos:

| Nivel | Qué cubre | Por qué ahí |
|---|---|---|
| Función pura, sin base | La aritmética: noches, huéspedes extra, cargos, impuestos, redondeo, anticipo | Decenas de casos en tabla, incluidos los de centavos, corriendo en milisegundos |
| Integración con Postgres | Resolución de tarifas por temporada y prioridad, disponibilidad del mes, restricciones | Son consultas SQL: probarlas con un doble no probaría nada |
| Criterios sobre el sitio construido | Que el desglose visible sea el del servidor y que la URL compartida rinda lo mismo | `scripts/smoke.sh`, como en el Sprint 1 |

**Un caso obligatorio en el nivel de arriba:** la suma de las líneas del
desglose debe ser exactamente el total, para varias combinaciones con decimales
incómodos. Un centavo de diferencia entre lo mostrado y lo cobrado es una
discrepancia con la pasarela y una discusión con el huésped.

## Adición al Definition of Done para este sprint

El DoD del equipo se mantiene; este sprint agrega una casilla, por la misma
razón por la que existe la prueba de concurrencia cuando se toca inventario:

- [ ] **Ningún precio se calcula en el navegador.** Si una historia toca
      precios, se verifica que el importe mostrado viene del servidor.

Propuesta de la Retrospective del Sprint 1, aplicada aquí: los criterios que se
pueden comprobar desde fuera del proceso se comprueban desde fuera. Los tres
defectos del sprint anterior salieron de ahí.

## Estado de la Definition of Ready

| Elemento | Pts | Historia | Criterios | Estimado | Sin dependencias abiertas | Listo |
|---|---|---|---|---|---|---|
| S2-1 | 8 | ✓ | ✓ | ✓ | **no** — decisiones 1, 2, 3 | **no** |
| S2-2 | 3 | ✓ | ✓ | ✓ | **no** — decisión 1 | **no** |
| S2-3 | 5 | ✓ | ✓ | ✓ | **no** — decisión 3 | **no** |
| S2-4 | 3 | ✓ | ✓ | ✓ | ✓ | ✓ |
| S2-5 | 2 | ✓ | ✓ | ✓ | ✓ | ✓ |
| S2-6 | 3 | ✓ | ✓ | ✓ | ✓ | ✓ |

Tres de seis elementos no están listos, y los tres son el corazón del sprint.
**No es un problema de refinamiento: es que faltan tres respuestas del cliente.**
Están nombradas, tienen dueño y tienen fecha; si llegan al Planning sin
respuesta, el equipo avanza con supuestos documentados —los impuestos como están
configurados hoy y las tarifas del seed— y el Sprint Review se hace con datos
que no son los reales. Eso convierte la validación del SME en teatro, así que
vale la pena empujar las respuestas antes.

## Riesgos propios del sprint

| Riesgo | Dueño | Mitigación |
|---|---|---|
| Las tarifas reales resultan más complejas que el modelo (tarifas por persona, paquetes, temporadas traslapadas raras) | PO | La sesión de refinamiento con el SME es antes del Planning, no durante el sprint. Si el modelo no alcanza, se descubre ahí y no en la semana 4 |
| La base gravable de los impuestos se define mal | PO | Decisión 2, con el contador |
| El calendario se vuelve lento con muchos productos | Developers | El criterio de una sola consulta por mes está en el S2-3 |
| Cotizar termina apartando inventario "para no perder la venta" | SM | Criterios explícitos en S2-2 y S2-6. Apartar es del Sprint 3 |

## Qué se demuestra en el Sprint Review

El SME cotiza en pantalla tres casos de su propia operación —temporada alta, fin
de semana con huésped extra, y un tour con menores e infante— y confirma que los
números coinciden con lo que cobraría hoy. Si no coinciden, el sprint no está
terminado, aunque el código esté bien.
