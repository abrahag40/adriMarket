# 0009 · Destinos y tours vuelven a cuadrícula

**Fecha:** 2026-09-06 · **Estado:** aplicada · **Decide:** cliente

## La pregunta

La [decisión 0008](0008-la-portada-es-una-vitrina.md) pasó las cuatro vitrinas
de la portada a rieles y bajó la página de 8 692 a 4 316 px en un teléfono. El
cliente volvió con la misma plantilla de referencia de la
[decisión 0006](0006-paleta-inspirada-en-referencia.md) y pidió lo contrario
para las cuatro: **seis destinos en cuadrícula**, **tres tours con la foto
alta**, y **seis estancias y seis vehículos en columnas de tres**, como en
"Top Destinations", "Popular Tours" y "Hotel Rooms".

¿Se le dice que no, o se hace y se cuenta lo que cuesta?

## Lo que se decidió

Se hace, y se cuenta lo que cuesta.

1. **Destinos: cuadrícula de seis**, tres por fila en escritorio y **dos en el
   teléfono**. Seis, no los ocho que había: la muestra es una muestra.
2. **Tours destacados: tres, en cuadrícula**, con la foto en `4 / 5` — 352 ×
   440 px en escritorio, ancho completo en el teléfono. Eran ocho en riel.
3. **Estancias y vehículos: seis cada uno, en cuadrícula de tres**, con el
   mismo corte de dos columnas en el teléfono. En esas dos tarjetas el
   **resumen se oculta debajo de 700 px**: dos renglones de texto gris doblan
   el alto de la tarjeta para decir lo que la foto y el nombre ya dicen, y son
   1 100 px de portada en un teléfono. El dato sigue completo en la ficha.
4. **La salida de cada vitrina baja al final y se centra.** Estaba arriba, a
   la derecha del título, porque una fila que se arrastra no tiene final
   visible donde ponerla. Ya no se arrastra ninguna.
5. **Nace `/es/destinos` (`/en/destinations`)**, que los lista todos. Sin ella,
   cortar la portada a seis dejaba los otros dos alcanzables solo escribiendo
   la URL a mano — que es exactamente la razón por la que hasta ahora no se
   cortaban.
6. **La portada se queda sin un solo riel.** `Carousel` sobrevive en la galería
   de la ficha y en la guía de estilo; su `content-visibility` sigue
   documentado en `globals.css` porque la regla no cambió, solo dejó de
   aplicarse aquí.

## Lo que cuesta, medido

Portada en un teléfono de 390 px, sobre el mismo catálogo:

| | Antes (0008) | Ahora |
|---|---|---|
| Alto de la página | 4 316 px · 5.1 pantallas | **6 351 px · 7.5 pantallas** |
| Peso transferido | 194 kB en 12 peticiones | **261 kB en 21** |
| JavaScript | 105 kB | **104 kB** |
| Destinos · alto | 340 px (riel de 8) | 601 px (2 × 3) |
| Tours destacados · alto | 482 px (riel de 8) | **1 535 px (3 apilados)** |
| Estancias · alto | 532 px (riel de 6) | 871 px (3 × 2) |
| Vehículos · alto | 532 px (riel de 6) | 912 px (3 × 2) |

**La mitad del alto que se agregó es la sección de tours**: tres fotos a 4/5 de
ancho completo miden 448 px cada una en un teléfono. Es justo lo que se pidió
—"ese tipo de imagen más grande en el height"— y es lo que la referencia hace
en el suyo. No es un descuido: es el precio de la foto grande, y se paga una
vez por sección, no por tarjeta.

Las dos secciones de tarjetas con cuerpo —estancias y vehículos— habrían
costado **2 200 px cada una** apiladas de una en una. Las dos columnas del
teléfono y el resumen oculto las dejan en 871 y 912: el 40 % de lo que
costarían sin esos dos cortes.

Lo que **no** se deshizo de 0008 es lo que de verdad importaba: el catálogo
paginado sigue fuera de la portada, y por eso 6.7 pantallas se comparan contra
las 10.3 originales, no contra las 5.1.

### El `sizes` que costaba el doble

Al pasar las cuatro vitrinas a cuadrícula, el ancho real de cada tarjeta bajó a
331–352 px, pero los tres componentes seguían declarando `sizes="33vw"`. En un
escritorio de 1280 eso son 422 px, así que el navegador bajaba la **variante de
800** para pintarla a 331: **cuatro veces los bytes sin un píxel más de
detalle**, y con veintiuna fotos en la página. La portada de escritorio pesaba
**843 kB**; con la medida real de la columna declarada, **406**.

No lo detectó la barra: `audit` mide a 390 px de ancho, donde la variante más
chica (400) es la única candidata y el error no se nota. Un `sizes` mentiroso
solo se paga en pantallas grandes.

El presupuesto de peso de la portada sube de 260 a **320 kB** en
`scripts/audit.mjs`, con la medición y el porqué escritos ahí. En resumen: 190
kB de la página son armazón que no se mueve —104 de JavaScript, 53 de dos
tipografías, 22 del documento, 9 de CSS—, así que un tope de 260 dejaba 70 kB
para fotos, unas tres. Una portada cuyo trabajo es enseñar veintiuna fotos no
cabe en tres, y un presupuesto que la página no puede cumplir enseñando lo que
vino a enseñar no se respeta: se ignora. Es el mismo argumento con el que ese
archivo jubiló el tope global de 200. Medido: **261 kB, con 59 de margen**.

## La alternativa descartada

**Dejar los rieles y decirle al cliente que la referencia está mal.** El
argumento técnico existe y está escrito en 0008: una fila horizontal deja ver
que hay más sin gastar alto. Pero la referencia es la que el cliente eligió y
paga, el costo es alto de página y no de peso crítico —el JavaScript no se
movió y las fotos siguen llegando diferidas—, y 7.5 pantallas está lejos de las
10.3 que motivaron 0008. Cuando el costo es contable y el gusto es del cliente,
se cobra el costo y se documenta.

**Apilar las tarjetas de una en una en el teléfono, como hace la referencia.**
Es lo que 0008 midió y rechazó: 2 693 px por sección, dos secciones. Con dos
columnas y sin resumen se conserva la cuadrícula que se pidió y se paga un
tercio de ese alto. Una tarjeta de estancia a 172 px sigue enseñando foto,
precio, nombre y su enlace — que es con lo que se elige.

## La trampa que esto reabre a medias

`content-visibility: auto` en `.carousel-item` existe porque **una tarjeta
fuera de pantalla en un riel está lejos hacia el lado**, dentro del margen con
el que Chrome adelanta descargas, y `loading="lazy"` no la detiene. En una
cuadrícula lo que sobra está **abajo**, y ahí el navegador sí espera: por eso
ninguna de las cuatro vitrinas necesita ya el truco.

Sigue en `globals.css`, con su explicación, porque la regla no cambió — solo
dejó de aplicarse aquí. El día que una vitrina vuelva a ser un riel, es lo que
evita que el teléfono se traiga sus veintiún fotos de golpe.

Lo que sí queda pendiente de mirar con calma es el **escritorio**: 406 kB en 30
peticiones a 1280 px, porque a esa altura de página el umbral de carga diferida
de Chrome alcanza casi todas las fotos. La barra no lo vigila —mide a 390 px, a
propósito, que es donde está el huésped— y 406 kB para una página de veintiuna
fotos no es alarmante, pero es el número que hay que mirar el día que se agregue
una quinta vitrina.
