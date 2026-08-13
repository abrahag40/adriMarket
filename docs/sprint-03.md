# Sprint 3 · semanas 5–6 · refinamiento

> **Sprint Goal**
> Un huésped completa una reserva pagando el anticipo con tarjeta, y tanto él
> como la operación reciben la confirmación.

**Pronóstico:** 21 puntos (*yesterday's weather*: 22 y 21).
**Refinado y listo:** 21 puntos en cinco elementos.

Este es el sprint donde entra dinero. Todo lo construido hasta ahora es
infraestructura sin retorno hasta que este sprint cierre; y al mismo tiempo es el
sprint donde un error cuesta de verdad. La barra de verificación no se negocia:
si algo hay que recortar, se recorta alcance en otros sprints.

Al cerrar se habilita la **venta asistida** (semana 6): la operación puede tomar
reservas por el sitio y administrar a mano lo que falte, seis semanas antes del
MVP completo.

---

## S3-1 · Checkout: datos del titular y de los pax

**3 puntos** · Developers

> **Como** huésped que ya vio el precio, **quiero** dar mis datos una sola vez y
> entender exactamente qué acepto, **para** pagar sin sorpresas.

```gherkin
Dado una cotización válida en pantalla
Cuando el huésped continúa al checkout
Entonces se le piden nombre, correo y teléfono del titular
Y el desglose sigue visible, con el anticipo y el saldo separados

Dado un tour con menores
Cuando el huésped captura los pasajeros
Entonces se pide nombre y edad de cada menor
Y no se pide documento de identidad

Dado el checkout
Cuando el huésped va a pagar
Entonces tiene que aceptar explícitamente la política de cancelación
Y el texto que acepta queda guardado con la reserva, no solo referenciado
Y se registra el consentimiento del aviso de privacidad con su fecha y versión

Dado un formulario incompleto o con un correo inválido
Cuando se intenta continuar
Entonces se explica qué falta, campo por campo
Y no se pierde nada de lo ya capturado

Dado que el huésped recarga la página a media captura
Entonces la cotización y las fechas siguen ahí, porque viven en la URL
```

**Notas técnicas.** El esquema ya tiene `booking_guests` con `pax_type` y
`birthdate`, y `customers.privacy_accepted_at` con su versión. La política se
congela en `bookings.cancellation_policy_snapshot`: **lo que el huésped aceptó no
puede cambiar porque el cliente edite la política después.**

Se pide edad y no documento por la razón del SME (§2.6 del plan): pedir
identificación ahuyenta y crea una obligación de custodia que este negocio no
necesita.

---

## S3-2 · Apartado del inventario y cobro del anticipo

**8 puntos** · Developers · *depende de la cuenta de Stripe*

> **Como** huésped, **quiero** que mis fechas queden apartadas mientras escribo
> los datos de mi tarjeta, **para** no descubrir al final que se vendieron.

```gherkin
Dado una cotización válida y los datos capturados
Cuando el huésped inicia el pago
Entonces se crea la reserva en estado hold con vencimiento a 15 minutos
Y el inventario queda apartado en la misma transacción
Y el precio se recalcula en el servidor: no se confía en ningún monto recibido

Dado que las fechas se ocuparon entre la cotización y el pago
Cuando el huésped inicia el pago
Entonces se le dice que acaban de ocuparse, con el mensaje del dominio
Y no se crea ninguna reserva ni se cobra nada

Dado un apartado vigente
Cuando el huésped captura su tarjeta
Entonces los datos van a campos alojados del proveedor
Y no pasan por nuestro servidor en ningún momento

Dado un pago rechazado por el banco
Entonces el apartado sigue vigente hasta su vencimiento
Y el huésped puede reintentar sin volver a capturar todo

Dado que el huésped abandona el pago
Cuando pasan 15 minutos
Entonces el apartado se libera y las fechas vuelven a estar a la venta
```

**Notas técnicas.** Las funciones del Sprint 0 hacen el trabajo pesado:
`stay_hold_create` y `tour_hold_create` ya garantizan el apartado, y sus errores
`AM001`/`AM002` ya se traducen a mensajes para el huésped. Lo nuevo es el flujo y
la integración de cobro.

**Recotizar en el servidor antes de cobrar no es paranoia:** entre la cotización
y el pago pueden pasar minutos, y el único monto en el que se puede confiar es el
que el servidor acaba de calcular. El monto que llega del navegador se ignora.

Los datos de tarjeta van a campos alojados del proveedor, lo que mantiene el
cumplimiento PCI en su nivel más simple. Es la razón por la que no se construye
un formulario de tarjeta propio, aunque se vea mejor.

**Es el elemento de 8 puntos del sprint y el de mayor incertidumbre.** Si se
complica, el alcance que se mueve es el de otros sprints.

---

## S3-3 · Webhook firmado y confirmación idempotente

**5 puntos** · Developers · *depende de la cuenta de Stripe*

> **Como** operación, **quiero** que una reserva se confirme cuando el dinero
> llegó de verdad, **para** no perseguir pagos fantasma ni duplicar reservas.

```gherkin
Dado un pago exitoso en la pasarela
Cuando llega el webhook
Entonces se verifica su firma antes de procesar nada
Y se guarda el evento con su identificador antes de actuar sobre él
Y la reserva pasa a confirmada con el saldo registrado como pago pendiente

Dado un webhook con firma inválida
Entonces se rechaza y se registra el intento
Y no se modifica ninguna reserva

Dado el mismo webhook recibido diez veces
Entonces existe una sola reserva confirmada, un solo saldo y dos avisos
Y el evento se guarda una sola vez

Dado que el huésped cerró la pestaña justo después de pagar
Entonces la reserva se confirma igual, porque no depende del navegador
Y al volver a la URL de su reserva la ve confirmada

Dado un webhook cuyo monto no corresponde al anticipo esperado
Entonces no se confirma y se marca para revisión de la operación
```

**Notas técnicas.** `booking_confirm()` ya es idempotente y
`payment_events (provider, provider_event_id)` ya es único: la garantía existe
desde el Sprint 0 y aquí se conecta. El último criterio es el que no está
cubierto por el esquema y hay que agregar: **un monto que no cuadra es un
problema humano, no técnico**, y confirmar a ciegas sería peor que no confirmar.

Verificar la firma **antes** de procesar es lo que impide que cualquiera con la
URL del webhook confirme reservas gratis.

---

## S3-4 · Correos de confirmación desde la bandeja de salida

**3 puntos** · Developers

> **Como** huésped, **quiero** un comprobante con todo lo que necesito el día que
> llegue, **para** no depender de recordar los detalles.

```gherkin
Dado una reserva confirmada
Cuando el worker procesa la bandeja de salida
Entonces el huésped recibe un comprobante en el idioma en que reservó
Y el comprobante lleva el desglose, el anticipo pagado y el SALDO A PAGAR EN DESTINO
Y lleva la política de cancelación que aceptó
Y para un tour lleva la hora de presentación y el punto de encuentro
Y para una estancia lleva las instrucciones de llegada y el depósito de garantía en efectivo
Y el administrador recibe su propio aviso con los datos de los pax

Dado que el proveedor de correo está caído
Entonces la reserva sigue confirmada
Y el aviso se reintenta con espera creciente hasta lograrlo

Dado un correo ya enviado
Cuando el worker vuelve a pasar
Entonces no se envía dos veces
```

**Notas técnicas.** La tabla `outbox` con su `dedupe_key` ya existe y ya se llena
dentro de la transacción de confirmación. Lo nuevo son las plantillas y el envío.

Dos detalles vienen del SME y no del esquema: **la hora de presentación no es la
hora de salida** (§2.7) y **el depósito de garantía en efectivo tiene que
aparecer** (§2.12), o el huésped llega sin efectivo suficiente.

El comprobante se arma con el desglose congelado y con las etiquetas ya
traducidas al idioma del huésped: un comprobante que se relee en dos años no debe
depender del código de entonces.

---

## S3-5 · Worker: expiración de apartados y reintento de avisos

**2 puntos** · Developers

> **Como** operación, **quiero** que el inventario se libere solo, **para** no
> perder ventas por reservas que nadie pagó.

```gherkin
Dado reservas en hold cuyo plazo venció
Cuando corre el worker
Entonces sus apartados se liberan y las reservas quedan expiradas
Y las fechas y los lugares vuelven a estar a la venta de inmediato

Dado apartados huérfanos de un checkout abandonado antes de crear la reserva
Cuando corre el worker
Entonces también se liberan

Dado que dos instancias del worker corren a la vez
Entonces no se libera nada dos veces ni se descuadra el contador de lugares

Dado avisos fallidos en la bandeja
Cuando corre el worker
Entonces se reintentan con espera creciente
Y después de varios intentos quedan marcados para revisión, no en silencio
```

**Notas técnicas.** `booking_expire_holds()` ya hace las tres primeras cosas,
incluido el barrido de huérfanos y el `for update skip locked` que lo hace seguro
con varios workers. Aquí solo se programa su ejecución y se conecta el envío.

Es el elemento más chico del sprint y el que nadie ve. También es el que evita
que el inventario se vaya secando con apartados muertos.

---

## Dependencias y pendientes

| Qué | Dueño | Para cuándo |
|---|---|---|
| **Cuenta de Stripe aprobada** | PO | día 1. Bloquea S3-2 y S3-3. Si se atrasa, S3-1, S3-4 y S3-5 se pueden terminar sin ella |
| **Política de cancelación con porcentajes y plazos** | PO con el SME | día 1. Es el texto que el huésped acepta en S3-1 |
| **Dominio, correo y SPF/DKIM/DMARC** | Developers | día 1. Sin esto los correos de S3-4 caen en spam |
| **Base gravable de los impuestos** | PO con el contador | día 3. Hoy es un supuesto en el código |
| Procedimiento manual de cancelación por clima | PO con el SME | durante el sprint. C1 llega en el Sprint 5 y la temporada no espera |
| Aviso de privacidad y términos publicados | PO | día 5. Se aceptan en S3-1 |

## Adición al Definition of Done para este sprint

El DoD del equipo se mantiene. Este sprint agrega dos casillas por la misma
razón por la que existe la prueba de concurrencia:

- [ ] **Ningún dato de tarjeta toca nuestro servidor.** Verificado revisando qué
      se envía, no confiando en la librería.
- [ ] **Entrega de correo probada de verdad** a Gmail, Outlook e iCloud, no solo
      "el proveedor respondió 200".

## Estrategia de pruebas

| Nivel | Qué cubre |
|---|---|
| Función pura | Transiciones de estado y validación del formulario |
| Integración con Postgres | Hold + confirmación + saldo + bandeja, incluidos los caminos de error |
| Webhook simulado | Firma inválida, evento repetido diez veces, monto que no cuadra |
| Concurrencia | Dos huéspedes pagando el último lugar de la misma salida al mismo tiempo |
| Criterios sobre el sitio construido | El flujo completo con tarjeta de prueba, y los caminos que no salen bien |

**El caso obligatorio de este sprint:** dos pagos simultáneos por el último lugar.
Uno confirma y el otro recibe un rechazo honesto; nunca se cobra a los dos.

## Qué se demuestra en el Sprint Review

Una reserva completa de principio a fin con tarjeta de prueba, y después los
cuatro caminos que no salen bien: pago rechazado, pestaña cerrada a media
transacción, apartado que vence sin pago, y el mismo webhook llegando diez veces.

Los caminos que fallan son la demostración que importa. El camino feliz lo logra
cualquiera.

---

## Cierre del sprint

**Sprint Goal: cumplido.** Un huésped completa una reserva pagando el anticipo, y
tanto él como la operación reciben la confirmación. 21 puntos, cinco elementos.

| Historia | Pts | Estado |
|---|---|---|
| S3-1 Checkout con datos, pax y política aceptada | 3 | terminada |
| S3-2 Apartado del inventario y cobro del anticipo | 8 | terminada, con salvedad |
| S3-3 Webhook firmado y confirmación idempotente | 5 | terminada |
| S3-4 Correos de confirmación desde la bandeja | 3 | terminada |
| S3-5 Worker de expiración y reintentos | 2 | terminada |
| **Velocidad real** | **21** | |

Velocidad acumulada: 22, 21, 21. El pronóstico del Sprint 4 sigue en 21.

### La salvedad, dicha completa

**La cuenta de Stripe nunca llegó**, así que la implementación de Stripe está
escrita contra su API documentada pero **no se ha ejecutado contra el servicio**.
Lo mismo con Resend: hace falta el dominio con SPF, DKIM y DMARC.

Lo que sí quedó verificado, y no es poco:

- **La verificación de firma**, con vectores propios: cuerpo alterado, secreto
  distinto, firma vieja, marca de tiempo del futuro, rotación de secreto y
  cabeceras mal formadas. Es la parte que decide quién puede confirmar reservas.
- **Todo el flujo de reserva**, con una pasarela local que firma sus eventos con
  el mismo mecanismo y los procesa por el mismo camino. No es un doble que diga
  "sí": lo único que no ocurre es el cobro.
- **El contenido exacto de los correos**, porque el transporte local guarda el
  mensaje renderizado en la bandeja en lugar de mandarlo.

La interfaz de proveedor que venía de la arquitectura se ganó el sueldo: se
diseñó para poder agregar Mercado Pago sin tocar el checkout, y terminó
permitiendo entregar el sprint sin la cuenta del cliente.

**Tarea del día 1 del Sprint 4:** primera prueba con llaves reales y un cargo de
prueba pequeño, más entrega de correo verificada a Gmail, Outlook e iCloud.

### Evidencia

- **8 casos de firma** de webhook, sin base de datos.
- **16 casos de integración** del checkout completo, repetibles sobre la misma
  base.
- **91 criterios de aceptación** sobre el sitio construido, 12 nuevos.
- **Recorrido de extremo a extremo en navegador real** (`npm run test:e2e`): de la
  ficha al checkout, formulario incompleto, reserva creada, pago simulado y
  reserva confirmada al volver a la URL.
- Las 12 garantías del Sprint 0 y la prueba de carga, intactas.
- 60 pruebas automatizadas en total, typecheck y linter limpios.

### Hallazgos del sprint

1. **El middleware del Sprint 1 redirigía las rutas de API.** `/api/webhooks/...`
   respondía 307 hacia `/es/api/webhooks/...`, y **un proveedor de pagos no sigue
   redirecciones ni firma la URL nueva**: en producción ninguna reserva se habría
   confirmado. Se encontró al probar el endpoint con curl, no leyendo el código.
   Hay una comprobación en `scripts/smoke.sh` para que no vuelva a pasar.
2. **Mi propio código se contradecía con su comentario.** Una función decía
   consultar la configuración de cupo y en realidad suponía que solo los infantes
   no ocupan lugar. Ahora el número de lugares lo decide el motor de precios, que
   ya consultó esa configuración: una sola copia de la regla.
3. **`jsonb_build_object` no puede inferir el tipo de un parámetro.** Postgres se
   niega a adivinar y aborta. Casts explícitos.
4. **La página de confirmación no mostraba las fechas.** Es la página que el
   huésped guarda, y aterrizaba sin lo primero que quiere ver.

### Deuda técnica anotada

- Stripe y Resend sin ejecutar contra el servicio real (arriba).
- La simulación de pago vive en la aplicación y **se niega a actuar si hay llaves
  de Stripe presentes**. Conviene quitarla del build de producción en el Sprint 7.
- Imágenes sin optimizar (decisión 0001, se paga en el Sprint 6).

### Para la Retrospective

El hallazgo del middleware es el mismo patrón de los tres sprints anteriores: **lo
que no se ejecuta, no está verificado**. El código era correcto leyéndolo; el
sistema estaba roto. Cuatro sprints, cuatro veces la misma lección — vale la pena
dejar de tratarla como anécdota y aceptar que la barra de "probado desde fuera"
es la única que ha encontrado algo.
