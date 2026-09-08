# 0013 · Desplegar desde CI, no desde la laptop

**Fecha:** 2026-09-07
**Estado:** aceptada

## Contexto

El despliegue era `vercel --prod` desde la máquina de quien desarrolla, y la
migración un `workflow_dispatch` aparte que alguien tenía que acordarse de
correr antes. Dos pasos manuales, en un orden que nadie verificaba.

El mismo día en que se cerró el hueco del simulador de pagos, ese
procedimiento produjo el incidente que lo justifica todo.

### Lo que pasó

Se desplegó el arreglo con `vercel --prod`. El despliegue salió `READY`, el
sitio respondió 200 en todo — y `/api/health` dijo:

```
payments: pasarela local con PAYMENT_SIMULATOR=si: se puede fingir un pago
```

`PAYMENT_SIMULATOR` **no estaba en Vercel**. `vercel env ls production` no lo
tenía. Venía de la laptop: el CLI empaquetó el `.env` local pese a estar en
`.gitignore`, y el log del build lo dijo con todas sus letras:

```
- Environments: .env
```

Next carga ese archivo. Las variables que Vercel define **ganan** —por eso
`DATABASE_URL` siguió apuntando a Neon y nada se rompió de forma visible—, pero
las que Vercel **no** define se llenan con el valor local. `PAYMENT_SIMULATOR`
no existía allá, así que se llenó con el `si` de desarrollo.

**El despliegue que iba a cerrar el hueco lo mantuvo abierto por otra puerta**,
y sin el chequeo `payments` —agregado horas antes, por otra razón— habría
pasado por bueno: el sitio respondía, la salud estaba en `ok`, el webhook en
400. Todo verde, y cualquiera podía seguir confirmando reservas sin pagar.

La lección se parece a una que ya estaba escrita —`.env.production.local`
secuestrando el build— pero llega por otro camino: **`.gitignore` protege el
repositorio, no el paquete que sube el CLI.** Son dos fronteras distintas y
hacen falta las dos.

## Decisión

**No se despliega a mano.** El ciclo completo queda automatizado:

```
commit → PR → CI → merge → migrar → desplegar → comprobar
```

- `ci.yml` es la compuerta del PR. Se le corrigió el disparador de `push`:
  apuntaba a `main` y **la rama por defecto de este repositorio no se llama
  `main`**, así que ese disparador no había corrido nunca. Durante meses solo
  se verificaron los pull requests.
- `desplegar.yml` se dispara con `workflow_run` cuando la CI **termina en
  verde** sobre la rama que despliega. Con `push` las dos arrancarían a la vez
  y producción podría estrenar un commit cuyas pruebas aún no terminan.
- Migra **antes** de desplegar, en el mismo job. El código nuevo lee columnas
  que la migración crea; al revés hay una ventana en la que producción sirve
  código que consulta algo que no existe. Si la migración falla, no hay
  despliegue.
- **Comprueba después.** Tres cosas contra el sitio real: que responda, que
  ningún chequeo de salud esté en rojo, y que **el simulador de pagos no esté
  activo**. Esa última es el incidente de arriba convertido en compuerta.

Y la defensa de fondo: **el runner no tiene `.env`, porque git nunca lo tuvo.**
Desplegar desde CI no hace ese error improbable — lo hace imposible.

`.vercelignore` se agrega igual, como cinturón además de tirantes, para quien
tenga que desplegar a mano alguna vez.

`migrar-produccion.yml` se queda como escotilla manual, que es para lo que
sirve de verdad: aplicar una migración sin desplegar código, o reintentar si el
despliegue se cayó entre un paso y el otro.

## El conflicto con la integración nativa, y cómo queda

Al abrir el primer PR apareció algo que no estaba a la vista: **Vercel ya está
conectado a GitHub.** El PR estrenó un despliegue de vista previa sin que nadie
lo pidiera.

Eso significa que al mergear habría **dos despliegues de producción a la vez**:
el de la integración nativa, que arranca con el push, y el de este workflow, que
espera a la CI. El de la integración no espera nada y, sobre todo, **no migra
antes** — que es justo el orden que este proyecto no puede permitirse.

La primera versión de este arreglo apagaba el despliegue automático **solo** de
la rama que despliega, para conservar las vistas previas de los PR. Al abrir el
PR quedó claro que esas vistas previas **nunca han funcionado**:

```
Error: Falta DATABASE_URL. Ver .env.example.
> Build error occurred
[Error: Failed to collect page data for /admin/entrar/[token]]
```

`DATABASE_URL` solo existe en el entorno *Production* del proyecto. El entorno
*Preview* tiene únicamente las tres variables de Blob, así que una vista previa
no puede ni compilar — el build lee la base para recolectar los datos de las
páginas.

Y no se arregla cargándole `DATABASE_URL`: la única base que hay es producción,
y dejar que una rama cualquiera —con migraciones a medias, o con el simulador
encendido— hable con la base real es peor que no tener vistas previas. Harían
falta una base de preview y un plan que hoy no existe.

Así que se apagan del todo:

```json
{ "git": { "deploymentEnabled": false } }
```

Producción pasa a tener un solo dueño, este workflow, que despliega por CLI con
token —eso no lo toca esta bandera—. Y el PR deja de traer un check rojo
permanente, que es lo mismo que se evitó en `/api/health`: **un rojo que
siempre está rojo enseña a ignorar el rojo.**

**Para reconsiderarlo hace falta una base de preview**, no cambiar esta línea.
Cuando exista, las vistas previas valen mucho: revisar un cambio de vitrina en
una URL real es más honesto que leer un diff.

## Las alternativas descartadas

**La integración nativa de Vercel con GitHub** (`vercel git connect`). Es más
simple, no necesita ningún token y regala despliegues de vista previa por cada
PR, que son útiles de verdad. Se descartó porque despliega **al recibir el
push**, sin esperar a la CI y sin forma de meter la migración antes. Para un
proyecto donde el esquema y el código tienen que moverse en un orden, eso no es
un detalle. Vale la pena reconsiderarla para *previews* de PR, donde no hay
migración de por medio ni riesgo para producción.

**Seguir desplegando a mano, pero con `.vercelignore`.** Habría tapado este
caso y ninguno de los siguientes: seguiría dependiendo de que alguien migre
antes, despliegue después y revise la salud al final. Tres cosas que se
recuerdan hasta el día que no.

## Lo que hace falta para que funcione

Un secreto que este trabajo no puede crear:

```bash
gh secret set VERCEL_TOKEN
```

Se genera en `vercel.com/account/tokens`, con alcance al equipo del proyecto.
El workflow **falla en su primer paso** si no está, con un mensaje que dice
exactamente eso, en vez de morir a media API de Vercel.

`DATABASE_URL` (la cadena directa de Neon) ya existe como secreto desde el
2026-09-04.

## El primer despliegue automático mintió, y lo que enseñó

La primera corrida completa —con `VERCEL_TOKEN` ya cargado— reportó **todos los
pasos en verde**. No había desplegado nada:

```
Error: User not found.
desplegado en: (no se pudo leer la URL del log)
✔ producción responde, la salud está limpia y nadie puede fingir un pago
```

Tres defectos encadenados, y los tres valen la pena:

1. **`Error: User not found` no era del token.** `.vercel/` está en
   `.gitignore`, así que el runner nunca tiene el enlace al proyecto que sí
   existe en la máquina de quien desarrolla. Sin `VERCEL_ORG_ID` y
   `VERCEL_PROJECT_ID`, el CLI no sabe a dónde desplegar y el error que da
   suena a credencial inválida. Ahora van como **variables** del repositorio —
   son identificadores, no credenciales, y sin el token no sirven de nada.

2. **La tubería se tragó el fallo.** GitHub corre los `run:` con `bash -e`,
   **sin `pipefail`**, y en una tubería el código de salida es el del último
   comando. `vercel deploy … | tee` devolvía el cero de `tee`. Se arregla con
   `shell: bash`, que añade `-o pipefail`, y con una guarda explícita: **si no
   hay URL, no hubo despliegue**.

3. **Y la comprobación pasó igual**, porque preguntaba si
   `adrimarket.vercel.app` estaba sano — y lo estaba, sirviendo el despliegue
   anterior. *Comprobar que el sitio responde no dice nada si nadie comprueba
   que el sitio es el que se acaba de subir.* Ahora hay un paso previo que
   exige que el despliegue más reciente de producción sea **el de esta
   corrida**, y que esté en `READY`.

   Ese paso costó dos intentos, y los dos descartes valen la pena:

   - **`vercel ls --prod`** murió con *"Could not retrieve Project Settings"*:
     el CLI quiere un directorio enlazado y `.vercel/` está en `.gitignore`,
     así que el runner nunca lo tiene. Pasarle los identificadores por entorno
     alcanza para `deploy`, no para `ls`.
   - **Comparar por HTTP** tampoco: la URL del despliegue está detrás del SSO
     de Vercel y responde `302`, y `x-vercel-id` identifica la petición, no la
     compilación.

   Se pregunta por la **API REST**, que no depende de ninguna de las dos cosas.
   Y si la respuesta no tiene la forma esperada, el paso **falla y la imprime**
   en vez de dar por bueno lo que no pudo leer — que es el mismo error que se
   está corrigiendo, un nivel más abajo.

Es exactamente el defecto contra el que existe este workflow —una barra verde
sobre código que no se probó— cometido por el workflow mismo. Que lo haya
destapado en su primer uso, y no dentro de tres semanas con una reserva real de
por medio, es el argumento de la decisión entera.

## Cómo se comprobó

- Los cuatro workflows parsean como YAML válido.
- Los seis pasos con shell pasan `bash -n` — el heredoc de Python anidado
  dentro de un bloque `run: |` es justo lo que se rompe sin que el YAML se
  queje.
- La compuerta de verificación se corrió contra la salud **real** de
  producción: pasa hoy (`exit 0`) y **falla** (`exit 1`, con anotación de
  error) al inyectarle el detalle del incidente. No es un criterio que pase en
  vacío.
