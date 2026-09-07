# 0012 · El dinero que sale también se audita

**Fecha:** 2026-09-07
**Estado:** aceptada

## Contexto

Cancelar una reserva registraba la devolución —`booking_cancel` inserta la fila
de `refunds` en la misma transacción que cancela, y eso siempre estuvo bien— y
ahí se acababa. `provider.refund()` existía en la interfaz y en los dos
proveedores, y **no se llamaba desde ningún lado**.

La consecuencia no era la que decía la documentación. El texto hablaba de "un
paso manual documentado", pero el paso era:

```sql
update refunds set status = 'succeeded', provider_ref = 'LA-REFERENCIA'
 where id = 'EL-ID';
```

contra la base de **producción**. Y quien opera el panel es recepción, desde un
teléfono. Un procedimiento que exige una consola SQL es un procedimiento que no
se ejecuta: la fila se quedaba en `pending`, a las 24 h `/api/health` pasaba a
`degraded` con `refunds: { ok: false }` y **ahí se quedaba para siempre**,
porque el panel no tenía ninguna vista de reembolsos desde la que salir.

Dicho de otro modo: la primera cancelación real dejaba el monitoreo en rojo
permanente, y el rojo permanente enseña a ignorar el rojo.

Al revisar el esquema apareció algo más interesante. `payments` ya estaba
preparada para auditarse: `method`, `provider`, `provider_ref`, `fee_cents`,
`net_cents`, `fx_rate`, `paid_at` y un `collected_by` cuyo comentario dice
*"Quién cobró el saldo en el mostrador. Trazabilidad de efectivo"*. `refunds`
no tenía nada de eso. **El dinero que entra se podía auditar; el que sale, no.**

## Decisión

El reembolso se **liquida fuera del sistema y se registra dentro**, y `refunds`
se vuelve simétrica con `payments`.

Migración 0021 agrega `method` (reutilizando el enum `payment_method`, que ya
traía `spei`, `transfer`, `cash` y `card`), `settled_at`, `settled_by`, `notes`,
`receipt_url` y `receipt_mime`. Más una restricción:

```sql
check (status <> 'succeeded'
       or (settled_at is not null and method is not null and settled_by is not null))
```

**Marcar dinero como devuelto exige cómo, cuándo y quién.** Va en la base y no
en el formulario porque el formulario no es el único camino a la tabla — el
procedimiento viejo era precisamente un `UPDATE` a mano.

Y una pantalla, `/admin/reembolsos`: los pendientes con su antigüedad y un
formulario que pide método, clave de rastreo, comprobante y notas. La fecha y
el autor los pone el servidor desde la sesión; no se teclean, porque una fecha
que el usuario escribe es una fecha que el usuario se equivoca.

**Registrar exige rol `manager`.** Ver la lista es operación; declarar que el
dinero salió es contabilidad, y conviene que no sea la misma persona que
canceló. La jerarquía de roles ya existía.

### Que sea manual no es una etapa provisional

Es la parte que la documentación anterior tenía mal. El negocio cobra el
anticipo en línea y **el saldo en destino, en efectivo**: parte del dinero nunca
pasa por la pasarela, y lo que no entró por ahí no puede salir por ahí. Un
reembolso de un saldo cobrado en el mostrador jamás será un reembolso de Stripe.

O sea que el camino manual hace falta **siempre**. Cuando Stripe llegue será un
`method` más de los que ya están en el enum, no un camino aparte. Lo único que
sigue pendiente de esa cuenta es que la devolución a tarjeta se dispare sola.

## Las alternativas descartadas

**Esperar a Stripe y automatizarlo todo.** Descartada por lo de arriba: no
cubriría el efectivo ni las transferencias, que son la mayoría de los casos de
este negocio, y mientras tanto el monitoreo seguiría en rojo permanente.

**Un botón de "marcar como pagado" sin pedir nada más.** Es lo que la mayoría
haría, y habría sacado el 503 igual de rápido. Se descartó porque deja el mismo
agujero con mejor cara: una fila que dice `succeeded` y no puede decir quién lo
afirmó ni contra qué movimiento bancario. El costo de pedir tres datos más lo
paga una sola persona una vez por cancelación; el costo de no pedirlos lo paga
quien intente conciliar el mes.

**Guardar el comprobante en una tabla aparte.** Es 1:1 con la devolución, así
que dos columnas bastan. Si algún día hay que partir un reembolso en dos
transferencias, se registran dos filas de `refunds`, que es lo correcto de todas
formas.

## Lo que esto habilita

Sin plomería nueva, uniendo con `bookings` y `booking_items`:

- **Tiempo de devolución** = `settled_at − created_at`. Es lo que el huésped
  percibe y lo único que se puede mejorar a propósito. Antes no se podía
  calcular: `updated_at` es un trigger que se mueve al corregir una nota.
- Reembolsos **por método y por mes**, para conciliar contra el estado de cuenta.
- Quién ejecuta devoluciones.
- Tasa de cancelación por producto y temporada.

Sumado a `fee_cents` y `net_cents` de `payments`, que ya existían, sale ingreso
neto real.

## Cómo se comprobó

- **Garantía 25** en `db/tests/guarantees.sql`: sin explicar rebota, a medias
  también, completa pasa y conserva los tres datos, y `pending` sigue sin exigir
  nada. **Se verificó que falla con el defecto puesto** — quitada la
  restricción, el caso (a) se pone en rojo.
- `refunds.test.ts`, cinco casos, incluido que **dos liquidaciones simultáneas
  no producen dos pagos**: el `where status = 'pending'` hace que la segunda no
  encuentre nada y lo diga, en vez de sobrescribir en silencio la fecha y el
  autor de la que sí ocurrió.
- La prueba **recoge los reembolsos que crea**, acotados a los productos de su
  propia corrida. Es la disciplina que ya estaba escrita en `cancel.test.ts` y
  que existe porque un dato de prueba con forma de síntoma de producción costó
  una investigación entera.
