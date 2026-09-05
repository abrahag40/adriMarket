#!/usr/bin/env node
/**
 * Accesibilidad y peso en conexiones malas · Sprint 7 (E2)
 *
 * Dos cosas que se degradan solas si nadie las mide, y que en este negocio no
 * son opcionales: el huésped abre esto en un teléfono, a pleno sol, con la señal
 * de un hotel del Caribe.
 *
 * 1. **Cero violaciones de WCAG 2.2 AA**, con axe, en los dos temas. Se corre
 *    contra el sitio construido porque el tema oscuro y el contraste dependen del
 *    CSS final, no del que uno cree que escribió.
 * 2. **Presupuesto de bytes.** No es una meta aspiracional: es un tope que falla
 *    la verificación. Sin él, cualquiera agrega un componente de cliente pesado y
 *    nadie se entera hasta que un huésped abandona la página.
 *
 * Y una tercera que no se mide en bytes: **la vitrina funciona sin JavaScript.**
 * Es la diferencia entre una conexión mala y una página inservible.
 *
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
 *   npx next start -p 3100 &
 *   BASE_URL=http://127.0.0.1:3100 node scripts/audit.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const DB = process.env.DATABASE_URL;

let pass = 0;
let fail = 0;
function ok(label) {
  console.log(`  [32m✔[0m ${label}`);
  pass += 1;
}
function no(label) {
  console.log(`  [31m✘[0m ${label}`);
  fail += 1;
}
function query(sql) {
  return execFileSync("psql", [DB, "-tAXq", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

/**
 * Presupuesto por página, en kilobytes transferidos (comprimidos).
 *
 * Los números salen de medir el sitio tal como está y dejar margen, no de un
 * ideal. Un presupuesto que ya se incumple el día que se escribe no se respeta
 * nunca; uno con margen razonable avisa cuando algo crece de más.
 *
 * **El tope de 200 dejó de ser alcanzable, y no por descuido.** Se midió el
 * armazón de una página con TODAS las imágenes bloqueadas: **189 kB** —
 * JavaScript, dos tipografías (53 kB), CSS y documento. Contra 200, eso deja
 * once kilobytes para fotos: no es un presupuesto, es prohibir las imágenes.
 * El número se fijó cuando el catálogo tenía cuatro productos y las fotos
 * eran de relleno; hoy hay treinta y cinco productos con fotos de verdad.
 *
 * Un límite que la página no puede cumplir con ninguna cantidad de contenido
 * no se respeta: se ignora, y entonces no avisa de nada.
 *
 * Así que cada página tiene el suyo, medido y con margen — no un número
 * global aflojado hasta que todo pase:
 *
 *   · inicio: 400, con 369 medidos. Lleva portada, dos carruseles, dos
 *     cuadrículas y el listado; el navegador descarga **doce fotos** antes de
 *     que nadie desplace nada, a unos 16 kB cada una. 189 kB de imágenes para
 *     doce fotos no es un problema de compresión, es la cuenta de una portada
 *     con doce fotos.
 *   · ficha: 260, con 226 medidos. Galería de cinco fotos.
 *   · lo demás (checkout y lo que se agregue): 210, con 179 medidos.
 *
 * **Se probó bajar más la calidad y no rinde**: del escalón de 400 px, pasar
 * de q=42 a q=36 ahorró 15 kB de 384. Lo que pesa es el número de fotos, no
 * cuánto pesa cada una — y el número de fotos es contenido pedido.
 *
 * **El tope de JavaScript no se movió, y es el que de verdad mide nuestra
 * disciplina**: 105 kB en el inicio y 108 en la ficha, contra 140 permitidos.
 * El día que alguien agregue un componente de cliente pesado, esto avisa.
 */
const PRESUPUESTO = { total: 210, js: 140 };

/** Presupuesto por página. La clave es el prefijo de la ruta. */
const PRESUPUESTO_POR_RUTA = [
  [/^\/(es|en)$/, { total: 400, js: 140 }],
  [/^\/(es|en)\/(tours|estancias)\//, { total: 260, js: 140 }],
];

function presupuestoDe(ruta) {
  const sinBusqueda = ruta.split("?")[0];
  for (const [patron, tope] of PRESUPUESTO_POR_RUTA) {
    if (patron.test(sinBusqueda)) return tope;
  }
  return PRESUPUESTO;
}

const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

/* La ruta fija es la del contenedor donde se escribió esto, y ahí sigue
   valiendo. En una máquina de trabajo no existe y la auditoría tronaba antes
   de la primera comprobación ("executable doesn't exist"), así que si no está
   se deja que Playwright resuelva el Chromium que ya tiene instalado.
   `CHROMIUM_PATH` manda sobre las dos. */
const chromiumPath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(chromiumPath) ? { executablePath: chromiumPath } : {},
);

const RANGO = "from=2026-09-17&to=2026-09-20&guests=5";
const publicas = [
  ["/es", "listado"],
  ["/en", "listado en inglés"],
  [`/es/estancias/casa-akumal?${RANGO}`, "ficha de estancia"],
  ["/es/tours/snorkel-cenotes-tulum", "ficha de tour"],
  [`/es/checkout?kind=stay&slug=casa-akumal&${RANGO}`, "checkout"],
];

// ---------------------------------------------------------------------------
// 1. Accesibilidad, en los dos temas
// ---------------------------------------------------------------------------

console.log("\nAccesibilidad · WCAG 2.2 AA");

async function violaciones(page) {
  await page.addScriptTag({ content: axe });
  const resultado = await page.evaluate(
    async () =>
      await window.axe.run(document, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      }),
  );
  return resultado.violations;
}

for (const tema of ["light", "dark"]) {
  for (const [ruta, nombre] of publicas) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: tema,
    });
    const page = await ctx.newPage();
    await page.goto(base + ruta, { waitUntil: "networkidle" });
    const malas = await violaciones(page);
    if (malas.length === 0) {
      ok(`${nombre}, tema ${tema === "light" ? "claro" : "oscuro"}`);
    } else {
      no(
        `${nombre}, tema ${tema}: ${malas
          .map((v) => `${v.id} (${v.nodes.length})`)
          .join(", ")}`,
      );
    }
    await ctx.close();
  }
}

// El panel también: lo usa gente que trabaja aquí ocho horas al día.
if (DB) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/admin/entrar`, { waitUntil: "networkidle" });
  await page.fill("#email", "admin@adrimarket.mx");
  await page.getByRole("button", { name: /Mandarme el enlace/i }).click();
  await page.waitForTimeout(1200);

  const url = query(`
    select payload -> 'url' #>> '{}' from outbox
     where template = 'staff_login_link' and to_address = 'admin@adrimarket.mx'
     order by created_at desc limit 1
  `);
  await page.goto(`${base}${new URL(url).pathname}`, { waitUntil: "networkidle" });

  for (const [ruta, nombre] of [
    ["/admin", "panel · hoy"],
    ["/admin/reservas", "panel · reservas"],
    ["/admin/calendario", "panel · calendario"],
    ["/admin/catalogo", "panel · catálogo"],
    ["/admin/ajustes", "panel · ajustes"],
  ]) {
    await page.goto(base + ruta, { waitUntil: "networkidle" });
    const malas = await violaciones(page);
    if (malas.length === 0) ok(nombre);
    else no(`${nombre}: ${malas.map((v) => `${v.id} (${v.nodes.length})`).join(", ")}`);
  }
  await ctx.close();
} else {
  console.log("  (sin DATABASE_URL no se audita el panel)");
}

// ---------------------------------------------------------------------------
// 2. Presupuesto de bytes
// ---------------------------------------------------------------------------

console.log("\nPeso en el teléfono · presupuesto");

for (const [ruta, nombre] of publicas) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base + ruta, { waitUntil: "networkidle" });

  // Se mide lo transferido, no lo descomprimido: es lo que viaja por la red y lo
  // único que le cuesta tiempo al huésped.
  const medida = await page.evaluate(() => {
    const recursos = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    const suma = (filtro) =>
      recursos.filter(filtro).reduce((total, r) => total + (r.encodedBodySize || 0), 0);
    return {
      total: suma(() => true) + (nav?.encodedBodySize ?? 0),
      js: suma((r) => r.name.endsWith(".js")),
      peticiones: recursos.length + 1,
    };
  });

  const total = medida.total / 1024;
  const js = medida.js / 1024;
  const tope = presupuestoDe(ruta);
  const detalle = `${total.toFixed(0)} kB en ${medida.peticiones} peticiones · js ${js.toFixed(0)} kB`;

  if (total <= tope.total && js <= tope.js) {
    ok(`${nombre}: ${detalle}`);
  } else {
    no(`${nombre}: ${detalle} — pasa del presupuesto (${tope.total}/${tope.js} kB)`);
  }
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 3. La vitrina sin JavaScript
// ---------------------------------------------------------------------------

console.log("\nSin JavaScript · lo que ve una conexión que falla a medias");

const sinJs = await browser.newContext({
  javaScriptEnabled: false,
  viewport: { width: 390, height: 844 },
});
const page = await sinJs.newPage();

await page.goto(`${base}/es`, { waitUntil: "domcontentloaded" });
const tarjetas = await page.locator(".card").count();
if (tarjetas > 0) ok(`el listado muestra ${tarjetas} productos`);
else no("el listado queda vacío sin JavaScript");

// Se compara el **total** que anuncia el encabezado, no las tarjetas
// visibles: el listado se pagina de doce en doce, así que con el catálogo
// completo la primera página trae doce tarjetas esté filtrada o no, y contar
// tarjetas dejó de probar nada. Además se comprueba que ninguna de las que se
// ven sea una estancia — un filtro que reduce el número pero cuela un
// resultado del otro tipo tampoco funciona.
const totalDe = async () => {
  const texto = (await page.locator(".results-head h2").innerText()) ?? "";
  return Number.parseInt(texto.replace(/\D/g, ""), 10);
};
const totalSinFiltro = await totalDe();

await page.goto(`${base}/es?kind=tour`, { waitUntil: "domcontentloaded" });
const totalTours = await totalDe();
const estancias = await page.locator(".card-kind-badge", { hasText: "Estancias" }).count();
if (totalTours > 0 && totalTours < totalSinFiltro && estancias === 0) {
  ok("los filtros funcionan: viven en la URL");
} else {
  no(
    `los filtros no funcionan sin JavaScript (${totalTours} de ${totalSinFiltro}` +
      `, ${estancias} estancia(s) coladas)`,
  );
}

await page.goto(`${base}/es/estancias/casa-akumal?${RANGO}`, { waitUntil: "domcontentloaded" });
if ((await page.locator(".quote-total").count()) > 0) ok("la cotización se ve");
else no("la cotización no se ve sin JavaScript");
// Dentro de la tarjeta de reserva: el atajo de la barra fija del teléfono
// se llama igual y aparecería aunque el enlace real no estuviera.
if ((await page.locator("#reservar").getByRole("link", { name: "Reservar" }).count()) > 0)
  ok("y se puede reservar");
else no("no se puede llegar al checkout sin JavaScript");

await page.goto(`${base}/es/checkout?kind=stay&slug=casa-akumal&${RANGO}`, {
  waitUntil: "domcontentloaded",
});
if ((await page.locator("#fullName").count()) > 0) ok("el checkout renderiza sus campos");
else no("el checkout no renderiza sin JavaScript");

await sinJs.close();
await browser.close();

console.log("\n----------------------------------------");
if (fail === 0) {
  console.log(`[32m${pass} comprobaciones, 0 fallos[0m`);
} else {
  console.log(`[31m${fail} fallos de ${pass + fail} comprobaciones[0m`);
  process.exitCode = 1;
}
