# 0003 · El comprobante QR va como adjunto, no como imagen embebida

**Estado:** decidido · **Sprint:** post-7 (panel de opciones de tour y
comprobante QR) · **Decide:** Developers

## Pregunta

El cliente pidió que la confirmación de reserva incluya un comprobante con
código QR. ¿Cómo se entrega ese QR dentro de un correo que hoy es texto plano?

## Contexto

- `src/modules/notifications/templates.ts` genera **texto plano a propósito**
  desde el Sprint 3: llega igual a cualquier cliente de correo, no cae en spam
  por HTML mal formado y se lee bien en una conexión mala. El propio comentario
  del archivo dice que la versión con diseño entra "cuando haya volumen que lo
  justifique" — es decir, todavía no.
- El QR tiene que reflejar el estado real de la reserva en el momento en que se
  escanea, no un dato congelado al momento de mandar el correo: una
  reprogramación o una cancelación después del correo no debe dejar un QR que
  miente.
- `Transport` (la interfaz de envío) no tenía manera de adjuntar nada; solo
  mandaba `{ to, subject, text }`.

## Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **A. Imagen incrustada en HTML** (`<img src="data:image/png;base64,...">`) | No agrega concepto nuevo al transporte | Obliga a mandar el correo en HTML — justo la decisión que el Sprint 3 pospuso a propósito — y varios clientes de correo bloquean imágenes `data:` por seguridad, así que ni siquiera se vería |
| **B. Imagen incrustada por `cid:`** (adjunto referenciado desde el HTML) | Es la forma correcta de embeber en clientes reales | Mismo problema de fondo: exige generar HTML además de texto, duplicar la plantilla, y probar el render en varios clientes — alcance mucho mayor que "mandar un QR" |
| **C. PNG como adjunto del correo de texto plano** | Cero cambios a la plantilla de texto; el `Transport` solo necesita un campo `attachments` opcional; funciona en cualquier cliente de correo sin depender de que renderice HTML | El comprobante no se ve "en línea" dentro del cuerpo del correo — hay que abrir el adjunto |

## Decisión

**Opción C.** El QR se genera con la librería `qrcode` (pura en JavaScript, sin
binario nativo — no repite el problema que ya se evaluó con `sharp` en la
[decisión 0002](0002-donde-vive-el-sistema.md)) y se manda como adjunto
`comprobante-{código}.png` únicamente en `booking_confirmed_guest`, el correo
de confirmación al huésped. El texto del correo avisa que el adjunto existe.

El QR **no lleva datos del huésped adentro** — solo la URL pública
`/{locale}/reserva/{code}`, que ya existía desde el Sprint 3. Nombre, correo,
monto y fechas se leen de esa página en el momento de escanear, con el estado
real de la reserva.

## Por qué

1. **No reabre la decisión del Sprint 3.** Mandar HTML de verdad —con diseño,
   probado contra Gmail, Outlook y clientes móviles— es un trabajo aparte que
   sigue esperando volumen que lo justifique. Un adjunto no lo necesita.
2. **El QR nunca puede mentir.** Si llevara los datos codificados adentro y la
   reserva cambiara después, el comprobante impreso seguiría enseñando lo
   viejo. Apuntando a la página, siempre se lee el estado actual.
3. **Es la mínima extensión posible al transporte.** `Transport.send()` ganó un
   campo `attachments?` opcional; `ResendTransport` lo manda en base64 como pide
   la API de Resend; `LocalTransport` lo deja pasar sin usarlo, y el nombre del
   archivo queda inspeccionable en el `payload` de la bandeja de salida — igual
   que ya se podía inspeccionar el texto.

## Consecuencias

- Nueva dependencia: `qrcode` (+ `@types/qrcode`), sin binario nativo, sin
  fricción con Render ni con Neon.
- `src/modules/notifications/voucher.ts` concentra la generación; `send.ts`
  decide en qué plantilla adjuntarlo.
- WhatsApp sigue sin comprobante: la Cloud API solo entrega plantillas de texto
  aprobadas por Meta carácter por carácter, y meter un adjunto ahí es un cambio
  de alcance distinto — no se tocó en esta iteración.

## Qué se rechazó explícitamente

Mandar el QR (o un enlace) por WhatsApp en esta misma iteración. El canal de
WhatsApp solo admite plantillas de texto ya aprobadas por Meta
(`docs/puesta-en-produccion.md` §7); agregar un enlace ahí exige registrar una
plantilla nueva y esperar la aprobación, que es trámite del cliente y no
código. Queda para cuando el cliente decida si lo quiere.
