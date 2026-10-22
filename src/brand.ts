import type { Locale } from "@/i18n/config";

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
};

const BRANDS: Record<string, Brand> = {
  adrimarket: {
    id: "adrimarket",
    name: "adriMarket",
    lead: "adri",
    accent: "Market",
    tagline: { es: "Tours y casas en el Caribe mexicano", en: "Tours and homes in the Mexican Caribbean" },
    emailTagline: { es: "Tours y estancias en el Caribe mexicano", en: "Tours and stays in the Mexican Caribbean" },
  },
  "conquest-tours": {
    id: "conquest-tours",
    name: "Conquest Tours",
    lead: "Conquest ",
    accent: "Tours",
    tagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    emailTagline: { es: "Tours en el Caribe mexicano", en: "Tours in the Mexican Caribbean" },
    logo: { src: "/brand/conquest-tours.png", width: 176, height: 176 },
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
