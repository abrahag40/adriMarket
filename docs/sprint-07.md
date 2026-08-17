# Sprint 7 · semanas 13–14 · refinamiento y cierre

> **Sprint Goal**
> El sistema está en producción vendiendo, con avisos por WhatsApp, monitoreo y
> una operación capacitada para sostenerlo.

**Pronóstico:** 20 puntos (*yesterday's weather*: 22, 21, 21, 21, 21, 21).
**Refinado y listo:** 20 puntos en cinco elementos.

Es el último sprint del plan, y es el único cuyo objetivo **no se puede cumplir
solo con trabajo del equipo técnico**. Se dice al principio y no al final:

> **El Sprint Goal quedó cumplido a medias, y la mitad que falta no es código.**
> Todo lo que este sprint pedía construir está construido y verificado. Lo que
> impide vender son tres cuentas que el cliente no entregó: Stripe, el dominio
> de correo y el número de WhatsApp con sus plantillas aprobadas.

Lo que sí se puede afirmar sin asterisco: **el sistema está listo para el día que
lleguen**. La lista de ese día es [`docs/puesta-en-produccion.md`](puesta-en-produccion.md).

---

## S7-1 · WhatsApp: confirmaciones y recordatorios

**5 puntos** · Developers

> **Como** huésped que reservó por WhatsApp, **quiero** que me confirmen por
> WhatsApp, **para** no perder el aviso entre las promociones del correo.

```gherkin
Dado un huésped que dejó teléfono
Cuando se confirma su reserva
Entonces recibe el correo con el desglose completo
Y ADEMÁS un WhatsApp corto con la fecha, el saldo y el código

Dado un huésped sin teléfono
Entonces recibe solo el correo, y eso no es una falla

Dado un número local de diez dígitos
Entonces se completa con el código de país antes de mandarlo

Dado un dato faltante en la plantilla
Entonces se sustituye por un guion, porque un hueco en blanco lo rechaza Meta

Dada una salida cancelada por el operador
Entonces el aviso también sale por WhatsApp, con el motivo
```

**Notas técnicas.** Mismo patrón que la pasarela y el correo: interfaz de
proveedor, real por configuración, y **un proveedor local que arma el mensaje
exactamente igual** —misma plantilla, mismos parámetros, mismo texto— y lo guarda
en lugar de entregarlo. Lo único que no ocurre es la entrega.

WhatsApp se manda **además del correo, nunca en su lugar**. El correo lleva el
desglose, la política y el depósito de garantía; WhatsApp lleva lo que se lee en
la pantalla de bloqueo. Si un canal falla, el otro sigue.

El encolado va **en la misma transacción** que confirma o cancela, como el correo
desde el Sprint 3. Por eso la normalización del número vive en SQL: tenerla en
los dos lados garantiza que algún día difieran.

**Las plantillas están escritas en el formato exacto que Meta pide** para
registrarlas, con los huecos numerados. El trámite se hace copiando el texto de
`src/modules/notifications/whatsapp.ts` a la consola de Meta. Si el mensaje
enviado no coincide **carácter por carácter** con el aprobado, se rechaza en
producción — por eso hay una prueba que verifica que los huecos de las dos
versiones de idioma coincidan.

---

## S7-2 · Accesibilidad y rendimiento en conexiones lentas

**5 puntos** · Developers

> **Como** huésped en un hotel del Caribe, **quiero** que la página cargue y se
> lea, **para** poder reservar sin señal buena y a pleno sol.

```gherkin
Dada cualquier página pública, en tema claro y oscuro
Entonces axe no reporta ninguna violación de WCAG 2.2 AA

Dada cualquier página del panel
Entonces tampoco

Dada una página de la vitrina
Entonces pesa menos de 200 kB y menos de 140 kB son JavaScript

Dado un navegador sin JavaScript
Entonces el listado, los filtros, la cotización y el checkout funcionan igual
```

**Notas técnicas.** `npm run audit` corre las tres cosas contra el sitio
**construido**, no contra el de desarrollo: el tema oscuro y el contraste
dependen del CSS final.

El presupuesto de bytes es un **tope que falla la verificación**, no una meta
aspiracional. Sin él, cualquiera agrega un componente de cliente pesado y nadie
se entera hasta que un huésped abandona la página. Los números salen de medir lo
que hay y dejar margen: un presupuesto que ya se incumple el día que se escribe
no lo respeta nadie.

Que la vitrina funcione sin JavaScript no es una casualidad que convenga
conservar por accidente: es lo que hace que una conexión que falla a medias
todavía venda. Ahora está fijado por prueba.

---

## S7-3 · Observabilidad, alertas y manual de operación

**3 puntos** · Developers

> **Como** quien atiende una falla, **quiero** saber en un vistazo qué está mal y
> qué hacer, **para** no tener que leer el código a las siete de la mañana.

```gherkin
Dado el sistema sano
Cuando se consulta /api/health
Entonces responde 200

Dado el worker caído, un aviso muerto o un reembolso atorado
Entonces responde 503 y dice cuál de las comprobaciones falló

Dada una falla cualquiera
Entonces docs/operacion.md dice cómo se ve, qué significa y qué hacer
```

**Notas técnicas.** `/api/health` **no es un `{"ok": true}` que siempre responde
lo mismo**. Un chequeo que no puede fallar no informa de nada, y su único efecto
es que el monitoreo esté en verde mientras el negocio está parado. Comprueba las
cinco cosas cuya falla se traduce en dinero, y **responde 503 cuando alguna
falla**, que es lo que un monitor entiende sin configurarle reglas.

El latido del worker se registra en la bitácora al terminar. Es lo que hace
observable que esté vivo: un worker caído no se queja — deja de expirar
apartados y deja de mandar avisos, en silencio.

No lleva secreto a propósito: solo devuelve conteos, y un monitoreo que exige
credenciales es un monitoreo que alguien termina desconectando.

---

## S7-4 · Pruebas de aceptación con la operación y correcciones

**5 puntos** · Developers · **colchón deliberado**

El plan maestro lo dice desde el principio: *"este trabajo va a existir"*. Existió.

No se pudo hacer con la operación real —no hay operación real todavía— así que se
gastó en lo más parecido que había: **auditar el sistema completo con
herramientas que no dependen de mi criterio** y corregir lo que apareció. Los
cinco hallazgos están abajo, y tres de ellos eran defectos en producción esperando
a que alguien los usara.

## S7-5 · Capacitación del staff y documentación de uso

**2 puntos** · Developers

Tres documentos, cada uno para un lector distinto:

- [`docs/manual-del-panel.md`](manual-del-panel.md) — para quien trabaja aquí.
  Escrito para que no haga falta saber nada de computación. Incluye la tabla de
  qué puede hacer cada rol, para que "no me aparece" deje de ser una duda.
- [`docs/operacion.md`](operacion.md) — para quien atiende una falla. Cada
  sección dice cómo se ve el problema, qué significa y qué hacer, en ese orden.
- [`docs/puesta-en-produccion.md`](puesta-en-produccion.md) — la lista del día
  del despliegue, ordenada por dependencia.

---

## Dependencias y pendientes

| Qué | De quién | Estado |
|---|---|---|
| Cuenta de Stripe | Cliente | **vencida hace cuatro sprints · bloquea el cierre** |
| Dominio con SPF, DKIM y DMARC | Cliente | **pendiente · bloquea el cierre** |
| Número y plantillas de WhatsApp en Meta | Cliente | **pendiente · el trámite ni siquiera se inició** |
| Porcentajes de la política de cancelación | Cliente | vencida; el mecanismo espera los números |
| Base gravable del impuesto | Contador | necesaria antes de facturar |

---

## Cierre del sprint

**Sprint Goal: cumplido a medias**, y la mitad que falta no es código.

| Historia | Pts | Estado |
|---|---|---|
| S7-1 WhatsApp: confirmaciones y recordatorios | 5 | terminada, sin ejecutar contra Meta |
| S7-2 Accesibilidad y rendimiento | 5 | terminada |
| S7-3 Observabilidad y manual de operación | 3 | terminada |
| S7-4 Auditoría y correcciones | 5 | terminada |
| S7-5 Capacitación y documentación | 2 | terminada |
| **Velocidad real** | **20** | |

Velocidad acumulada: 22, 21, 21, 21, 21, 21, 20. Seis sprints seguidos en el
pronóstico.

**Lo que NO se pudo demostrar:** *una reserva real, de un huésped real, cobrada
en producción.* Sin la cuenta de Stripe no hay forma, y ninguna cantidad de
trabajo técnico la sustituye.

### Evidencia

- **22 garantías en SQL**, dos nuevas: que toda confirmación se encole con
  destinatario y que WhatsApp solo salga con número normalizable.
- **117 casos de integración**, 7 nuevos de plantillas de WhatsApp.
- **124 criterios** sobre el sitio construido, 11 nuevos.
- **25 comprobaciones de accesibilidad y peso** (`npm run audit`): cero
  violaciones de WCAG 2.2 AA en las dos temas, presupuesto de bytes respetado y
  la vitrina funcionando sin JavaScript.
- **Los cuatro recorridos en navegador**, repetibles: 8 del checkout, 18 del
  panel, 25 del día del huracán, 29 de la publicación.
- **La prueba de concurrencia** (`npm run db:bench`): sin sobreventa, sin
  desalineación y sin falsos conflictos.
- `/api/health` en 200.

Todo lo anterior corrió sobre una **base recreada desde cero** —`db:reset`, las
trece migraciones en orden y el seed— y no sobre la base de trabajo acumulada.
Es la casilla del DoD que dice *"las migraciones aplican limpias desde cero"*, y
es también lo que destapó las dos fallas de medición de más abajo: sobre una base
usada, ninguna de las dos se ve.

### Hallazgos del sprint

Cinco, y **tres eran defectos en producción esperando a que alguien los usara**:

1. **Ningún enlace de acceso del staff se habría entregado jamás.** El despacho
   de la bandeja exigía que todo aviso tuviera una reserva asociada, y el enlace
   de acceso no pertenece a ninguna: moría con *"aviso sin reserva asociada"*
   tras seis intentos. En desarrollo no se notaba porque los recorridos leen la
   URL directamente de la bandeja. **Con el correo configurado, nadie del equipo
   habría podido entrar al panel.** Las 44 filas muertas se reanimaron y se
   entregaron.
2. **`robots.txt` y `sitemap.xml` no existían.** El middleware ya los excluía del
   prefijo de idioma —así que alguien, yo, dio por hecho que existían— pero nada
   los generaba y respondían 404. Apareció **escribiendo la lista de puesta en
   producción**, al comprobar una casilla en vez de darla por buena; estuve a
   punto de escribir "ya lo hace" sobre algo que no era cierto.
3. **Un producto sin traducción reventaba el WhatsApp de su confirmación.** El
   nombre llegaba nulo y `null.trim()` mataba el aviso: el correo salía y el
   WhatsApp se reintentaba seis veces hasta morir. Apareció al despachar la
   bandeja de verdad.
4. **`--text-faint` estaba en 4.05:1**, por debajo del 4.5:1 que el propio
   encabezado del archivo dice verificar. Con él el pie, los días no disponibles
   del calendario y las notas de los formularios. **El token nunca estuvo en la
   lista de contrastes documentados**, y eso es exactamente por qué se salió de
   norma: un token que no está en la lista es uno que nadie vuelve a medir.
5. **El calendario de ocupación no se podía desplazar con teclado.** Es una
   región que se mueve en horizontal sin `tabindex`, así que quien no usa ratón
   veía media tabla.

Y dos que no eran del sistema sino de cómo lo medía:

- El recorrido del huracán contaba **el doble** de cancelaciones y reembolsos.
  Desde que el aviso también sale por WhatsApp, el `left join` contra la bandeja
  devuelve dos filas por reserva —mismo `template`, distinto canal— y las tres
  cuentas salían al doble. El sistema estaba bien; la consulta que lo
  verificaba, no.
- La barra de humo **fallaba contra una instalación recién creada**: pedía
  `/api/health` en 200 sobre una base donde el worker nunca había latido, y ahí
  el 503 es la respuesta correcta. Ahora provoca un latido antes de preguntar, y
  de paso comprueba que el secreto del worker sirve. El sistema estaba bien; la
  barra que lo verificaba, no.

### El falso defecto que costó más que los reales

Al mirar `/api/health` por primera vez aparecieron **confirmaciones con el
destinatario vacío**, de reservas cuyo cliente sí tenía correo. Un huésped que
paga y no recibe nada es la peor falla silenciosa posible, así que se investigó
como tal.

Durante un rato no tuvo explicación, y este documento llegó a decir eso mismo con
una hipótesis prudente: que la base tenía una definición intermedia de
`booking_confirm` de algún momento del Sprint 3. **La hipótesis era falsa y la
prudencia no la salvó.** Lo que la tumbó fue un detalle que estaba a la vista:
entre las filas vacías había una de **WhatsApp**, y esa es imposible —
`outbox_enqueue_whatsapp` solo inserta cuando `whatsapp_number` devuelve dígitos,
y nunca devuelve una cadena vacía. Si la fila existe y no la pudo escribir la
función, no la escribió la función.

La escribió una prueba. En `checkout.test.ts`, el caso *"un aviso que falla se
reintenta con espera creciente"* hace exactamente esto para provocar el fallo:

```sql
update outbox set to_address = '' where booking_id = …
```

Sin filtro de canal, sobre las tres filas, contra **la misma base que usa el
desarrollo**, y sin recogerlas al terminar. No había defecto de producción: había
un dato de prueba indistinguible de uno.

Lo que sí queda del episodio, y vale más que el susto:

- La prueba ahora **borra sus propias filas** al salir. Un residuo de prueba que
  se disfraza de síntoma hace que el monitoreo mienta, y un monitoreo que miente
  se deja de mirar — que es justo lo que `/api/health` existe para evitar.
- La **garantía 21** se queda: verifica en SQL que toda confirmación se encola
  con destinatario. Nació persiguiendo un fantasma y cubre algo real.
- `docs/operacion.md` §3.1 sigue siendo el procedimiento correcto para un aviso
  muerto de verdad; lo que faltaba era el paso previo: **antes de tratar un
  síntoma como defecto, comprobar si el dato pudo entrar por donde uno cree.**

### Deuda técnica al cierre

Todo junto, para que nadie lo descubra después:

- **Stripe, correo y WhatsApp sin ejecutar contra el servicio real.**
- **Los reembolsos se registran, no se ejecutan.** Paso manual documentado.
- **Los cupones se administran pero no se canjean.**
- **El panel no crea opciones de tour ni unidades de estancia.**
- **Sin colchón de rotación** entre estancias (regla 2.9 del SME).
- **El cobro parcial del saldo se rechaza** a propósito.
- Los recorridos de navegador consumen inventario y no lo devuelven.

### Para la Retrospective

Ocho sprints. La lección se fue afinando y ahora tiene tres filos:

1. **Lo que no se ejecuta no está verificado** (sprints 1–3).
2. **Lo que no se mira tampoco** (sprints 4 y 6, mirando capturas).
3. **Las pruebas se pudren solas** (sprint 5).

Este sprint agregó un cuarto, y es el que más me costó: **lo que se da por hecho
no está verificado, y lo que uno mismo escribe en un documento es donde más
fácil se cuela.** El defecto de `robots.txt` apareció porque me obligué a
comprobar una casilla de una lista que yo mismo estaba escribiendo, en vez de
marcarla. Iba a escribir "ya lo hace".

Y un quinto, que es el mismo filo por el otro lado: **decir "no sé" tampoco es
gratis.** El destinatario vacío se escribió aquí como un misterio honesto, con su
hipótesis marcada como hipótesis — y todo eso era correcto salvo lo importante:
había una fila que la función no podía haber escrito, y esa contradicción estaba
disponible desde el principio. La humildad bien redactada no sustituye a seguir
la única pista que no cuadra.

Los tres defectos de producción de este sprint —los enlaces de acceso, el
WhatsApp que reventaba, el robots inexistente— tienen algo en común: **ninguno
tenía prueba que fallara**. Todos aparecieron al usar el sistema completo con
herramientas externas: axe, un presupuesto de bytes, un chequeo de salud que sí
puede fallar. Las herramientas encontraron lo que mis pruebas no buscaban, porque
mis pruebas verifican lo que se me ocurrió verificar.

La conclusión práctica para el siguiente equipo: **la barra de "probado desde
fuera" sigue siendo la única que ha encontrado algo**, y el chequeo de salud es
la versión de esa barra que funciona sin que nadie corra nada.
