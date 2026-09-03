"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ResponsiveImage } from "@/components/responsive-image";
import type { ImageVariants } from "@/components/responsive-image";

export type GalleryPhoto = {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  variants: ImageVariants | null;
};

/**
 * Los textos llegan ya resueltos, no como funciones: una función no cruza la
 * frontera del servidor al cliente ("Functions cannot be passed directly to
 * Client Components"), así que el formateo de `galleryCounter(i, n)` ocurre
 * en la página —que es donde vive el diccionario— y aquí llega una entrada
 * por foto.
 */
export type GalleryLabels = {
  /** Etiqueta de la pastilla sobre la foto principal. */
  open: string;
  close: string;
  prev: string;
  next: string;
  /** "5 fotos". */
  photoCount: string;
  /** Una entrada por foto: "Ver foto 2 en grande". */
  openPhoto: string[];
  /** Una entrada por foto: "2 de 5". */
  counter: string[];
};

/**
 * Galería de la ficha · la cuadrícula de la referencia más su carrusel
 *
 * La referencia arma la cuadrícula con la foto principal a 2/3 del ancho
 * (relación 9:5, medida sobre su contenedor de 820×456) y cuatro miniaturas
 * en 2×2 sobre el tercio restante. Cada foto es un `<a href>` a la imagen
 * completa que su lightbox intercepta.
 *
 * Ese `<a href>` es a propósito y no un botón: **sin JavaScript la foto
 * completa sigue abriéndose** en su propia pestaña, que es el
 * comportamiento útil. Con JavaScript se cancela la navegación y se abre el
 * carrusel — mejora progresiva, no dos caminos distintos.
 *
 * El carrusel es propio, no una librería: son cinco fotos y lo que hace
 * falta es teclado (←/→/Esc), foco atrapado dentro del diálogo, y devolver
 * el foco a la miniatura de origen al cerrar. Traer lightGallery para eso
 * pesa más que el resto de la página.
 */
export function Gallery({
  photos,
  productName,
  labels,
}: {
  photos: GalleryPhoto[];
  productName: string;
  labels: GalleryLabels;
}) {
  const [cover, ...rest] = photos;
  /* La referencia muestra cuatro miniaturas; las demás fotos siguen en el
     carrusel, contadas sobre la última. */
  const thumbs = rest.slice(0, 4);
  const hidden = rest.length - thumbs.length;

  const [openAt, setOpenAt] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const open = useCallback((index: number, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setOpenAt(index);
  }, []);

  const close = useCallback(() => {
    setOpenAt(null);
    /* El foco vuelve a la foto que abrió el carrusel: quien navega con
       teclado no queda al principio de la página. */
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  const move = useCallback(
    (delta: number) => {
      setOpenAt((current) => {
        if (current === null) return current;
        return (current + delta + photos.length) % photos.length;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    if (openAt === null) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Tab") {
        /* Foco atrapado: el diálogo cubre la página y tabular hasta la
           cabecera que hay debajo deja al huésped navegando a ciegas. */
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button");
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [openAt, close, move]);

  if (!cover) return null;

  const current = openAt === null ? null : photos[openAt];

  return (
    <>
      <div className={thumbs.length > 0 ? "gallery" : "gallery gallery-solo"}>
        <figure className="gallery-main">
          <a
            href={cover.url}
            onClick={(event) => {
              event.preventDefault();
              open(0, event.currentTarget);
            }}
            aria-label={labels.openPhoto[0]}
          >
            {/* La principal se carga de inmediato: es lo que el huésped vino
                a ver, y diferirla retrasa justo eso. */}
            <ResponsiveImage
              src={cover.url}
              alt={cover.alt ?? productName}
              width={cover.width ?? 1200}
              height={cover.height ?? 800}
              variants={cover.variants}
              sizes={thumbs.length > 0 ? "(min-width: 900px) 66vw, 100vw" : "100vw"}
              priority
            />
          </a>
          <button
            type="button"
            className="gallery-pill"
            onClick={(event) => open(0, event.currentTarget)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M3 5h18v14H3z" strokeLinejoin="round" />
              <path d="m3 16 5-5 4 4 3-3 6 6" strokeLinejoin="round" />
              <circle cx="8.5" cy="9" r="1.4" />
            </svg>
            {labels.open}
            <span className="gallery-pill-count">{labels.photoCount}</span>
          </button>
        </figure>

        {/* El catálogo real casi nunca llega a las cuatro fotos secundarias
            de la referencia — la mayoría de los productos tiene una o dos.
            Un `grid-template-columns` fijo a tres columnas dejaba ese
            espacio vacío en vez de repartirlo: la principal se veía a la
            mitad de su ancho. `.gallery-thumbs` reparte lo que haya. */}
        {thumbs.length > 0 ? (
          <div className="gallery-thumbs" data-count={thumbs.length}>
            {thumbs.map((item, index) => (
              <figure key={item.url}>
                <a
                  href={item.url}
                  onClick={(event) => {
                    event.preventDefault();
                    open(index + 1, event.currentTarget);
                  }}
                  aria-label={labels.openPhoto[index + 1]}
                >
                  <ResponsiveImage
                    src={item.url}
                    alt={item.alt ?? ""}
                    width={item.width ?? 800}
                    height={item.height ?? 600}
                    variants={item.variants}
                    sizes="(min-width: 900px) 16vw, 50vw"
                  />
                  {hidden > 0 && index === thumbs.length - 1 ? (
                    <span className="gallery-more" aria-hidden="true">
                      +{hidden}
                    </span>
                  ) : null}
                </a>
              </figure>
            ))}
          </div>
        ) : null}
      </div>

      {current ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={dialogRef}
          onClick={(event) => {
            /* Clic en el fondo cierra; clic en la foto o los controles, no. */
            if (event.target === event.currentTarget) close();
          }}
        >
          <p className="visually-hidden" id={titleId}>
            {productName}
          </p>

          <button type="button" className="lightbox-close" onClick={close}>
            <span className="visually-hidden">{labels.close}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>

          <figure className="lightbox-figure">
            <ResponsiveImage
              src={current.url}
              alt={current.alt ?? productName}
              width={current.width ?? 1600}
              height={current.height ?? 1067}
              variants={current.variants}
              sizes="100vw"
              priority
            />
          </figure>

          {photos.length > 1 ? (
            <div className="lightbox-controls">
              <button type="button" onClick={() => move(-1)}>
                <span className="visually-hidden">{labels.prev}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <p className="lightbox-counter" aria-live="polite">
                {labels.counter[openAt!]}
              </p>
              <button type="button" onClick={() => move(1)}>
                <span className="visually-hidden">{labels.next}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
