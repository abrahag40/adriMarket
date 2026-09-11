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
 *
 * **Es una compuerta local, no una sonda de producción.** Las comprobaciones
 * sin JavaScript piden productos del seed de desarrollo por su slug
 * (`casa-akumal`, `snorkel-cenotes-tulum`), que en producción no existen:
 * apuntarle a `adrimarket.vercel.app` da fallos que no son fallos. Para medir
 * producción, lo que vale de aquí es el bloque de peso.
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
 *   · inicio: 320, con **247 medidos**. Fue 450 mientras la portada cargaba
 *     doce fotos de golpe, y bajó a 260 el día que las cuatro vitrinas
 *     pasaron a rieles y la portada cargaba **tres**: un tope de 450 sobre
 *     una página de 194 no avisa de nada, que es la otra forma de que un
 *     presupuesto deje de servir.
 *
 *     Volvió a subir cuando destinos y tours destacados pasaron de riel a
 *     cuadrícula —seis destinos en dos filas y tres tours con foto alta, que
 *     es lo que el cliente pidió ver—. Ahora la portada pinta **cuatro o
 *     cinco fotos** de entrada en lugar de la primera de un riel: 58 kB de
 *     imágenes sobre 190 kB de armazón.
 *
 *     Los 190 son el suelo y no se mueven: 105 de JavaScript, 53 de dos
 *     tipografías, 22 del documento y 9 de CSS. Contra un tope de 260 eso
 *     dejaba 70 kB para fotos —tres— y el mismo argumento que jubiló al tope
 *     global de 200 aplicaba aquí: un presupuesto que la página no puede
 *     cumplir enseñando lo que vino a enseñar no se respeta, se ignora. 320
 *     deja 130 kB, que son seis u ocho fotos, y **73 kB de margen** sobre lo
 *     medido — el mismo margen que tenía antes, y por la misma razón: cuáles
 *     fotos toquen depende del orden del catálogo, y una portada pesada no
 *     puede hacer fallar la barra sin que nadie haya tocado el código.
 *
 *     Lo que **no** subió es el tope de JavaScript, que es el que mide la
 *     disciplina: sigue en 140 y lo medido **bajó** a 104, porque el cambio no
 *     agregó ningún componente de cliente — quitó los cuatro carruseles.
 *
 *     Sigue vigente la trampa que lo hizo engordar a 475 kB en su día: una
 *     tarjeta fuera de pantalla en una cuadrícula está lejos **hacia abajo**
 *     y el navegador no pide su foto; en un riel está lejos hacia el lado,
 *     dentro del margen con el que Chrome adelanta descargas. Por eso los dos
 *     rieles que quedan —estancias y vehículos— llevan
 *     `content-visibility: auto` en `.carousel-item`, explicado en
 *     `globals.css`.
 *   · listado (/es?kind=tour): comparte el tope del inicio —`presupuestoDe`
 *     recorta la búsqueda antes de comparar, así que `/es?kind=tour` es `/es`—
 *     y va sobrado: seis tarjetas paginadas y una barra de facetas que es
 *     texto. Está en la lista por lo **otro** que mide esto: **axe nunca había
 *     visto esta vista**, y es la única del sitio con un `<details>` que se
 *     abre en el teléfono y se queda abierto en escritorio. Eso es
 *     exactamente el tipo de cosa que se rompe sin que nadie mire.
 *   · destinos (/es/destinos): 320, con **251 medidos**. Es la misma
 *     cuadrícula que la portada con los ocho destinos en vez de seis, así que
 *     comparte tope con ella y por la misma razón: 190 de armazón y el resto
 *     son fotos que la página existe para enseñar.
 *   · ficha: 260, con 226 medidos. Galería de cinco fotos.
 *   · lo demás (checkout y lo que se agregue): 210, con 179 medidos.
 *
 * **Se probó bajar más la calidad y no rinde**: del escalón de 400 px, pasar
 * de q=42 a q=36 ahorró 15 kB de 384. Lo que pesa es el número de fotos, no
 * cuánto pesa cada una — y el número de fotos es contenido pedido.
 *
 * **El tope de JavaScript no se movió, y es el que de verdad mide nuestra
 * disciplina**: 104 kB en el inicio y 108 en la ficha, contra 140 permitidos.
 * El día que alguien agregue un componente de cliente pesado, esto avisa.
 */
const PRESUPUESTO = { total: 210, js: 140 };

/** Presupuesto por página. La clave es el prefijo de la ruta. */
const PRESUPUESTO_POR_RUTA = [
  [/^\/(es|en)$/, { total: 320, js: 140 }],
  [/^\/(es|en)\/(destinos|destinations)$/, { total: 320, js: 140 }],
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

/* El paso de extras necesita una salida real, y la toma de la ficha igual que
   la tomaría un huésped. Se audita porque es una pantalla pública llena de
   controles de formulario: casillas, etiquetas y objetivos de toque son
   exactamente donde se rompe la accesibilidad, y darla por buena sin pasarla
   por axe sería marcar una casilla por confianza. */
const fichaTour = await (await fetch(`${base}/es/tours/snorkel-cenotes-tulum`)).text();
const salidaTour = (fichaTour.match(/value="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/) ?? [])[1];
const EXTRAS = `kind=tour&slug=snorkel-cenotes-tulum&departure=${salidaTour}&adults=2&children=1&infants=0`;

const publicas = [
  ["/es", "portada"],
  ["/en", "portada en inglés"],
  ["/es/destinos", "destinos"],
  ["/es?kind=tour", "listado con filtro lateral"],
  [`/es/estancias/casa-akumal?${RANGO}`, "ficha de estancia"],
  ["/es/tours/snorkel-cenotes-tulum", "ficha de tour"],
  [`/es/extras?${EXTRAS}&extras=tirolesa`, "paso de extras"],
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

/* El listado vive en la **búsqueda**, no en el inicio: la portada enseña
   vitrinas y el listado es la respuesta a una pregunta. Estas comprobaciones
   apuntaban a `/es` y se quedaron sin nada que contar el día que el catálogo
   salió de la portada. */
await page.goto(`${base}/es?kind=tour`, { waitUntil: "domcontentloaded" });
const tarjetas = await page.locator(".card").count();
if (tarjetas > 0) ok(`la búsqueda muestra ${tarjetas} productos`);
else no("la búsqueda queda vacía sin JavaScript");

/* Se comprueba el **total** que anuncia el encabezado, no las tarjetas
   visibles: el listado se pagina, así que con el catálogo completo la primera
   página trae seis tarjetas esté filtrada o no, y contarlas no prueba nada.
   Y se comprueba que ningún resultado sea del otro tipo — un filtro que
   reduce el número pero cuela un resultado ajeno tampoco funciona. */
/* El total vive en el párrafo del encabezado, no en su título: desde que el
   listado es una vista de categoría, el `h1` dice "Tours" y el conteo va
   debajo. Este selector ya se rompió una vez por leer el título — cuando eso
   pasa, esta comprobación **se cuelga treinta segundos y tumba la auditoría
   entera**, en vez de fallar diciendo qué no encontró. */
const totalDe = async () => {
  const texto = (await page.locator(".results-head p").innerText()) ?? "";
  return Number.parseInt(texto.replace(/\D/g, ""), 10);
};
const totalTours = await totalDe();
const estanciasColadas = await page
  .locator(".card-kind-badge", { hasText: "Estancias" })
  .count();

await page.goto(`${base}/es?kind=stay`, { waitUntil: "domcontentloaded" });
const totalEstancias = await totalDe();
const toursColados = await page.locator(".card-kind-badge", { hasText: "Tours" }).count();

if (totalTours > 0 && totalEstancias > 0 && estanciasColadas === 0 && toursColados === 0) {
  ok("los filtros funcionan: viven en la URL");
} else {
  no(
    `los filtros no funcionan sin JavaScript (${totalTours} tours, ` +
      `${totalEstancias} estancias, ${estanciasColadas + toursColados} coladas)`,
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

/* El paso de extras sin JavaScript. Es donde más fácil se rompe la promesa:
   la afirmación "el total sube solo al marcar" se cumple con un componente de
   cliente, y sin él tiene que quedar el camino de siempre —un `form` GET y su
   botón—. Se comprueba marcando la casilla y enviando, que es lo que haría
   alguien con una conexión que cargó el HTML y no el JavaScript. */
await page.goto(`${base}/es/extras?${EXTRAS}`, { waitUntil: "domcontentloaded" });
const antesSinJs = await page.locator(".quote-total td").innerText();
await page.locator('input[name="extras"][value="tirolesa"]').check();
await page.getByRole("button", { name: "Actualizar total" }).click();
await page.waitForLoadState("domcontentloaded");
const despuesSinJs = await page.locator(".quote-total td").innerText();
if (antesSinJs !== despuesSinJs && page.url().includes("extras=tirolesa")) {
  ok(`los extras se pueden agregar sin JavaScript: ${antesSinJs.trim()} → ${despuesSinJs.trim()}`);
} else {
  no("sin JavaScript no se puede agregar un extra");
}

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
