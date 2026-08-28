# 0005 · El sitio se muda de Render a Vercel, y las fotos a Vercel Blob

**Estado:** decidido · **Sprint:** post-7 (retoma del despliegue) · **Decide:**
cliente

## Pregunta

El cliente decidió no comprar un dominio propio todavía y usar en su lugar lo
que Vercel da gratis. ¿Alcanza con cambiar dónde corre el sitio, o hay que
tocar código?

## Contexto

- La [decisión 0002](0002-donde-vive-el-sistema.md) ya había fijado Render +
  Cloudflare + Neon, y el sitio llegó a desplegarse ahí — ver
  `docs/puesta-en-produccion.md`.
- Vercel **no es Cloudflare Workers**: corre Node.js completo (con Fluid
  Compute), así que `sharp` y `postgres` por TCP funcionan igual que en
  Render. La decisión 0002 no aplica aquí tal cual — hay que evaluar Vercel
  por separado, no asumir que comparte los problemas de Workers.
- Pero el plan gratuito de Vercel sí tiene dos límites reales que si tocan a
  este proyecto:
  1. **El disco es efímero**, y peor que en Render: una función puede correr
     en una instancia distinta a la que atendió la subida anterior, así que
     ni siquiera se puede asumir que el archivo sigue ahí un segundo después.
  2. **Los cron jobs del plan gratuito corren cuando mucho una vez al día.**
     El sistema necesita `/api/jobs/tick` cada minuto.

## Opciones evaluadas — almacenamiento de fotos

| Opción | A favor | En contra |
|---|---|---|
| **A. Vercel Blob** | Producto de primera parte, mismo proveedor que el hosting, sin cuenta nueva que crear | Cambia el módulo de imágenes: guardar y leer ya no es `fs`, es HTTP |
| **B. Seguir en disco y aceptar que las fotos se pierdan** | Cero código | Rompe la razón de ser del módulo de fotos (Sprint 6): el cliente sube una foto y necesita que siga ahí |
| **C. Otro proveedor de objetos (S3, Cloudinary)** | Más maduro | Cuenta nueva, credenciales nuevas, y ninguna ventaja sobre Blob para este volumen |

## Opciones evaluadas — el latido cada minuto

| Opción | A favor | En contra |
|---|---|---|
| **A. Cron nativo de Vercel** | Cero configuración extra | Gratis, corre cuando mucho una vez al día — no sirve |
| **B. Servicio externo gratuito (cron-job.org y similares)** | Intervalos de un minuto de verdad | Exige crear una cuenta en un tercero — no es algo que se pueda automatizar sin que el cliente la cree |
| **C. GitHub Actions con `schedule` de alta frecuencia** | Corre en la cuenta de GitHub que el cliente ya tiene y ya autorizó para este repositorio; no hay cuenta nueva que crear | **Se probó a `*/5 * * * *` y falló en la práctica**: `gh run list` mostró corridas cada 4 a 10 horas, no cada 5 minutos. GitHub no garantiza los cron de alta frecuencia — los retrasa a propósito |
| **D. GitHub Actions con un job que se autosostiene en un bucle interno** | El `schedule` que sí dispara puntual es uno de baja frecuencia (GitHub no retrasa esos); una vez arrancado, el propio job llama al latido cada minuto con un `sleep` hasta su límite de tiempo | Consume minutos de Actions por hora casi completa — solo es gratis porque el repositorio es público (minutos ilimitados); en uno privado agotaría el plan gratuito en un día |

## Decisión

**Fotos: opción A, Vercel Blob**, por configuración — igual que Stripe, Resend
y WhatsApp desde el Sprint 3: con `BLOB_READ_WRITE_TOKEN` presente se usa
Blob; sin él (en local), sigue el disco de siempre. `uploadImage`,
`processMediaJobs` y `deleteImage` pasan por una interfaz `MediaStorage` con
dos implementaciones — ver `src/modules/media/images.ts`.

**Latido: opción D**, después de que la opción C fallara en producción
(`.github/workflows/heartbeat.yml`). Un `schedule` de baja frecuencia
(`0 */3 * * *`, cada 3 horas) arranca un job que llama a
`POST /api/jobs/tick` en un bucle con `sleep 60` hasta acercarse al límite
de 6 horas de un job de GitHub Actions, y se detiene solo con margen. Si el
job muere por lo que sea, el siguiente disparo del `schedule` de baja
frecuencia lo reinicia — y esos sí corren puntuales. El resultado es más
cercano al minuto-a-minuto original que la opción C que se intentó primero.

## Por qué

1. **Blob es la ruta con menos fricción.** Ya está en el mismo proveedor que
   el hosting, sin cuenta ni credencial nueva, y el cambio de código queda
   contenido en un solo módulo gracias a la interfaz que ya existía como
   patrón (Stripe/Resend/WhatsApp).
2. **El latido no puede depender de una cuenta que nadie va a crear hoy.** El
   cliente ya tiene GitHub; pedirle que además se registre en un servicio de
   cron de terceros es fricción que un flujo automatizado no puede resolver
   por su cuenta — crear cuentas está fuera de lo que se automatiza sin la
   persona presente.
3. **Un `schedule` de alta frecuencia no era la solución — era el problema.**
   Pedirle a GitHub cada 5 minutos no lo hizo correr cada 5 minutos: lo hizo
   correr cada varias horas, con menos margen que el cron nativo de Vercel
   que la opción A ya había descartado por lento. El bucle interno evita
   depender de que GitHub respete un intervalo corto, y de paso queda más
   cerca del minuto a minuto original que cualquiera de las dos opciones de
   `schedule` puro.

## Consecuencias

- Nueva dependencia: `@vercel/blob`.
- **El latido solo es gratis porque el repositorio es público.** El bucle
  corre casi las 24 horas del día; en un repositorio privado agotaría el
  límite mensual gratuito de minutos de Actions en cuestión de un día. Si el
  repositorio pasa a privado algún día, este mecanismo hay que revisarlo
  primero.
- `docs/decisiones/0002-donde-vive-el-sistema.md` queda como historia de la
  primera decisión, no se reescribe — Render sigue siendo válido como
  alternativa si el cliente algún día quiere volver a un plan de pago con
  disco y cron reales.
- **Pendiente, no resuelto por esta decisión:** la subida de fotos por el
  panel usa un formulario simple (`FormData` al servidor), y las funciones de
  Vercel tienen un límite de **4.5 MB por cuerpo de petición**. Una foto de
  teléfono moderno pesa de 3 a 8 MB — por encima del límite. Migrar a subida
  directa desde el navegador (`@vercel/blob/client`) lo resuelve, pero exige
  JavaScript en un formulario que hoy no lo necesita, así que queda para
  cuando el cliente empiece a subir fotos reales y no antes.

## Qué se rechazó explícitamente

Reescribir `src/db/index.ts` para usar `@neondatabase/serverless` en vez de
`postgres` sobre TCP. Ese cambio es necesario solo si se quiere correr en
Edge Runtime, y este proyecto sigue —igual que en Render— exclusivamente en
runtime de Node (`sharp`, el mismo motivo que en la decisión 0002). Cambiar de
driver sin necesitarlo sería tocar el módulo de base de datos completo por
una ventaja que no aplica aquí.
