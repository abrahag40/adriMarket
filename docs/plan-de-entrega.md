# Plan maestro de entrega

Columna vertebral del proyecto. **Una sola fuente de verdad**: si algo contradice
este documento, este documento gana o se corrige.

Marco: **Scrum Guide 2020**, sprints de dos semanas. Versión presentable, con
diagramas: <https://claude.ai/code/artifact/d51465d0-ff54-4c9d-ae9e-0b3948e605dd>

El plan está escrito desde tres miradas, y conviene distinguirlas porque
responden preguntas distintas:

| Mirada | Pregunta que responde | Dónde |
|---|---|---|
| **SME de operación** | ¿Qué pasa de verdad en el Caribe cuando esto opera? | §2 |
| **Product Owner** | ¿Qué se construye, en qué orden y por qué ese orden? | §3 y §4 |
| **Gestión de entrega** | ¿Qué puede impedirlo y cómo se sostiene el ritmo? | §5 |

> **Lo que este plan NO es.** No es un plan de cascada partido en tramos de dos
> semanas. **Solo el sprint en curso es un compromiso**; del siguiente en
> adelante es un pronóstico que se vuelve a decidir en cada Sprint Planning, con
> lo aprendido. Los sprints 4 en adelante están al nivel de historia y criterios,
> no refinados al detalle: refinarlos hoy sería inventar certeza.

---

## 1. Dónde estamos

| Sprint | Semanas | Objetivo | Pts | Estado |
|---|---|---|---|---|
| 0 | — | Esquema y garantías de inventario | — | entregado, fuera de cadencia |
| 1 | 1–2 | Vitrina pública en dos idiomas | 22 | **cumplido** |
| 2 | 3–4 | Disponibilidad y precio exactos | 21 | **cumplido** |
| 3 | 5–6 | Checkout y cobro del anticipo | 21 | **cumplido**, con Stripe pendiente de llaves |
| 4 | 7–8 | Panel de operación | 21 | **cumplido** |
| 5 | 9–10 | Cancelaciones, cambios y manifiesto | 21 | **cumplido** |
| 6 | 11–12 | Publicar y ajustar sin el equipo técnico | 21 | **cumplido** |
| 7 | 13–14 | Salida a producción | 20 | **cumplido a medias**: lo construible está entregado; faltan tres cuentas del cliente |

**Velocidad observada: 22, 21, 21, 21, 21, 21 y 20.** Pronóstico para el
Release 2: **21 puntos por sprint**. No es una meta a superar; es el insumo del
pronóstico.

Lo que ya funciona y está verificado: catálogo en español e inglés, motor de
cotización con temporadas y restricciones, calendario de disponibilidad,
garantías de inventario probadas bajo concurrencia real, y una barra de
verificación de 124 criterios que corre en el pipeline.

Ya se puede reservar y cobrar el anticipo: el flujo completo está verificado de
extremo a extremo con la pasarela local. **Falta la cuenta de Stripe** para
ejecutarlo contra el servicio real; lleva un sprint de retraso y ahora bloquea la
operación real, no la demostración.

Y ya se puede **operar**: recepción entra con su cuenta, ve el día, cobra el saldo
en destino, bloquea noches y consulta el calendario, todo desde el teléfono y sin
el equipo técnico.

Y ya se resuelve lo que la realidad pone: un cierre de puerto cancela la salida
completa, avisa a todos y devuelve el anticipo; una cancelación del huésped se
calcula con la política **congelada en su reserva**; una reserva se mueve de fecha
conservando lo pagado; y el guía abre su manifiesto en el teléfono.

Y el cliente ya publica solo: da de alta un producto, escribe sus textos en dos
idiomas, sube fotos que se sirven optimizadas, genera las salidas del mes en lote
y cambia su anticipo — todo desde el panel y sin despliegue. Cada cambio queda en
la bitácora con nombre y fecha.

Y ya avisa por los dos canales que usa el negocio: correo con el desglose
completo y WhatsApp con lo que se alcanza a leer en la pantalla de bloqueo, con
un latido vigilado que responde `503` cuando deja de correr.

Lo que todavía **no** existe: **estar vendiendo**. No falta desarrollo; faltan
tres cuentas del cliente —Stripe, el dominio de correo autenticado y el número de
WhatsApp con plantillas aprobadas por Meta— y las tres son trámites con semanas
de espera. La lista del día del despliegue está en
[`puesta-en-produccion.md`](puesta-en-produccion.md).

---

## 2. La mirada del SME: lo que pasa de verdad en la operación

Esta sección es la que más cambió el plan. Un motor de reservas correcto puede
seguir siendo inútil si ignora cómo trabaja el negocio catorce semanas al año.
Cada regla apunta al elemento del backlog que la atiende.

### 2.1 Junio a noviembre es temporada de huracanes

Los tours de mar no se cancelan por decisión del operador: los cancela la
capitanía de puerto, a veces con doce horas de aviso. Cuando pasa, hay que
avisar a todos los pasajeros de esa salida y devolver el anticipo — no es una
cancelación del huésped y no aplica la política de cancelación.

> **Es la regla operativa más importante que faltaba en el plan original.** Sin
> ella, un cierre de puerto se resuelve con veinte llamadas a mano y el riesgo
> de devolver dos veces o ninguna. → **C1**

### 2.2 Los cambios de fecha son más frecuentes que las cancelaciones

Un vuelo que se mueve, un permiso de trabajo que no salió. Hoy la operación lo
resuelve por WhatsApp y lo anota. El sistema tiene que poder mover una reserva
de fechas conservando el pago hecho, y recotizar la diferencia si la tarifa
cambió. → **C3**

### 2.3 El guía necesita el manifiesto a las 7 de la mañana, en el teléfono

Sin computadora, sin imprimir: quién viene, cuántos son, edades de los menores,
teléfono del titular, punto de encuentro y quién falta por pagar. Hoy es una
captura de pantalla de un grupo de WhatsApp. → **C4**

### 2.4 El saldo se paga en efectivo, y el efectivo necesita rastro

La mayoría del saldo en destino se paga en efectivo. Quién cobró, cuánto y
cuándo no es un dato contable: es la diferencia entre un faltante explicable y
uno que no lo es. El corte de caja diario ayuda, pero puede esperar. → **B5**,
corte en Release 2

### 2.5 Reservar hoy mismo es negocio normal

Turista que camina por la avenida y quiere el tour de mañana, o la casa de esta
noche. No se puede rechazar por una regla de fechas mal escrita. → ya resuelto
en el Sprint 2

### 2.6 En los tours viajan menores, y se pide edad, no documento

Para chalecos y para el precio. Nombre y edad bastan; pedir identificación
oficial ahuyenta y crea una obligación de custodia de datos que no hace falta.
→ **A1**

### 2.7 La hora de presentación no es la hora de salida

El guía pide 15 minutos antes. Si la confirmación dice "09:00" y el huésped llega
a las 09:00, el camión ya se fue. La confirmación y el recordatorio tienen que
decir la hora de presentación y el punto de encuentro con referencia física.
→ **A4**, **C5**

### 2.8 El sargazo afecta la expectativa, no la disponibilidad

Entre abril y agosto la playa puede estar con sargazo. No cambia el inventario,
pero un huésped que llega sin saberlo deja una mala reseña. Un aviso honesto por
producto y por temporada evita más problemas de los que crea. → Release 2

### 2.9 A veces la limpieza no alcanza para rotar el mismo día

En una casa grande con salida a las 11:00 y llegada a las 15:00, cuatro horas
pueden no ser suficientes. Algunas propiedades necesitan un día de colchón entre
estancias.

> **Hallazgo: el esquema no lo soporta.** No hay colchón de rotación. Mientras no
> exista, la operación bloquea el día a mano desde el panel, que es aceptable con
> este volumen. → Release 2

### 2.10 No se hace sobreventa deliberada

A diferencia de un hotel grande, aquí no se sobrevende contando con
cancelaciones: el inventario es chico y una sobreventa se paga con una crisis. El
sistema lo hace imposible por diseño, y eso está alineado con el negocio.

### 2.11 Las propinas no se cobran en línea

Se dejan en efectivo al guía. El checkout no debe insinuar lo contrario ni
agregar una línea de propina sugerida: aquí se lee como cargo sorpresa.

### 2.12 El depósito de garantía por daños se pide en destino

En casas se pide un depósito reembolsable en efectivo al llegar. No pasa por la
pasarela y no forma parte del total cotizado, pero **sí tiene que aparecer en la
confirmación** o el huésped llega sin efectivo suficiente. → **A4**

### 2.13 El no-show existe y hay que medirlo

Entre 5 y 15% según producto y temporada. El anticipo lo mitiga, no lo elimina.
Se mide desde el primer mes de venta, porque de ahí sale si el porcentaje actual
alcanza. → métricas, §6

---

## 3. La mirada del PO: el Product Backlog ordenado

El orden no es por facilidad ni por dependencia técnica: es por valor y por
riesgo. Cada épica dice qué habilita y qué duele si se posterga.

| # | Épica | Qué habilita | Si se posterga… | Pts | Sprint |
|---|---|---|---|---|---|
| A | **Checkout y cobro del anticipo** | Vender. Es la primera vez que entra dinero | No hay negocio; todo lo demás es infraestructura sin retorno | 21 | 3 |
| B | **Operación diaria** | Que el cliente opere sin el equipo técnico | Cada reserva real genera trabajo manual y llamadas al equipo | 21 | 4 |
| C | **Realidad de la operación caribeña** | Sobrevivir un cierre de puerto y un cambio de fecha | Un huracán en temporada se resuelve a mano, con riesgo de doble reembolso | 21 | 5 |
| D | **Autonomía del cliente** | Publicar y cambiar tarifas sin despliegue | El equipo queda de intermediario para cada cambio de precio | 21 | 6 |
| E | **Salida a producción** | Vender de verdad, con soporte | Se lanza sin monitoreo ni staff capacitado | 20 | 7 |

**Total del MVP: 104 puntos, cinco sprints, diez semanas — entregados.** Las
cinco épicas están construidas y verificadas; lo que queda abierto de la E no es
alcance, son las cuentas del cliente (§5.1).

### Decisión de orden que vale explicar

La épica C —cancelación por clima, cambios de fecha, manifiesto— **se adelantó
por encima de la autonomía del catálogo (D)**. El plan original tenía D antes.

El argumento del SME lo cambió: una vez que se está vendiendo y operando, lo
siguiente que duele no es no poder editar un producto —eso lo hace el equipo en
diez minutos— sino un cierre de puerto con dieciocho pasajeros y ningún proceso.
Editar catálogo es incomodidad; un huracán sin proceso de reembolso es una crisis
de reputación en plena temporada.

### El MVP creció dos semanas, y conviene decir por qué

El plan original terminaba en la semana 12 con seis sprints. Ahora son siete y
termina en la **semana 14**. Los 21 puntos nuevos son la épica C, y salieron de
mirar el negocio con la lente del SME, no de un cambio de opinión.

Alternativa considerada y descartada: mantener las 12 semanas moviendo la épica C
al Release 2. Se descartó porque el MVP saldría a producción en plena temporada
de huracanes sin proceso de cancelación por clima. Dos semanas cuestan menos que
esa apuesta.

### Backlog del Release 2, ordenado

Entra cuando haya datos de uso que digan cuál importa primero. No se compromete
fecha.

| Elemento | Pts | Por qué no es MVP |
|---|---|---|
| Mercado Pago: OXXO, SPEI, meses sin intereses | 8 | El turista extranjero paga con tarjeta; el mercado nacional se atiende con Stripe mientras se mide |
| Reportes: ocupación, ingreso por noche disponible, anticipos contra saldos | 8 | Sin tres meses de datos, un reporte es una pantalla bonita |
| Paquetes: tour + estancia en una reserva | 8 | El modelo ya soporta varios renglones; falta la experiencia de compra |
| Facturación CFDI | 8 | Depende de cuántos huéspedes la piden. Se atiende a mano al inicio |
| Reseñas de huéspedes | 5 | Hacen falta huéspedes primero |
| Cobro automático del saldo con tarjeta guardada | 5 | Mitiga el no-show, pero primero hay que medirlo |
| Reprogramación autoservicio por el huésped | 5 | En el MVP lo hace la operación desde el panel (C3) |
| Multi-moneda con precios en dólares | 5 | Se cobra en pesos; mostrar en dólares es conversión, no operación |
| Colchón de rotación entre estancias | 3 | Requiere esquema nuevo (§2.9). Se bloquea a mano |
| Descuento por estancia larga | 3 | Requiere esquema nuevo. Palanca comercial, no requisito |
| Corte de caja diario | 3 | La trazabilidad por cobro (B5) alcanza al inicio |
| Lista de espera para salidas llenas | 3 | Recupera ventas perdidas, pero primero hay que llenar salidas |
| Avisos de sargazo por producto y temporada | 2 | Se puede poner en la descripción a mano |

**Fuera del alcance por decisión del cliente**, no por prioridad: sincronización
con canales externos (Airbnb, Booking) e inventario de terceros. Lo segundo es lo
único caro de revertir: si aparece un socio, es una migración con reservas vivas.

---

## 4. Los sprints

### Sprint 3 · semanas 5–6 · 21 pts · **el de mayor riesgo**

> **Sprint Goal.** Un huésped completa una reserva pagando el anticipo con
> tarjeta, y tanto él como la operación reciben la confirmación.

Refinado al detalle en [`sprint-03.md`](sprint-03.md).

| | Elemento | Pts |
|---|---|---|
| A1 | Checkout: datos del titular, pax con edades, política aceptada | 3 |
| A2 | Apartado del inventario y cobro del anticipo con Stripe | 8 |
| A3 | Webhook firmado y confirmación idempotente | 5 |
| A4 | Correos de confirmación desde la bandeja de salida | 3 |
| A5 | Worker: expiración de apartados y reintento de avisos | 2 |

**Se demuestra:** una reserva completa con tarjeta de prueba, incluidos los
caminos que no salen bien — pago rechazado, pestaña cerrada a media transacción,
apartado que vence sin pago, y el mismo webhook llegando diez veces.

**Si algo se sacrifica en este sprint, no es la verificación.** Aquí entra dinero
y el DoD exige la prueba de concurrencia. Se recorta alcance en otros sprints.

### Sprint 4 · semanas 7–8 · 21 pts

> **Sprint Goal.** La operación administra el día a día —reservas, calendario,
> bloqueos y cobro del saldo— sin pedirle nada al equipo técnico.

| | Elemento | Pts | Criterio de aceptación resumido |
|---|---|---|---|
| B1 | Sesión de staff y permisos por rol | 3 | Recepción puede marcar el saldo pagado; solo gerencia reembolsa. Se aplica en el servidor, no ocultando botones |
| B2 | Bandeja de reservas con filtros, búsqueda y ficha | 5 | Se encuentra una reserva por el código que el huésped dice por teléfono |
| B3 | Calendario de ocupación por unidad y por salida | 8 | Un mes por consulta; se ve quién llega y quién sale cada día |
| B4 | Bloqueos manuales con motivo | 3 | Mantenimiento, uso del propietario, cupo cerrado. El motivo nunca llega a la vitrina |
| B5 | Registrar cobro del saldo en destino | 2 | Queda registrado quién cobró, cuánto y cuándo |

**Se demuestra:** recepción opera un día completo simulado —una llegada, un
bloqueo por mantenimiento y un cobro de saldo— sin intervención del equipo.

**Cerrado.** 21 de 21 puntos. El detalle, los hallazgos y el supuesto que se
asumió por la decisión 6 sin responder están en [`sprint-04.md`](sprint-04.md).

### Sprint 5 · semanas 9–10 · 21 pts · **el que trajo el SME**

> **Sprint Goal.** La operación resuelve sola lo que la realidad le va a poner:
> un cierre de puerto, una cancelación y un cambio de fecha.

| | Elemento | Pts | Criterio de aceptación resumido |
|---|---|---|---|
| C1 | Cancelación por el operador con reembolso del anticipo | 5 | Se cancela una salida completa, se avisa a todos sus pasajeros y se devuelve el anticipo. No aplica la política de cancelación: no canceló el huésped |
| C2 | Cancelación a solicitud del huésped, según política | 5 | El monto devuelto sale de la política **congelada en la reserva**, no de la vigente hoy |
| C3 | Reprogramar la fecha de una reserva | 5 | El pago hecho se conserva; si la tarifa cambió, se recotiza la diferencia y queda registrada |
| C4 | Manifiesto del día para guías | 3 | Se abre en un teléfono: pax, edades, contacto, punto de encuentro y quién debe saldo |
| C5 | Recordatorios automáticos a 72 y 24 horas | 3 | Con hora de presentación y punto de encuentro, no con la hora de salida |

**Se demuestra:** el SME cancela una salida por mal tiempo en el panel y verifica
que los dieciocho pasajeros recibieron aviso y reembolso, sin tocar la base.

**Cerrado.** 21 de 21 puntos. El detalle, los hallazgos y cómo se construyó el
mecanismo de reembolso sin los porcentajes del cliente están en
[`sprint-05.md`](sprint-05.md).

### Sprint 6 · semanas 11–12 · 21 pts

> **Sprint Goal.** El cliente publica un producto nuevo y cambia sus tarifas y su
> anticipo sin escribir código ni pedir un despliegue.

| | Elemento | Pts | Criterio de aceptación resumido |
|---|---|---|---|
| D1 | Alta y edición de productos con traducciones y galería | 8 | Incluye subida de fotos con variantes, según la [decisión 0001](decisiones/0001-entrega-de-imagenes.md) |
| D2 | Tarifas, temporadas y restricciones desde el panel | 5 | Se define un puente encima de la temporada por prioridad, sin partirla |
| D3 | Generación de salidas en lote por recurrencia | 3 | "Todos los martes y jueves de marzo a junio, cupo 12" |
| D4 | Cupones y porcentaje de anticipo editables | 3 | El cambio no altera reservas ya tomadas |
| D5 | Bitácora visible de cambios | 2 | Quién cambió qué tarifa y cuándo |

**Se demuestra:** el SME publica un tour nuevo con sus salidas del mes y le sube
el anticipo al 50%, en vivo y sin ayuda. Si necesita ayuda, no está terminado.

**Cerrado.** 21 de 21 puntos, con dos salvedades dichas sin adornos: los cupones
se administran pero no se canjean todavía, y el panel no crea opciones de tour ni
unidades de estancia. El detalle está en [`sprint-06.md`](sprint-06.md).

### Sprint 7 · semanas 13–14 · 20 pts

> **Sprint Goal.** El sistema está en producción vendiendo, con avisos por
> WhatsApp, monitoreo y una operación capacitada para sostenerlo.

| | Elemento | Pts | Nota |
|---|---|---|---|
| E1 | WhatsApp: confirmaciones y recordatorios | 5 | Las plantillas requieren aprobación de Meta: el trámite arranca en el Sprint 5 |
| E2 | Accesibilidad y rendimiento en conexiones lentas | 5 | La conexión de un hotel del Caribe no es hipotética |
| E3 | Observabilidad, alertas y manual de operación | 3 | Qué hacer cuando un pago queda a medias |
| E4 | Pruebas de aceptación con la operación y correcciones | 5 | **Colchón deliberado.** Este trabajo va a existir |
| E5 | Capacitación del staff y documentación de uso | 2 | |

**Se demuestra:** una reserva real, de un huésped real, cobrada en producción.

**Cerrado a medias, y la mitad que falta no es código.** 20 de 20 puntos
construidos y verificados; la demostración de arriba **no se pudo hacer** porque
sigue sin haber cuenta de Stripe. El detalle está en
[`sprint-07.md`](sprint-07.md), incluidos los tres defectos de producción que
destapó el `/api/health` recién escrito —los enlaces de acceso del staff nunca se
entregaban, no había `robots.txt` ni `sitemap.xml`, y el WhatsApp moría con un
producto sin traducción— y una cosa que no se pudo explicar y se dice igual.

---

## 5. La mirada de gestión de entrega

Las funciones de gestión de proyecto existen repartidas donde el marco las
contempla: **alcance y prioridad son del PO; proceso e impedimentos, del Scrum
Master; coordinación técnica, del equipo.** No hay una capa de aprobación entre
el PO y el equipo, porque eso elimina la autogestión y con ella la estimación
honesta.

### 5.1 Ruta crítica y dependencias externas

Lo que hay que arrancar **antes** de necesitarlo, con su tiempo de espera real:

| Dependencia | Tiempo típico | Arrancar en | Se necesita en | Dueño |
|---|---|---|---|---|
| **Cuenta de Stripe** (verificación del negocio) | 2 a 4 semanas | ya iniciado | **vencida cuatro sprints: bloquea vender** | PO |
| **Dominio, correo y registros SPF/DKIM/DMARC** | 1 a 3 días | Sprint 3, día 1 | Sprint 3 | Developers → **PO**: falta el dominio |
| **WhatsApp Business y plantillas** (aprobación de Meta) | 1 a 3 semanas | Sprint 5 | **vencida: bloquea el canal** | PO |
| **Tarifas y temporadas reales** | — | vencido | Sprint 2 | PO / SME |
| **Fotos y textos reales** | — | vencido | Sprint 6 | SME |
| Timbrador CFDI | 1 semana | Release 2 | Release 2 | PO |

> **Las tres primeras filas son, al cierre del Sprint 7, lo único que separa al
> sistema de estar vendiendo.** Ninguna es desarrollo y ninguna la puede
> destrabar el equipo. La de Meta es la más lenta y la que peor se lleva con la
> prisa: aprobar una plantilla tarda de horas a días, y cambiar una coma después
> obliga a registrarla de nuevo.

> **El correo autenticado es ruta crítica y no lo parece.** Mandar
> confirmaciones desde un dominio nuevo sin SPF, DKIM y DMARC las manda a spam. Y
> una confirmación en spam es, para el huésped, una reserva que no existe: el
> mismo problema que resuelve la bandeja de salida, por una causa distinta. Se
> configura en el Sprint 3, no en el 7.

### 5.2 El calendario del negocio manda sobre el calendario del proyecto

Con la velocidad observada, el MVP sale en la **semana 14**: mediados de
noviembre. Eso deja tres semanas de margen antes de la temporada alta, y es
deliberado.

- **Salida a producción en noviembre**, con dos semanas de acompañamiento cercano.
- **Congelamiento del 15 de diciembre al 7 de enero:** en temporada alta solo se
  despliegan correcciones críticas. Es la quincena que factura y no es el momento
  de aprender algo nuevo.
- Si el proyecto se atrasara más de tres semanas, **no se lanza en diciembre**: se
  lanza en enero. Lanzar en temporada alta con un sistema sin rodar es cambiar un
  retraso por una crisis.

### 5.3 Capacidad y colchones

3 Developers × 10 días hábiles, menos 10% de eventos y 10% de refinamiento y
soporte: **21 puntos por sprint**, que es lo que la velocidad confirma.

Tres colchones explícitos, porque un plan sin holgura es un plan que se desborda:

1. **5 puntos de UAT en el Sprint 7** (E4), reservados para lo que salga.
2. **Los cupones del Sprint 2**, que ya se movieron al Sprint 3 y son el primer
   candidato a recortar si A2 se complica.
3. **El Release 2 es el desagüe.** Cuando un sprint no cierra, se mueve alcance
   ahí — nunca se recorta la Definition of Done.

### 5.4 Registro de riesgos

| Riesgo | Impacto | Dueño | Mitigación |
|---|---|---|---|
| La cuenta de Stripe no está aprobada para el Sprint 3 | Bloquea media épica | PO | Iniciada cinco semanas antes. Si se atrasa, A1, A4 y A5 se terminan sin ella y A2/A3 se mueven |
| Los correos caen en spam | La reserva "no existe" para el huésped | Developers | Autenticación de dominio en el Sprint 3 y prueba de entrega real antes del Review |
| El SME no tiene tiempo | Las reglas se adivinan | SM | 4 h/semana comprometidas. Dos sprints sin él se escala como impedimento formal |
| Decisiones abiertas del cliente | Frenan trabajo listo | PO | Fecha límite por decisión; si vence, se avanza con supuesto documentado. Ya pasó dos veces |
| La base gravable de los impuestos está mal | Se cobra de menos o de más en cada reserva | PO | Pregunta al contador. Hoy es un supuesto marcado en el código |
| Un cierre de puerto antes del Sprint 5 | Reembolsos a mano, riesgo de doble devolución | PO | Procedimiento manual escrito **antes** del Sprint 3, no del 5 |
| El no-show hace insuficiente el anticipo | Pérdida directa | PO | Se mide desde el primer mes. Las tres mitigaciones ya están soportadas por el modelo |
| Datos personales de los pax | Cumplimiento | Developers | Consentimiento en el checkout (Sprint 3), acceso por rol (Sprint 4), retención acotada |
| Equipo chico: una ausencia pega fuerte | Pronóstico | SM | Revisión cruzada obligatoria, sin dueños únicos de módulo. El pronóstico se ajusta, no se compensa con horas extra |
| Lanzar en temporada alta | Crisis en la quincena que factura | PO | Congelamiento del 15 de diciembre al 7 de enero (§5.2) |

### 5.5 Comunicación

| Qué | Cuándo | Para quién |
|---|---|---|
| Sprint Review con demostración | cada 2 semanas, viernes | cliente, SME, stakeholders |
| Resumen de una página: objetivo cumplido, riesgos, decisiones pendientes | después de cada Review | cliente |
| Canal de impedimentos | continuo | SM |
| Registro de decisiones (`docs/decisiones/`) | cuando se decide | equipo y futuro |

Las decisiones se escriben cuando se toman, con su alternativa descartada. En
seis meses nadie recuerda por qué, y re-litigar cuesta más que escribir diez
líneas.

### 5.6 Costo

| Concepto | USD / mes |
|---|---|
| Infraestructura (hospedaje, base, correo, jobs, monitoreo) | 75 – 100 |
| WhatsApp, por conversación | ≈ 10 |
| Comisión de la pasarela | ≈ 3.6% **solo del anticipo** |

Al cobrar únicamente el anticipo, la comisión se aplica sobre una fracción del
ticket. Es un ahorro real frente a cobrar el total en línea y conviene tenerlo
presente al fijar el porcentaje.

### 5.7 Lista de verificación para salir a producción

Se revisó en el Sprint 7 y se convirtió en un documento operable, ordenado por
dependencia y con los comandos exactos:
[`puesta-en-produccion.md`](puesta-en-produccion.md). Esta es la versión corta,
y ninguna casilla se marca por confianza — **marcar una por escrito sin
verificarla fue justo el origen de uno de los defectos del Sprint 7**:

- [ ] Migraciones aplicadas en producción desde cero, en un ensayo previo
- [ ] Respaldos automáticos y una restauración probada de verdad
- [ ] Llaves de producción separadas de las de prueba, ninguna en el repositorio
- [ ] Webhook de la pasarela apuntando a producción, con firma verificada
- [ ] Correo autenticado y con entrega probada a Gmail, Outlook e iCloud
- [ ] Monitoreo con alerta a un teléfono que alguien va a ver
- [ ] Aviso de privacidad y términos publicados y aceptados en el checkout
- [ ] Manual de operación para las tres fallas más probables
- [ ] Staff capacitado, con una reserva de prueba hecha por ellos
- [ ] Procedimiento de reembolso probado con un cargo real pequeño
- [ ] Plan de acompañamiento: dos semanas con guardia y revisión diaria

---

## 6. Gobierno del plan

### Roles

| Rol pedido | Dónde queda en el marco | Dedicación |
|---|---|---|
| PO | **Product Owner**. Una persona, no un comité | 50% |
| Ingenieros | **Developers** (3). Datos, interfaz, pruebas y despliegue | 100% |
| SME | **Stakeholder clave**, fuera del equipo Scrum | 10% (4 h/semana) |
| PM | Repartido: alcance → PO, proceso → SM, coordinación técnica → equipo | — |

### Cadencia

| Evento | Timebox | Cuándo |
|---|---|---|
| Sprint Planning | 4 h | lunes, día 1 |
| Daily Scrum | 15 min | diario, misma hora |
| Sprint Review | 2 h | viernes, día 10 |
| Sprint Retrospective | 1.5 h | viernes, después del Review |
| Refinamiento | ≈2 h/semana | miércoles — **no es un evento oficial de Scrum** |

Timeboxes proporcionales a los del Scrum Guide, que están definidos para sprints
de un mes. Son máximos, no metas.

### Definition of Done

Propiedad del equipo. No se negocia bajo presión de fecha.

- [ ] Criterios de aceptación verificados
- [ ] Pruebas automatizadas del comportamiento nuevo, en verde
- [ ] Migraciones aplican limpias desde cero
- [ ] **Si toca inventario o pagos:** prueba de concurrencia ejecutada, sin
      sobreventa ni desalineación
- [ ] **Ningún precio se calcula en el navegador** (agregado en el Sprint 2)
- [ ] Typecheck y linter sin errores
- [ ] Revisado por otra persona del equipo
- [ ] Desplegado en staging y demostrable
- [ ] Sin trabajo manual pendiente para que funcione

### Definition of Ready

- [ ] Historia con valor para alguien identificable
- [ ] Criterios de aceptación en `Dado / Cuando / Entonces`
- [ ] Estimado por el equipo
- [ ] Sin dependencias externas abiertas, o con dueño y fecha
- [ ] Diseño o contenido disponible si hace falta
- [ ] Cabe en un sprint

### Estimación

Fibonacci (1, 2, 3, 5, 8, 13) con Planning Poker. Los puntos miden esfuerzo,
complejidad e incertidumbre juntos, no horas. Lo que llega a 13 se divide.

Historia de referencia: **3 puntos = ficha de producto con galería y descripción
en dos idiomas**.

### Métricas

De proceso, para el equipo y no para reportar hacia arriba: Sprint Goal cumplido
(sí/no), velocidad, defectos escapados, tiempo de ciclo.

De producto, disponibles desde el Sprint 3: conversión del checkout, apartados
expirados, y **tasa de no-show**, que es la que decide si el anticipo alcanza.

La velocidad sirve para pronosticar, no para medir productividad. No se compara
entre equipos ni se usa en evaluaciones individuales: en el momento en que se
vuelve meta, se infla y deja de servir para lo único que servía.

### Cómo evoluciona este documento

Se revisa en cada Sprint Planning. El sprint que empieza pasa a compromiso, el
resto sigue siendo pronóstico. Cuando el pronóstico cambia se cambia aquí, con la
razón — no calladamente en una hoja aparte.

---

## 7. Decisiones abiertas

| # | Decisión | Dueño | Fecha límite | Qué bloquea |
|---|---|---|---|---|
| 1 | Sobre qué base se calcula cada impuesto (¿IVA sobre subtotal, o sobre subtotal + ISH?) | PO con el contador | antes del Sprint 3 | Los montos de toda reserva. Hoy es un supuesto en el código |
| 2 | Tarifas y temporadas reales del año | PO / SME | **vencida** | Que el Sprint Review sea real y no una demostración con datos inventados |
| 3 | Política de cancelación con porcentajes y plazos concretos | PO con el SME | **venció; el mecanismo está construido y espera los números** | Cuánto se le devuelve a quien cancela. Se cargan como datos y solo aplican a reservas nuevas (ver `docs/sprint-05.md`) |
| 4 | ¿Se factura CFDI? | PO | antes del Release 2 | Un módulo con proveedor de timbrado |
| 5 | ¿El SME da descuentos por estancia larga hoy? | SME | **venció sin respuesta; no se implementó nada** | Si es sí, entra esquema nuevo. Ya no cabe en el MVP: pasa al Release 2 |
| 6 | ¿Quién opera el panel a diario y desde qué dispositivo? | PO | **venció sin respuesta** | Se asumió *recepción desde el celular* y el panel se construyó móvil primero (ver `docs/sprint-04.md`). Confirmar o desmentir |
| 7 | Fotos y textos reales | SME | **ya no bloquea al equipo**: se suben desde el panel (Sprint 6) | Que la vitrina venda algo parecido a lo que existe |

Las decisiones **2 y 3 son las urgentes**. La 3 no es un detalle legal: es lo que
se le cobra a un huésped que cancela, y sin ella el checkout del Sprint 3 tendría
que inventar una política.

## Fuentes

Scrum Guide 2020 (Schwaber y Sutherland) · INVEST (Bill Wake) · Gherkin ·
Planning Poker (James Grenning) · yesterday's weather (Extreme Programming) ·
último momento responsable (Lean) · RACI.
