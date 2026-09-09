# 0016 · Stripe se queda en sandbox hasta tener los datos fiscales del cliente

**Fecha:** 2026-09-09
**Estado:** aceptada · **bloqueada por el cliente**

## El bloqueo

La integración con Stripe **está verificada de punta a punta** contra la API
real, pero en una cuenta *sandbox*: `acct_1UDDar…` · **AlexisTours sandbox**.

Una cuenta sandbox no emite llaves `sk_live_`. Para salir de ahí hay que activar
la cuenta real, y Stripe pide para eso lo que el cliente **todavía no ha
entregado**:

- razón social y RFC,
- domicilio fiscal,
- identificación del representante legal,
- cuenta bancaria de depósito (CLABE).

No es un trámite que se pueda adelantar desde este lado: son datos oficiales de
un tercero. Mientras no lleguen, **producción no puede cobrar** y el checkout se
queda cerrado — que es el comportamiento correcto, no una avería
(ver [decisión 0011](0011-el-simulador-es-un-permiso.md)).

## Qué SÍ quedó comprobado, para no repetirlo

El 2026-09-09 se ejercitó el camino completo con llaves de prueba, que son
gratis e inmediatas y no exigen cuenta verificada. `stripe.ts` llevaba cinco
sprints escrito **sin haberse ejecutado nunca**; ya no:

| Camino | Resultado |
|---|---|
| Crear sesión de cobro | ✅ `cs_test_…`, con `expires_at` atado al apartado |
| Página de pago alojada | ✅ redirección y cobro con tarjeta de prueba |
| Webhook firmado **por Stripe** | ✅ `signature_ok = t` |
| `booking_confirm` | ✅ reserva a `confirmed`, saldo y avisos en la misma transacción |
| Cancelar y liberar inventario | ✅ 0 lugares sin liberar |
| `refund()` | ✅ `re_…`, y **dos llamadas devolvieron el mismo reembolso** |
| Liquidar en `/admin/reembolsos` | ✅ con método, fecha, autor y referencia |

Las dos correcciones del día anterior quedaron demostradas contra Stripe real:
la llave de idempotencia estable —con la aleatoria anterior, el segundo intento
habría devuelto el dinero **dos veces**— y el `GET` para recuperar la sesión,
que antes era un `POST` al endpoint de *actualizar*.

**Del lado del código no falta nada para cobrar.** Lo que falta es la cuenta.

## La trampa que apareció y hay que recordar el día del despliegue

El primer pago de prueba **se cobró y el webhook nunca llegó**. La causa no era
el código:

| | Cuenta |
|---|---|
| La llave `sk_test_` | `acct_1UDDar…` · AlexisTours sandbox |
| El CLI (`stripe listen`) | `acct_1P9soH…` · Zahardev |

El CLI escuchaba **otra cuenta**, así que nunca vería ese evento; y el `whsec_`
que había guardado era el de esa otra cuenta, de modo que aunque el evento
hubiera llegado, la firma no habría verificado.

El síntoma es el peor posible: **el dinero entra y el sistema no se entera**,
indistinguible de un webhook roto. Se resuelve atando el reenviador a la misma
cuenta de la llave:

```bash
stripe listen --api-key "$STRIPE_SECRET_KEY" --forward-to …/api/webhooks/stripe
```

**El día del despliegue real vale lo mismo**: el `whsec_` de producción sale del
panel **de la cuenta que va a recibir el dinero**. Equivocarse de cuenta da
exactamente el mismo silencio.

## Qué hacer cuando lleguen los datos

1. El cliente activa la cuenta real de Stripe con su información fiscal.
2. Del panel de **esa** cuenta salen `sk_live_` y, del endpoint que se cree
   apuntando a `https://adrimarket.vercel.app/api/webhooks/stripe`, el
   `whsec_`. Suscrito a `checkout.session.completed`,
   `checkout.session.expired` y `payment_intent.payment_failed`.
3. Se cargan en Vercel:
   ```bash
   vercel env add STRIPE_SECRET_KEY production
   vercel env add STRIPE_WEBHOOK_SECRET production
   ```
4. Se despliega. `gatewayState()` pasa a `stripe` solo y el checkout abre.
5. Se comprueba: `/api/health` debe decir `Stripe: el checkout cobra`, y
   `POST /api/webhooks/stripe` debe responder **400** a una firma inválida,
   nunca `3xx`.

## Lo que hay que resolver ANTES de abrir el cobro

No es orden de gustos: cada uno le pega a un huésped que ya pagó.

1. **El correo.** Hoy la credencial de Gmail está rechazada; alguien que pague
   no recibe ni confirmación ni comprobante. Se resuelve con
   `./scripts/correo.sh`, que **comprueba antes de cargar**.
2. **La base gravable** (decisión abierta 1 del cliente). Cada reserva se
   calcula hoy con un supuesto fiscal que nadie confirmó. Con el simulador daba
   igual; con dinero real es un problema contable desde la primera venta — y
   justamente el cliente que debe esos datos es el mismo que debe los de Stripe.
3. **Los porcentajes de la política de cancelación** (decisión abierta 2). El
   mecanismo está construido y espera números.

## La alternativa descartada

**Abrir el cobro con la cuenta personal de quien desarrolla.** Técnicamente
funcionaría y el sitio empezaría a vender mañana. Se descartó porque el dinero
de los huéspedes caería en una cuenta que no es la del negocio, los comprobantes
saldrían a nombre equivocado y la responsabilidad fiscal quedaría en la persona
equivocada. El bloqueo es del cliente y se queda del lado del cliente.
