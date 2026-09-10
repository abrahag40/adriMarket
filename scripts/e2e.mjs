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

console.log(`\nCÓDIGO=${code}`);
await browser.close();
