import Link from "next/link";

import { formatMoney, productPath, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { CatalogCard } from "@/modules/catalog/queries";

import { ResponsiveImage } from "./responsive-image";

/**
 * Tarjeta de resultado.
 *
 * El precio que aparece es un "desde", derivado de la tarifa más baja vigente.
 * No se calcula un total aquí a propósito: el total depende de fechas y
 * personas, y ese cálculo tiene una sola fuente autorizada en el servidor
 * (Sprint 2). Mostrar un número aproximado que después cambia es la forma más
 * rápida de perder la confianza del huésped.
 */
export function ProductCard({ item, locale }: { item: CatalogCard; locale: Locale }) {
  const t = getMessages(locale);
  const href = productPath(locale, item.kind, item.slug);
  const kindLabel = item.kind === "tour" ? t.filterKindTour : t.filterKindStay;
  const unit = item.kind === "stay" ? t.perNight : t.perPerson;

  return (
    <li className="card">
      {/* Un producto sin fotos no reserva el hueco de la galería: la tarjeta se
          compacta. Reservar el espacio deja un rectángulo gris que se lee como
          imagen que no cargó — y en una vitrina eso resta confianza. */}
      {item.coverUrl ? (
        <div className="card-media">
          {/* Sirve los anchos generados al subir (decisión 0001). Una tarjeta
              ocupa media pantalla en un teléfono y un tercio en escritorio: eso
              es lo que dice `sizes`, y con eso el navegador elige el archivo más
              chico que se vea bien. */}
          <ResponsiveImage
            src={item.coverUrl}
            alt={item.coverAlt ?? ""}
            width={item.coverWidth ?? 800}
            height={item.coverHeight ?? 600}
            variants={item.coverVariants}
            sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
          />
          <span className="card-kind-badge">{kindLabel}</span>
        </div>
      ) : null}

      <div className="card-body">
        {/* Sin foto no hay dónde poner la insignia: el tipo se queda como
            etiqueta de texto para no perder el dato. */}
        {item.coverUrl ? null : <span className="card-kind">{kindLabel}</span>}
        {/* El enlace del título se estira sobre toda la tarjeta con un
            pseudoelemento (`.card-title a::after`), así que se entra al
            detalle pulsando cualquier parte —la foto, el precio, el hueco—
            y no solo las letras del nombre. Sigue siendo **un solo enlace**
            con el nombre del producto: repetir el enlace en la foto le daría
            dos entradas idénticas a un lector de pantalla. */}
        <h3 className="card-title">
          <Link href={href}>{item.name}</Link>
        </h3>
        {item.summary ? <p className="card-summary">{item.summary}</p> : null}

        <div className="card-foot">
          {item.fromCents !== null ? (
            <p className="price">
              <span className="price-label">{t.fromPrice}</span>
              <span className="price-amount">
                {formatMoney(item.fromCents, item.currency, locale)}
              </span>
              <span className="price-unit">{unit}</span>
            </p>
          ) : (
            <span />
          )}
          {item.capacity !== null ? (
            <span className="badge">{t.upToGuests(item.capacity)}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
