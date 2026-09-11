#!/usr/bin/env node
/**
 * Recorrido de extremo a extremo del checkout · Sprint 3
 *
 * Es la evidencia que se presenta en el Sprint Review: un navegador real hace
 * una reserva completa, incluidos los caminos que no salen bien.
 *
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
 *   npx next start -p 3100 &
 *   BASE_URL=http://127.0.0.1:3100 node scripts/e2e.mjs ./capturas
 *
 * `NEXT_PUBLIC_SITE_URL` se fija **al construir** y no al arrancar: Next reemplaza
 * esas variables durante la compilación. La pasarela recibe una URL de retorno
 * absoluta, así que si no coincide con el puerto donde se sirve, el navegador
 * vuelve a un servidor que no existe y el recorrido muere justo después de pagar.
 *
 * Requiere la pasarela local (sin llaves de Stripe): el paso del cobro simula la
 * respuesta del proveedor, firmada y procesada por el mismo camino que en
 * producción.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const out = process.argv[2] ?? ".";
/* La ruta fija es la del contenedor donde se escribió esto, y ahí sigue
   valiendo. En una máquina de trabajo no existe y el recorrido tronaba antes
   del primer paso ("executable doesn't exist"), así que si no está se deja
   que Playwright resuelva el Chromium que ya tiene instalado.
   `CHROMIUM_PATH` manda sobre las dos. */
const chromiumPath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(chromiumPath) ? { executablePath: chromiumPath } : {},
);
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();

function ok(label) { console.log(`  ✔ ${label}`); }
function fail(label) { console.log(`  ✘ ${label}`); process.exitCode = 1; }

// 0. El menú marca dónde estoy, **después de navegar**
//
// Va aquí y no en `smoke.sh` porque el defecto no se ve en el HTML del
// servidor: aparecía solo al navegar sin recargar. El enlace activo se
// calculaba en el layout con las cabeceras de la petición, y en el App Router
// un layout no se vuelve a renderizar en una navegación de cliente — así que
// el valor se congelaba. La URL cambiaba, el título de la pestaña cambiaba, el
// listado cambiaba, y el punto se quedaba en "Inicio". Recargar lo arreglaba,
// que es lo que lo hacía tan difícil de creer.
await page.goto(`${base}/es`, { waitUntil: "networkidle" });

const activoAlLlegar = await page.locator(".site-nav a[aria-current]").innerText();
if (activoAlLlegar.trim() === "Inicio") ok("al llegar al inicio, el menú marca Inicio");
else fail(`al llegar marcaba "${activoAlLlegar.trim()}"`);

// Se navega por el menú desplegable, que es el camino real en un teléfono, y
// **sin recargar**: es la única forma de reproducir el defecto.
await page.locator(".mobile-nav-toggle").click();
await page.locator('.mobile-nav-panel a[href$="kind=stay"]').click();
await page.waitForURL(/kind=stay/);
await page.waitForTimeout(500);

const activoTrasNavegar = await page.locator(".site-nav a[aria-current]").innerText();
if (activoTrasNavegar.trim() === "Estancias") ok("y tras navegar sin recargar, marca Estancias");
else fail(`tras navegar el menú seguía en "${activoTrasNavegar.trim()}"`);

// Y al quitar el filtro no se cae en la portada: se ve el catálogo entero.
//
// Se pulsa el chip y no el "Quitar filtros" de la barra lateral: en el teléfono
// esa barra está cerrada —por eso existen los chips, y su propio comentario lo
// dice—, así que el enlace de la barra resuelve pero nunca llega a ser visible
// y Playwright se queda esperando treinta segundos.
await page.locator('.active-facet').first().click();
await page.waitForURL(/kind=all/);
await page.waitForTimeout(500);

if ((await page.locator("#resultados").count()) > 0) {
  ok("quitar el último filtro deja el listado completo, no la portada");
} else {
  fail("quitar el último filtro devolvió a la portada");
}

// 1. Ficha → cotización → reservar
//
// El rango no se escribe a mano: este recorrido **vende** esas noches, así que
// fijarlas hace que solo se pueda correr una vez. Se buscan jueves libres, que
// dan siempre el mismo total: una noche a tarifa base más dos de fin de semana.
//
// **Cada recorrido tiene su propio año**, y esto no es manía de orden: cuando
// compartían 2026 se quitaban las noches entre ellos y los criterios empezaban a
// fallar por falta de inventario, no por un defecto.
//
//   2026 · las fechas fijas de scripts/smoke.sh
//   2027 · este recorrido
//   2028 · los del panel (e2e-sme)
//
// La temporada alta solo está definida para diciembre de 2026, así que todo 2027
// es tarifa base y el total no cambia.
const jueves = [];
for (let d = new Date(Date.UTC(2027, 1, 1)); d < new Date(Date.UTC(2027, 11, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
  if (d.getUTCDay() === 4) jueves.push(new Date(d));
}

const iso = (date) => date.toISOString().slice(0, 10);
let rango = null;
for (const salida of jueves) {
  const regreso = new Date(salida);
  regreso.setUTCDate(regreso.getUTCDate() + 3);
  const candidato = { from: iso(salida), to: iso(regreso) };
  await page.goto(
    `${base}/es/estancias/casa-akumal?from=${candidato.from}&to=${candidato.to}&guests=5`,
    { waitUntil: "networkidle" },
  );
  // Acotado a la tarjeta de reserva: la barra fija del teléfono tiene su
  // propio enlace "Reservar" y existe siempre, haya o no disponibilidad.
  if ((await page.locator("#reservar").getByRole("link", { name: "Reservar" }).count()) > 0) {
    rango = candidato;
    break;
  }
}

if (rango) ok(`fechas libres para el recorrido: ${rango.from} a ${rango.to}`);
else fail("no quedó ningún jueves libre en el rango de prueba");

const total = await page.locator(".quote-total td").innerText();
if (total.includes("16,184")) ok(`la ficha cotiza ${total}`);
else fail(`total inesperado: ${total}`);
await page.screenshot({ path: `${out}/01-ficha-con-boton.png`, fullPage: true });

// Acotado a la tarjeta de reserva: la barra fija del teléfono tiene su
// propio enlace "Reservar" —un atajo a esta misma tarjeta— y sin acotar,
// el recorrido hacía clic en el atajo y se quedaba esperando una
// navegación que nunca ocurría.
await page.locator("#reservar").getByRole("link", { name: "Reservar" }).click();
await page.waitForURL(/\/checkout/);
ok("el botón lleva al checkout");

// 2. Checkout: enviar vacío debe explicar qué falta, sin perder nada
await page.getByRole("button", { name: /Pagar anticipo/ }).click();
await page.waitForTimeout(600);
const alerta = await page.locator("[role=alert]").count();
if (alerta > 0) ok("el formulario incompleto se explica");
else fail("no se explicó el error");

// 3. Llenar y pagar
await page.fill("#fullName", "Ana Ruiz");
await page.fill("#email", "ana.ruiz@example.com");
await page.fill("#phone", "+529981234567");
await page.check('input[name="acceptPolicy"]');
await page.check('input[name="acceptPrivacy"]');
await page.screenshot({ path: `${out}/02-checkout.png`, fullPage: true });
await page.getByRole("button", { name: /Pagar anticipo/ }).click();

await page.waitForURL(/\/reserva\//, { timeout: 20000 });
const code = (page.url().match(/reserva\/(AM-[A-Z0-9]+)/) ?? [])[1];
if (code) ok(`se creó la reserva ${code}`);
else fail("no se obtuvo código de reserva");

const esperando = await page.locator(".status-wait").innerText();
if (esperando.includes("Esperando")) ok("queda esperando el pago");
else fail(`estado: ${esperando}`);
await page.screenshot({ path: `${out}/03-esperando-pago.png`, fullPage: true });

// 4. Simular el cobro: firma + webhook + confirmación
await page.getByRole("button", { name: "Simular pago exitoso" }).click();
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });
const confirmada = await page.locator(".status-ok").innerText();
if (confirmada.includes("confirmada")) ok("la reserva queda confirmada");
else fail(`estado: ${confirmada}`);
await page.screenshot({ path: `${out}/04-confirmada.png`, fullPage: true });

// 5. El huésped cerró la pestaña: al volver, sigue confirmada
const otra = await ctx.newPage();
await otra.goto(`${base}/es/reserva/${code}`, { waitUntil: "networkidle" });
if ((await otra.locator(".status-ok").count()) > 0) ok("al volver a la URL la ve confirmada");
else fail("la reserva no se ve confirmada al volver");

// ---------------------------------------------------------------------------
// 6. Extras de tour · S8
// ---------------------------------------------------------------------------
//
// Va aquí y no en `smoke.sh` por la misma razón que el enlace activo del menú:
// lo que hay que comprobar es que **el total cambia sin recargar** y que lo
// calcula el servidor. Una petición con `curl` no puede distinguir eso de un
// total sumado en el navegador — que es justo lo que el invariante prohíbe.
//
// Usa la ÚLTIMA salida del calendario, no la primera: `smoke.sh` toma la
// primera con `head -1`, y dos recorridos vendiendo lugares de la misma salida
// se quitan cupo entre ellos hasta que uno falla por inventario y parece un
// defecto del contador.

function query(sql) {
  // `-q` no es cosmética: sin ella psql pega la etiqueta del comando —"INSERT
  // 0 1"— al valor devuelto, y el uuid sale con basura.
  return execFileSync("psql", [process.env.DATABASE_URL, "-tAXq", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

const tour = await ctx.newPage();
await tour.goto(`${base}/es/tours/snorkel-cenotes-tulum`, { waitUntil: "networkidle" });

// La salida es propia de este recorrido, no una del seed. Es la misma lección
// que ya aprendieron las garantías 5-7 y `e2e-sme`: una prueba que toma una
// fila compartida deja de medir lo que dice medir en cuanto otra corrida vende
// lugares en esa misma salida, y el desajuste parece un defecto del contador.
//
// Se REUTILIZA entre corridas en vez de crear una nueva cada vez, y las dos
// mitades del `on conflict` importan:
//
//   · `(tour_option_id, starts_at)` es único, así que una hora fija sin
//     `on conflict` truena en la segunda corrida del mismo día;
//   · devolverle el cupo evita lo contrario —una fila por corrida— y evita
//     que se agote: cada pasada vende 3 lugares y sin esto la cuarta fallaría
//     por inventario, que es un fallo que parece del código y no lo es.
//
// El `note` dice de quién es, para quien la encuentre en el calendario.
const salida = query(`
  insert into tour_departures (tour_option_id, starts_at, ends_at, capacity, note)
  select o.id,
         (current_date + 40 + time '11:17') at time zone 'America/Cancun',
         (current_date + 40 + time '16:17') at time zone 'America/Cancun',
         12, 'salida del recorrido e2e · extras'
    from tour_options o
    join products pr on pr.id = o.product_id
   where pr.slug = 'snorkel-cenotes-tulum' and o.active
   limit 1
  on conflict (tour_option_id, starts_at) do update
     set capacity = greatest(tour_departures.capacity, tour_departures.seats_taken + 12),
         note     = excluded.note
  returning id
`);

await tour.goto(
  `${base}/es/tours/snorkel-cenotes-tulum?departure=${salida}&adults=2&children=1&infants=1`,
  { waitUntil: "networkidle" },
);

// 6a. El botón lleva al paso de extras, no al checkout.
await tour.locator("#reservar").getByRole("link", { name: "Reservar" }).click();
await tour.waitForURL(/\/extras/);
ok("un tour con extras pasa primero por el paso de extras");

const antes = await tour.locator(".quote-total td").innerText();

// 6b. Marcar una casilla recotiza **sin recargar**, y el total lo pone el
//     servidor: si esto se sumara en el navegador, el invariante estaría roto.
await tour.locator('input[name="extras"][value="tirolesa"]').check();
await tour.waitForFunction(
  (previo) => document.querySelector(".quote-total td")?.textContent?.trim() !== previo,
  antes.trim(),
  { timeout: 5000 },
);
const despues = await tour.locator(".quote-total td").innerText();
if (antes !== despues) ok(`el total se actualiza solo: ${antes.trim()} → ${despues.trim()}`);
else fail("el total no cambió al marcar el extra");

// 6c. Se cobra por LUGAR OCUPADO, no por persona: el grupo son cuatro
//     —2 adultos, 1 menor, 1 infante— y solo tres ocupan asiento. Un "× 4"
//     aquí significaría que el infante en brazos subió a la tirolesa.
const renglon = await tour.locator(".quote-table tr", { hasText: "Tirolesa" }).innerText();
if (/× 3/.test(renglon)) ok("el extra se cobra por lugar ocupado (× 3), no por persona (× 4)");
else fail(`el renglón del extra dice: ${renglon.replace(/\s+/g, " ").trim()}`);

await tour.screenshot({ path: `${out}/05-extras.png`, fullPage: true });

// 6d. La selección viaja al checkout y sigue ahí.
await tour.getByRole("link", { name: "Continuar" }).click();
await tour.waitForURL(/\/checkout/);
if (tour.url().includes("extras=tirolesa")) ok("la selección viaja en la URL del checkout");
else fail(`la URL del checkout no lleva el extra: ${tour.url()}`);

if ((await tour.locator(".quote-table tr", { hasText: "Tirolesa" }).count()) > 0) {
  ok("el resumen del checkout muestra el extra");
} else {
  fail("el extra se perdió al llegar al checkout");
}

// 6e. Y llega hasta la reserva confirmada, con su etiqueta congelada.
await tour.fill("#fullName", "Luis Peña");
await tour.fill("#email", "luis.pena@example.com");
await tour.fill("#phone", "+529981112233");
for (const campo of await tour.locator('input[name="paxName"]').all()) {
  await campo.fill("Acompañante de prueba");
}
await tour.check('input[name="acceptPolicy"]');
await tour.check('input[name="acceptPrivacy"]');
await tour.getByRole("button", { name: /Pagar anticipo/ }).click();

await tour.waitForURL(/\/reserva\//, { timeout: 20000 });
const codigoTour = (tour.url().match(/reserva\/(AM-[A-Z0-9]+)/) ?? [])[1];
if (codigoTour) ok(`se creó la reserva del tour ${codigoTour}`);
else fail("no se obtuvo código de reserva del tour");

if ((await tour.locator("text=Tirolesa").count()) > 0) {
  ok("el extra queda congelado en el comprobante de la reserva");
} else {
  fail("el comprobante no menciona el extra");
}

console.log(`\nCÓDIGO=${code}`);
await browser.close();
