/**
 * Imagen de la vitrina · S6-1
 *
 * Cierra la deuda anotada en la [decisión 0001](../../docs/decisiones/0001-entrega-de-imagenes.md):
 * hasta el Sprint 5 la vitrina servía un `<img>` simple sobre imágenes de
 * relleno, "deuda técnica consciente y anotada… se paga cuando lleguen las fotos
 * reales". Ya hay módulo de subida, así que ya hay variantes que servir.
 *
 * Tres decisiones que están aquí y no en el CSS:
 *
 * - **AVIF primero, WebP de respaldo, original al final.** El navegador toma la
 *   primera que entiende. No hay negociación en el servidor ni transformación al
 *   leer: son archivos estáticos.
 * - **`width` y `height` siempre.** Es lo que evita que la página salte al
 *   cargar, y el dato ya se registró al subir.
 * - **Una foto sin variantes se sirve tal cual.** El catálogo de relleno todavía
 *   no está procesado, y una galería a medias es peor que una sin optimizar.
 */

export type ImageVariants = Record<string, Record<string, string>>;

export type ResponsiveImageProps = {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  variants?: ImageVariants | null;
  /** Cuánto espacio ocupa la imagen; se lo pasa el llamador porque depende del diseño. */
  sizes: string;
  priority?: boolean;
  className?: string;
};

function srcSet(byWidth: Record<string, string> | undefined): string | null {
  if (!byWidth) return null;
  const entries = Object.entries(byWidth)
    .map(([width, url]) => [Number(width), url] as const)
    .filter(([width]) => Number.isFinite(width))
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return null;
  return entries.map(([width, url]) => `${url} ${width}w`).join(", ");
}

export function ResponsiveImage({
  src,
  alt,
  width,
  height,
  variants,
  sizes,
  priority = false,
  className,
}: ResponsiveImageProps) {
  const avif = srcSet(variants?.avif);
  const webp = srcSet(variants?.webp);

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={webp ?? undefined}
      sizes={webp ? sizes : undefined}
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      // La primera imagen de la ficha se carga de inmediato; el resto espera a
      // acercarse a la pantalla. Diferir la principal retrasa justo lo que el
      // huésped vino a ver.
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );

  if (!avif && !webp) return img;

  return (
    <picture>
      {avif ? <source type="image/avif" srcSet={avif} sizes={sizes} /> : null}
      {webp ? <source type="image/webp" srcSet={webp} sizes={sizes} /> : null}
      {img}
    </picture>
  );
}
