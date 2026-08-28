# 0006 · Paleta y tipografía adaptadas de una plantilla de referencia

**Estado:** decidido · **Sprint:** post-7 (retoma del despliegue) · **Decide:**
cliente, con el análisis de los Developers

## Pregunta

El cliente encontró una plantilla de referencia
(`demo.goodlayers.com/traveltour/homepages/main5`, tema comercial GoodLayers
TravelTour) y pidió que el sitio se vea exactamente así. ¿Se clona el sitio
con una herramienta como HTTrack, o hay otra forma de llegar al mismo
resultado visual?

## Contexto

- GoodLayers TravelTour es un **tema de WordPress de pago**, construido sobre
  WPBakery (`gdlr-core-*`) y su propio plugin de reservas (`tourmaster-*`).
  Se confirmó inspeccionando las clases CSS y los scripts cargados
  (`jquery.min.js`, `page-builder.js`, `tourmaster.js`, `masonry.min.js`,
  entre otros) — es, técnicamente, un sitio de WordPress real, no una
  maqueta.
- Mirar sus archivos con HTTrack (o cualquier descargador de sitios) traería
  su HTML, su CSS y **sus imágenes de stock** tal cual — un producto pagado
  que este proyecto no compró, con activos que tampoco son del cliente.
- Lo que sí es legítimamente reutilizable, porque no es propiedad de
  GoodLayers: las dos tipografías que usa son **Google Fonts gratuitas**
  (`DM Sans` y `DM Serif Display`), y los colores son datos observables —se
  leen con el inspector del navegador, no se copian del código fuente.

## Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **A. Descargar el sitio con HTTrack y adaptar sus archivos** | El resultado sería idéntico de inmediato | Reproduce un tema comercial de pago y sus imágenes de stock. Su código es WordPress + WPBakery: no encaja con Next.js sin reescribirlo entero, así que tampoco ahorra el trabajo que parece ahorrar |
| **B. Inspeccionar la referencia y reconstruir con código propio** | Mismo resultado visual, cero riesgo de licencia, el código queda integrado con el sistema de diseño y las garantías de accesibilidad que ya existían | Exige leer la referencia con cuidado en vez de copiar y pegar |

## Decisión

**Opción B.** Se inspeccionó la referencia con el navegador —no se descargó
nada— y se extrajeron sus decisiones de diseño con el inspector de estilos
computados: tipografías, colores exactos, radios de esquina, sombras y la
estructura de sus componentes principales (encabezado, hero con buscador
flotante, tarjetas de tour). Esos valores se volvieron a implementar como
tokens propios en `src/app/globals.css`, cargando las tipografías con
`next/font/google` — que las descarga una vez al construir y las sirve desde
el propio dominio, sin depender de Google en cada visita.

## Por qué

1. **El resultado visual es el mismo; el origen del código no.** Un huésped
   que compara los dos sitios ve la misma paleta, la misma pareja tipográfica
   y el mismo lenguaje de tarjetas flotantes con sombra suave. Lo que cambia
   es que aquí cada línea de CSS se escribió para este proyecto.
2. **El azul de la referencia no pasaba contraste, y hubo que arreglarlo, no
   copiarlo.** Medido con la fórmula de luminancia relativa: su azul sobre
   blanco da 2.91:1 — insuficiente incluso para texto grande (mínimo 3:1), y
   muy por debajo del 4.5:1 que exige un botón con texto normal. Se oscureció
   a `#2F6FD6`, que da 4.84:1. Clonar el sitio tal cual habría heredado ese
   defecto de accesibilidad silenciosamente.
3. **El verde-menta de la insignia es decorativo en la referencia (1.7:1 de
   contraste) y aquí se necesitaba como texto legible.** Se resolvió
   reutilizando el teal que ya estaba verificado desde el Sprint 1
   (`--accent-2: #0b5f5c`, 7.48:1) en vez de inventar un tono nuevo que
   hubiera que volver a auditar.
4. **No duplica trabajo de plataforma.** El stack de la referencia —WordPress,
   WPBakery, jQuery, Masonry— no tiene nada que ver con Next.js server-first
   de este proyecto. Adaptar su código en vez de sus decisiones de diseño
   habría significado reescribirlo de cualquier forma.

## Consecuencias

- Paleta reemplazada en `src/app/globals.css`: acento primario azul
  (`#2f6fd6` claro / `#6fa1f5` oscuro), acento secundario el teal existente,
  fondos neutros en vez de con tinte verde-azulado, sombras suaves y difusas
  como firma visual, y radios más generosos (`--radius-pill` nuevo, para
  insignias y botones).
- Tipografía nueva en todo el sitio, público y panel: `DM Sans` para texto y
  `DM Serif Display` para títulos, ambas cargadas con `next/font/google` en
  los dos layouts raíz (`[locale]/layout.tsx` y `admin/layout.tsx`).
- El titular del inicio gana una palabra destacada en el color de acento
  (`heroTitleStart` + `heroTitleAccent` en `src/i18n/messages.ts`), igual que
  "Visit" en la referencia.
- El buscador de la portada cambia de tarjeta con campos en caja a campos
  separados por línea vertical con un bloque de acento a todo lo alto,
  scoped a `.search-card` para no tocar el `.filters` que comparte el panel
  de administración.

## Qué se rechazó explícitamente

Usar HTTrack (o cualquier espejo de sitio) para traer el HTML, el CSS y las
imágenes de la referencia tal cual. Además del problema de licencia sobre un
tema comercial de pago, el código resultante habría sido WordPress con un
framework de maquetación (WPBakery) que no corre en este proyecto — habría
que reescribirlo de todos modos para integrarlo a Next.js, así que ni
siquiera ahorraba el trabajo que aparentaba ahorrar.
