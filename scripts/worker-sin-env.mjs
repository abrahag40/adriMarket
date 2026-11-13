#!/usr/bin/env node
/**
 * Guardián: el Worker compilado no lleva el `.env` de nadie · decisión 0023.
 *
 * OpenNext copia **todas** las variables de los archivos `.env*` que encuentra
 * al compilar dentro de `.open-next/cloudflare/next-env.mjs`, y ese archivo viaja
 * en el Worker. En la máquina de quien desarrolla eso incluye
 * `PAYMENT_SIMULATOR=si`, la cadena de la base local y los secretos de prueba.
 *
 * Es la misma trampa que ya costó un incidente el 2026-09-07 con `vercel --prod`
 * (CLAUDE.md, «`.gitignore` protege el repositorio, no el paquete que sube el
 * CLI»), por otra puerta. En la CI no pasa —el runner no tiene `.env` porque git
 * nunca lo tuvo—, pero un acuerdo de "no despliegues desde la laptop" no
 * sobrevive a la prisa. Esto sí.
 *
 * Falla si el archivo trae cualquier variable que no sea `NEXT_PUBLIC_*`: esas
 * ya van dentro del código del navegador de todos modos, y las demás se cargan
 * en el Worker como variables o secretos de wrangler, nunca desde un archivo.
 *
 *   node scripts/worker-sin-env.mjs            # después de `npm run cf:build`
 *   node scripts/worker-sin-env.mjs --calibrar # debe FALLAR: prueba que mira
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const ARCHIVO = path.join(process.cwd(), ".open-next/cloudflare/next-env.mjs");

const calibrar = process.argv.includes("--calibrar");

let fuente;
try {
  fuente = await readFile(ARCHIVO, "utf8");
} catch {
  console.error(`✘ No existe ${path.relative(process.cwd(), ARCHIVO)}: corre antes npm run cf:build.`);
  process.exit(1);
}

if (calibrar) {
  // Un archivo con lo que pasó el 2026-09-07 tiene que reprobar.
  fuente = 'export const production = {"PAYMENT_SIMULATOR":"si"};';
}

// El archivo exporta un objeto JSON por entorno: production, development, test.
const entornos = [...fuente.matchAll(/export const (\w+) = (\{.*?\});/g)];
if (entornos.length === 0) {
  console.error("✘ No reconozco el formato de next-env.mjs: OpenNext cambió. Revisa el archivo a mano.");
  process.exit(1);
}

const prohibidas = new Set();
for (const [, , json] of entornos) {
  for (const nombre of Object.keys(JSON.parse(json))) {
    if (!nombre.startsWith("NEXT_PUBLIC_")) prohibidas.add(nombre);
  }
}

if (prohibidas.size > 0) {
  console.error("✘ El Worker compilado lleva variables de un archivo .env:");
  for (const nombre of [...prohibidas].sort()) console.error(`    ${nombre}`);
  console.error("  Compila sin .env (como en la CI) o no despliegues este build.");
  process.exit(1);
}

console.log("✔ El Worker no lleva variables de ningún .env (solo NEXT_PUBLIC_*).");
