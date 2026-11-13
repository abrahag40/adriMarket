#!/usr/bin/env node
/**
 * Guardián: el Hyperdrive de un sitio no guarda consultas en caché · decisión 0023.
 *
 * Hyperdrive **guarda en caché las consultas de lectura por omisión**, 60
 * segundos (developers.cloudflare.com/hyperdrive/concepts/query-caching). Para
 * este motor eso está mal: el panel, la disponibilidad, la salud y la
 * confirmación de un pago tienen que leer lo que hay en la base ahora, no lo de
 * hace un minuto. Las garantías del inventario no se rompen —las escrituras no
 * se cachean y la base sigue impidiendo la sobreventa—, pero lo que se ve sí.
 *
 * Se encontró el 2026-11-13 en la vista previa de ZaharDev Tours: recepción
 * creaba un bloqueo y la lista del panel seguía sin él, así que no había botón
 * para liberarlo. En `wrangler dev` no pasa —el Hyperdrive local no cachea—, y
 * por eso la barra local estaba en verde. La caché es una propiedad del recurso
 * en Cloudflare, no de `wrangler.jsonc`: un Hyperdrive nuevo nace con ella
 * encendida y nada en el repositorio lo diría.
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/hyperdrive-sin-cache.mjs <entorno>
 *   node scripts/hyperdrive-sin-cache.mjs --calibrar   # debe FALLAR: prueba que mira
 *
 * Se apaga con: npx wrangler hyperdrive update <id> --caching-disabled
 */
import { readFileSync } from "node:fs";

const calibrar = process.argv.includes("--calibrar");
const entorno = process.argv.slice(2).find((a) => !a.startsWith("--"));

function revisar(nombre, config) {
  if (config?.caching?.disabled === true) {
    console.log(`✔ ${nombre}: Hyperdrive sin caché.`);
    return true;
  }
  console.error(`✘ ${nombre}: Hyperdrive guarda consultas en caché (${JSON.stringify(config?.caching ?? null)}).`);
  console.error(`  Se apaga con: npx wrangler hyperdrive update ${config?.id ?? "<id>"} --caching-disabled`);
  return false;
}

if (calibrar) {
  // Un Hyperdrive recién creado, como lo deja Cloudflare, tiene que reprobar.
  process.exit(revisar("calibración", { id: "calibracion", caching: { disabled: false } }) ? 0 : 1);
}

if (!entorno) {
  console.error("Uso: node scripts/hyperdrive-sin-cache.mjs <entorno de wrangler.jsonc>");
  process.exit(1);
}

const texto = readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "");
const ids = (JSON.parse(texto).env?.[entorno]?.hyperdrive ?? []).map((h) => h.id);
if (ids.length === 0) {
  console.error(`✘ El entorno «${entorno}» no declara Hyperdrive en wrangler.jsonc.`);
  process.exit(1);
}

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: cuenta } = process.env;
if (!token || !cuenta) {
  console.error("✘ Faltan CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID para preguntarle a Cloudflare.");
  process.exit(1);
}

let bien = true;
for (const id of ids) {
  const respuesta = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cuenta}/hyperdrive/configs/${id}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const cuerpo = await respuesta.json();
  if (!cuerpo.success) {
    console.error(`✘ ${entorno}: Cloudflare no devolvió el Hyperdrive ${id} (${respuesta.status}).`);
    bien = false;
    continue;
  }
  // Sólo se mira `caching`: el origen trae el usuario y el servidor de la base.
  bien = revisar(`${entorno} (${id})`, { id, caching: cuerpo.result.caching }) && bien;
}
process.exit(bien ? 0 : 1);
