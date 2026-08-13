import Link from "next/link";

import { formatMoney, productPath, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import type { CatalogCard } from "@/modules/catalog/queries";

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
          {/* Imagen sin optimizar todavía: la entrega definitiva se decide en el
              spike S1-6 y se implementa con las fotos reales del cliente. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.coverUrl}
            alt={item.coverAlt ?? ""}
            width={800}
            height={600}
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}

      <div className="card-body">
        <span className="card-kind">{kindLabel}</span>
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
