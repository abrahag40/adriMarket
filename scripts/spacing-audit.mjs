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
 *   2. Medida de línea fuera de rango. Menos de 32 caracteres se lee en
 *      zigzag; más de 85 hace perder el renglón al saltar. Lo cómodo son 45
 *      a 75, y esto avisa cuando algo se sale por mucho.
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
  const out = { rejillasMalas: [], columnasAngostas: [], toques: [], desborde: null };
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

  for (const p of document.querySelectorAll("p, li")) {
    const r = p.getBoundingClientRect();
    if (r.width === 0 || r.height < 18) continue;
    const texto = p.textContent.trim();
    if (texto.length < 60 || p.querySelector("p,li")) continue;
    const fs = parseFloat(getComputedStyle(p).fontSize);
    const ch = r.width / (fs * 0.5);
    if (ch < 32) out.columnasAngostas.push({ texto: texto.slice(0, 30), ancho: Math.round(r.width), ch: Math.round(ch) });
    if (ch > 85) out.columnasAngostas.push({ texto: texto.slice(0, 30), ancho: Math.round(r.width), ch: Math.round(ch), largo: true });
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
  out.columnasAngostas = out.columnasAngostas.slice(0, 5);
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
    const r = await page.evaluate(analisis);
    const problemas = [];
    if (r.desborde) problemas.push(`desborde horizontal: ${r.desborde.scrollW} > ${r.desborde.clientW}`);
    for (const g of r.rejillasMalas) problemas.push(`rejilla ${g.clase}: ${g.pistas} pistas para ${g.hijos} → ${g.vacias} vacía(s)`);
    for (const c of r.columnasAngostas) problemas.push(`${c.largo ? "línea larga" : "columna angosta"} (${c.ch} car.): "${c.texto}…"`);
    for (const t of r.toques) problemas.push(`interactivos a ${t.dy}px: "${t.a}" / "${t.b}"`);
    console.log(`  ${nombre}: ${problemas.length ? "" : "sin hallazgos"}`);
    for (const p of problemas) console.log(`    · ${p}`);
  }
  await ctx.close();
}
await browser.close();
