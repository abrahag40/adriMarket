#!/usr/bin/env node
/**
 * Auditoría de espaciado · lo que el ojo no alcanza a medir
 *
 * No sustituye mirar la página: le pone número a cuatro cosas que se
 * degradan en silencio y que en una revisión visual se discuten en vez de
 * medirse.
 *
 *   1. Rejillas con pistas vacías — el síntoma de usar `auto-fill` en un
 *      conjunto de tamaño fijo: reserva una columna de más y aprieta las
 *      reales. Así se encontró que las tres columnas de confianza partían el
 *      texto a 22 caracteres por línea.
 *   2. Renglones de más de 85 caracteres, donde se pierde el salto de línea.
 *      El renglón **corto** no se reporta: en una tarjeta de 325px o en un
 *      teléfono caben treinta caracteres y eso es correcto. Cuando el texto
 *      sí está apretado por la maqueta lo delata la pista vacía del punto 1,
 *      que se mide con certeza en vez de inferirse.
 *   3. Destinos de toque a menos de 8px. Dos enlaces contiguos más juntos
 *      que eso se leen como un bloque y el dedo cae entre ambos — es la
 *      separación que piden las guías de iOS y Android.
 *   4. Desbordamiento horizontal, que en un teléfono es la diferencia entre
 *      una página y una página rota.
 *
 * Lo que reporta no siempre es un defecto: una rejilla de largo variable con
 * un solo resultado deja pistas vacías **a propósito**, para que esa tarjeta
 * mida lo mismo que cuando tiene compañía. Se lee, se piensa y se decide.
 *
 *   BASE_URL=http://127.0.0.1:3100 npm run audit:spacing
 *
 * Requiere el sitio construido y servido, igual que `npm run audit`.
 */

import { existsSync } from "node:fs";

import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const rutas = [
  ["/es", "inicio"],
  ["/es?page=2", "listado p.2"],
  ["/es/tours/snorkel-en-los-cenotes-de-tulum", "ficha de tour"],
  ["/es/estancias/casa-akumal", "ficha de estancia"],
  ["/es/checkout?kind=tour&slug=snorkel-en-los-cenotes-de-tulum", "checkout"],
];

const analisis = () => {
  const out = { rejillasMalas: [], lineasLargas: [], toques: [], desborde: null };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) out.desborde = { scrollW: de.scrollWidth, clientW: de.clientWidth };

  for (const g of document.querySelectorAll("*")) {
    const cs = getComputedStyle(g);
    if (cs.display !== "grid") continue;
    const pistas = cs.gridTemplateColumns.split(" ").filter(Boolean);
    if (pistas.length < 2) continue;
    const hijos = [...g.children].filter((c) => c.getBoundingClientRect().width > 0).length;
    const vacias = pistas.length - Math.min(hijos, pistas.length);
    if (vacias > 0)
      out.rejillasMalas.push({ clase: (g.className || g.tagName).toString().slice(0, 30), pistas: pistas.length, hijos, vacias });
  }

  /* La medida se calcula con el ancho real del glifo en **esta** fuente, no
     suponiendo que un carácter mide media eme. En DM Sans el "0" mide 0.68
     em, así que la suposición inflaba la cuenta un 35 %: reportó 88
     caracteres donde había 64, y 22 donde había 18. Un detector que miente
     en esa dirección hace perseguir defectos que no existen. */
  const anchoDeCaracter = (cs) => {
    const probe = document.createElement("span");
    probe.textContent = "0".repeat(100);
    probe.style.cssText = `font: ${cs.font}; position:absolute; visibility:hidden; white-space:nowrap`;
    document.body.appendChild(probe);
    const ancho = probe.getBoundingClientRect().width / 100;
    probe.remove();
    return ancho;
  };

  for (const p of document.querySelectorAll("p, li")) {
    const r = p.getBoundingClientRect();
    if (r.width === 0 || r.height < 18) continue;
    const texto = p.textContent.trim();
    if (texto.length < 60 || p.querySelector("p,li")) continue;
    const ch = r.width / anchoDeCaracter(getComputedStyle(p));
    /* Solo se reporta la línea **larga**. El renglón corto no se puede juzgar
       por su número: en una tarjeta de 325px o en un teléfono de 390 caben
       treinta caracteres y eso es correcto, no un defecto — la regla de 45 a
       75 es para prosa corrida, no para el resumen de una tarjeta. Cuando el
       texto sí está apretado por la maqueta, lo que lo delata es una pista de
       rejilla vacía, y eso se mide arriba con certeza en vez de inferirlo.
       El renglón largo sí es viewport-independiente: pasando de 85 se pierde
       el salto de línea. */
    if (ch > 85) out.lineasLargas.push({ texto: texto.slice(0, 30), ancho: Math.round(r.width), ch: Math.round(ch) });
  }

  // Elementos interactivos demasiado juntos (menos de 8px entre cajas vecinas)
  const focos = [...document.querySelectorAll("a, button, select, input")].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  for (let i = 0; i < focos.length; i++) {
    for (let j = i + 1; j < focos.length; j++) {
      const a = focos[i].getBoundingClientRect(), b = focos[j].getBoundingClientRect();
      if (focos[i].contains(focos[j]) || focos[j].contains(focos[i])) continue;
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
      if (dx === 0 && dy > 0 && dy < 8) out.toques.push({ a: focos[i].textContent.trim().slice(0, 18), b: focos[j].textContent.trim().slice(0, 18), dy: Math.round(dy) });
    }
  }
  out.toques = out.toques.slice(0, 4);
  out.lineasLargas = out.lineasLargas.slice(0, 5);
  return out;
};

/* Mismo respaldo que el resto de los guiones de navegador: la ruta fija es
   la del contenedor y en una máquina de trabajo no existe. */
const chromiumPath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(chromiumPath) ? { executablePath: chromiumPath } : {},
);
for (const [ancho, alto, etiqueta] of [[1440, 1000, "escritorio"], [390, 844, "teléfono"]]) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  console.log(`\n═══ ${etiqueta} (${ancho}px) ═══`);
  for (const [ruta, nombre] of rutas) {
    await page.goto(base + ruta, { waitUntil: "networkidle" });
    /* Se espera a las tipografías antes de medir. Sin esto la medida sale con
       la fuente de respaldo, cuyo glifo es más ancho, y el guion reporta 31
       caracteres donde hay 64 — un detector que mide antes de tiempo inventa
       defectos. */
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(analisis);
    const problemas = [];
    if (r.desborde) problemas.push(`desborde horizontal: ${r.desborde.scrollW} > ${r.desborde.clientW}`);
    for (const g of r.rejillasMalas) problemas.push(`rejilla ${g.clase}: ${g.pistas} pistas para ${g.hijos} → ${g.vacias} vacía(s)`);
    for (const c of r.lineasLargas) problemas.push(`línea larga (${c.ch} car.): "${c.texto}…"`);
    for (const t of r.toques) problemas.push(`interactivos a ${t.dy}px: "${t.a}" / "${t.b}"`);
    console.log(`  ${nombre}: ${problemas.length ? "" : "sin hallazgos"}`);
    for (const p of problemas) console.log(`    · ${p}`);
  }
  await ctx.close();
}
await browser.close();
