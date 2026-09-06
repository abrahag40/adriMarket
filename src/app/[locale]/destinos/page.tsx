import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DestinationsView,
  destinationsMetadata,
} from "@/components/marketing/destinations-view";

/** Igual que el catálogo: refleja lo publicado ahora, no lo del último build. */
export const dynamic = "force-dynamic";

/**
 * /es/destinos · el segmento va en español porque es contenido indexable, la
 * misma regla que /es/estancias. Su gemela en inglés es /en/destinations.
 *
 * El guardia no es paranoia: `[locale]` acepta cualquiera de los dos idiomas,
 * así que sin él /en/destinos respondería 200 con la página en inglés bajo una
 * URL en español — dos direcciones para el mismo contenido, que es exactamente
 * lo que el canonical existe para evitar.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "es") return {};
  return destinationsMetadata("es");
}

export default async function DestinosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "es") notFound();
  return <DestinationsView locale="es" />;
}
