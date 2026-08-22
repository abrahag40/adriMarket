# Puesta en producción

Lista de verificación para el día del despliegue. Está ordenada por dependencia:
si un paso falla, el siguiente no tiene sentido.

**Lo que falta no es código.** Al cierre del Sprint 7 el sistema está completo y
verificado contra proveedores locales que recorren el mismo camino que los
reales. Lo que impide vender son tres cuentas que el cliente todavía no entregó.

---

## Bloqueantes · sin esto no se vende

| # | Qué | De quién | Estado |
|---|---|---|---|
| 1 | Cuenta de Stripe con llaves de producción | Cliente | **pendiente desde el Sprint 3** |
| 2 | Dominio con SPF, DKIM y DMARC para el correo | Cliente | pendiente |
| 3 | Número de empresa y plantillas aprobadas en Meta | Cliente | pendiente |

Los tres son trámites, no desarrollo. El 3 es el más lento: la aprobación de
plantillas tarda de horas a días y **hay que iniciarla antes** de necesitarla.

Sin el 1 no se puede cobrar. Sin el 2 los correos llegan a spam o no llegan. Sin
el 3 no sale WhatsApp, pero el correo sí — el sistema manda por los dos canales
justamente para que la falta de uno no deje a nadie sin enterarse.

---

## 0. Dónde vive · decidido

| Pieza | Dónde | Nota |
|---|---|---|
| El sitio | Un host con **runtime de Node** | No edge: `sharp`, el disco y `postgres` por TCP lo exigen |
| La base | **Neon**, PostgreSQL gestionado | Con `btree_gist` disponible. Conexión **directa** para migraciones |
| Dominio, caché y protección | **Cloudflare**, al frente | Que no cachee `/admin`, `/api` ni `/media` con reglas propias |
| Las fotos | Volumen **persistente** en el host | Si el disco es efímero, desaparecen en el siguiente despliegue |

El porqué, con las alternativas descartadas, está en
[`decisiones/0002-donde-vive-el-sistema.md`](decisiones/0002-donde-vive-el-sistema.md).
**No hace falta cambiar una línea de código para desplegar:** lo que se probó es
lo que se sube.

---

## 1. Base de datos

- [ ] PostgreSQL 16 o superior, con `btree_gist` disponible.
- [ ] `DATABASE_URL` apuntando a la conexión **directa** para migraciones.
- [ ] Si el runtime usa un pooler en modo transacción, `DATABASE_POOL_MAX` bajo:
      el límite real es *(instancias × este valor)* y las instancias suben solas.
- [ ] `npm run db:migrate` — aplica en orden y registra lo aplicado.
- [ ] **No correr el seed.** Son datos de desarrollo.
- [ ] Copias de seguridad automáticas activadas y **una restauración probada**.
      Una copia que nunca se restauró no es una copia.

## 2. Variables de entorno

| Variable | Para qué | Si falta |
|---|---|---|
| `DATABASE_URL` | base | no arranca |
| `NEXT_PUBLIC_SITE_URL` | canonical, hreflang y retorno de la pasarela | el huésped vuelve de pagar a una dirección equivocada |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | cobro real | se usa la pasarela local: **no cobra** |
| `RESEND_API_KEY` + `MAIL_FROM` | correo real | el aviso se guarda pero no se manda |
| `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` | WhatsApp real | no se manda |
| `JOBS_SECRET` | protege el latido | el worker queda abierto |
| `MEDIA_DIR` | dónde viven las fotos | usa `var/media` del proyecto |
| `PRIVACY_VERSION` | versión del aviso que acepta el huésped | consentimiento sin versión |

> **`NEXT_PUBLIC_SITE_URL` se fija al construir, no al arrancar.** Next reemplaza
> esas variables durante la compilación. Cambiarla exige volver a construir.

## 3. Almacenamiento de fotos

- [ ] `MEDIA_DIR` en un volumen **persistente**. Si el disco es efímero, las
      fotos desaparecen en el siguiente despliegue.
- [ ] Incluido en las copias de seguridad: no están en la base ni en el
      repositorio.
- [ ] CDN delante de `/media/*`, si lo hay. Los archivos no cambian nunca
      —el nombre lleva identificador y ancho— y ya se sirven con
      `cache-control: immutable`.

## 4. El worker

- [ ] Cron **cada minuto** a `POST /api/jobs/tick` con la cabecera
      `x-job-secret`.
- [ ] Verificar que efectivamente corre: `/api/health` debe decir
      `worker.ok = true`.

Es el paso que más se olvida y el que peor falla, porque **falla en silencio**:
sin él los apartados no expiran, los avisos no salen y los recordatorios
tampoco. Nada da error; simplemente deja de pasar.

## 5. Pasarela de pago

- [ ] Llaves de producción configuradas.
- [ ] Webhook apuntando a `https://EL-SITIO/api/webhooks/stripe`.
- [ ] Eventos suscritos: los de pago exitoso y fallido.
- [ ] **Comprobar que el webhook no recibe una redirección.** El middleware de
      idioma excluye `/api` a propósito: un proveedor de pagos no sigue
      redirecciones ni vuelve a firmar la URL nueva, y en el Sprint 3 eso
      significó que ninguna reserva se confirmaba.
      ```
      curl -i -X POST https://EL-SITIO/api/webhooks/stripe -d '{}'
      ```
      Tiene que responder `400` (firma inválida), **nunca `3xx`**.
- [ ] Un cargo de prueba pequeño de extremo a extremo, y **su devolución**.

## 6. Correo

- [ ] Dominio verificado con SPF, DKIM y DMARC.
- [ ] `MAIL_FROM` en ese dominio.
- [ ] Prueba de entrega real a **Gmail, Outlook e iCloud**, revisando que no
      caiga en no deseado. Son los tres que usa el 95% de los huéspedes.

## 7. WhatsApp

- [ ] Número de empresa verificado.
- [ ] Las tres plantillas registradas y **aprobadas**, copiadas literalmente de
      `src/modules/notifications/whatsapp.ts`.
- [ ] Categoría **utilidad**, no marketing.
- [ ] Un mensaje de prueba a un número real.

> Si el texto enviado no coincide **carácter por carácter** con el aprobado,
> Meta rechaza el mensaje en producción. Cambiar una coma obliga a registrar de
> nuevo.

## 8. El equipo

- [ ] Cuentas creadas con el rol que corresponde. Menos es más: recepción no
      necesita ser gerencia.
- [ ] Cada quien entró una vez y encontró su pantalla.
- [ ] `docs/manual-del-panel.md` compartido con el equipo.
- [ ] `docs/operacion.md` con quien vaya a atender una falla.

## 9. Antes de anunciar

- [ ] `npm run db:test` — las 22 garantías.
- [ ] `npm run test:integration`.
- [ ] `./scripts/smoke.sh` contra **producción**.
- [ ] `npm run audit` — accesibilidad y peso.
- [ ] `/api/health` en `200`.
- [ ] Monitoreo externo pegándole a `/api/health` cada cinco minutos, con alerta
      cuando responda `503`.
- [ ] `robots.txt` permitiendo el sitio y **bloqueando `/admin`** (ya lo hace).
- [ ] Una reserva de verdad, con tarjeta de verdad, cobrada y confirmada.

---

## Lo que queda pendiente y hay que decir

Se dice aquí para que nadie lo descubra después:

- **Los reembolsos se registran, no se ejecutan.** Cancelar deja la devolución
  anotada; hacerla en la pasarela es un paso manual. Está en `docs/operacion.md`
  §4. Automatizarlo depende de la cuenta de Stripe.
- **Los cupones se administran pero no se canjean.** No hay campo en el checkout.
- **El panel no crea opciones de tour ni unidades de estancia.** Un tour nuevo
  necesita su opción —hora, duración, punto de encuentro, precios por pasajero—
  y eso todavía se inserta a mano.
- **No hay colchón de rotación entre estancias.** Cuando la limpieza no alcanza
  para rotar el mismo día, se bloquea el día a mano desde el panel.
- **El cobro parcial del saldo se rechaza a propósito**, porque no hay regla de
  negocio acordada.
