"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/**
 * Los enlaces del menú, con el activo marcado **desde el cliente**.
 *
 * Es un componente de cliente por una razón concreta y no por gusto. Antes el
 * enlace activo se decidía en el layout, con `x-pathname` y `x-search` que pone
 * el middleware en las cabeceras de la petición. Eso funciona en la primera
 * carga y **deja de funcionar en cuanto el huésped navega**: en el App Router
 * un layout no se vuelve a renderizar en una navegación de cliente, así que
 * `currentPath` se queda congelado en el valor del primer render del servidor.
 *
 * El síntoma era exactamente ese: entras por el inicio, pulsas "Estancias", la
 * URL cambia a `?kind=stay`, el título de la pestaña dice "Estancias", el
 * listado se actualiza — y **el punto se queda en Inicio**. Recargar lo
 * arreglaba, que es lo que hacía tan difícil de creer el reporte.
 *
 * `usePathname` y `useSearchParams` sí se actualizan en cada navegación, que es
 * justo lo que hacía falta.
 *
 * Se compara **el parámetro `kind`**, no la cadena entera: "Inicio", "Tours" y
 * "Estancias" comparten `pathname` y solo se distinguen por ahí. Comparar
 * cadenas ya había fallado una vez con la URL que produce el buscador — un
 * formulario GET manda todos sus campos, incluidos los vacíos, así que
 * "Estancias" llegaba como `?kind=stay&location=&guests=` y no coincidía con
 * `?kind=stay`.
 */
export function NavLinks({ locale }: { locale: Locale }) {
  const t = getMessages(locale);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const enCatalogo = pathname === `/${locale}`;
  const kindActual = searchParams.get("kind") ?? "";
  const isActive = (kind: string) => enCatalogo && kindActual === kind;

  return (
    <>
      <Link href={`/${locale}`} aria-current={isActive("") ? "page" : undefined}>
        {t.navHome}
      </Link>
      <Link href={`/${locale}?kind=tour`} aria-current={isActive("tour") ? "page" : undefined}>
        {t.navTours}
      </Link>
      <Link href={`/${locale}?kind=stay`} aria-current={isActive("stay") ? "page" : undefined}>
        {t.navStays}
      </Link>
      <Link href={`/${locale}?kind=vehicle`} aria-current={isActive("vehicle") ? "page" : undefined}>
        {t.navVehicles}
      </Link>
    </>
  );
}
