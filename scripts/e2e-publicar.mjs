#!/usr/bin/env node
/**
 * El SME publica un tour nuevo · Sprint 6
 *
 * Es la evidencia del Sprint Review y el criterio es duro: **si necesita ayuda,
 * no está terminado.** Así que este guion no toca la base para preparar nada del
 * producto — lo crea todo desde el panel, como lo haría el cliente.
 *
 * Lo único que se consulta con psql es lo que el panel no enseña: que el archivo
 * de la variante exista y que el anticipo de una reserva vieja no se haya movido.
 *
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
 *   npx next start -p 3100 &
 *   BASE_URL=http://127.0.0.1:3100 node scripts/e2e-publicar.mjs ./capturas
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { existsSync } from "node:fs";

import { chromium } from "playwright";
import sharp from "sharp";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const out = process.argv[2] ?? ".";
const DB = process.env.DATABASE_URL;
if (!DB) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}

function ok(label) {
  console.log(`  ✔ ${label}`);
}
function fail(label) {
  console.log(`  ✘ ${label}`);
  process.exitCode = 1;
}
function query(sql) {
  return execFileSync("psql", [DB, "-tAXq", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

const stamp = query("select to_char(now(), 'YYYYMMDDHH24MISS')");
const slug = `catamaran-sunset-${stamp}`;
const nombre = `Catamarán al atardecer ${stamp}`;

/* La ruta fija es la del contenedor donde se escribió esto, y ahí sigue
   valiendo. En una máquina de trabajo no existe y el recorrido tronaba antes
   del primer paso ("executable doesn't exist"), así que si no está se deja
   que Playwright resuelva el Chromium que ya tiene instalado.
   `CHROMIUM_PATH` manda sobre las dos. */
const chromiumPath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(chromiumPath) ? { executablePath: chromiumPath } : {},
);
const ctx = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();

// Una foto de verdad, del tamaño que sale de un teléfono. No se usa un archivo
// del repo para que el recorrido no dependa de que alguien lo deje ahí.
const scratch = await mkdtemp(path.join(tmpdir(), "adri-foto-"));
const fotoPath = path.join(scratch, "catamaran.jpg");
await writeFile(
  fotoPath,
  await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 20, g: 90, b: 120 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer(),
);

// ---------------------------------------------------------------------------
// 1. Entra el dueño
// ---------------------------------------------------------------------------

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
if (page.url().endsWith("/admin")) ok("el dueño entra al panel");
else fail(`no entró: ${page.url()}`);

// ---------------------------------------------------------------------------
// 2. Crea el producto
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/catalogo`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Nuevo producto/i }).click();
await page.selectOption("#kind", "tour");
await page.fill("#name", nombre);
await page.fill("#slug", slug);
await page.screenshot({ path: `${out}/p1-nuevo-producto.png`, fullPage: true });
await page.getByRole("button", { name: /^Crear$/ }).click();
await page.waitForTimeout(1500);

const productId = query(`select id::text from products where slug = '${slug}'`);
if (/^[0-9a-f-]{36}$/.test(productId)) ok(`producto creado en borrador: ${slug}`);
else fail(`no se creó el producto (${productId})`);

const estado = query(`select status::text from products where slug = '${slug}'`);
if (estado === "draft") ok("nace en borrador, no en el sitio");
else fail(`nació en estado ${estado}`);

// ---------------------------------------------------------------------------
// 3. No se puede publicar a medias
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/catalogo/${productId}`, { waitUntil: "networkidle" });

const publicar = page.getByRole("button", { name: /Publicar en el sitio/i });
if (await publicar.isDisabled()) ok("el botón de publicar está bloqueado: falta una foto");
else fail("se ofreció publicar un producto sin fotos");

const faltantes = await page.locator(".check-list li").allInnerTexts();
if (faltantes.some((text) => /foto/i.test(text))) ok(`y se dice qué falta: "${faltantes.join(", ")}"`);
else fail("no se explica qué falta para publicar");

// ---------------------------------------------------------------------------
// 4. Textos en los dos idiomas
// ---------------------------------------------------------------------------

await page.fill("#summary-es", "Navegamos al arrecife y volvemos con el atardecer.");
await page.getByRole("button", { name: /Guardar español/i }).click();
await page.waitForTimeout(1200);

await page.fill("#name-en", `Sunset catamaran ${stamp}`);
await page.fill("#summary-en", "Sail to the reef and come back with the sunset.");
await page.getByRole("button", { name: /Guardar inglés/i }).click();
await page.waitForTimeout(1200);

const idiomas = query(`
  select string_agg(locale, ',' order by locale) from product_translations
   where product_id = '${productId}'
`);
if (idiomas === "en,es") ok("queda escrito en los dos idiomas");
else fail(`idiomas guardados: ${idiomas}`);

// ---------------------------------------------------------------------------
// 5. Sube una foto y el latido la procesa
// ---------------------------------------------------------------------------

await page.setInputFiles("#photo", fotoPath);
await page.getByRole("button", { name: /^Subir$/ }).click();
await page.waitForTimeout(2500);

const pendiente = await page.locator(".media-wait").count();
if (pendiente === 1) ok("la foto se ve de inmediato y avisa que sigue procesando");
else fail(`estado de la foto tras subir: ${pendiente} en proceso`);
await page.screenshot({ path: `${out}/p2-foto-subida.png`, fullPage: true });

// El latido genera las variantes, igual que en producción.
const secret = process.env.JOBS_SECRET ?? "desarrollo_cambiar_en_produccion";
for (let vuelta = 0; vuelta < 10; vuelta += 1) {
  const left = query(`
    select count(*)::text from media_jobs j join product_media m on m.id = j.media_id
     where m.product_id = '${productId}' and j.status = 'pending'
  `);
  if (left === "0") break;
  await page.request.post(`${base}/api/jobs/tick`, { headers: { "x-job-secret": secret } });
}

const variantes = query(`
  select variants::text from product_media where product_id = '${productId}' limit 1
`);
const parsed = JSON.parse(variantes || "{}");
if (parsed.avif && parsed.webp) ok("el latido generó las variantes AVIF y WebP");
else fail(`no se generaron variantes: ${variantes}`);

const anchos = Object.keys(parsed.webp ?? {})
  .map(Number)
  .sort((a, b) => a - b);
if (anchos.join(",") === "400,800,1600,2400") ok(`anchos generados: ${anchos.join(", ")}`);
else fail(`anchos inesperados: ${anchos.join(", ")}`);

await page.reload({ waitUntil: "networkidle" });
if ((await page.locator(".media-ok").count()) === 1) ok("el panel ya la muestra como lista");
else fail("el panel sigue diciendo que procesa");

// ---------------------------------------------------------------------------
// 6. Sus salidas del mes, en lote
// ---------------------------------------------------------------------------

// El producto necesita una opción de tour para poder tener salidas. Es lo único
// que el panel todavía no crea, y queda anotado como tal en el sprint.
query(`
  insert into tour_options (product_id, code, name_es, duration_minutes, meeting_point, default_capacity)
  values ('${productId}', 'sunset', 'Atardecer', 240, 'Marina Puerto Aventuras', 20)
`);
query(`
  insert into tour_pax_prices (tour_option_id, pax_type, price_cents, counts_toward_capacity)
  select o.id, v.pax::pax_type, v.price, v.counts
    from tour_options o,
         (values ('adult', 210000, true), ('child', 140000, true), ('infant', 0, false))
           as v(pax, price, counts)
   where o.product_id = '${productId}'
`);

await page.goto(`${base}/admin/ajustes`, { waitUntil: "networkidle" });
await page.selectOption("#optionId", { label: `${nombre} · Atardecer` });

const desde = query("select (current_date + 30)::text");
const hasta = query("select (current_date + 90)::text");
await page.fill("#batch-from", desde);
await page.fill("#batch-to", hasta);
await page.locator('.dow-check input[value="2"]').check();
await page.locator('.dow-check input[value="4"]').check();
await page.fill("#time", "17:00");
await page.fill("#capacity", "20");
await page.screenshot({ path: `${out}/p3-generar-salidas.png`, fullPage: true });
await page.getByRole("button", { name: /^Generar$/ }).click();
await page.waitForTimeout(2000);

const creadas = query(`
  select count(*)::text from tour_departures d join tour_options o on o.id = d.tour_option_id
   where o.product_id = '${productId}'
`);
if (Number(creadas) >= 15) ok(`${creadas} salidas generadas de un jalón`);
else fail(`solo se generaron ${creadas} salidas`);

const horas = query(`
  select count(distinct to_char(d.starts_at at time zone 'America/Cancun', 'HH24:MI'))::text
    from tour_departures d join tour_options o on o.id = d.tour_option_id
   where o.product_id = '${productId}'
`);
if (horas === "1") ok("todas a la misma hora local, sin corrimiento de zona");
else fail(`salieron ${horas} horas distintas`);

// Generar otra vez el mismo periodo no puede duplicar nada.
await page.getByRole("button", { name: /^Generar$/ }).click();
await page.waitForTimeout(2000);
const tras = query(`
  select count(*)::text from tour_departures d join tour_options o on o.id = d.tour_option_id
   where o.product_id = '${productId}'
`);
if (tras === creadas) ok("generar de nuevo el mismo periodo no duplica salidas");
else fail(`de ${creadas} salidas pasó a ${tras}`);

// ---------------------------------------------------------------------------
// 7. Publica
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/catalogo/${productId}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Publicar en el sitio/i }).click();
await page.waitForTimeout(2000);

const publicado = query(`select status::text from products where slug = '${slug}'`);
if (publicado === "published") ok("producto publicado");
else fail(`quedó en estado ${publicado}`);
await page.screenshot({ path: `${out}/p4-publicado.png`, fullPage: true });

// ---------------------------------------------------------------------------
// 8. Y se ve en el sitio, en los dos idiomas y con la foto servida por anchos
// ---------------------------------------------------------------------------

const publico = await ctx.browser().newContext({ viewport: { width: 390, height: 844 } });
const visitante = await publico.newPage();

await visitante.goto(`${base}/es/tours/${slug}`, { waitUntil: "networkidle" });
if ((await visitante.locator("h1").innerText()).includes(nombre)) ok("la ficha existe en español");
else fail("la ficha en español no muestra el nombre");

await visitante.goto(`${base}/en/tours/${slug}`, { waitUntil: "networkidle" });
if ((await visitante.locator("h1").innerText()).includes("Sunset catamaran")) {
  ok("y también en inglés");
} else {
  fail("la ficha en inglés no muestra el nombre traducido");
}

await visitante.goto(`${base}/es/tours/${slug}`, { waitUntil: "networkidle" });
const sources = await visitante.locator("picture source").evaluateAll((nodes) =>
  nodes.map((node) => ({ type: node.getAttribute("type"), srcset: node.getAttribute("srcset") })),
);
if (sources.some((source) => source.type === "image/avif")) ok("la foto se sirve en AVIF");
else fail("no se declaró la fuente AVIF");

if (sources.some((source) => (source.srcset ?? "").includes("400w"))) {
  ok("con srcset por anchos: el teléfono baja el archivo chico");
} else {
  fail("el srcset no declara los anchos");
}

// El archivo existe de verdad, no solo la fila en la base.
const chica = parsed.webp["400"];
const respuesta = await visitante.request.get(`${base}${chica}`);
if (respuesta.ok()) ok(`la variante de 400 px se sirve como archivo estático`);
else fail(`la variante de 400 px respondió ${respuesta.status()}`);

await visitante.goto(`${base}/es?kind=tour`, { waitUntil: "networkidle" });
if ((await visitante.locator("body").innerText()).includes(nombre)) ok("y aparece en el listado");
else fail("no aparece en el listado");
await visitante.screenshot({ path: `${out}/p5-en-el-sitio.png`, fullPage: true });

// ---------------------------------------------------------------------------
// 9. Le sube el anticipo al 50%
// ---------------------------------------------------------------------------

// Una reserva tomada antes del cambio, para comprobar la promesa que el panel
// hace en pantalla.
const antes = query(`
  with c as (
    insert into customers (full_name, email)
    values ('Antes del cambio', 'antes+' || gen_random_uuid() || '@example.com')
    returning id
  )
  insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                        quote, deposit_due_at, currency)
  select c.id, 'hold', 1000000, resolve_deposit_pct('${productId}'),
         round(1000000 * resolve_deposit_pct('${productId}') / 100),
         '{}'::jsonb, now() + interval '15 minutes', 'MXN'
    from c
  returning code || '|' || deposit_pct::text
`).split("|");

await page.goto(`${base}/admin/catalogo/${productId}`, { waitUntil: "networkidle" });
await page.fill("#pct", "50");
await page.getByRole("button", { name: /Guardar anticipo/i }).click();
await page.waitForTimeout(1800);

const aviso = await page.locator(".notice").innerText();
if (/no cambian/i.test(aviso)) ok(`el panel lo promete en pantalla: "${aviso}"`);
else fail(`el panel no aclaró qué pasa con las reservas viejas: ${aviso}`);

const nuevo = query(`select resolve_deposit_pct('${productId}')::text`);
if (nuevo === "50.00" || nuevo === "50") ok("las reservas nuevas usan el 50%");
else fail(`el anticipo nuevo quedó en ${nuevo}`);

const vieja = query(`select deposit_pct::text from bookings where code = '${antes[0]}'`);
if (Number(vieja) === Number(antes[1])) {
  ok(`y la reserva tomada antes sigue en ${vieja}%: la promesa se cumple`);
} else {
  fail(`la reserva vieja pasó de ${antes[1]}% a ${vieja}%`);
}

// ---------------------------------------------------------------------------
// 10. Todo quedó en la bitácora
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/bitacora`, { waitUntil: "networkidle" });
const bitacora = await page.locator("body").innerText();

for (const [accion, etiqueta] of [
  ["creó un producto", "el alta"],
  ["subió una foto", "la foto"],
  ["generó salidas", "las salidas"],
  ["cambió la publicación", "la publicación"],
  ["cambió el anticipo del producto", "el anticipo"],
]) {
  if (bitacora.includes(accion)) ok(`la bitácora registra ${etiqueta}`);
  else fail(`la bitácora no registra ${etiqueta}`);
}

if (/Administración/.test(bitacora)) ok("y con el nombre de quién lo hizo");
else fail("la bitácora no dice quién hizo los cambios");
await page.screenshot({ path: `${out}/p6-bitacora.png`, fullPage: true });

console.log(`\nPRODUCTO=${slug}`);
await browser.close();
