import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Configuración del adaptador OpenNext para Cloudflare Workers (decisión 0023).
 *
 * Sin caché incremental a propósito: el catálogo se lee de la base en cada
 * petición (`force-dynamic`), igual que en Node. Cachear las páginas públicas es
 * un pendiente con su propia decisión (0020, "lo que queda abierto"), no un
 * efecto secundario de cambiar de plataforma.
 */
export default defineCloudflareConfig({});
