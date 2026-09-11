import { LOCALE_TAG, type Locale } from "@/i18n/config";
import { getMessages, type Messages } from "@/i18n/messages";

import type { Quote, QuoteLine } from "./types";

/**
 * Traducción de los conceptos del desglose.
 *
 * El motor de precios emite claves (`occupancy:1x3`) porque no sabe en qué
 * idioma lee el huésped. Aquí se convierten en texto.
 *
 * Vive fuera de los componentes porque tiene dos usos: pintar la pantalla, y
 * **congelar el desglose en la reserva** con las etiquetas ya traducidas. Un
 * comprobante que se relee en dos años no debe depender del código de entonces
 * para ser legible.
 */

function formatNight(night: string, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${night}T00:00:00Z`));
}

export function describeLine(line: QuoteLine, locale: Locale, t: Messages): string {
  switch (line.kind) {
    case "nightly":
      return formatNight(line.concept, locale);

    case "occupancy": {
      const [, detail = ""] = line.concept.split(":");
      const [guests = "0", nights = "0"] = detail.split("x");
      return t.quoteExtraGuests(Number(guests), Number(nights));
    }

    case "pax": {
      const [, type = "", count = "0"] = line.concept.split(":");
      const label = type === "adult" ? t.paxAdult : type === "child" ? t.paxChild : t.paxInfant;
      return `${label} × ${count}`;
    }

    case "extra": {
      /* `extra:<cantidad>:<nombre>`. El nombre viene del catálogo y ya está en
         el idioma del huésped —igual que el de un impuesto—, así que aquí no
         se traduce: se acomoda. Se parte con límite porque un nombre puede
         llevar dos puntos ("Buffet: tacos al pastor") y partirlo entero lo
         cortaría a la mitad. */
      const [, qty = "1", ...resto] = line.concept.split(":");
      return `${resto.join(":")} × ${qty}`;
    }

    case "fee":
      return line.concept === "cleaning" ? t.quoteCleaning : line.concept;

    case "discount": {
      /* `coupon:<código>` o `coupon:<código>:base`. El sufijo lo pone el motor
         cuando el descuento salió solo del servicio base porque la reserva
         lleva extras que el cupón no alcanza: el huésped lee POR QUÉ el total
         bajó menos de lo que esperaba, en vez de descubrirlo restando. */
      const [, code = "", alcance] = line.concept.split(":");
      return alcance === "base" ? t.couponDiscountBase(code) : t.couponDiscount(code);
    }

    case "tax":
      // Nombre del impuesto: viene configurado y ya es legible.
      return line.concept;
  }
}

/**
 * Devuelve el desglose con una etiqueta traducida por línea, listo para guardar.
 * No modifica los importes ni el orden: solo agrega texto.
 */
export function freezeQuoteLabels(quote: Quote, locale: Locale): Quote & {
  lines: (QuoteLine & { label: string })[];
  locale: Locale;
} {
  const t = getMessages(locale);
  return {
    ...quote,
    locale,
    lines: quote.lines.map((line) => ({ ...line, label: describeLine(line, locale, t) })),
  };
}
