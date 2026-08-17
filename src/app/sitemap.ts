import type { MetadataRoute } from "next";

import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { LOCALES, productPath } from "@/i18n/config";
import { SITE_URL } from "@/site";

/**
 * sitemap.xml · S7-2
 *
 * Se genera desde la base y no a mano: el cliente publica productos sin pedirle
 * nada al equipo técnico desde el Sprint 6, y un sitemap escrito a mano habría
 * quedado desactualizado el primer día.
 *
 * **Cada producto aparece una vez por idioma en el que tenga traducción**, no
 * una vez por idioma existente. Desde el Sprint 1 una ficha sin traducción
 * responde 404 en ese idioma; listarla sería mandar al rastreador a una página
 * rota y gastar presupuesto de rastreo en un error.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await db.execute<{
    slug: string;
    kind: "tour" | "stay";
    locale: string;
    updated_at: string;
  }>(sql`
    select p.slug, p.kind, t.locale, p.updated_at::text
      from products p
      join product_translations t on t.product_id = p.id
     where p.status = 'published' and length(t.name) > 0
     order by p.updated_at desc
  `);

  const home: MetadataRoute.Sitemap = LOCALES.map((locale) => ({
    url: `${SITE_URL}/${locale}`,
    changeFrequency: "daily",
    priority: 1,
  }));

  const products: MetadataRoute.Sitemap = rows
    .filter((row) => LOCALES.includes(row.locale as (typeof LOCALES)[number]))
    .map((row) => ({
      url: `${SITE_URL}${productPath(row.locale as (typeof LOCALES)[number], row.kind, row.slug)}`,
      lastModified: new Date(row.updated_at),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  return [...home, ...products];
}
