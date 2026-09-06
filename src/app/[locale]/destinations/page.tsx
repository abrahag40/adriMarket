import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  DestinationsView,
  destinationsMetadata,
} from "@/components/marketing/destinations-view";

/** Igual que el catálogo: refleja lo publicado ahora, no lo del último build. */
export const dynamic = "force-dynamic";

/**
 * /en/destinations · la gemela en inglés de /es/destinos. Ver ahí el porqué
 * del guardia de idioma; el cuerpo de las dos es `DestinationsView`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en") return {};
  return destinationsMetadata("en");
}

export default async function DestinationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== "en") notFound();
  return <DestinationsView locale="en" />;
}
