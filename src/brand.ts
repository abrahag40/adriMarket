import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";

/**
 * La marca de cada sitio.
 *
 * El mismo código sirve a varios clientes, cada uno en su propio proyecto de
 * Vercel y con su propia base: lo único que cambia entre ellos es esto. Se elige
 * con `NEXT_PUBLIC_SITE_BRAND` y, como toda variable `NEXT_PUBLIC_`, **se fija al
 * construir**: cada proyecto compila con la suya, y servidor y navegador leen el
 * mismo valor (el encabezado se pinta en los dos lados).
 *
 * Sin la variable, la marca es adriMarket: el sitio que ya existía no tiene que
 * enterarse de que ahora hay otros. Una marca que no está en la lista detiene la
 * compilación en lugar de publicar un sitio con el nombre de otro cliente.
 */
export type Brand = {
  id: string;
  /** El nombre completo, como se escribe en títulos y correos. */
  name: string;
  /** El nombre partido en dos tonos para el encabezado: `lead` normal, `accent` en el color de acento. */
  lead: string;
  accent: string;
  tagline: Record<Locale, string>;
  /** Firma de los correos, debajo del nombre. */
  emailTagline: Record<Locale, string>;
  /** Logo en `public/`. Sin logo, el encabezado lleva solo el nombre. */
  logo?: { src: string; width: number; height: number };
  /** Qué vende el sitio: el menú solo ofrece esas secciones. */
  kinds: ("tour" | "stay" | "vehicle")[];
  /**
   * Textos que este sitio dice distinto. Sirve para lo que depende de cómo cobra
   * cada cliente: un sitio que cobra el total no puede decir «saldo en destino».
   */
  messages?: Partial<Record<Locale, Partial<Messages>>>;
};

/**
 * Textos de un operador que cobra el total al reservar (settings.deposit = 100)
 * y reserva directo con quien organiza el tour: no hay «saldo en destino» que
 * prometer. Los usan Conquest Tours y MarTours, que es su réplica.
 */
const COBRO_TOTAL: Brand["messages"] = {
  es: {
    heroEyebrow: "Reserva directo con el operador",
    valuePropDepositHeading: "Reserva directo con el operador",
    valuePropDepositBody: "Tratas con quien organiza el tour: sin intermediarios y sin cargos ocultos.",
    ctaHeading: "Reserva tu próximo tour en el Caribe",
    ctaBody: "Elige el tour, la fecha y cuántos van. Tratas directo con quien lo organiza, sin cargos ocultos.",
    footerHowBody: "Eliges tu tour y tu fecha, y reservas directo con el operador.",
    extrasIntro: "Se paga junto con el tour.",
    // Conquest no tiene cancelación: «Cancelación clara» sugería que sí.
    valuePropCancelHeading: "Sin sorpresas",
    valuePropCancelBody: "Las condiciones del tour quedan escritas en tu reserva desde el momento en que pagas.",
    // El precio de la tarjeta es el de adulto: dicho así, sin «Desde».
    fromPrice: "",
    perPerson: "por adulto",
  },
  en: {
    heroEyebrow: "Book directly with the operator",
    valuePropDepositHeading: "Book directly with the operator",
    valuePropDepositBody: "You deal with the people who run the tour: no middlemen and no hidden fees.",
    ctaHeading: "Book your next Caribbean tour",
    ctaBody: "Pick the tour, the date and how many are going. You deal directly with the people who run it, no hidden fees.",
    footerHowBody: "Pick your tour and date, and book directly with the operator.",
    extrasIntro: "Paid together with the tour.",
    valuePropCancelHeading: "No surprises",
    valuePropCancelBody: "The tour's terms are written into your booking from the moment you pay.",
    fromPrice: "",
    perPerson: "per adult",
  },
};

const BRANDS: Record<string, Brand> = {
  adrimarket: {
    id: "adrimarket",
    name: "adriMarket",
    lead: "adri",
    accent: "Market",
    tagline: { es: "Tours y casas en el Caribe mexicano", en: "Tours and homes in the Mexican Caribbean" },
    emailTagline: { es: "Tours y estancias en el Caribe mexicano", en: "Tours and stays in the Mexican Caribbean" },
    kinds: ["tour", "stay", "vehicle"],
  },
  "conquest-tours": {
    id: "conquest-tours",
    name: "Conquest Tours",
    lead: "Conquest ",
    accent: "Tours",
    tagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    emailTagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    logo: { src: "/brand/conquest-tours.png", width: 176, height: 176 },
    kinds: ["tour"],
    // Conquest cobra el total al reservar: ver COBRO_TOTAL.
    messages: COBRO_TOTAL,
  },
  // MarTours es una réplica de Conquest Tours en su propio ambiente: su
  // proyecto de Vercel, su base de Neon y su Blob (decisión 0020). Mismo
  // catálogo y mismo cobro; cambia el nombre. Sin logo: el encabezado lleva
  // solo el nombre.
  martours: {
    id: "martours",
    name: "MarTours",
    lead: "Mar",
    accent: "Tours",
    tagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    emailTagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    kinds: ["tour"],
    messages: COBRO_TOTAL,
  },
  "zahardev-tours": {
    id: "zahardev-tours",
    name: "ZaharDev Tours",
    lead: "ZaharDev ",
    accent: "Tours",
    tagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    emailTagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    // Sin logo hasta que Abraham apruebe uno: el encabezado lleva el nombre.
    kinds: ["tour"],
    // ZaharDev revende (decisión 0025): cobra el total al reservar, con el
    // precio final en la tarjeta. Nada de «saldo en destino».
    //
    // BORRADOR del 2026-11-13. Lo que ve un visitante lo aprueba Abraham antes
    // de publicarse (regla 2 del sitio de ZaharDev). Se evitó a propósito decir
    // quién opera cada tour y prometer una política de cancelación: las dos
    // cosas dependen de lo que entregue Alexis.
    messages: {
      es: {
        heroEyebrow: "Pago en línea · precio final",
        valuePropDepositHeading: "El precio que ves es el que pagas",
        valuePropDepositBody: "Pagas en línea el total de tu tour: sin cargos agregados al final ni saldo pendiente en destino.",
        ctaHeading: "Reserva tu próximo tour en el Caribe",
        ctaBody: "Elige el tour, la fecha y cuántos van. Pagas en línea el precio final y tu lugar queda confirmado.",
        footerHowBody: "Eliges tu tour y tu fecha, y pagas en línea el precio final.",
        extrasIntro: "Se paga junto con el tour.",
        valuePropCancelHeading: "Sin sorpresas",
        valuePropCancelBody: "Las condiciones del tour quedan escritas en tu reserva desde el momento en que pagas.",
        perPerson: "por adulto",
      },
      en: {
        heroEyebrow: "Pay online · final price",
        valuePropDepositHeading: "The price you see is the price you pay",
        valuePropDepositBody: "You pay the full tour online: no fees added at checkout and no balance due on arrival.",
        ctaHeading: "Book your next Caribbean tour",
        ctaBody: "Pick the tour, the date and how many are going. You pay the final price online and your spot is confirmed.",
        footerHowBody: "Pick your tour and date, and pay the final price online.",
        extrasIntro: "Paid together with the tour.",
        valuePropCancelHeading: "No surprises",
        valuePropCancelBody: "The tour's terms are written into your booking from the moment you pay.",
        perPerson: "per adult",
      },
    },
  },
};

export const BRAND_IDS = Object.keys(BRANDS);

export function brandFor(id: string | undefined): Brand {
  const clave = (id ?? "").trim() || "adrimarket";
  const b = BRANDS[clave];
  if (!b) {
    throw new Error(`NEXT_PUBLIC_SITE_BRAND=«${clave}» no es una marca conocida. Las que hay: ${BRAND_IDS.join(", ")}`);
  }
  return b;
}

/** La marca de este sitio. */
export function brand(): Brand {
  return brandFor(process.env.NEXT_PUBLIC_SITE_BRAND);
}
