# Sprint 6 · semanas 11–12 · refinamiento y cierre

> **Sprint Goal**
> El cliente publica un producto nuevo y cambia sus tarifas y su anticipo sin
> escribir código ni pedir un despliegue.

**Pronóstico:** 21 puntos (*yesterday's weather*: 22, 21, 21, 21, 21).
**Refinado y listo:** 21 puntos en cinco elementos.

Este sprint tiene el criterio de aceptación más duro de todo el plan, y está
escrito en el plan maestro desde el principio: **si necesita ayuda, no está
terminado.** No hay margen de interpretación — o el cliente publica un tour solo,
o el sprint no cerró.

Casi todo el esquema que hacía falta existía desde el Sprint 0: productos,
traducciones, tarifas por temporada y prioridad, cupones. Lo que faltaba en la
base era poco y concreto; el trabajo grueso fue interfaz y, sobre todo, el módulo
de imágenes que la [decisión 0001](decisiones/0001-entrega-de-imagenes.md) dejó
anotado como deuda desde el Sprint 1.

---

## S6-1 · Alta y edición de productos con traducciones y galería

**8 puntos** · Developers

> **Como** dueño del negocio, **quiero** dar de alta un producto con sus textos y
> sus fotos, **para** empezar a venderlo sin llamarle a nadie.

```gherkin
Dado que se crea un producto
Entonces nace en borrador y no se ve en el sitio
Y su dirección se propone a partir del nombre, pero se puede corregir

Dado un producto sin foto o sin nombre en español
Cuando se intenta publicar
Entonces no se puede, y se dice exactamente qué falta antes de intentarlo

Dado que se sube una foto
Entonces se ve de inmediato
Y se avisa que los tamaños para móvil se están generando
Y cuando terminan, la vitrina sirve AVIF y WebP en cuatro anchos

Dado un archivo que no es una imagen, o una de menos de 800 px
Entonces se rechaza con una explicación, no con un error técnico

Dado que se quita una foto
Entonces se borran también sus archivos del almacén

Dado un producto publicado
Entonces su ficha existe en los dos idiomas y aparece en el listado
```

**Notas técnicas.** El módulo de imágenes implementa la decisión 0001 tal como se
tomó: anchos de 400, 800, 1600 y 2400 px en AVIF con respaldo en WebP, generados
**al subir** y servidos como archivos.

El reparto entre la petición y el latido no es una optimización prematura, es lo
que la decisión exige por escrito: *"se hace en un job y no en la petición del
panel, para que subir quince fotos no bloquee la pantalla"*. Codificar AVIF tarda
segundos por imagen; quince fotos por cuatro anchos por dos formatos son ciento
veinte codificaciones. La petición guarda el original —que ya se ve— y encola.

Se valida el contenido con `sharp`, no la extensión ni el tipo que declara el
navegador: lo único que prueba que un archivo es una imagen es abrirlo.

Y con esto **se paga la deuda anotada en la decisión 0001**: la vitrina dejó de
servir `<img>` simple sobre imágenes de relleno y ahora emite `<picture>` con
`srcset` y `sizes`.

---

## S6-2 · Tarifas, temporadas y restricciones desde el panel

**5 puntos** · Developers

> **Como** dueño, **quiero** cambiar mis tarifas y agregar un puente, **para** no
> depender de nadie en temporada.

```gherkin
Dado un plan de tarifas
Cuando se agrega una temporada con su precio por noche
Entonces la cotización la usa desde ese momento

Dado una temporada ya definida
Cuando hace falta un precio distinto para un puente
Entonces se agrega una regla encima con más prioridad
Y NO hay que partir la temporada en tramos

Dado que dos reglas cubren la misma noche
Entonces gana la de mayor prioridad
Y la pantalla las lista en ese orden, no por fecha
```

**Notas técnicas.** La columna `priority` existe desde el Sprint 0 y este sprint
es donde se gana el sueldo. La alternativa —partir la temporada en tres tramos
para meter un puente— deja huecos y solapes en cada cambio, y un hueco se paga
con una noche sin precio que el motor se niega a cotizar.

La pantalla ordena por prioridad descendente a propósito: verlas por fecha
esconde lo único que hay que entender, que es cuál se impone.

---

## S6-3 · Generación de salidas en lote por recurrencia

**3 puntos** · Developers

> **Como** dueño, **quiero** decir "todos los martes y jueves de marzo a junio,
> cupo 12", **para** no capturar cincuenta salidas a mano.

```gherkin
Dado un tour y un periodo
Cuando se eligen los días de la semana, la hora y el cupo
Entonces se crean todas las salidas de ese patrón
Y todas quedan a la misma hora del destino

Dado que se genera el mismo periodo otra vez
Entonces no se duplica ninguna salida
Y las que ya tenían pasajeros conservan su cupo intacto

Dado un rango invertido, un cupo de cero o ningún día elegido
Entonces se rechaza con una explicación
```

**Notas técnicas.** La recurrencia se resuelve en la base y no en la aplicación
por una razón concreta: la hora es local y el rango puede cruzar un cambio de
horario. Postgres sabe convertir eso; un ciclo en JavaScript sumando 24 horas no.
Quintana Roo no tiene horario de verano, pero el sistema no debería depender de
que el cliente nunca opere fuera del estado.

**La idempotencia es la parte que importa.** Regenerar es la operación que más se
va a repetir —el cliente amplía el periodo, corrige la hora, vuelve a entrar— y
reescribir el cupo de una salida que ya tiene pasajeros sería crear sobreventa
desde el panel. Las salidas existentes se omiten y se dice cuántas fueron.

---

## S6-4 · Cupones y porcentaje de anticipo editables

**3 puntos** · Developers

> **Como** dueño, **quiero** subir el anticipo al 50% en temporada alta, **para**
> reducir el riesgo de no-show sin llamar al equipo técnico.

```gherkin
Dado el anticipo por omisión
Cuando se cambia
Entonces las reservas nuevas lo usan
Y NINGUNA reserva ya tomada cambia
Y la pantalla lo dice antes de guardar

Dado un producto con anticipo propio
Entonces el propio gana sobre el global
Y dejarlo vacío significa heredar, no conservar el último valor

Dado un porcentaje de cero, negativo o mayor que cien
Entonces se rechaza

Dado un cupón que ya se usó
Cuando ya no se quiere ofrecer
Entonces se desactiva, no se borra
```

**Notas técnicas.** Que cambiar el anticipo no altere reservas existentes no es
código nuevo: `bookings.deposit_pct` se congela al reservar desde el Sprint 0.
Lo que este sprint agrega es **decirlo en la pantalla**, porque es la primera
pregunta que hace cualquiera antes de tocar ese campo.

Un cupón usado se desactiva y no se borra: es parte de la historia de las
reservas que lo aplicaron, y borrarlo deja descuentos sin explicación en la
contabilidad.

---

## S6-5 · Bitácora visible de cambios

**2 puntos** · Developers

> **Como** dueño, **quiero** ver quién cambió qué y cuándo, **para** poder
> explicar un precio raro sin depender de la memoria de nadie.

```gherkin
Dado cualquier cambio hecho desde el panel
Entonces queda registrado con quién lo hizo, qué cambió y cuándo
Y se guarda el valor anterior y el nuevo

Dada la pantalla de bitácora
Entonces se leen los cambios más recientes primero
```

**Notas técnicas.** La tabla `audit_log` existe desde el Sprint 0 y **nadie
escribía en ella**. Se agregó un ayudante en la base para que registrar cueste una
línea: una bitácora que hay que acordarse de llenar termina medio llena, y una
bitácora medio llena es peor que ninguna porque genera confianza que no merece.

Se muestra el antes y el después en crudo. No es bonito; es exacto, y aquí la
exactitud importa más que la presentación.

---

## Dependencias y pendientes

| Qué | De quién | Estado |
|---|---|---|
| Cuenta de Stripe | Cliente | **vencida hace tres sprints** |
| Tarifas y temporadas reales | Cliente | **ya se pueden capturar solo**: el panel dejó de ser el bloqueo |
| Fotos y textos reales | SME | **ya se pueden subir solo**: mismo caso |
| Porcentajes de la política de cancelación | Cliente | vencida; el mecanismo espera los números |
| ¿Descuentos por estancia larga? | SME | **no llegó**; no se implementó nada. Si es sí, entra esquema nuevo |
| Base gravable del impuesto al hospedaje | Contador | necesaria antes de facturar |

Dos dependencias dejaron de ser bloqueos por lo que se construyó aquí: las
tarifas reales y las fotos ya no necesitan al equipo técnico. Es el resultado
concreto del sprint.

---

## Estrategia de pruebas

| Capa | Qué cubre |
|---|---|
| SQL (`npm run db:test`) | 20 garantías de inventario, dinero y cancelación |
| Integración (`npm run test:integration`) | 110 casos, 14 nuevos de publicar, generar y procesar fotos |
| Criterios sobre el sitio construido (`scripts/smoke.sh`) | 113 criterios, 5 nuevos |
| Navegador, vitrina (`npm run test:e2e`) | el checkout del huésped |
| Navegador, panel (`npm run test:e2e:admin`) | un día de recepción |
| Navegador, el huracán (`npm run test:e2e:sme`) | cancelar una salida y mover una reserva |
| **Navegador, publicar (`npm run test:e2e:publicar`)** | **el criterio de este sprint, sin ayuda** |

El recorrido de publicación **no prepara nada del producto en la base**: crea el
producto, escribe los textos, sube la foto, genera las salidas, publica y sube el
anticipo, todo desde el panel. Lo único que consulta con `psql` es lo que la
pantalla no puede enseñar: que el archivo de la variante exista y que el anticipo
de una reserva vieja no se haya movido.

---

## Qué se demuestra en el Sprint Review

Lo que el plan pidió: **el SME publica un tour nuevo con sus salidas del mes y le
sube el anticipo al 50%, en vivo y sin ayuda.**

1. Crea el producto. Nace en borrador.
2. Intenta publicar: no puede, y la pantalla dice que falta una foto.
3. Escribe los textos en español e inglés.
4. Sube una foto de 3000 px. Se ve de inmediato, marcada como "procesando".
5. El latido genera ocho archivos: cuatro anchos en AVIF y cuatro en WebP.
6. Genera 18 salidas —martes y jueves, 17:00, cupo 20— de un jalón. Repite la
   operación y no se duplica nada.
7. Publica. La ficha aparece en los dos idiomas, la foto se sirve en AVIF con
   `srcset`, y el producto sale en el listado.
8. Sube el anticipo al 50%. Una reserva tomada antes sigue en 30%.
9. Todo está en la bitácora, con su nombre.

---

## Cierre del sprint

**Sprint Goal: cumplido.** El cliente publica y ajusta sin el equipo técnico.
21 puntos, cinco elementos.

| Historia | Pts | Estado |
|---|---|---|
| S6-1 Productos, traducciones y galería | 8 | terminada |
| S6-2 Tarifas y temporadas desde el panel | 5 | terminada |
| S6-3 Salidas en lote por recurrencia | 3 | terminada |
| S6-4 Cupones y anticipo editables | 3 | terminada, con salvedad |
| S6-5 Bitácora visible | 2 | terminada |
| **Velocidad real** | **21** | |

Velocidad acumulada: 22, 21, 21, 21, 21, 21. El pronóstico del Sprint 7 queda en
20, como estaba.

### La salvedad de S6-4

Los cupones **se administran pero todavía no se canjean**. El panel los crea, los
activa y los desactiva, y la tabla lleva la cuenta de usos; lo que no existe es el
campo en el checkout que los aplique al total.

Se decidió así al planear el sprint y se dice ahora sin adornos: el elemento vale
3 puntos y el objetivo del sprint es el anticipo, que es lo que el cliente pidió
poder cambiar. Aplicar un cupón toca el motor de cotización y la cotización
congelada de la reserva, y eso no cabe en 3 puntos hechos con cuidado. **Entra en
el Sprint 7 o queda para el Release 2**, y es decisión del PO.

### Evidencia

- **14 casos de integración** nuevos: idempotencia de la generación de salidas,
  el anticipo que no toca reservas viejas, el procesamiento de imágenes en los
  anchos de la decisión 0001, y que borrar una foto no deje archivos huérfanos.
- **113 criterios** sobre el sitio construido, 5 nuevos.
- **29 comprobaciones en navegador real** del recorrido de publicación completo.
- Las 20 garantías SQL y los otros tres recorridos, intactos y repetibles.
- 110 pruebas de integración en total, typecheck y linter limpios.

### Hallazgos del sprint

1. **Las fotos subidas respondían 404.** `next build` resuelve el contenido de
   `public/` en tiempo de compilación, así que **un archivo escrito ahí después
   del build no se sirve nunca**. El cliente subía una foto y no la veía hasta el
   siguiente despliegue — exactamente lo contrario del objetivo del sprint. Las
   fotos se movieron fuera de `public/` y se sirven por una ruta propia, que en
   producción reemplaza el CDN sobre el mismo almacén.
2. **Pasar un arreglo de JavaScript a Postgres no produce un arreglo.** El
   constructor de consultas lo expande como lista de parámetros —`($1, $2)`— y
   Postgres lo rechaza. Los días de la semana no llegaban, así que **la generación
   de salidas no funcionaba en absoluto**. Se arma el literal `{2,4}` a mano.
3. **`.field` estiraba los formularios apilados.** La regla `flex: 1 1 150px`
   estaba pensada para una fila de filtros; dentro de un contenedor en columna fija
   150 px de **alto** por campo, y la ficha del catálogo quedaba con huecos
   enormes entre etiqueta y etiqueta. Ninguna prueba lo vio: apareció al abrir la
   captura.
4. **El campo de hora nunca se estilizó**, así que quedaba más bajo que sus
   vecinos y, como la fila alinea por abajo, las etiquetas de al lado salían a
   distinta altura. También apareció en la captura.
5. **Otro criterio de smoke se pudrió solo**: contaba tres tarjetas con foto en el
   listado, y en cuanto el recorrido de publicación empezó a publicar productos
   con foto pasó a contar seis. Medía cuánto inventario hay, no la propiedad.
   Reescrito contra la ficha, donde se puede aislar un producto.
6. **Los recorridos se estaban quitando el inventario entre ellos.** El del panel
   buscaba noches libres en la misma ventana de 2026 donde smoke.sh comprueba
   montos exactos con fechas fijas; una corrida vendía esas noches y cinco
   criterios empezaban a fallar sin que nada estuviera roto. La temporada del seed
   ahora cubre tres años, **cada recorrido trabaja en su propio año** y el rango de
   smoke queda declarado como reservado en el propio guion.

### Deuda técnica anotada

- Stripe y Resend siguen sin ejecutarse contra el servicio real. Tres sprints.
- **Los cupones no se canjean** (arriba).
- **El panel no crea opciones de tour ni unidades de estancia.** Un tour nuevo
  necesita su opción —hora, duración, punto de encuentro, precios por tipo de
  pasajero— y eso todavía se inserta a mano. El recorrido de publicación lo hace
  con `psql` y lo dice en un comentario. Es el hueco más visible que queda para
  que "publicar sin ayuda" sea cierto sin asteriscos.
- Reprocesar el catálogo al agregar un ancho nuevo es un job que todavía no
  existe (consecuencia prevista en la decisión 0001).
- Sin colchón de rotación entre estancias (regla 2.9 del SME).
- Los recorridos de navegador consumen inventario real y no lo devuelven. Con la
  temporada de tres años alcanza de sobra, pero la limpieza correcta sería que
  cada recorrido cancelara lo que creó. Anotado, no hecho.

### Para la Retrospective

Siete sprints. La lección de siempre —**lo que no se ejecuta no está verificado, y
lo que no se mira tampoco**— sigue cobrando: dos de los cinco hallazgos aparecieron
mirando una captura de pantalla que todas las pruebas habían aprobado.

Pero el hallazgo #1 merece separarse, porque es de otra clase. Los defectos de los
sprints anteriores eran errores en código que yo escribí. Este fue **una suposición
sobre la plataforma**: que `public/` se sirve desde el disco en tiempo de
ejecución. Es razonable, es lo que hace casi cualquier servidor, y es falsa aquí.
No había forma de encontrarla razonando; solo pidiendo el archivo.

Vale la pena decirlo con precisión porque cambia dónde hay que buscar: no basta
con probar *mi* código contra la realidad, también hay que probar **lo que doy por
sentado del marco**. La prueba que lo encontró es de una línea —pedir la URL de la
variante y mirar el código de respuesta— y es la única de todo el recorrido que
mira algo que el panel no muestra.
