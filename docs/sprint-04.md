# Sprint 4 · semanas 7–8 · refinamiento y cierre

> **Sprint Goal**
> La operación administra el día a día —reservas, calendario, bloqueos y cobro
> del saldo— sin pedirle nada al equipo técnico.

**Pronóstico:** 21 puntos (*yesterday's weather*: 22, 21, 21).
**Refinado y listo:** 21 puntos en cinco elementos.

Este es el primer sprint cuyo usuario **no es el huésped**. Todo lo anterior se
juzgaba por si alguien lograba reservar; esto se juzga por si recepción puede
trabajar un martes cualquiera sin llamar por teléfono al equipo técnico. Son dos
criterios distintos y el segundo es más severo: el huésped usa el sistema una vez
y con calma, recepción lo usa cuarenta veces al día con alguien enfrente.

---

## La decisión que no llegó, y qué se hizo con ella

La pregunta 6 del plan —**¿quién opera el panel a diario y desde qué
dispositivo?**— tenía fecha límite "antes del Sprint 4" y no se respondió.

No se puede construir un panel sin contestarla, así que se contestó por
suposición y se deja escrita para que el cliente la desmienta si quiere:

> **Supuesto asumido: recepción, desde el celular, de pie y con alguien
> enfrente.**

De ahí salen decisiones concretas y verificables:

- **Tarjetas y no tablas.** Una tabla de ocho columnas en un teléfono obliga a
  desplazarse en horizontal para leer un solo registro.
- **44 píxeles de alto mínimo** en todo lo que se toca, incluido el botón de
  salir.
- **El teléfono del huésped es un enlace `tel:`**, porque el aparato que tiene
  recepción en la mano es un teléfono.
- **El acceso es un enlace que se toca**, no una contraseña que se escribe con
  una mano.

El costo de equivocarse es asimétrico y por eso se eligió así: **un panel pensado
para el celular funciona en un escritorio; al revés no.** Si la respuesta llega y
dice "una computadora en la oficina", no hay nada que rehacer.

---

## S4-1 · Sesión de staff y permisos por rol

**3 puntos** · Developers

> **Como** operación, **quiero** que cada quien entre con su propia cuenta y solo
> pueda hacer lo suyo, **para** saber quién hizo qué y poder cerrarle el acceso a
> alguien el mismo día que se va.

```gherkin
Dado alguien del equipo con cuenta activa
Cuando pide acceso con su correo de trabajo
Entonces recibe un enlace válido 15 minutos y de un solo uso

Dado un correo que no pertenece a nadie del equipo
Cuando se pide acceso
Entonces la respuesta es idéntica a la del caso anterior
Y no se puede averiguar quién trabaja aquí probando correos

Dado un enlace ya canjeado, o vencido, o inventado
Cuando se abre
Entonces no se abre sesión

Dado alguien que deja de trabajar aquí
Cuando se desactiva su cuenta
Entonces sus sesiones abiertas dejan de valer de inmediato

Dado un guía con sesión iniciada
Cuando intenta cobrar un saldo
Entonces el servidor lo rechaza, aunque el botón no se haya mostrado
```

**Notas técnicas.** Enlace por correo y no contraseña, por tres razones que pesan
en este negocio: no se guardan contraseñas (un operador chico no tiene cómo
responder a una filtración, y la mejor forma de no tener el problema es no tener
el dato), el staff es de tres a seis personas con alta rotación estacional (dar y
quitar acceso es activar una fila), y recepción entra desde el teléfono.

**La sesión vive en la base, no solo en una cookie firmada.** Una cookie firmada
no se puede revocar, y aquí hace falta poder cerrarle la sesión a alguien el mismo
día que se va. De ambos —enlace y sesión— solo se guarda el hash: quien lea la
base no puede entrar con lo que encuentre.

Los roles son una jerarquía de cuatro niveles (`guide < front_desk < manager <
owner`) y no una tabla de permisos. Es suficiente para este negocio y evita una
tabla que nadie va a mantener.

---

## S4-2 · Bandeja de reservas con filtros, búsqueda y ficha

**5 puntos** · Developers

> **Como** recepción con el huésped enfrente, **quiero** encontrar su reserva por
> el código que me dice por teléfono, **para** atenderlo sin hacerlo esperar.

```gherkin
Dado el código que el huésped dice por teléfono
Cuando se busca en la bandeja
Entonces aparece su reserva, sin importar mayúsculas

Dado que no se recuerda el código
Cuando se busca por nombre, correo o teléfono
Entonces también aparece

Dado que se abre el panel al llegar
Entonces lo primero que se ve son las llegadas y salidas de hoy
Y "hoy" es hoy en el destino, no en el servidor

Dado que se abre una reserva
Entonces se ve quién es, qué reservó, qué pagó, qué falta cobrar y su bitácora
Y ningún estado se muestra con el valor crudo de la base
```

**Notas técnicas.** "Hoy" se calcula con la zona horaria de la ubicación del
producto (`locations.timezone`), no con la del servidor. A las diez de la noche en
Cancún ya es el día siguiente en UTC, y una llegada fechada contra el reloj del
servidor no aparecería en la pantalla del día.

La lista de "esperando pago" solo muestra apartados con **plazo de pago vigente**.
Un apartado vencido está muerto —el barrido lo va a expirar y nadie va a pagarlo—
y mezclarlo con los vivos entierra los que sí requieren atención.

---

## S4-3 · Calendario de ocupación por unidad

**8 puntos** · Developers

> **Como** operación, **quiero** ver el mes completo por unidad, **para** saber de
> un vistazo qué está vendido, qué está bloqueado y qué está libre.

```gherkin
Dado un mes cualquiera
Cuando se abre el calendario
Entonces se ve una fila por unidad activa y una columna por día
Y aparecen también las unidades que no tienen nada ese mes

Dado un día ocupado por una reserva
Entonces la celda dice el código de la reserva

Dado un día ocupado por un bloqueo manual
Entonces la celda dice el motivo
Y ese motivo nunca sale en la vitrina
```

**Notas técnicas.** Una sola consulta para todo el mes, igual que el calendario de
la vitrina. Las filas salen del **catálogo de unidades** y no de lo que trajo la
ocupación: si se armaran con la ocupación, una unidad sin vender ni bloquear en el
mes no aparecería, y un mes tranquilo se vería como un calendario vacío.

La columna de la unidad se queda fija al desplazar y está acotada al 42 % del
ancho en pantallas chicas. Sin el tope, un nombre largo se come media pantalla del
teléfono y del mes solo se ven diez días.

---

## S4-4 · Bloqueos manuales con motivo

**3 puntos** · Developers

> **Como** operación, **quiero** cerrar unas noches por mantenimiento o uso del
> propietario, **para** no venderlas.

```gherkin
Dado que se bloquean unas noches libres
Entonces esas noches dejan de estar a la venta de inmediato

Dado que se intenta bloquear unas noches ya vendidas
Entonces la base lo impide y el panel lo explica en una frase

Dado un bloqueo que ya no aplica
Cuando se libera
Entonces las noches vuelven a estar a la venta
Y la fila sigue existiendo, marcada como liberada
```

**Notas técnicas.** El bloqueo manual usa **la misma restricción de exclusión que
impide sobrevender**. Es la garantía del Sprint 0 protegiendo ahora a la operación
de sí misma: no se puede bloquear encima de algo vendido, igual que no se puede
vender encima de un bloqueo.

Liberar es un `UPDATE` de `released_at`, nunca un `DELETE`: la fila sigue ahí para
poder explicar qué pasó.

---

## S4-5 · Registrar el cobro del saldo en destino

**2 puntos** · Developers

> **Como** recepción, **quiero** marcar el saldo como cobrado, **para** que la
> caja cuadre y quede claro quién lo recibió.

```gherkin
Dado una reserva confirmada con saldo pendiente
Cuando recepción registra el cobro y la forma de pago
Entonces el saldo queda pagado, con la hora y el nombre de quien lo recibió
Y queda un evento en la bitácora de la reserva

Dado una reserva cuyo saldo ya se cobró
Cuando se intenta cobrar otra vez
Entonces se rechaza y no se suma dinero que no entró

Dado un intento de cobrar solo una parte del saldo
Entonces se rechaza, porque esa regla de negocio todavía no existe

Dado una reserva cancelada o expirada
Entonces no se puede cobrar su saldo
```

**Notas técnicas.** El saldo ya se registra como pago pendiente al confirmar
(`booking_confirm`, Sprint 3); cobrarlo es marcarlo. La función bloquea la fila
del pago antes de tocarla, así que dos personas cobrando a la vez no producen dos
cobros.

La forma de pago es obligatoria y explícita. La mayoría del saldo entra en
efectivo, y **el efectivo sin rastro es la diferencia entre un faltante explicable
y uno que no lo es.**

El cobro parcial se **rechaza en lugar de inventar una regla**: es un caso real,
pero necesita una decisión de negocio que todavía no existe. Inventarla aquí es
peor que no soportarla, porque después hay que desinventarla con dinero de por
medio.

---

## Dependencias y pendientes

| Qué | De quién | Estado |
|---|---|---|
| Cuenta de Stripe | Cliente | **vencida desde el Sprint 3** |
| Tarifas y temporadas reales | Cliente | **vencida desde el Sprint 2** |
| Quién opera el panel y desde qué dispositivo | PO | **no llegó; se asumió y quedó escrito arriba** |
| Porcentajes de la política de cancelación | Cliente | necesaria para el Sprint 5 |
| Base gravable del impuesto al hospedaje | Contador | necesaria antes de facturar |

---

## Estrategia de pruebas

Lo mismo que en los sprints anteriores, con una capa nueva:

| Capa | Qué cubre |
|---|---|
| SQL (`npm run db:test`) | las 12 garantías de inventario y dinero |
| Integración (`npm run test:integration`) | 81 casos, incluidos acceso, cobro y bloqueos |
| Criterios sobre el sitio construido (`scripts/smoke.sh`) | 102 criterios, 11 nuevos del panel |
| Navegador real, vitrina (`npm run test:e2e`) | el checkout completo del huésped |
| **Navegador real, panel (`npm run test:e2e:admin`)** | **un día de operación completo** |

El recorrido del panel es la evidencia del Review y hace lo que se prometió
demostrar: entra por enlace de correo leído de la bandeja de salida —el mismo
lugar de donde saldría en producción—, ve la llegada del día, cobra su saldo,
bloquea unas noches por mantenimiento, las ve en el calendario, las libera y cierra
sesión. 18 comprobaciones, en un viewport de teléfono.

---

## Qué se demuestra en el Sprint Review

Recepción opera un día completo simulado sin intervención del equipo:

1. Entra al panel con un enlace de correo, desde el teléfono.
2. Ve la llegada del día sin buscarla.
3. Cobra el saldo en efectivo y queda su nombre en el registro.
4. Bloquea unas noches por mantenimiento y las ve en el calendario.
5. Libera el bloqueo y las noches vuelven a estar a la venta.
6. Cierra sesión, y la sesión deja de valer de inmediato.

---

## Cierre del sprint

**Sprint Goal: cumplido.** La operación administra el día a día sin pedirle nada
al equipo técnico. 21 puntos, cinco elementos.

| Historia | Pts | Estado |
|---|---|---|
| S4-1 Sesión de staff y permisos por rol | 3 | terminada |
| S4-2 Bandeja de reservas y ficha | 5 | terminada |
| S4-3 Calendario de ocupación | 8 | terminada |
| S4-4 Bloqueos manuales con motivo | 3 | terminada |
| S4-5 Registrar el cobro del saldo | 2 | terminada |
| **Velocidad real** | **21** | |

Velocidad acumulada: 22, 21, 21, 21. El pronóstico del Sprint 5 sigue en 21.

### Evidencia

- **12 casos** de acceso del staff: enlace de un solo uso, enlace vencido, token
  inventado, sesión revocada, cuenta desactivada, sesión vencida y la jerarquía
  de roles completa.
- **9 casos** de cobro y bloqueos: doble cobro, cobro parcial, reserva en estado
  inválido, reserva inexistente, bloqueo sobre noches vendidas y liberación.
- **102 criterios** sobre el sitio construido, 11 nuevos: ninguna ruta del panel
  se abre sin sesión, la pantalla de acceso no delata correos, el panel no se
  indexa y no lo redirige el prefijo de idioma.
- **18 comprobaciones en navegador real** sobre el panel, en viewport de teléfono.
- Las 12 garantías del Sprint 0 y los recorridos de la vitrina, intactos.
- 81 pruebas de integración en total, typecheck y linter limpios.

### Hallazgos del sprint

Cinco, y **ninguno se encontró leyendo código**:

1. **El panel entero era inalcanzable en el build.** El middleware de idioma
   redirigía `/admin` a `/es/admin`, que no existe. Es exactamente el mismo error
   que en el Sprint 3 rompía el webhook de la pasarela: la lista de exclusiones
   del middleware no tenía `admin`. Se encontró con un `curl` al build, no
   revisando el archivo — que se veía bien.
2. **El enlace de acceso abría sesión y el panel volvía a pedirla.** La
   redirección se armaba con `request.url`, que salía con otro host que el de la
   petición, y **una cookie puesta en un host no viaja al otro**. Detrás de un
   proxy habría fallado igual. Se cambió a `Location` relativo.
3. **No había forma de cerrar sesión.** La función de revocar estaba escrita y
   probada, pero ninguna pantalla la llamaba. Apareció al intentar hacer el paso
   final del recorrido. En un mostrador donde el teléfono se presta y cambia de
   turno, eso no es un detalle.
4. **El calendario solo mostraba unidades con ocupación**, así que un mes tranquilo
   se veía como un calendario vacío — lo contrario de lo que la operación necesita
   ver. Apareció mirando la captura, no ejecutando una prueba.
5. **La ficha mostraba `confirmed` y fechas en ISO.** El valor crudo del enum y
   `2026-08-13 → 2026-08-15` en la pantalla que recepción lee con el huésped
   enfrente. También apareció mirando la captura.

Y uno de higiene, encontrado por consecuencia: **las pruebas de integración
creaban productos publicados**. Inventario falso que, contra una base compartida,
habría aparecido en la vitrina ofreciéndole al huésped una casa que no existe.
Ahora se crean como borrador.

### Deuda técnica anotada

- Stripe y Resend siguen sin ejecutarse contra el servicio real. Ya lleva un
  sprint de retraso y bloquea la operación real, no la demostración.
- El cobro parcial del saldo se rechaza a propósito; necesita decisión de negocio.
- La bandeja no tiene paginación: 200 filas por consulta y un tope visible en la
  pantalla de inicio. Alcanza para el volumen de este negocio; se revisa si deja
  de alcanzar.
- Imágenes sin optimizar (decisión 0001, se paga en el Sprint 6).

### Para la Retrospective

Cinco sprints, cinco veces la misma lección, y esta vez con una variante que vale
la pena separar.

Los sprints 1 a 3 enseñaron que **lo que no se ejecuta, no está verificado**. Este
sprint agregó que **lo que no se mira, tampoco**: dos de los cinco hallazgos
—el calendario vacío y el enum crudo en la ficha— pasaron todas las pruebas
automáticas. Las pruebas comprobaban que la página respondía y que los datos
estaban; no que la pantalla sirviera para trabajar. Aparecieron al abrir la
captura de pantalla y leerla como la leería recepción.

La conclusión práctica para adelante: en un sprint cuyo entregable es una
interfaz, **la captura de pantalla es evidencia de primera clase**, no ilustración
del informe. El recorrido de navegador ya las genera; el cambio es mirarlas.
