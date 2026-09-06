# 0008 · La portada es una vitrina, no un listado

**Fecha:** 2026-09-06 · **Estado:** aplicada

## El problema

La portada medía **8 692 px — 10.3 pantallas de teléfono**. Enseñaba cuatro
vitrinas y, debajo, el catálogo entero paginado. Dos de esas vitrinas
—Estancias y Vehículos— eran cuadrículas de seis tarjetas apiladas: **2 693 px
cada una, el 31 % de la página por sección, 62 % entre las dos**. Los tours,
en riel, ocupaban 434 px para la misma cantidad de tarjetas.

Y el bloque de confianza —anticipo en línea, confirmación al instante,
cancelación clara— empezaba en el píxel **7 686 de 8 692**: al 88 % de la
página, donde casi nadie llega.

## Lo que se decidió

**Tres cambios, medidos antes y después.**

1. **Estancias y Vehículos pasan a riel**, como los tours ya estaban. Misma
   cantidad de tarjetas, 488 px en vez de 2 693.
2. **Cada vitrina lleva su salida** —"Ver los N tours →", "Ver las N
   estancias →", "Ver los N vehículos →"— con el número dentro, tomado del
   catálogo completo y no de la muestra. Desde que el listado dejó de vivir en
   la portada, una vitrina sin salida es un callejón: enseña ocho de treinta y
   se acaba.
3. **El bloque de confianza sube** justo debajo del buscador, en su variante
   compacta.

El listado ya no vive en la portada: es la respuesta a una búsqueda.

Resultado: **8 692 → 4 316 px**, de 10.3 a **5.1 pantallas**. Las vitrinas
siguen enseñando las mismas veintiocho tarjetas —8, 8, 6 y 6—: no se recortó
catálogo, se recortó el alto que costaba enseñarlo. Lo que salió de la portada
es el listado paginado, que ahora es la respuesta a una búsqueda.

## Por qué ese orden, y no otro

- Las vitrinas horizontales son el patrón de Amazon y Mercado Libre por una
  razón medible: una fila deja ver que **hay más** sin gastar alto. Una
  cuadrícula de seis en una columna de teléfono gasta tres pantallas para
  decir lo mismo.
- El número dentro del enlace fija la expectativa antes del clic. "Ver los 31
  tours" y "Ver más" llevan al mismo sitio; solo uno dice a qué.
- La confianza va donde se decide, no donde se termina. El buscador es lo
  primero que se toca; las tres promesas que quitan el miedo a pagar por
  adelantado tienen que estar a la vista ahí, no once mil píxeles después.
- La salida va **junto al título**, no bajo las tarjetas: un riel no tiene
  final visible, así que un enlace al final no tiene dónde ponerse.

## La alternativa descartada

**Dejar las dos cuadrículas y solo recortar a tres tarjetas cada una.** Baja
el alto sin tocar nada más, y es menos trabajo. Se descartó porque resuelve el
síntoma al revés: quita catálogo de la vista para ganar espacio, cuando el
problema no era cuánto se enseña sino cuánto alto cuesta enseñarlo. El riel
baja el costo sin bajar el contenido.

## Lo que costó, y que no estaba previsto

El día que las dos cuadrículas pasaron a rieles, la portada **adelgazó a la
mitad de alto y engordó de 369 a 475 kB**. La carga diferida había dejado de
funcionar sin decirlo: una tarjeta fuera de pantalla en una cuadrícula está
lejos *hacia abajo* y el navegador no pide su foto; en un riel está lejos
*hacia el lado*, dentro del margen con el que Chrome adelanta descargas. Con
`loading="lazy"` puesto en las veintiocho tarjetas, el teléfono se traía
veintiuna fotos antes de que nadie arrastrara nada.

Lo cerró `content-visibility: auto` en `.carousel-item`, con
`contain-intrinsic-size` **por tipo de tarjeta** —un solo número reservaba 460
px donde median 225 y estiraba la portada 498 px sin que se notara en una
captura—. **475 → 194 kB, veintiuna fotos → tres**, y las veintiocho llegan
cuando el dedo arrastra el riel. El tope del presupuesto bajó de 450 a 260
detrás: uno de 450 sobre una página de 194 tampoco avisa de nada.

Está anotado en CLAUDE.md que una captura de página completa de la portada
sale con los rieles vacíos por esto, y que la portada está bien.
