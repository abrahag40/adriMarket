# 0010 · El filtro lateral, y un buscador que deja de preguntar lo que ya sabe

**Fecha:** 2026-09-06 · **Estado:** aplicada · **Decide:** cliente

## La pregunta

Al entrar a una sección desde la portada —"Ver los 31 tours →"— el buscador
horizontal volvía a aparecer con **"Tipo: Tours"** ya elegido, y con su botón
de Aplicar. El cliente lo dijo directo: *"si entro a la sección de ver más
vehículos, tours o hospedaje, el buscador no debería volver a pedir el tipo, de
hecho deberíamos implementar un filtro sidebar, como Amazon o Mercado Libre,
sólo en cada sección de tipo."*

## Lo que se decidió

1. **El buscador horizontal es del inicio.** En cuanto hay un filtro puesto,
   desaparece. No es solo que repitiera el tipo: repetía, en forma de
   formulario con botón, exactamente lo que la barra lateral hace en un clic.
   Dos filtros para lo mismo en la misma pantalla no es redundancia, es la duda
   de cuál manda.
2. **El tipo pasa a ser el título de la página.** `<h1>Tours</h1>` con el
   conteo debajo, que es lo que hace cualquier tienda: "Tours", no
   "Tipo: Tours".
3. **Barra lateral de facetas** —Tipo, Ubicación, Personas, Precio— a la
   izquierda de los resultados, en escritorio. En el teléfono es un `<details>`
   cerrado cuyo resumen dice cuántos filtros hay puestos.
4. **Fichas de lo filtrado encima de los resultados**, cada una con su ×.
5. **Aparece con cualquier filtro, no solo con `?kind=`.** A `/es?location=tulum`
   se llega desde una tarjeta de destino, y ahí la barra sirve igual; la única
   diferencia es que el título es "Tulum" y la faceta de Tipo no viene marcada.
   Dos interfaces de filtro distintas según el parámetro habrían sido más
   fieles a la letra del encargo y peores de usar.

### Enlaces, no campos

Cada opción es una URL completa. Se aplica en un clic y se quita en otro, sin
botón de Aplicar, **sin una línea de JavaScript**: sigue pasando el criterio de
`audit` que comprueba que el sitio funciona con el JS caído, y una búsqueda
filtrada se sigue pudiendo mandar por WhatsApp.

### Cada opción trae su cuenta, y la inútil no se ofrece

"Tulum (4)", "Hasta $1,400 (11)". La cuenta sale del resultado **sin esa
faceta** y con las demás puestas — contarla con la faceta puesta daría el
resultado actual en la elegida y cero en todas las demás, que es la forma más
rápida de convertir un filtro en un callejón.

Con la cuenta a la vista se pueden tirar dos clases de opción:

- **La que daría cero.** Antes se podía pedir "Cozumel · 10 personas" desde el
  formulario y llegar a una página vacía sin ninguna pista de qué sobraba.
- **La que daría todo.** En tours, "1 o más personas", "2 o más" y "4 o más"
  devolvían los 31 resultados las tres: había que probarlas para descubrir que
  no hacían nada. La faceta de Personas en tours quedó en dos opciones —8 o más
  y 10 o más—, que son las que de verdad separan.

Y si un grupo se queda con menos de dos opciones, el grupo entero desaparece.

**La fila de "Todo" también desaparece cuando vaciaría la vista entera.** Se
encontró comprobando las 90 opciones de faceta una por una: estando en tours,
"Tipo · Todo" prometía **48** y apuntaba a `/es`, que desde la decisión 0008
**no es un listado** sino la portada. La opción entregaba el hero, los destinos
y las cuatro vitrinas, sin una sola de esas 48 tarjetas. Se quitó la fila en
vez de quitarle la cuenta —relabelar el problema lo deja ahí—; desde una vista
con dos filtros la fila sigue, porque ahí sí lleva a otro listado. Vaciarlo
todo es lo que hacen las fichas de arriba y su "Quitar filtros", que están
junto a los resultados y dicen exactamente eso.

### Las cubetas de precio salen del catálogo

Un tour parte de $650 y una casa de $1,450, así que una escalera escrita a mano
dejaría cubetas vacías en una de las dos secciones. Se sacan de los percentiles
33 y 66 de lo que hay y se redondean a una cifra de precio: en tours quedan
"Hasta $1,400 / $1,400 a $2,100 / Más de $2,100" y en estancias "Hasta $3,400 /
$3,400 a $4,600 / Más de $4,600". Ninguna cubeta puede quedar vacía, y las tres
cubren el catálogo exactamente una vez —el borde pertenece a la de arriba—, lo
que hace que las cuentas sumen.

## El filtrado se mueve de SQL a memoria

Es la parte discutible, y es deliberada.

`listCatalog` sabe filtrar por tipo, ubicación y huéspedes, y el listado usaba
eso. Un filtro con cuentas no puede: **cada faceta se cuenta sobre el resultado
sin esa faceta**, así que serían cuatro consultas más por página y cuatro
oportunidades de que la cuenta y la lista se contradigan. Una faceta que dice
"(6)" y devuelve 4 es peor que no tener cuentas.

Ahora hay **una sola consulta sin filtrar** —el catálogo publicado, 47
productos hoy— y las cuentas y los resultados salen del mismo arreglo, donde no
pueden discrepar.

**Esto no mueve la frontera de "el SQL manda".** El SQL sigue decidiendo qué se
publica, qué precio tiene y con qué impuesto; lo que se hace en memoria es
recortar una lista que ya llegó decidida. El límite está escrito en
`modules/catalog/facets.ts`: el día que el catálogo tenga miles de productos,
esto vuelve a SQL con una consulta de agregados por faceta.

La lógica vive en su propio módulo y tiene **14 pruebas** que cubren los bordes
—el producto que cuesta exactamente el corte de dos cubetas, el que no tiene
precio, el rango invertido que llega por la URL—, porque es la única parte del
catálogo que la base ya no valida.

## Alternativas descartadas

**Quitar solo el campo "Tipo" del buscador y dejar el resto.** Era la lectura
literal del encargo y la de menos trabajo. Se descartó porque el problema no
era ese campo: era que el listado tuviera un buscador de portada encima. Con el
campo fuera seguían siendo dos filtros compitiendo, uno con botón y otro sin
él.

**Contar las facetas con consultas de agregados.** Es lo correcto con un
catálogo grande y es a donde esto va a volver. Hoy costaría cuatro consultas
por página y una segunda fuente de verdad para las cuentas, sobre 47 productos
que caben en una.

## Lo que quedó pendiente

- **La barra no aparece en la ficha de producto ni en la página de destinos**,
  que no son listados filtrables.
- **Sin filtro por fechas.** Es la faceta que más pide un motor de reservas y
  la única que no se puede resolver en memoria: exige preguntarle al inventario
  qué está libre, que es justo lo que la base hace bien. Cuando entre, entra
  por SQL.
- **Una sola opción por faceta.** Mercado Libre permite marcar dos destinos a
  la vez; aquí marcar uno reemplaza al anterior. No hay dato que lo impida —es
  trabajo de URL y de conteo— pero no se pidió.
