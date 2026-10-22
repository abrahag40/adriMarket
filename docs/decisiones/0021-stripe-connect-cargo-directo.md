# 0021 · Stripe Connect con cargo directo y comisión de la plataforma

**Fecha:** 2026-10-22 · **Estado:** aceptada (falta la prueba en sandbox)

## Contexto

ZaharDev cobra el **2.5% de cada venta** por el uso de la plataforma. El dinero
de cada venta es del cliente (Conquest Tours): él paga a sus proveedores.

## Decisión

**Stripe Connect, cargo directo en la cuenta del cliente, con `application_fee_amount`.**

- El cobro se crea con el encabezado `Stripe-Account: acct_…` del cliente. El
  cliente es el vendedor: su nombre sale en el estado de cuenta del huésped, Stripe
  le descuenta a él su comisión, y reembolsos y contracargos salen de su saldo.
- La comisión de ZaharDev (`PLATFORM_FEE_BPS`, 250 = 2.5%) se calcula sobre el
  **total** de la reserva y se cobra de lo que pasa por la pasarela; nunca más
  que el cobro.
- Con «Stripe cobra directamente a las cuentas conectadas» la plataforma no paga
  cuotas de Connect (stripe.com/mx/connect/pricing, 2026-10-22).
- Sin `STRIPE_CONNECTED_ACCOUNT` todo sigue como antes: el sitio cobra en la
  cuenta de su propia llave.

## Alternativas descartadas

- **Cobrar todo en la cuenta de ZaharDev y transferirle al cliente.** El Acuerdo
  de Servicios de Stripe prohíbe actuar como intermediario para sus servicios
  (§1.2) y compartirlos (§2.5); la vía autorizada es Connect. Además ZaharDev
  cargaría con reembolsos y contracargos, y con el ingreso del total.
- **Cargos a un destino.** Funcionan, pero los cobros, reembolsos y disputas
  quedan en el saldo de la plataforma. Aquí el vendedor es el cliente.

## Lo que queda abierto

- Probar el camino completo en sandbox: cuenta conectada de prueba, cobro con
  comisión, webhook de Connect y reembolso.
- El alta de la cuenta del cliente (liga de alta de Connect) y el webhook de
  Connect en la cuenta de la plataforma.
