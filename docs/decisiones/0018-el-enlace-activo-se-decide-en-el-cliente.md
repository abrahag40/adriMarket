# 0018 · El enlace activo del menú se decide en el cliente

**Fecha:** 2026-09-09
**Estado:** aceptada

## Contexto

El punto que marca la sección actual **se quedaba en "Inicio"**. Se entraba por
la portada, se pulsaba "Estancias", la URL cambiaba a `?kind=stay`, el título de
la pestaña cambiaba, el listado se actualizaba — y el punto no se movía.
Recargar lo arreglaba, que es lo que volvía tan difícil de creer el reporte.

La lógica estaba bien. El problema era **dónde se calculaba**:

```jsx
// layout.tsx
const currentPath = `${pathname}${requestHeaders.get("x-search") ?? ""}`;
```

De las cabeceras de la petición, leídas en el layout. Y en el App Router **un
layout no se vuelve a renderizar en una navegación de cliente**: el valor se
congelaba en el primer render del servidor y ahí se quedaba toda la sesión.

Por eso una comprobación con `curl` decía que todo estaba bien —una petición
nueva siempre acierta— y por eso ningún criterio de `smoke.sh` lo habría visto
jamás. **El defecto solo existe entre dos renders.**

## Decisión

Los cuatro enlaces salen a `NavLinks`, un componente de cliente que usa
`usePathname` y `useSearchParams`, que sí se actualizan en cada navegación.

- Va envuelto en `<Suspense>`: `useSearchParams` lo exige o falla al construir
  cualquier ruta que Next quiera renderizar de forma estática. El respaldo son
  los mismos enlaces sin marcar — el menú nunca desaparece.
- El menú móvil usa **el mismo componente**. Tenía el mismo defecto y uno peor
  encima: comparaba la cadena entera, así que `?kind=stay&location=&guests=`
  —lo que produce el buscador, que manda todos sus campos incluidos los
  vacíos— no coincidía con `?kind=stay` ni siquiera en la primera carga.
- Se compara **el parámetro `kind`**, no la URL: "Inicio", "Tours" y
  "Estancias" comparten `pathname` y solo se distinguen por ahí.

`x-pathname` sigue leyéndose en el layout para el enlace de idioma, que **sí**
es cosa del servidor: depende de la ruta y no cambia con la búsqueda.

## La alternativa descartada

**Forzar el re-render del layout**, con `export const dynamic` o leyendo la
búsqueda en la página y pasándola hacia arriba. Lo segundo no se puede —los
datos no viajan de la página al layout— y lo primero no arregla nada: el
problema no es que el layout esté cacheado, es que en una navegación de cliente
**no se vuelve a ejecutar en absoluto**. Insistir por ahí era pelearse con el
modelo del framework para conseguir algo que un componente de cliente da gratis.

## Cómo se comprobó

- Reproducido antes de tocar nada, con navegación de cliente real:
  `/es` → `● Inicio`; tras pulsar "Estancias", `/es?kind=stay` → **`● Inicio`**.
- Después del arreglo, cinco navegaciones seguidas sin recargar: el punto sigue
  al huésped en todas.
- Un criterio en `e2e.mjs`, que navega por el menú desplegable —el camino real
  en un teléfono— y comprueba el marcado **después** de navegar. Es el único
  lugar de la barra donde este defecto puede verse: `smoke.sh` pide con `curl`
  y una petición nueva siempre acierta.
