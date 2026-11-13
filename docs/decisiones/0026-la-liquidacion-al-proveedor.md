# 0026 · La liquidación al proveedor

**Fecha:** 2026-11-13 · **Estado:** aceptada; probada en local, en el panel y en la CI · **Decide:** ZaharDev (Abraham, 2026-11-12)

## Pregunta

En un sitio que revende ([decisión 0025](0025-reventa-el-precio-del-proveedor.md)),
el turista le paga todo a ZaharDev. Abraham le transfiere después a Alexis, por
SPEI, el 100 % de su precio por cada reserva. Para eso el panel tiene que decir
tres cosas:

- **cuánto** se le debe a Alexis por cada venta;
- **cuánto quedó de verdad** para ZaharDev, con la comisión que cobró Stripe y no
  con la que se supuso;
- **si ya se le pagó**, cuándo, cómo y con qué referencia.

## Decisión

### La comisión real, leída del cargo

`payments` ya tenía `fee_cents` y `net_cents` desde la migración 0006, pero nadie
las llenaba. Ahora se llenan, y se agrega `card_country`. Los tres datos salen de
la API de Stripe, en una sola llamada: la sesión de pago con su intento, su cargo
y el registro contable del cargo expandidos.

- el país, de `charge.payment_method_details.card.country`;
- la comisión, de `balance_transaction.fee`, que ya suma la de Stripe y su IVA.

Se leen **después** de confirmar el pago, fuera de la transacción del webhook. Es
una llamada de red: si Stripe tarda, la reserva no lo espera ni se cae con él. Lo
que falle lo reintenta el latido, que revisa los cobros de reventa de los
últimos 30 días que aún no tienen el dato.

En un sitio que no revende no hay nada que leer, y el latido ni siquiera
construye la pasarela. adriMarket y Conquest no cambian.

Si Stripe todavía no asentó el cargo, o lo asentó en otra moneda, el dato queda
en `null`, **nunca en cero**. El panel muestra entonces el modelo de tarjeta
extranjera, marcado como «estimado».

El simulador responde lo que cobraría Stripe con una tarjeta extranjera, la peor
para el margen. Así se recorre la liquidación entera en local y en la vista
previa, y el panel marca esos cobros como simulados.

### La transferencia, auditada como una devolución

`supplier_payouts` guarda una transferencia por reserva, simétrica a la
devolución de la migración 0021. No se registra sin decir cómo, cuándo, con qué
clave de rastreo y quién.

**El monto no se captura.** Lo pone `supplier_payout_record()` a partir de
`bookings.supplier_cents`, el que se congeló al reservar. Un formulario que lo
pidiera invitaría a escribirlo mal, y un disparador impide otro monto también
por SQL a mano.

Sólo se liquida lo cobrado: confirmada, en curso, completada o no-show. Una
reserva cancelada se resuelve con su política.

### La pantalla

`/admin/liquidacion`, sólo para gerencia y sólo en un sitio que revende; en otro
sitio no aparece en el menú y responde 404. Por cada reserva muestra:

- lo que pagó el turista;
- lo que se quedó la pasarela y el país de la tarjeta;
- lo del proveedor;
- lo que quedó para el sitio.

Arriba dice el total por transferir. **Si una venta deja menos del 2.5 %**, por
un cupón o por una tarjeta que cobró más, la fila lo marca.

## Cómo se prueba

- **Garantía 29**. Rechaza:
  - una reserva que no es de reventa;
  - una sin cobrar;
  - una transferencia sin clave de rastreo;
  - una con fecha futura;
  - una segunda transferencia por la misma reserva;
  - otro monto metido por SQL;
  - un país que no es código ISO.

  La transferencia buena queda por el monto que se debe y con bitácora.
- **`stripe.test.ts`**. Prueba la llamada y la lectura con la forma de los
  objetos que documenta la API. Sin registro contable expandido, o en otra
  moneda, la comisión queda sin dato; sin cargo, todo queda sin dato.
- **`payouts.test.ts`**, el camino del panel completo:
  - lee el cargo una vez y no vuelve a pedirlo;
  - la lista cuadra cobro − pasarela − proveedor;
  - la transferencia se registra una vez;
  - lo cancelado y lo ajeno no aparecen.

  Se vio fallar quitando tres reglas del módulo, una por una. Corre dentro de una
  transacción con una sola conexión, igual que `resale.test.ts`.
- **A mano, en el panel local** (2026-11-13), con la marca ZaharDev Tours:
  1. Una reserva de dos adultos pagada con el simulador. El webhook confirmó y
     leyó el cargo: tarjeta de US, comisión de 188.08 sobre 3,881.58.
  2. El panel mostró 3,600 para el proveedor y 93.50 para el sitio, arriba del
     piso de 90.00.
  3. Se registró la transferencia desde el formulario.

  En esa revisión apareció el redondeo de la 0025.

## Lo que queda abierto

- **Stripe sandbox.** El código lee los campos que documenta la API, pero
  nunca habló con Stripe de verdad. Depende de decidir qué cuenta cobra.
- **Una reserva cancelada después de pagar.** No se liquida aquí. Qué le toca al
  proveedor depende de su política de cancelación, que todavía no existe por
  escrito.
- **Reprogramar después de transferir** puede cambiar `supplier_cents`. La
  transferencia guarda el monto que se pagó, y la diferencia no se muestra
  todavía.
