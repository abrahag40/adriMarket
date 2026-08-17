import type { MetadataRoute } from "next";

import { SITE_URL } from "@/site";

/**
 * robots.txt · S7-2
 *
 * Faltaba: el middleware ya lo excluía del prefijo de idioma —así que alguien
 * dio por hecho que existía— pero nada lo generaba y respondía 404. Se encontró
 * escribiendo la lista de puesta en producción, al comprobar una casilla en vez
 * de darla por buena.
 *
 * Dos reglas y su porqué:
 *
 * - **`/admin` bloqueado.** El panel ya responde `noindex`, pero eso solo evita
 *   que aparezca en resultados; el rastreador igual lo pide. Bloquearlo aquí le
 *   ahorra el viaje y no gasta presupuesto de rastreo en páginas que redirigen
 *   a una pantalla de acceso.
 * - **`/api` bloqueado.** No hay nada que indexar y sí endpoints que responden
 *   401 o 400 a cualquier visita.
 *
 * La vitrina se rastrea entera, en los dos idiomas: es de donde viene el
 * tráfico que evita pagarle comisión a un intermediario.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
