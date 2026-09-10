# 0017 · El listado completo necesita su propia dirección

**Fecha:** 2026-09-09
**Estado:** aceptada

## Contexto

Dos defectos reportados desde el uso real, con la misma raíz más de lo que
parece.

### El síntoma

Estando en `/es?kind=stay`, viendo resultados, quitar el filtro de tipo —el
chip con su × o "Quitar filtros"— **devolvía al huésped a la portada**: arriba
del hero, sin listado, sin las tarjetas que estaba mirando.

### La causa

`/es` significaba **dos cosas a la vez**: "la portada" y "sin filtros". Y la
portada, desde la [decisión 0008](0008-la-portada-es-una-vitrina.md), no lleva
catálogo dentro:

```jsx
{noFilters ? null : (
  <div className="listing" id="resultados">   ← sidebar, chips y resultados
```

Así que al quitar el último filtro **no había a dónde caer**. Ni siquiera el
ancla existía: los enlaces apuntaban a `/es#resultados` y en la portada ese
`id` no se renderiza.

Lo que hace instructivo este defecto es que **el código ya conocía la mitad**.
Hay un comentario, escrito al arreglarlo la primera vez, que dice:

> Estando en tours, "Tipo · Todo" apuntaba a `/es` —sin ningún parámetro— y
> `/es` **no es un listado**: es la portada […] La opción prometía "48" y
> entregaba el hero.

Ese arreglo **escondió la fila** del panel lateral cuando su destino no era un
listado. Trató el sitio donde se había visto el problema y dejó intactos los
otros dos —los chips y "Quitar filtros"—, que son justamente los que el huésped
usa en el teléfono, donde la barra lateral está cerrada.

## Decisión

**`?kind=all` es la dirección que faltaba.** No es un filtro: es la forma de
decir *"estoy en el listado y no quiero filtrar por tipo"*.

- `parseFilters` lo reconoce y devuelve `todoElCatalogo`, sin tocar `filters`.
- La portada pasa a ser `sinFiltros && !todoElCatalogo`. Antes las dos
  condiciones eran la misma, que es exactamente de donde salía el defecto.
- `hrefCon` pone `kind=all` cuando al quitar facetas no quedaría ninguna: el
  enlace nunca puede degenerar en `/es`.
- Los tres "quitar" —la fila del panel, los chips y "Quitar filtros"— apuntan
  ahí.

Y una propiedad que salió gratis: **la fila "Tipo · Todo" volvió sola**. Su
guarda pregunta si el destino lleva a un listado (`anyHref.includes("?")`), y
ahora lo lleva. No hubo que tocar esa lógica — solo dejó de ser cierto el caso
que la hacía esconderse.

### Para el buscador

`?kind=all` tiene título propio en la pestaña —"Todo"— y **canonical a la
portada**. Es una vista útil para quien navega, no una página que deba competir
por posicionar: su contenido es el mismo que la portada resume, y sin el
canonical sería contenido duplicado compitiendo consigo mismo.

## Las alternativas descartadas

**Una ruta aparte, `/es/catalogo`.** Conceptualmente es lo correcto y termina
de hacer lo que la decisión 0008 empezó: separar de verdad portada y catálogo.
Se descartó por alcance contra beneficio — cambian todos los enlaces de filtro,
el buscador, el menú, el sitemap, el canonical y el hreflang, y eso toca SEO,
que hoy está sano con 86 URLs. `?kind=all` resuelve el defecto reportado hoy
sin mover nada de eso. **Sigue siendo la evolución correcta** el día que la
navegación crezca.

**Impedir que se pueda quedar sin filtro** —quitarle la × al chip de tipo y que
"Quitar filtros" limpie todo menos el tipo—. Es el cambio más pequeño y se
descartó porque contradice lo que se pidió: no habría forma de ver el catálogo
entero desde dentro del listado.

## Cómo se comprobó

- Siete criterios nuevos en `smoke.sh`. **Dos fallan con el defecto restaurado**
  —los que describen el síntoma: que `?kind=all` sea un listado y no traiga la
  portada encima—. Los otros cinco pasaron en ambos estados en esa reversión
  parcial, y se dice aquí en vez de contarlos como cobertura que no dan.
- Un criterio en `e2e.mjs`, porque **este defecto no se ve en el HTML del
  servidor**: hay que quitar el filtro navegando.
- Barra completa sobre base recreada: 25 garantías, 179 de integración, 136
  criterios de smoke, los cuatro recorridos y 31 de auditoría.
