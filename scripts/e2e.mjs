#!/usr/bin/env node
/**
 * Recorrido de extremo a extremo del checkout · Sprint 3
 *
 * Es la evidencia que se presenta en el Sprint Review: un navegador real hace
 * una reserva completa, incluidos los caminos que no salen bien.
 *
 *   npm run build && npx next start -p 3100 &
 *   BASE_URL=http://127.0.0.1:3100 node scripts/e2e.mjs ./capturas
 *
 * Requiere la pasarela local (sin llaves de Stripe): el paso del cobro simula la
 * respuesta del proveedor, firmada y procesada por el mismo camino que en
 * producción.
 */

import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const out = process.argv[2] ?? ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();

function ok(label) { console.log(`  ✔ ${label}`); }
function fail(label) { console.log(`  ✘ ${label}`); process.exitCode = 1; }

// 1. Ficha → cotización → reservar
await page.goto(`${base}/es/estancias/casa-akumal?from=2026-11-12&to=2026-11-15&guests=5`, { waitUntil: "networkidle" });
// Rango propio del recorrido, distinto del que usa scripts/smoke.sh: este
// crea una reserva de verdad y dejaría esas fechas ocupadas para el otro.
// Mismo patrón jueves–domingo, así que el total es el mismo.
const total = await page.locator(".quote-total td").innerText();
if (total.includes("16,184")) ok(`la ficha cotiza ${total}`);
else fail(`total inesperado: ${total}`);
await page.screenshot({ path: `${out}/01-ficha-con-boton.png`, fullPage: true });

await page.getByRole("link", { name: "Reservar" }).click();
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
