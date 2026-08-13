# 0001 · Entrega de imágenes

**Estado:** decidido · **Sprint:** 1 (spike S1-6, caja de tiempo 4 h) ·
**Decide:** Developers

## Pregunta

Las fotos son el activo de venta más importante de este producto. ¿Cómo se
sirven en varios tamaños y formato moderno, sin que la galería sea lo que más
tarda en cargar en un teléfono con señal de hotel?

## Contexto

- El tráfico es mayoritariamente móvil, en conexiones malas.
- Quien sube las fotos es el cliente desde el panel (Sprint 5), no un
  desarrollador: no se puede esperar que optimice antes de subir.
- Una ficha lleva de 3 a 15 fotos; el listado, una por producto.
- El presupuesto de infraestructura del MVP es de 75 a 100 USD al mes.

## Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **A. Optimizador de Next sobre almacenamiento propio** | Sin proveedor extra; ya viene en el marco | La transformación consume cómputo del servidor y se factura por invocación; en la plataforma administrada es la partida que más crece sin avisar |
| **B. Cloudinary / imgix** | Transformación por URL, muy buena calidad, recortes inteligentes | Costo por transformación; un proveedor más que administrar; el tramo gratuito se agota con un catálogo con tráfico |
| **C. Almacenamiento con CDN + variantes al subir** | Costo predecible (almacenamiento, no cómputo); el CDN sirve archivos estáticos; sin dependencia en tiempo de lectura | Hay que generar las variantes en el momento de la subida; una variante nueva obliga a reprocesar |

## Decisión

**Opción C**: generar las variantes cuando el cliente sube la foto, guardarlas
en el almacén y servirlas por CDN.

Al subir se producen anchos de 400, 800, 1600 y 2400 px en AVIF con respaldo en
WebP, y se guardan en `product_media` la URL, el ancho, el alto y el texto
alternativo. La etiqueta `<img>` declara `srcset` y `sizes` y el navegador elige.

## Por qué

1. **El costo es predecible.** Se paga almacenamiento, que es barato y crece
   con el catálogo, no con el tráfico. Las otras dos opciones facturan por
   transformación o por invocación: justo cuando el negocio va bien, la factura
   sube y nadie sabe por qué.
2. **Nada falla en el momento de leer.** Servir archivos ya generados no puede
   fallar por un proveedor caído ni por un límite de tasa alcanzado a media
   temporada alta.
3. **El punto de optimización coincide con el punto de subida**, que es donde
   ya hay un humano esperando unos segundos. Optimizar al leer traslada esa
   espera al huésped.
4. **Guardar ancho y alto evita el salto de la página al cargar.** Es la causa
   más común de mala medición de estabilidad visual, y sale gratis si se
   registra al subir.

## Consecuencias

- El módulo de subida (Sprint 5) necesita procesamiento de imagen en el
  servidor; se hace en un job y no en la petición del panel, para que subir
  quince fotos no bloquee la pantalla.
- Agregar un ancho nuevo obliga a reprocesar el catálogo. Con este volumen es un
  job de minutos, no un problema.
- Mientras no exista el módulo de subida, la vitrina usa `<img>` simple con
  ancho y alto declarados y carga diferida, sobre imágenes de relleno. **Es
  deuda técnica consciente y anotada**, no un descuido: se paga en el Sprint 5,
  cuando lleguen las fotos reales.

## Qué se rechazó explícitamente

Servir la foto original tal como la sube el cliente. Una foto de teléfono
moderno pesa entre 3 y 8 MB; una ficha con diez fotos serían decenas de
megabytes. En la conexión de un hotel eso no es una galería lenta: es una
página que el huésped abandona antes de ver el precio.
