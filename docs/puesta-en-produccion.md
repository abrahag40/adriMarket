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
| 2 | Dominio propio, verificado en Resend con SPF, DKIM y DMARC | Cliente | pendiente — **no hay dominio todavía**; la cuenta de Resend existe y no tiene ninguno |
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
| El sitio | **Vercel** (`adrimarket.vercel.app`, plan gratuito) | Sin dominio propio por decisión del cliente — ver decisión 0005 |
| La base | **Neon**, PostgreSQL gestionado | Con `btree_gist` disponible. Conexión **agrupada** (pooler) para el runtime, **directa** para migraciones |
| Las fotos | **Vercel Blob** | Por configuración (`BLOB_READ_WRITE_TOKEN`), no disco: una función de Vercel no tiene sistema de archivos persistente |
| El latido | **GitHub Actions**, bucle de un minuto | El cron nativo de Vercel gratis es de máximo una vez al día, y un `schedule` de GitHub cada 5 minutos resultó correr cada varias horas — no confiable |

El porqué, con las alternativas descartadas, está en
[`decisiones/0005-vercel-y-blob.md`](decisiones/0005-vercel-y-blob.md). La
decisión anterior, Render + Cloudflare, está en
[`decisiones/0002-donde-vive-el-sistema.md`](decisiones/0002-donde-vive-el-sistema.md)
— histórica, no se borró, sigue explicando por qué Cloudflare Workers y D1
quedan descartados en cualquier caso.

---

## 1. Base de datos

- [ ] PostgreSQL 16 o superior, con `btree_gist` disponible.
- [ ] `DATABASE_URL` apuntando a la conexión **directa** para migraciones.
- [ ] Si el runtime usa un pooler en modo transacción, `DATABASE_POOL_MAX` bajo:
      el límite real es *(instancias × este valor)* y las instancias suben solas.
- [ ] `npm run db:migrate` — aplica en orden y registra lo aplicado. La
      `DATABASE_URL` que se exporte manda sobre `.env`, e imprime el servidor
      de destino con la contraseña tapada antes de tocar nada: si lo que sale
      no es Neon, hay que parar.
- [ ] **No correr el seed.** Son datos de desarrollo.
- [ ] Pero el seed carga una cosa que **no** es dato de desarrollo:
      `settings.notifications.admin_email`, a quién se le avisa de una reserva
      nueva. Saltárselo fue lo que dejó producción encolando un aviso muerto
      por reserva. Se carga aparte:

      ```bash
      SEED_FILE=db/arreglos/cargar-correo-admin.sql ./scripts/demo-content.sh --from-env
      ```

      Si falta, `/api/health` lo dice en el chequeo `config` y responde 503.
- [ ] Opcional, y **no es el seed**: `db/seed/demo_content.sql` rellena los
      bloques de la ficha que estén vacíos —qué incluye, qué no incluye, lo
      mejor e itinerario— para que la página no se vea a medias mientras el
      cliente escribe su copia. Solo llena lo vacío, nunca toca la
      descripción, y es idempotente:

      ```bash
      ./scripts/demo-content.sh --from-env
      ```

      Pide la cadena de conexión con el prompt tapado y la lee él mismo. No
      se pasa un `read` desde la línea de comandos: en zsh no imprime prompt,
      se ve como una terminal colgada y la variable termina vacía.

      **`vercel env pull` no sirve para esto.** `DATABASE_URL` está marcada
      como sensible en el proyecto de Vercel, y las sensibles son de solo
      escritura: el archivo baja con `DATABASE_URL=""`. La cadena se saca de
      la consola de Neon. Sin credenciales en la máquina, la otra opción es
      pegar `db/seed/demo_content.sql` en el editor SQL de Neon.

      El guion **imprime a qué servidor va antes de escribir** (con la
      contraseña tapada) y el SQL informa cuántas filas encontró vacías y
      cuántas dejó. Eso no es adorno: la primera vez que se corrió a mano
      contra producción no cambió nada, y sin ese informe no había forma de
      distinguir "se conectó a la base de al lado" de "no había nada que
      llenar". Si la línea `destino:` dice `127.0.0.1` o `localhost`, fue a
      la base local.

      Ojo con `./scripts/db.sh`: hace `source .env` y eso **pisa** cualquier
      `DATABASE_URL` que le pases por la línea de comandos. Por eso el
      relleno tiene su propio guion y recibe el archivo por argumento.
- [ ] Opcional, y **tampoco es el seed**: `db/seed/catalogo_caribe.sql` carga un
      catálogo completo del Caribe mexicano —ocho destinos, veinticuatro tours
      con texto en español e inglés, itinerario, precios por tipo de pasajero,
      salidas de los próximos cuatro meses y cinco fotos de relleno cada uno—
      para que la vitrina se pueda juzgar antes de que el cliente termine de
      cargar su inventario. Solo inserta, nunca pisa lo que ya existe, y correrlo
      dos veces no duplica nada. Va por el mismo envoltorio:

      ```bash
      SEED_FILE=db/seed/catalogo_caribe.sql ./scripts/demo-content.sh --from-env
      ```

      **No toca `tax_rates`**: la base gravable sigue siendo una decisión abierta
      del cliente, así que los destinos nuevos exhiben precio sin impuesto hasta
      que se cargue la tasa que les toca. El informe final dice cuántos tours
      quedaron sin salidas o sin precio de adulto —ambos deben ser cero— y se
      niega a terminar si alguno de los suyos quedó sin poder venderse.
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
| `BLOB_READ_WRITE_TOKEN` | dónde viven las fotos | usa disco local (`var/media`); en Vercel eso es efímero |
| `PRIVACY_VERSION` | versión del aviso que acepta el huésped | consentimiento sin versión |

> **`NEXT_PUBLIC_SITE_URL` se fija al construir, no al arrancar.** Next reemplaza
> esas variables durante la compilación. Cambiarla exige volver a construir —
> en Vercel, un nuevo `vercel --prod` después de cambiar la variable.

## 3. Almacenamiento de fotos

- [x] `BLOB_READ_WRITE_TOKEN` presente: las fotos van a Vercel Blob, no a
      disco. Se inyecta solo al conectar un almacén de Blob al proyecto
      (`vercel blob create-store --access public`, después "Connect Project"
      desde el dashboard de Storage).
- [ ] Probar una subida real desde el panel y confirmar que la foto sigue
      disponible después de un redeploy — es la garantía que el disco
      efímero no daba.

## 4. El worker

- [x] `.github/workflows/heartbeat.yml` llama a `POST /api/jobs/tick` cada
      minuto, dentro de un job que se autosostiene en un bucle hasta su
      límite de tiempo — un `schedule` de GitHub cada 5 minutos se probó
      primero y corrió cada varias horas, no cada 5 minutos. Un `schedule`
      de baja frecuencia (cada 3 horas, `0 */3 * * *`) reinicia el bucle si
      alguna vez muere. El secreto `JOBS_SECRET` vive como secreto del
      repositorio (`gh secret set JOBS_SECRET`).
- [ ] Verificar que efectivamente corre: `/api/health` debe decir
      `worker.ok = true` con "último latido hace" en minutos de un dígito, y
      la pestaña Actions de GitHub debe mostrar el job vivo, no corridas
      sueltas.

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

El camino está completo y probado —el aviso se encola en la misma transacción
que confirma la reserva, el latido lo despacha, se reintenta con espera
creciente y se guarda el texto exacto que recibió el huésped— pero contra el
transporte local. **Lo único que nunca se ha ejercitado es la última pulgada:
que Resend acepte el mensaje y llegue a una bandeja.**

Estado revisado el 2026-09-04, en la cuenta de Resend del cliente:

| Qué | Cómo está |
|---|---|
| Llaves de API | dos, una con acceso total y otra de envío |
| Dominios verificados | **ninguno** |
| `RESEND_API_KEY` y `MAIL_FROM` en Vercel | **no están** — producción usa el transporte local |

- [ ] **Dominio propio.** Es el mismo bloqueante que deja al sitio en
      `adrimarket.vercel.app` (decisión 0005): sin dominio no hay dónde poner
      SPF, DKIM y DMARC, y Resend no tiene qué verificar.
- [ ] Dominio verificado en Resend con esos tres registros.
- [ ] `MAIL_FROM` en ese dominio, y `RESEND_API_KEY` cargadas en Vercel.
- [ ] Prueba de entrega real a **Gmail, Outlook e iCloud**, revisando que no
      caiga en no deseado. Son los tres que usa el 95% de los huéspedes.

La prueba de entrega tiene sonda. Manda una confirmación real, con su
comprobante QR adjunto, armada con las mismas funciones que usa el worker, y
sin tocar la bandeja de salida:

```bash
RESEND_API_KEY=re_… MAIL_FROM=reservas@… npm run probar:correo -- destinatario@ejemplo.com
```

> **Cargar `RESEND_API_KEY` sin dominio verificado es peor que no cargarla.**
> Resend solo entrega desde `onboarding@resend.dev` a la dirección dueña de la
> cuenta; a cualquier otra responde `403`. El aviso del huésped se reintentaría
> seis veces, quedaría `dead` y `/api/health` pasaría a `degraded`. Hoy, sin
> llaves, al menos el correo queda renderizado y consultable en la bandeja.

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

- [ ] `npm run db:test` — las 23 garantías.
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
- ~~Los cupones se administran pero no se canjean.~~ **Cerrada.** Se canjean
  desde el checkout; ver [decisión 0004](decisiones/0004-cupon-agotado-es-inventario.md).
- ~~El panel no crea opciones de tour ni unidades de estancia.~~ **Cerrada.**
  Un tour se da de alta completo —hora, punto de encuentro, cupo, precio por
  pasajero— desde `/admin/catalogo/[id]/opciones`, y una estancia desde
  `/admin/catalogo/[id]/unidades`, con su primer plan de tarifa incluido.
- **No hay colchón de rotación entre estancias.** Cuando la limpieza no alcanza
  para rotar el mismo día, se bloquea el día a mano desde el panel.
- **El cobro parcial del saldo se rechaza a propósito**, porque no hay regla de
  negocio acordada.
- **Subir una foto de más de 4 MB falla en Vercel.** Es el límite de cuerpo
  de petición de una función, no un error del código; una foto de teléfono
  moderno pesa de 3 a 8 MB. La primera foto real publicada (post-Sprint 7)
  reveló que el límite efectivo era peor de lo documentado — una Server
  Action de Next.js parte de 1 MB, no de los 4.5 MB de Vercel — y ya está
  subido a 4 MB (`next.config.ts`). Arreglarlo del todo exige subir directo
  desde el navegador a Vercel Blob en vez de pasar por el servidor — ver
  [decisión 0005](decisiones/0005-vercel-y-blob.md). Queda para cuando el
  cliente empiece a subir fotos reales de forma rutinaria.
- **El latido depende de que el repositorio siga siendo público.** El
  mecanismo (bucle de un minuto dentro de un job de GitHub Actions,
  reiniciado cada 3 horas) solo es gratis con minutos de Actions
  ilimitados; si el repositorio pasa a privado algún día, hay que revisarlo
  antes — ver decisión 0005. Si el bucle muere entre reinicios, el peor caso
  es hasta 3 horas sin latido, no minutos.
