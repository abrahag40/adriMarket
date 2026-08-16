# Sprint 5 · semanas 9–10 · refinamiento y cierre

> **Sprint Goal**
> La operación resuelve sola lo que la realidad le va a poner: un cierre de
> puerto, una cancelación y un cambio de fecha.

**Pronóstico:** 21 puntos (*yesterday's weather*: 22, 21, 21, 21).
**Refinado y listo:** 21 puntos en cinco elementos.

Este es **el sprint que trajo el SME**. Los cuatro anteriores construyeron lo que
cualquier motor de reservas necesita; este construye lo que necesita *este*
negocio, en el Caribe, entre junio y noviembre. Ninguno de sus cinco elementos
salió de un requerimiento técnico: los cinco salieron de la sección 2 del plan
maestro, y cada uno apunta a una regla que alguien aprendió operando.

---

## La decisión que sigue sin llegar, y cómo se trabajó sin ella

Los **porcentajes de la política de cancelación** (decisión 3) llevan tres
sprints pendientes y son, literalmente, cuánto dinero se le devuelve a un huésped
que cancela. No se pueden inventar.

Lo que se hizo: **construir el mecanismo completo y dejar los números fuera del
código.** La política vive como datos —una lista de escalones `{horas antes,
porcentaje}`— y lo que el motor hace es leerla. Los valores del seed son de
relleno y están marcados como tales.

Esto no es un rodeo: es la forma correcta de construirlo de todos modos, porque
**el reembolso sale de la política congelada dentro de la reserva**, no de la
vigente. Cuando el cliente entregue sus porcentajes reales se cargan como datos,
aplican a las reservas nuevas, y **ninguna reserva ya tomada cambia** — que es
justo lo que el huésped aceptó al reservar.

---

## S5-1 · Cancelación por el operador con reembolso del anticipo

**5 puntos** · Developers

> **Como** operación a la que le cerraron el puerto, **quiero** cancelar la
> salida completa en un paso, **para** que ningún pasajero se entere en el
> muelle.

```gherkin
Dado una salida con pasajeros confirmados
Cuando la operación la cancela con un motivo
Entonces se cancelan todas sus reservas
Y a cada titular se le encola un aviso con ese motivo
Y se le devuelve el total de lo que pagó
Y NO aplica la política de cancelación
Y los lugares vuelven al cupo

Dado que la salida ya estaba cancelada
Cuando se cancela otra vez
Entonces no se devuelve dinero por segunda vez

Dado un guía con sesión iniciada
Entonces no se le ofrece cancelar salidas, ni el servidor se lo permite
```

**Notas técnicas.** Es la regla 2.1 del SME, y la más importante que faltaba en el
plan original: *los tours de mar no los cancela el operador, los cancela la
capitanía de puerto, a veces con doce horas de aviso.*

La cancelación de una salida va **en una sola transacción**: dieciocho pasajeros
o ninguno. Un aviso a la mitad del grupo es peor que ninguno, porque los que no
supieron llegan al muelle igual.

Hay una sola función de cancelar para los dos casos, con un parámetro explícito
que decide si aplica la política. No son dos funciones porque todo lo demás
—liberar inventario, cerrar el saldo, avisar— es idéntico, y duplicarlo garantiza
que algún día se arreglen distinto.

---

## S5-2 · Cancelación a solicitud del huésped, según política

**5 puntos** · Developers

> **Como** gerencia, **quiero** que el monto a devolver lo calcule el sistema con
> la política que el huésped aceptó, **para** no discutir de memoria en el
> mostrador.

```gherkin
Dado una reserva con su política congelada
Cuando se abre su ficha
Entonces se ve cuánto se devolvería si cancelara ahora, y con qué porcentaje

Dado que el cliente endureció su política después de que el huésped reservó
Cuando el huésped cancela
Entonces se aplica la política congelada en la reserva, no la vigente

Dado que se cancela
Entonces el monto devuelto es exactamente el que se mostró antes de decidir
Y las fechas vuelven a estar a la venta
Y el saldo que nunca se cobró deja de estar por cobrar

Dado una reserva ya cancelada
Cuando se cancela otra vez
Entonces no se devuelve dos veces
```

**Notas técnicas.** El monto **se muestra antes de decidir**. Anunciarle al
huésped lo que se le devuelve después de haber cancelado convierte una
conversación en un reclamo, y hay una prueba dedicada a que el número cotizado y
el devuelto sean el mismo.

Cancelar es de gerencia y no de recepción: **devuelve dinero**. Un cobro mal hecho
se corrige; una devolución mal hecha ya salió de la cuenta.

El saldo pendiente se marca como cancelado, no como faltante: no es dinero que
falte, es un cobro que ya no va a ocurrir.

---

## S5-3 · Reprogramar la fecha de una reserva

**5 puntos** · Developers

> **Como** recepción, **quiero** mover una reserva de fecha conservando lo
> pagado, **para** resolver por sistema lo que hoy se resuelve por WhatsApp.

```gherkin
Dado una reserva confirmada
Cuando se mueve a otras noches libres
Entonces el anticipo ya cobrado se conserva
Y el precio nuevo lo calcula el motor, no una captura a mano
Y la diferencia se ajusta en el saldo que se paga en destino
Y las noches viejas vuelven a estar a la venta
Y queda registrado en la bitácora quién la movió

Dado que las noches nuevas ya están vendidas
Cuando se intenta mover
Entonces se rechaza y la reserva queda exactamente como estaba

Dado un tour cuya salida destino ya no tiene cupo
Entonces se rechaza y la reserva sigue en su salida original
```

**Notas técnicas.** Es la regla 2.2: *los cambios de fecha son más frecuentes que
las cancelaciones.*

Lo delicado no es mover, es **no perder lo que había**. Todo ocurre en una
transacción: si las noches nuevas chocan con la restricción de exclusión, el
rollback deja la reserva original intacta. En tours el orden se invierte —primero
se apartan los lugares nuevos y después se sueltan los viejos— porque el cupo se
cuenta en vez de traslaparse.

El precio se recalcula con el mismo motor que cotizó la reserva original. Nadie
escribe un total a mano.

---

## S5-4 · Manifiesto del día para guías

**3 puntos** · Developers

> **Como** guía a las siete de la mañana, **quiero** abrir en el teléfono quién
> viene hoy, **para** salir sin computadora y sin imprimir nada.

```gherkin
Dado una salida con pasajeros confirmados
Cuando el guía abre su manifiesto
Entonces ve la hora de presentación en grande, no la de salida
Y el punto de encuentro
Y cada titular con su teléfono tocable para llamar
Y los menores con su edad
Y quién trae saldo por cobrar, y cuánto en total

Dado una reserva cancelada
Entonces no aparece en el manifiesto

Dado un guía
Entonces puede abrir el manifiesto, pero no cancelar ni cobrar
```

**Notas técnicas.** Es la regla 2.3, y hoy es una captura de pantalla de un grupo
de WhatsApp.

El orden de la pantalla es el orden en que se usa: primero la hora de
presentación y el punto de encuentro, después la lista para pasar asistencia, y
hasta el final el dinero. Las edades van visibles porque **de ahí salen los
chalecos**.

Es la única pantalla del panel que un guía puede abrir: es su herramienta de
trabajo. También es la que más datos personales concentra —nombres, edades de
menores, teléfonos—, así que tiene su propio criterio de aceptación en
`scripts/smoke.sh` verificando que no se abre sin sesión.

---

## S5-5 · Recordatorios automáticos a 72 y 24 horas

**3 puntos** · Developers

> **Como** huésped, **quiero** que me recuerden cuándo y dónde presentarme,
> **para** no llegar cuando el camión ya salió.

```gherkin
Dado una reserva confirmada
Cuando faltan 72 horas para el servicio
Entonces se encola un recordatorio con la hora de presentación y el punto de encuentro

Dado que el latido corre cada minuto
Entonces el mismo recordatorio no se encola dos veces

Dado que el worker estuvo caído dos días
Cuando vuelve
Entonces el recordatorio sale tarde, pero sale

Dado una reserva para mañana
Entonces NO se manda un recordatorio que diga "en tres días"
```

**Notas técnicas.** Es la regla 2.7: *la hora de presentación no es la hora de
salida.* Si el correo dice "09:00" y el huésped llega a las 09:00, el camión ya
se fue.

La ventana **se abre pero no se cierra**: si el worker no corrió en seis horas, el
recordatorio sale tarde. Un recordatorio tarde sirve; uno que no se manda, no.

De las ventanas abiertas se manda **solo la más cercana**. Las dos pueden estar
abiertas a la vez porque alguien reservó para mañana —aquí es negocio normal, ver
regla 2.5— o porque el worker estuvo caído.

---

## Dependencias y pendientes

| Qué | De quién | Estado |
|---|---|---|
| Cuenta de Stripe | Cliente | **vencida hace dos sprints** |
| Tarifas y temporadas reales | Cliente | **vencida hace tres sprints** |
| Porcentajes de la política de cancelación | Cliente | **vencida; se construyó el mecanismo con datos de relleno** |
| Base gravable del impuesto al hospedaje | Contador | necesaria antes de facturar |
| Quién opera el panel y desde qué dispositivo | PO | asumida en el Sprint 4, sigue sin confirmar |

---

## Estrategia de pruebas

| Capa | Qué cubre |
|---|---|
| SQL (`npm run db:test`) | 20 garantías: 12 de inventario y dinero, 8 nuevas de cancelación y reembolso |
| Integración (`npm run test:integration`) | 96 casos, 15 nuevos de cancelar, mover y recordar |
| Criterios sobre el sitio construido (`scripts/smoke.sh`) | 105 criterios, 3 nuevos |
| Navegador, vitrina (`npm run test:e2e`) | el checkout completo del huésped |
| Navegador, panel (`npm run test:e2e:admin`) | un día de operación de recepción |
| **Navegador, el día del huracán (`npm run test:e2e:sme`)** | **la demostración que pidió el SME** |

---

## Qué se demuestra en el Sprint Review

Exactamente lo que el plan prometió: **el SME cancela una salida por mal tiempo en
el panel y verifica que los pasajeros recibieron aviso y reembolso, sin tocar la
base.**

1. Abre el manifiesto de la salida de mañana: seis pasajeros, dos menores con su
   edad, tres teléfonos tocables, $7,560 por cobrar.
2. Cierran el puerto. Cancela la salida escribiendo el motivo.
3. El panel responde: tres reservas avisadas y devolución total registrada.
4. Se lee el correo exacto que le llega a un pasajero: se disculpa, dice el
   motivo, y explica que se devuelve todo porque no aplica la política.
5. Mueve otra reserva de fecha: el anticipo se conserva y la diferencia se ajusta
   en el saldo.
6. Un guía entra con su cuenta: abre el manifiesto, y no se le ofrece cancelar
   nada.

---

## Cierre del sprint

**Sprint Goal: cumplido.** La operación resuelve sola un cierre de puerto, una
cancelación y un cambio de fecha. 21 puntos, cinco elementos.

| Historia | Pts | Estado |
|---|---|---|
| S5-1 Cancelación por el operador con reembolso | 5 | terminada |
| S5-2 Cancelación según política congelada | 5 | terminada |
| S5-3 Reprogramar la fecha de una reserva | 5 | terminada |
| S5-4 Manifiesto del día para guías | 3 | terminada |
| S5-5 Recordatorios a 72 y 24 horas | 3 | terminada |
| **Velocidad real** | **21** | |

Velocidad acumulada: 22, 21, 21, 21, 21. El pronóstico del Sprint 6 sigue en 21.

### Evidencia

- **8 garantías nuevas en SQL**: reembolso desde la política congelada aunque la
  vigente cambie, escalones por anticipación, cancelación del operador que
  devuelve todo pese a una política estricta, liberación de inventario, salida
  completa con aviso a los tres pasajeros, reprogramación rechazada sin destruir
  la reserva original, anticipo conservado, recordatorios sin duplicar.
- **15 casos de integración** de la capa que toca la operación, incluido que el
  monto cotizado sea exactamente el devuelto y que el correo diga lo correcto en
  cada caso.
- **105 criterios** sobre el sitio construido.
- **25 comprobaciones en navegador real** del día del huracán, en viewport de
  teléfono.
- Las 12 garantías originales, el checkout y el día de recepción, intactos.

### Hallazgos del sprint

1. **Un `NULL` explícito no activa el valor por omisión de un parámetro SQL.** La
   aplicación mandaba `NULL` cuando no tenía un instante concreto, el `DEFAULT
   now()` no se aplicaba, ninguna regla de la política se cumplía y **todo
   reembolso salía en cero**. Es el defecto más caro del sprint y no se ve
   leyendo: la función es correcta, la llamada es correcta, y juntas fallan.
2. **La vitrina ofrecía salidas que ya habían partido.** El calendario razona en
   días, así que a las tres de la tarde seguía preseleccionando la salida de las
   nueve; el motor la rechazaba por fecha pasada y **el huésped se quedaba sin
   precio a la vista**. Apareció porque las pruebas de la vitrina empezaron a
   fallar solas al pasar los días.
3. **El recordatorio de 72 horas decía "en tres días" hasta que faltaban 24.**
   Primero intenté arreglarlo eligiendo mejor el umbral; eso resolvía el caso de
   quien reserva para mañana pero no el del worker caído dos días. El arreglo
   correcto resultó ser doble: mandar solo la ventana más cercana **y quitar la
   frase relativa** — el correo ahora dice la fecha, que nunca se equivoca.
4. **El motor de precios detecta el cupo agotado antes que la base**, y el panel
   solo reconocía el error de la base. Una salida llena habría respondido con una
   excepción en vez de una frase.
5. **`psql` pega la etiqueta del comando al valor devuelto.** El recorrido leía
   un correo con `INSERT 0 1` pegado, lo escribía en el formulario y el acceso
   fallaba sin explicación. Perdí una vuelta sospechando del `+` en las
   direcciones antes de mirar el valor real.

### Deuda técnica anotada

- Stripe y Resend siguen sin ejecutarse contra el servicio real. Dos sprints de
  retraso.
- **Los reembolsos se registran, no se ejecutan.** La fila queda en `pending` a
  la espera de que la pasarela haga el movimiento, igual que los cobros. Cerrar
  ese ciclo depende de la cuenta.
- El cobro parcial del saldo sigue rechazado a propósito.
- Sin colchón de rotación entre estancias (regla 2.9): se bloquea a mano.
- Imágenes sin optimizar (decisión 0001, se paga en el Sprint 6).

### Para la Retrospective

Seis sprints y la lección ya no es una anécdota: **lo que no se ejecuta no está
verificado, y lo que no se mira tampoco.** Este sprint agregó un tercer filo:
*las pruebas se pudren solas*.

Tres pruebas que pasaban en el Sprint 4 fallaron en el 5 sin que nadie tocara el
código que verifican. Todas por lo mismo: afirmaban un dato del seed —"la primera
salida", "treinta salidas", "todas a las 09:00"— en vez de la propiedad que decían
verificar. El seed se genera relativo a hoy, así que el calendario las fue
invalidando.

Reescribirlas contra la propiedad las volvió más estrictas, no menos: la de
agrupamiento ahora comprueba que la fecha del calendario es la del destino, que es
literalmente su título y algo que la versión anterior nunca miró.

Y una de esas pruebas podridas destapó el defecto #2, que era real y estaba en
producción de la vitrina. **Una prueba que se rompe sola es una molestia; una que
se rompe sola y tenía razón es un hallazgo.**
