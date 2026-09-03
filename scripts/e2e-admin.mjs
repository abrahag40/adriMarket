#!/usr/bin/env node
/**
 * Un día de operación en el panel · Sprint 4
 *
 * Es la evidencia del Sprint Review: recepción entra desde el teléfono y opera
 * un día completo sin pedirle nada al equipo técnico —una llegada, un bloqueo
 * por mantenimiento y un cobro de saldo—, en un navegador de verdad.
 *
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
 *   npx next start -p 3100 &
 *   BASE_URL=http://127.0.0.1:3100 node scripts/e2e-admin.mjs ./capturas
 *
 * El enlace de acceso se lee de la bandeja de salida con psql, que es
 * exactamente de donde saldría en producción: del correo. No se inventa un
 * atajo que salte el camino real.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import { chromium } from "playwright";

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

// `-q` no es cosmética: sin ella psql agrega la etiqueta del comando —"INSERT
// 0 1"— después de la fila devuelta, y el valor leído sale con basura pegada.
// Un correo así no coincide con nadie y el guion falla lejos de la causa.
function query(sql) {
  return execFileSync("psql", [DB, "-tAXq", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

// El teléfono de recepción, no un escritorio: es el dispositivo que se asumió
// al diseñar el panel y por el que se eligieron tarjetas en vez de tablas.
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

// ---------------------------------------------------------------------------
// 0. Preparar una llegada con saldo pendiente
// ---------------------------------------------------------------------------

// Una reserva confirmada que llega hoy. Se arma con la misma función que usa el
// webhook, no insertando filas a mano: si booking_confirm dejara de registrar el
// saldo, esta prueba debe fallar.
const code = query(`
  do $$
  declare
    v_unit    uuid := '66666666-6666-6666-6666-66666666aaaa';
    v_product uuid;
    v_today   date;
    v_range   daterange;
    v_customer uuid;
    v_booking uuid;
    v_item    uuid;
  begin
    select su.product_id, (now() at time zone coalesce(l.timezone, 'America/Cancun'))::date
      into v_product, v_today
      from stay_units su
      join products pr on pr.id = su.product_id
      left join locations l on l.id = pr.location_id
     where su.id = v_unit;

    -- "Hoy" es hoy **en el destino**, no en el servidor. A las 22:00 de Cancún
    -- ya es el día siguiente en UTC, y una llegada fechada con current_date no
    -- aparecería en la pantalla del día. El panel lo resuelve en la zona de la
    -- propiedad y el guion tiene que hacer lo mismo o mediría otra cosa.
    v_range := daterange(v_today, v_today + 2);

    -- Las noches de hoy pueden venir ocupadas de una corrida anterior: se
    -- libera lo que este mismo guion dejó, y solo eso.
    update stay_blocks set released_at = now()
     where unit_id = v_unit and stay && v_range and released_at is null
       and booking_item_id in (
         select i.id from booking_items i
           join bookings b on b.id = i.booking_id
           join customers c on c.id = b.customer_id
          where c.email like 'lucia+%@example.com'
       );

    insert into customers (full_name, email, phone)
    values ('Lucía Fernández', 'lucia+' || gen_random_uuid() || '@example.com', '+529981112233')
    returning id into v_customer;

    insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                          quote, deposit_due_at, currency)
    values (v_customer, 'hold', 900000, 40, 360000, '{}'::jsonb,
            now() + interval '15 minutes', 'MXN')
    returning id into v_booking;

    insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range,
                               guests, subtotal_cents, quote)
    values (v_booking, 'stay', v_product, v_unit, v_range, 2, 900000, '{}'::jsonb)
    returning id into v_item;

    perform stay_hold_create(v_unit, v_range, v_item);

    insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                          amount_cents, currency, paid_at)
    values (v_booking, 'deposit', 'succeeded', 'card', 'stripe',
            'pi_demo_' || gen_random_uuid(), 360000, 'MXN', now());

    -- Se confirma con la misma función que usa el webhook: si dejara de
    -- registrar el saldo, este recorrido debe fallar.
    perform booking_confirm(v_booking, 'e2e');

    create temporary table if not exists e2e_demo (code text);
    delete from e2e_demo;
    insert into e2e_demo select code from bookings where id = v_booking;
  end;
  $$;
  select code from e2e_demo;
`)
  .split("\n")
  .pop()
  .trim();

if (/^AM-[A-Z0-9]+$/.test(code)) ok(`llegada de hoy preparada: ${code}`);
else fail(`no se preparó la llegada: ${code}`);

// ---------------------------------------------------------------------------
// 1. Acceso: enlace por correo, sin contraseña
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/reservas`, { waitUntil: "networkidle" });
if (page.url().includes("/admin/entrar")) ok("sin sesión, el panel manda a la pantalla de acceso");
else fail(`no protegió la ruta: ${page.url()}`);
await page.screenshot({ path: `${out}/a1-acceso.png`, fullPage: true });

await page.fill("#email", "recepcion@adrimarket.mx");
await page.getByRole("button", { name: /Mandarme el enlace/i }).click();
await page.waitForTimeout(1200);
if ((await page.getByText(/Si ese correo pertenece/i).count()) > 0) ok("responde sin decir si el correo existe");
else fail("no se confirmó el envío");

// El enlace sale de la bandeja, igual que en producción sale del correo.
const url = query(`
  select payload -> 'url' #>> '{}' from outbox
   where template = 'staff_login_link' order by created_at desc limit 1
`);
if (url.includes("/admin/entrar/")) ok("el enlace se encoló en la bandeja de salida");
else fail(`no se encontró el enlace: ${url}`);

const token = url.split("/admin/entrar/")[1];
await page.goto(`${base}/admin/entrar/${token}`, { waitUntil: "networkidle" });
if (page.url().endsWith("/admin")) ok("el enlace abre sesión y cae en la pantalla de hoy");
else fail(`el enlace no llevó al panel: ${page.url()}`);

// El mismo enlace, otra vez: no debe servir.
const otra = await ctx.browser().newContext();
const espia = await otra.newPage();
await espia.goto(`${base}/admin/entrar/${token}`, { waitUntil: "networkidle" });
if (espia.url().includes("vencido=1")) ok("el enlace ya canjeado no vuelve a abrir sesión");
else fail(`el enlace se pudo reutilizar: ${espia.url()}`);
await otra.close();

await page.screenshot({ path: `${out}/a2-hoy.png`, fullPage: true });

// ---------------------------------------------------------------------------
// 2. La llegada del día aparece sin buscarla
// ---------------------------------------------------------------------------

const hoy = await page.locator(".admin-card").filter({ hasText: code }).count();
if (hoy > 0) ok("la llegada de hoy aparece en la pantalla de inicio");
else fail("la llegada de hoy no aparece sin buscarla");

// ---------------------------------------------------------------------------
// 3. Cobro del saldo en el mostrador
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/reservas/${code}`, { waitUntil: "networkidle" });
const saldoTexto = await page.locator("body").innerText();
if (saldoTexto.includes("$5,400")) ok("la ficha muestra el saldo por cobrar ($5,400)");
else fail("no se vio el saldo por cobrar");
await page.screenshot({ path: `${out}/a3-reserva.png`, fullPage: true });

await page.selectOption("#method", "cash");
await page.getByRole("button", { name: /Registrar cobro/i }).click();
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });

const cobrado = query(`
  select p.status || '|' || coalesce(u.email, 'sin-nombre')
    from payments p
    left join staff_users u on u.id = p.collected_by
    join bookings b on b.id = p.booking_id
   where b.code = '${code}' and p.purpose = 'balance'
`);
if (cobrado === "succeeded|recepcion@adrimarket.mx") ok(`el saldo queda cobrado y a nombre de quien lo recibió`);
else fail(`estado del saldo: ${cobrado}`);

// Cobrar dos veces no puede sumar dinero que no entró.
if ((await page.getByRole("button", { name: /Registrar cobro/i }).count()) === 0) {
  ok("ya cobrado, el panel no vuelve a ofrecer el cobro");
} else {
  await page.getByRole("button", { name: /Registrar cobro/i }).click();
  await page.waitForTimeout(1200);
  const total = query(`
    select coalesce(sum(p.amount_cents), 0)::text from payments p
      join bookings b on b.id = p.booking_id
     where b.code = '${code}' and p.purpose = 'balance' and p.status = 'succeeded'
  `);
  if (total === "540000") ok("un segundo intento no cobra de más");
  else fail(`el saldo cobrado quedó en ${total}`);
}
await page.screenshot({ path: `${out}/a4-cobrado.png`, fullPage: true });

// ---------------------------------------------------------------------------
// 4. Bloqueo por mantenimiento
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/bloqueos`, { waitUntil: "networkidle" });

// La unidad se elige por su nombre y no por posición en la lista, y las noches
// se piden libres a la base antes de tocarlas. Elegir "la segunda opción" y unas
// fechas escritas a mano hace que el recorrido falle por dónde cayó, no por lo
// que se quería probar.
const unidad = query(`
  select su.id::text from stay_units su
    join products pr on pr.id = su.product_id
    left join product_translations t on t.product_id = pr.id and t.locale = 'es'
   where t.name = 'Casa Akumal' and su.active
   order by su.code limit 1
`);
const desde = "2031-02-10";
const hasta = "2031-02-14";
const libreAntes = query(`
  select stay_is_available('${unidad}'::uuid, daterange('${desde}', '${hasta}'))::text
`);
if (libreAntes === "true") ok(`las noches ${desde} a ${hasta} están libres antes de empezar`);
else fail("las noches elegidas no estaban libres: el recorrido probaría otra cosa");

await page.selectOption('select[name="unitId"]', unidad);
await page.fill('input[name="from"]', desde);
await page.fill('input[name="to"]', hasta);
await page.selectOption('select[name="reason"]', "maintenance");
await page.fill('input[name="note"]', "Impermeabilizar la terraza");
await page.getByRole("button", { name: /Bloquear/i }).click();
await page.waitForTimeout(1500);

// Si el panel rechazó algo, debe decirlo aquí y no en silencio.
const aviso = await page.locator(".quote-warning").allInnerTexts();
if (aviso.length === 0) ok("el bloqueo no produjo ningún aviso de error");
else fail(`el panel avisó: ${aviso.join(" / ")}`);

// Se guarda el id del bloqueo recién creado y todo lo demás se mide sobre él.
// Corridas anteriores dejan bloqueos liberados en el mismo rango —así debe ser,
// liberar no borra—, y contar por rango mediría también los de ayer.
const bloqueoId = query(`
  select id::text from stay_blocks
   where unit_id = '${unidad}' and stay = daterange('${desde}', '${hasta}')
     and reason = 'maintenance' and released_at is null
`);
if (/^[0-9a-f-]{36}$/.test(bloqueoId)) ok("recepción bloquea unas noches sin ayuda del equipo técnico");
else fail(`el bloqueo no se creó (${bloqueoId || "ninguno"})`);

// Esas noches ya no se pueden vender: es la misma garantía del inventario.
const libre = query(`
  select stay_is_available('${unidad}'::uuid, daterange('2031-02-11', '2031-02-13'))::text
`);
if (libre === "false") ok("las noches bloqueadas dejan de estar a la venta");
else fail("las noches bloqueadas siguen disponibles");

await page.goto(`${base}/admin/calendario?mes=2031-02-01`, { waitUntil: "networkidle" });
const marcadas = await page.locator("td.occ-blocked").count();
if (marcadas >= 4) ok(`el calendario muestra las noches bloqueadas (${marcadas} celdas)`);
else fail(`el calendario no las muestra (${marcadas} celdas)`);
await page.screenshot({ path: `${out}/a5-calendario.png`, fullPage: true });

// ---------------------------------------------------------------------------
// 5. Liberar el bloqueo: es un UPDATE, nunca un DELETE
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/bloqueos`, { waitUntil: "networkidle" });
await page
  .locator("li")
  .filter({ hasText: "Impermeabilizar la terraza" })
  .getByRole("button", { name: /Liberar/i })
  .click();
await page.waitForTimeout(1500);

const tras = query(`
  select count(*)::text || '|' || count(released_at)::text from stay_blocks
   where id = '${bloqueoId}'
`);
if (tras === "1|1") ok("liberar marca la fila y no la borra: se puede explicar qué pasó");
else fail(`estado del bloqueo tras liberar: ${tras}`);

const devuelto = query(`
  select stay_is_available('${unidad}'::uuid, daterange('2031-02-11', '2031-02-13'))::text
`);
if (devuelto === "true") ok("las noches vuelven a estar a la venta");
else fail("las noches no volvieron a estar disponibles");

// ---------------------------------------------------------------------------
// 6. Cerrar sesión
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Salir/i }).click();
await page.waitForTimeout(1200);

await page.goto(`${base}/admin/reservas`, { waitUntil: "networkidle" });
if (page.url().includes("/admin/entrar")) ok("al salir, la sesión deja de valer de inmediato");
else fail(`la sesión siguió viva: ${page.url()}`);

console.log(`\nRESERVA=${code}`);
await browser.close();
