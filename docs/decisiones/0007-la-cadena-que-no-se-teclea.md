# 0007 · La cadena de conexión no se teclea

**Estado:** decidido · **Sprint:** post-7 (operación) · **Decide:** equipo técnico

## Pregunta

Migrar producción y correr consultas contra ella exigía pegar la cadena de
conexión de Neon en cada comando. ¿Se puede hacer eso seguro, o hay que quitar
el paso?

## Contexto

El 2026-09-04, con el destino impreso en pantalla y completo, se pegó la cadena
de **otro proyecto de Neon** y se aplicaron las 16 migraciones sobre una base
ajena. El detalle está en [`../bitacora-2026-09-04.md`](../bitacora-2026-09-04.md).

Lo que hace instructivo el error es que **todas las protecciones funcionaron y
ninguna sirvió**:

- El guion imprimió el destino, entero y correcto.
- El destino decía `neon.tech`, que era lo que se había pedido comprobar.
- La diferencia entre la base correcta y la equivocada eran ocho caracteres a
  media línea: `ep-late-king-avk9v1d6` contra `ep-bitter-feather-aro32vx5`.

**Leer no es verificar.** Una protección que consiste en mostrar un dato y
confiar en que alguien lo compare contra su memoria no es una protección: es
una prueba de atención, y las pruebas de atención se fallan.

## Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **A. Seguir pegando la cadena, con más advertencias** | Cero trabajo | Es la que acaba de fallar. Más advertencias sobre el mismo texto no cambian que hay que compararlo de memoria |
| **B. Pedir que se teclee el servidor que el guion acaba de imprimir** | Obliga a mirar | Copiar no es reconocer: se transcribe lo que está en pantalla sin saber si es el correcto |
| **C. Tapar el identificador del servidor y pedir que se escriba** | Quien no sabe en qué base está, no puede copiarlo de la pantalla | Fricción real en cada comando contra una base remota |
| **D. Guardar la cadena una vez, anclada al servidor esperado** | El teclado deja de participar. Una cadena cambiada por equivocación se detecta al primer comando | Hay que crear el archivo una vez, y vive en la máquina de quien lo hace |
| **E. Guardar la cadena como secreto del repositorio y migrar desde un workflow** | La cadena no vive en ninguna máquina; funciona desde el celular | Depende de GitHub Actions; el secreto lo carga una persona con permiso de administrador |

## Decisión

**D y E, y C como red para lo que quede fuera de las dos.**

- `npm run prod:migrate` y `npm run prod:sql -- <archivo>` leen la cadena de
  `.env.production.local` y la verifican contra `PRODUCTION_DB_HOST`, anclado en
  el mismo archivo. Si no coinciden, se cancela antes de tocar nada.
- El workflow **Migrar producción** (`workflow_dispatch`) la lee de
  `secrets.DATABASE_URL`. Es un botón; no hay nada que teclear.
- `db.sh` y `demo-content.sh`, para el resto de los casos, **tapan** el
  identificador del servidor al imprimir el destino y piden escribirlo.

Y un respaldo que no depende de que nadie acierte:

- **Ninguna automatización estrena un esquema en una base remota.**
  `DB_CONFIRM=si` deja pasar una migración desatendida, pero si la primera
  migración está pendiente el guion aborta y exige `DB_BOOTSTRAP=si` a mano.
  Una base de producción vacía es siempre un destino equivocado, y ese era
  justo el dato que estuvo en pantalla —`aplicando 0001_foundation.sql`— sin
  que nadie lo leyera.

## Consecuencias

- Migrar producción es un botón en GitHub o un `npm run` sin argumentos.
- El error de destino, para repetirse, necesita que alguien edite el archivo
  anclado o cambie el secreto: dos actos deliberados, no un pegado distraído.
- La cadena sigue viviendo en dos lugares (una máquina y un secreto de GitHub).
  Rotarla obliga a actualizar los dos. Es el costo aceptado.
- `.env.production.local` está en `.gitignore` por el patrón `.env.*`, que ya
  existía desde que `vercel env pull` estuvo a punto de versionar la cadena.

## Lo que se descartó y por qué importa

**No se usó `vercel env pull`.** `DATABASE_URL` está marcada como sensible en
el proyecto de Vercel, y las sensibles son de solo escritura: el archivo baja
con el valor en blanco. Es una buena propiedad de Vercel y no se quiso
debilitar quitándole la marca.

**No se puso el identificador del servidor en el repositorio.** No es una
credencial —hace falta usuario y contraseña— pero este repositorio es público y
no hay razón para publicar la topología. Vive en el archivo local, junto a la
cadena que ancla.
