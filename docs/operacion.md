# Manual de operación

Qué hacer cuando algo se rompe. Está escrito para que lo siga alguien a las
siete de la mañana, con el teléfono en la mano y un guía esperando — no para
lucirse en una revisión de arquitectura.

Cada sección dice **cómo se ve el problema**, **qué significa** y **qué hacer**,
en ese orden. Si una instrucción no se puede seguir sin preguntarle a alguien,
es un defecto de este documento.

---

## Lo primero: `/api/health`

```
curl https://EL-SITIO/api/health
```

Responde `200` cuando todo está bien y **`503` cuando algo no lo está**, para
que un monitor lo entienda sin configurarle reglas. El cuerpo dice cuál de las
cinco comprobaciones falló y por qué.

No lleva contraseña a propósito: solo devuelve conteos, no datos de nadie, y un
monitoreo que exige credenciales es un monitoreo que alguien termina apagando.

| Comprobación | Qué mira | Si falla |
|---|---|---|
| `database` | que la base responda | [§1](#1-la-base-no-responde) |
| `worker` | que el latido haya corrido hace menos de 10 min | [§2](#2-el-worker-dejó-de-latir) |
| `notifications` | avisos muertos o atrasados | [§3](#3-hay-avisos-muertos) |
| `refunds` | reembolsos sin procesar por más de 24 h | [§4](#4-un-reembolso-lleva-un-día-sin-salir) |
| `inventory` | apartados vencidos que siguen ocupando fechas | [§2](#2-el-worker-dejó-de-latir) |
| `media` | fotos que no se pudieron procesar | [§5](#5-una-foto-no-se-procesó) |

---

## 1. La base no responde

**Cómo se ve.** El sitio entero da error. `/api/health` responde `503` con
`database.ok = false`.

**Qué significa.** No hay nada que hacer desde la aplicación: sin base no hay
inventario, ni precios, ni reservas.

**Qué hacer.**

1. Revisar el panel del proveedor de la base: ¿está arriba, se acabó el
   almacenamiento, se agotaron las conexiones?
2. Si es límite de conexiones, bajar `DATABASE_POOL_MAX` y volver a desplegar.
   El límite real es *(instancias × este valor)*, y en despliegue sin servidor
   las instancias suben solas con el tráfico.
3. Mientras tanto **el inventario está seguro**: nadie puede sobrevender porque
   nadie puede escribir.

---

## 2. El worker dejó de latir

**Cómo se ve.** `worker.ok = false`, o `inventory` reporta apartados vencidos.

**Qué significa.** Es la falla más silenciosa del sistema y la que más dinero
cuesta sin que nadie grite:

- Los apartados no expiran → **hay fechas y lugares bloqueados que nadie puede
  comprar**, reservados por gente que no pagó.
- Los avisos no salen → huéspedes que pagaron y no recibieron confirmación.
- Los recordatorios no salen → gente que no llega al muelle.

**Qué hacer.**

1. Comprobar que el cron sigue configurado y apuntando a
   `POST /api/jobs/tick` con la cabecera `x-job-secret`.
2. Dispararlo a mano para destapar la cola:
   ```
   curl -X POST -H "x-job-secret: EL-SECRETO" https://EL-SITIO/api/jobs/tick
   ```
   Devuelve cuántos apartados expiró, cuántos recordatorios encoló, cuántos
   avisos mandó y cuántas fotos procesó.
3. Repetirlo hasta que `/api/health` vuelva a `200`. La cola de avisos se
   despacha por lotes de 25.

**Si dice "nunca ha latido"** es que el cron no se configuró en el despliegue.
No es una falla: es un paso que faltó.

---

## 3. Hay avisos muertos

**Cómo se ve.** `notifications.ok = false` con un conteo de muertos.

**Qué significa.** Un aviso que agotó sus seis intentos. **Alguien no se enteró
de algo que le importaba** — su reserva, su recordatorio, su cancelación.

**Qué hacer.**

1. Ver qué pasó. Contra producción, sin abrir psql a mano y sin arriesgarse a
   pegarle a la base de al lado —el guion enseña el servidor de destino antes
   de correr y la consulta solo lee, con el destinatario tapado—:
   ```bash
   SEED_FILE=db/consultas/avisos-atorados.sql ./scripts/demo-content.sh --from-env
   ```
   Con una sesión ya abierta en la base correcta basta:
   ```sql
   select template, to_address, left(last_error, 120), count(*)
     from outbox where status = 'dead'
    group by 1, 2, 3 order by 4 desc;
   ```
2. Según el error:

   | Error | Qué hacer |
   |---|---|
   | `HTTP 4xx` del proveedor | revisar la llave y el dominio verificado; corregir y reintentar |
   | `HTTP 5xx` o red | el proveedor estuvo caído; reintentar |
   | `aviso sin destinatario` | la reserva se guardó sin correo. Ver §3.1 |
   | `sin plantilla de WhatsApp` | plantilla no registrada en Meta. Ver §6 |

3. Reintentar lo que sí se puede entregar:
   ```sql
   update outbox
      set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null
    where status = 'dead' and coalesce(to_address, '') <> '';
   ```
   y disparar el latido.

### 3.1 Avisos sin destinatario

No se pueden entregar nunca: no hay a dónde. **Hay que avisarle a esa persona a
mano**, buscando su reserva en el panel por código o teléfono, y después retirar
la fila de la cola.

> **Antes de tratarlo como defecto, mira el cliente de la reserva.** Si el
> cliente sí tiene correo, el aviso no salió vacío del sistema: alguien lo dejó
> así. En una base de desarrollo eso lo hacen las pruebas —pasó en el Sprint 7 y
> costó una investigación entera—; en producción sería una edición manual, y
> entonces lo que hay que averiguar es quién y por qué. La pista que lo delata es
> una fila de **WhatsApp** sin destinatario: el sistema no puede escribirla,
> porque solo encola WhatsApp cuando el número es válido.

```sql
delete from outbox where status = 'dead' and coalesce(to_address, '') = '';
```

Borrar la fila no pierde historia: lo que le pasó a la reserva vive en
`booking_events`, que no se toca.

---

## 4. Un reembolso lleva un día sin salir

**Cómo se ve.** `refunds.ok = false`.

**Qué significa.** Se canceló una reserva, se registró la devolución, y **el
dinero no ha salido**. El huésped ya sabe que le toca reembolso porque se le
avisó por correo.

**Qué hacer.**

1. Listar los atorados:
   ```sql
   select r.id, r.amount_cents, r.reason, b.code, r.created_at
     from refunds r
     join payments p on p.id = r.payment_id
     join bookings b on b.id = p.booking_id
    where r.status = 'pending' order by r.created_at;
   ```
2. Hacer la devolución en el panel de la pasarela, contra el cargo original.
3. Marcarlo aquí, **con la referencia que devolvió la pasarela**:
   ```sql
   update refunds set status = 'succeeded', provider_ref = 'LA-REFERENCIA'
    where id = 'EL-ID';
   ```

> **Deuda conocida.** Hoy los reembolsos **se registran, no se ejecutan**: la
> fila queda pendiente esperando que alguien haga el movimiento en la pasarela.
> Automatizarlo depende de la cuenta de Stripe, que sigue sin llegar. Mientras
> tanto esto es un paso manual y por eso está en el manual.

---

## 5. Una foto no se procesó

**Cómo se ve.** `media.ok = false`. En el panel, la foto se queda en
"procesando…".

**Qué significa.** La foto se subió y **se ve** —se sirve el original— pero no
tiene las versiones ligeras para móvil. No es urgente: es una página más pesada.

**Qué hacer.**

```sql
select m.original_url, j.attempts, j.last_error
  from media_jobs j join product_media m on m.id = j.media_id
 where j.status = 'failed';
```

Casi siempre es un archivo corrupto o un formato raro. Lo más rápido es quitar
la foto desde el panel y volverla a subir. Para reintentar sin resubir:

```sql
update media_jobs set status = 'pending', attempts = 0 where status = 'failed';
```

---

## 6. WhatsApp deja de entregar

**Cómo se ve.** Avisos de canal `whatsapp` fallando con `HTTP 4xx`.

**Qué significa.** Casi siempre una de tres, y ninguna se arregla con código:

1. **La plantilla no está aprobada**, o se cambió su texto. WhatsApp exige que
   el mensaje coincida **carácter por carácter** con lo aprobado. Los textos
   viven en `src/modules/notifications/whatsapp.ts`: si alguien los editó, hay
   que volver a registrarlos en Meta.
2. **El número de la empresa perdió calidad** por reportes de usuarios. Se ve en
   el administrador de Meta.
3. **El token venció.** Se renueva en la app de Meta y se actualiza
   `WHATSAPP_TOKEN`.

Mientras tanto **el correo sigue saliendo**: WhatsApp se manda *además* del
correo, nunca en su lugar, justamente para que una falla de canal no deje a
nadie sin enterarse.

---

## 7. Un pago quedó a medias

**Cómo se ve.** El huésped dice que pagó y su reserva aparece "Esperando pago",
o la pasarela muestra un cargo que aquí no está confirmado.

**Qué significa.** El cobro salió pero el webhook no llegó o no se procesó.
**El dinero está cobrado y el inventario no está asegurado.**

**Qué hacer.**

1. Buscar la reserva en el panel por su código.
2. Confirmar en la pasarela que el cargo existe y por cuánto.
3. Reenviar el webhook desde el panel de la pasarela. Es lo preferible: entra
   por el camino normal, con firma, y queda registrado igual que cualquier otro.
4. El sistema es **idempotente**: reenviar el mismo evento diez veces confirma
   una vez, encola los avisos una vez y registra el saldo una vez. Reenviar no
   puede hacer daño.

Si el apartado ya expiró y las fechas se vendieron, **eso ya no es un problema
técnico**: hay que hablarle al huésped, ofrecerle otra fecha o devolverle el
dinero desde el panel.

---

## 8. Qué NO hacer nunca

- **No borrar filas de `stay_blocks` ni de `tour_seat_holds`.** Liberar es un
  `UPDATE` de `released_at`. Borrar destruye la historia y desalinea los
  contadores de cupo.
- **No editar `bookings.deposit_pct` ni `quote` de una reserva existente.** Son
  lo que el huésped aceptó. Cambiarlos es cambiar un acuerdo por atrás.
- **No cambiar el texto de una plantilla de WhatsApp sin volver a registrarla.**
  Deja de entregar sin avisar.
- **No correr `db:reset` contra producción.** El guion se niega si la URL no es
  local, pero conviene no probarlo.

---

## 9. Números de referencia

Lo que se considera normal, para saber cuándo algo se salió de lo normal:

| Cosa | Normal |
|---|---|
| Latido del worker | cada minuto |
| Apartado sin pagar | 15 minutos y expira |
| Recordatorios | 72 y 24 horas antes; sale el más cercano |
| Reintentos de un aviso | 6, con espera creciente hasta 60 min |
| Peso de una página en móvil | menos de 200 kB, menos de 140 kB de JS |
| Anchos de foto | 400, 800, 1600 y 2400 px, AVIF y WebP |

Los tres últimos los verifica `npm run audit` contra el sitio construido.
