import { readFileSync } from "node:fs";

import postgres from "postgres";

import { cargarFichas, type Ficha } from "@/modules/catalog/intake-sync";

/**
 * Carga a mano un archivo de fichas (zahardev-intake/scripts/exportar-cliente.ts).
 * El camino normal ya no es este: el latido sincroniza solo (intake-sync.ts). Esto
 * queda para cargar a un cliente sin configurar la sincronización.
 *
 *   SITIO=conquest-tours ./scripts/produccion.sh run npx tsx scripts/importar-fichas.ts /ruta/abel.json [--publicar]
 *
 * Usa exactamente la misma lógica que el latido, así que repetirlo no duplica nada.
 */
const archivo = process.argv[2];
if (!archivo || !process.env.DATABASE_URL) {
  console.error("Uso: importar-fichas.ts /ruta/cliente.json [--publicar] (con DATABASE_URL)");
  process.exit(2);
}
const { tours } = JSON.parse(readFileSync(archivo, "utf8")) as { tours: Ficha[] };
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  console.log(await cargarFichas(sql, tours, { publicar: process.argv.includes("--publicar") }));
} finally {
  await sql.end();
}
