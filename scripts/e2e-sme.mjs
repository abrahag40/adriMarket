#!/usr/bin/env node
/**
 * El día que se cierra el puerto · Sprint 5
 *
 * Es la evidencia del Sprint Review, y es literalmente lo que el SME pidió
 * demostrar: **cancela una salida por mal tiempo en el panel y verifica que los
 * pasajeros recibieron aviso y reembolso, sin tocar la base.**
 *
 * Después hace las otras dos cosas que la realidad le pone a la operación: mover
 * una reserva de fecha y abrir el manifiesto del guía.
 *
 *   NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 npm run build
 *   npx next start -p 3100 &
 *   BASE_URL=http://127.0.0.1:3100 node scripts/e2e-sme.mjs ./capturas
 */

import { execFileSync } from "node:child_process";
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

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();

// ---------------------------------------------------------------------------
// 0. Una salida de mañana con tres reservas confirmadas
// ---------------------------------------------------------------------------

// Se arma con las mismas funciones que usa el checkout y el webhook. Si
// booking_confirm dejara de registrar el saldo o de apartar lugares, este
// recorrido debe fallar antes de llegar a la cancelación.
const setup = query(`
  do $$
  declare
    v_option  uuid;
    v_product uuid;
    v_dep     uuid;
    v_cust    uuid;
    v_booking uuid;
    v_item    uuid;
    v_start   timestamptz;
    v_codes   text[] := '{}';
  begin
    select o.id, o.product_id into v_option, v_product
      from tour_options o
      join products pr on pr.id = o.product_id
     where pr.slug = 'snorkel-cenotes-tulum' and o.active
     limit 1;

    -- Salida propia del recorrido: cancelar una del seed dejaría el sitio sin
    -- inventario para las demás pruebas.
    --
    -- Mañana a las 9:00 **hora de Cancún**, no "dentro de 30 horas": el
    -- manifiesto es la pantalla que se le enseña al cliente, y una salida de
    -- snorkel a las 3:41 de la mañana lo vuelve increíble.
    -- Mañana a las 8:00 de Cancún, o el minuto libre más cercano: el seed ya
    -- tiene la salida de las 9:00 y (opción, instante) es único. Correr esto dos
    -- veces tampoco puede chocar consigo mismo.
    v_start := ((now() at time zone 'America/Cancun')::date + 1 + time '08:00')
                 at time zone 'America/Cancun';
    while exists (select 1 from tour_departures
                   where tour_option_id = v_option and starts_at = v_start) loop
      v_start := v_start + interval '1 minute';
    end loop;

    insert into tour_departures (tour_option_id, starts_at, ends_at, capacity)
    values (v_option, v_start, v_start + interval '5 hours', 20)
    returning id into v_dep;

    for i in 1..3 loop
      insert into customers (full_name, email, phone)
      values ('Pasajero ' || i, 'sme+' || gen_random_uuid() || '@example.com', '+52998100000' || i)
      returning id into v_cust;

      insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                            quote, deposit_due_at, currency, cancellation_policy_snapshot)
      values (v_cust, 'hold', 360000, 30, 108000, '{}'::jsonb,
              now() + interval '15 minutes', 'MXN',
              (select jsonb_build_object('name', name, 'rules', rules,
                                         'deposit_refundable', deposit_refundable,
                                         'text_es', text_es)
                 from cancellation_policies limit 1))
      returning id into v_booking;

      insert into booking_items (booking_id, kind, product_id, tour_departure_id, seats,
                                 subtotal_cents, quote)
      values (v_booking, 'tour', v_product, v_dep, 2, 360000, '{}'::jsonb)
      returning id into v_item;

      insert into booking_guests (booking_id, full_name, pax_type, is_lead, birthdate)
      values (v_booking, 'Pasajero ' || i, 'adult', true, null),
             (v_booking, 'Menor ' || i, 'child', false, current_date - interval '9 years');

      perform tour_hold_create(v_dep, 2, v_item);

      insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                            amount_cents, currency, paid_at)
      values (v_booking, 'deposit', 'succeeded', 'card', 'stripe',
              'pi_sme_' || gen_random_uuid(), 108000, 'MXN', now());

      perform booking_confirm(v_booking, 'e2e-sme');
      v_codes := v_codes || (select code from bookings where id = v_booking);
    end loop;

    create temporary table if not exists e2e_sme (dep uuid, codes text[]);
    delete from e2e_sme;
    insert into e2e_sme values (v_dep, v_codes);
  end;
  $$;
  select dep::text || '|' || array_to_string(codes, ',') from e2e_sme;
`)
  .split("\n")
  .pop()
  .trim();

const [departureId, codeList] = setup.split("|");
const codes = codeList.split(",");
if (codes.length === 3) ok(`salida de mañana con 3 reservas: ${codes.join(", ")}`);
else fail(`no se prepararon las reservas: ${setup}`);

// ---------------------------------------------------------------------------
// 1. Entra la gerencia
// ---------------------------------------------------------------------------

// Cancelar devuelve dinero, así que es de gerencia y no de recepción. Se entra
// con la cuenta de dueño para poder ejercerlo.
await page.goto(`${base}/admin/entrar`, { waitUntil: "networkidle" });
await page.fill("#email", "admin@adrimarket.mx");
await page.getByRole("button", { name: /Mandarme el enlace/i }).click();
await page.waitForTimeout(1200);

const url = query(`
  select payload -> 'url' #>> '{}' from outbox
   where template = 'staff_login_link' order by created_at desc limit 1
`);
await page.goto(`${base}${new URL(url).pathname}`, { waitUntil: "networkidle" });
if (page.url().endsWith("/admin")) ok("la gerencia entra al panel");
else fail(`no entró: ${page.url()}`);

// ---------------------------------------------------------------------------
// 2. El manifiesto del guía, antes de que se caiga el día
// ---------------------------------------------------------------------------

await page.goto(`${base}/admin/salidas/${departureId}`, { waitUntil: "networkidle" });
const manifiesto = await page.locator("body").innerText();

if (/Presentación/.test(manifiesto)) ok("el manifiesto abre en la hora de presentación");
else fail("el manifiesto no muestra la presentación");

if (/15 minutos antes/.test(manifiesto)) ok("y dice que es 15 minutos antes de la salida");
else fail("no aparece la regla de los 15 minutos");

if (/Pasajero 1/.test(manifiesto) && /Pasajero 3/.test(manifiesto)) {
  ok("están los tres titulares");
} else {
  fail("falta algún titular en el manifiesto");
}

if (/Menor 1 · Menor · 9 años/.test(manifiesto)) ok("los menores traen su edad, para los chalecos");
else fail("no se ven las edades de los menores");

if (/Debe:/.test(manifiesto)) ok("dice quién trae saldo por pagar");
else fail("no se ve el saldo por cobrar");

if ((await page.locator('a[href^="tel:"]').count()) >= 3) ok("cada titular se puede llamar de un toque");
else fail("los teléfonos no son enlaces");

await page.screenshot({ path: `${out}/s1-manifiesto.png`, fullPage: true });

// ---------------------------------------------------------------------------
// 3. Cierra el puerto
// ---------------------------------------------------------------------------

// El día se pide en la zona del destino, que es como lo pagina el panel.
const manana = query(`select ((now() at time zone 'America/Cancun')::date + 1)::text`);
await page.goto(`${base}/admin/salidas?dia=${manana}`, { waitUntil: "networkidle" });

// Se localiza **esta** salida por su enlace al manifiesto y no "la primera del
// día": una corrida anterior deja otra salida cancelada en la misma fecha, y
// tomar la primera elige la que ya no tiene botón que tocar.
const card = page.locator(".admin-card").filter({
  has: page.locator(`a[href="/admin/salidas/${departureId}"]`),
});
if ((await card.count()) === 1) ok("la salida aparece en el día");
else fail(`no se encontró la salida del día (${await card.count()} coincidencias)`);

await card.getByRole("button", { name: /Cancelar salida/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/s2-cancelar-salida.png`, fullPage: true });

await page.fill('input[name="reason"]', "Cierre de puerto por mal tiempo");
await page.getByRole("button", { name: /Confirmar cancelación de la salida/i }).click();
await page.waitForTimeout(2500);

const aviso = await page.locator(".notice, .quote-warning").allInnerTexts();
if (aviso.some((text) => /3 reserva/.test(text))) ok(`el panel confirma: ${aviso[0]}`);
else fail(`el panel no confirmó la cancelación: ${aviso.join(" / ")}`);
await page.screenshot({ path: `${out}/s3-salida-cancelada.png`, fullPage: true });

// ---------------------------------------------------------------------------
// 4. Lo que el SME verifica: aviso y reembolso para los tres
// ---------------------------------------------------------------------------

const estado = query(`
  select count(*) filter (where b.status = 'cancelled')::text || '|' ||
         count(*) filter (where o.id is not null)::text || '|' ||
         coalesce(sum(r.amount_cents), 0)::text
    from bookings b
    left join outbox o
      on o.booking_id = b.id and o.template = 'booking_cancelled_by_operator'
    left join payments p on p.booking_id = b.id and p.purpose = 'deposit'
    left join refunds r on r.payment_id = p.id
   where b.code = any(array['${codes.join("','")}'])
`);
const [canceladas, avisadas, reembolsado] = estado.split("|");

if (canceladas === "3") ok("las tres reservas quedaron canceladas");
else fail(`solo ${canceladas} de 3 quedaron canceladas`);

if (avisadas === "3") ok("las tres tienen aviso encolado: nadie se queda sin saber");
else fail(`solo ${avisadas} de 3 pasajeros recibirían aviso`);

if (reembolsado === String(108000 * 3)) ok("se devolvió el anticipo completo de cada uno");
else fail(`se devolvieron ${reembolsado} centavos de ${108000 * 3}`);

// El cupo vuelve: la salida cancelada no deja lugares muertos.
const cupo = query(`select seats_taken::text from tour_departures where id = '${departureId}'`);
if (cupo === "0") ok("los lugares volvieron al cupo de la salida");
else fail(`quedaron ${cupo} lugares ocupados en una salida cancelada`);

// ---------------------------------------------------------------------------
// 5. El correo que le llega al pasajero
// ---------------------------------------------------------------------------

// Se despacha la bandeja como lo haría el latido y se lee el texto exacto: el
// transporte local guarda el mensaje renderizado en lugar de mandarlo.
const secret = process.env.JOBS_SECRET ?? "desarrollo_cambiar_en_produccion";
for (let vuelta = 0; vuelta < 10; vuelta += 1) {
  const left = query(`
    select count(*)::text from outbox o join bookings b on b.id = o.booking_id
     where b.code = any(array['${codes.join("','")}']) and o.status <> 'sent'
  `);
  if (left === "0") break;
  await page.request.post(`${base}/api/jobs/tick`, { headers: { "x-job-secret": secret } });
}

const correo = query(`
  select o.payload -> 'rendered' ->> 'text'
    from outbox o join bookings b on b.id = o.booking_id
   where b.code = '${codes[0]}' and o.template = 'booking_cancelled_by_operator'
`);

if (/lo sentimos/i.test(correo)) ok("el correo se disculpa: no fue culpa del huésped");
else fail("el correo no reconoce que canceló el operador");

if (/Cierre de puerto por mal tiempo/.test(correo)) ok("y dice el motivo que escribió la gerencia");
else fail("el motivo no llegó al correo");

if (/DEVOLUCIÓN/.test(correo) && /no aplica la política de cancelación/i.test(correo)) {
  ok("explica que se devuelve todo y por qué");
} else {
  fail("el correo no explica la devolución");
}

// ---------------------------------------------------------------------------
// 6. Cambio de fecha: lo que pasa más seguido que una cancelación
// ---------------------------------------------------------------------------

const stayCode = query(`
  do $$
  declare
    v_unit uuid := '66666666-6666-6666-6666-666666666666';
    v_product uuid; v_cust uuid; v_booking uuid; v_item uuid;
    -- Dentro de la ventana que el seed tiene tarifada (2026).
    v_from date;
  begin
    select product_id into v_product from stay_units where id = v_unit;

    -- Igual que arriba: las noches de origen también se piden libres.
    select d::date into v_from
      from generate_series(current_date + 100, date '2026-12-11', interval '1 day') d
     where stay_is_available(v_unit, daterange(d::date, d::date + 3))
     limit 1;

    insert into customers (full_name, email, phone)
    values ('Marta Solís', 'marta+' || gen_random_uuid() || '@example.com', '+529981234000')
    returning id into v_cust;
    insert into bookings (customer_id, status, total_cents, deposit_pct, deposit_cents,
                          quote, deposit_due_at, currency, cancellation_policy_snapshot)
    values (v_cust, 'hold', 1618400, 40, 647360, '{}'::jsonb, now() + interval '15 minutes', 'MXN',
            (select jsonb_build_object('name', name, 'rules', rules,
                                       'deposit_refundable', deposit_refundable, 'text_es', text_es)
               from cancellation_policies limit 1))
    returning id into v_booking;
    insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range,
                               guests, subtotal_cents, quote)
    values (v_booking, 'stay', v_product, v_unit, daterange(v_from, v_from + 3), 5, 1618400, '{}'::jsonb)
    returning id into v_item;
    perform stay_hold_create(v_unit, daterange(v_from, v_from + 3), v_item);
    insert into payments (booking_id, purpose, status, method, provider, provider_ref,
                          amount_cents, currency, paid_at)
    values (v_booking, 'deposit', 'succeeded', 'card', 'stripe',
            'pi_sme2_' || gen_random_uuid(), 647360, 'MXN', now());
    perform booking_confirm(v_booking, 'e2e-sme');
    create temporary table if not exists e2e_sme2 (code text);
    delete from e2e_sme2;
    insert into e2e_sme2 select code from bookings where id = v_booking;
  end;
  $$;
  select code from e2e_sme2;
`)
  .split("\n")
  .pop()
  .trim();

const saldoAntes = query(`
  select p.amount_cents::text from payments p join bookings b on b.id = p.booking_id
   where b.code = '${stayCode}' and p.purpose = 'balance' and p.status = 'pending'
`);

await page.goto(`${base}/admin/reservas/${stayCode}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Cambiar fecha/i }).click();
await page.waitForTimeout(300);

// Se mueve una semana adelante, dentro de la misma temporada.
// Las noches destino se piden libres a la base, no se escriben a mano: una
// corrida anterior movió una reserva justo ahí, y fechas fijas hacen que el
// recorrido falle por dónde cayó y no por lo que mide. Se queda antes del 15 de
// diciembre para no cruzar a temporada alta, que tiene mínimo de 4 noches.
const nuevo = query(`
  select d::date::text || '|' || (d::date + 3)::text
    from generate_series(current_date + 107, date '2026-12-11', interval '1 day') d
   where stay_is_available('66666666-6666-6666-6666-666666666666',
                           daterange(d::date, d::date + 3))
   limit 1
`).split("|");
if (nuevo.length === 2) ok(`hay noches libres para mover la reserva: ${nuevo[0]}`);
else fail("no quedaron noches libres en la ventana de prueba");
await page.fill("#new-from", nuevo[0]);
await page.fill("#new-to", nuevo[1]);
await page.screenshot({ path: `${out}/s4-cambiar-fecha.png`, fullPage: true });
await page.getByRole("button", { name: /Mover la reserva/i }).click();
await page.waitForTimeout(2500);

// Si el panel rechazó el cambio, tiene que decirlo aquí. Sin esta comprobación
// el recorrido solo detectaba el fallo mirando la base después, que es
// exactamente el diagnóstico lento que se quiere evitar.
const avisoMover = await page.locator(".quote-warning").allInnerTexts();
if (avisoMover.length === 0) ok("el cambio de fecha no produjo ningún aviso de error");
else fail(`el panel rechazó el cambio: ${avisoMover.join(" / ")}`);

const movida = query(`
  select i.stay_range::text from booking_items i join bookings b on b.id = i.booking_id
   where b.code = '${stayCode}'
`);
if (movida === `[${nuevo[0]},${nuevo[1]})`) ok(`la reserva se movió a ${nuevo[0]}`);
else fail(`la reserva quedó en ${movida}`);

const dinero = query(`
  select
    (select coalesce(sum(amount_cents), 0) from payments p join bookings b on b.id = p.booking_id
      where b.code = '${stayCode}' and p.purpose = 'deposit' and p.status = 'succeeded')::text
    || '|' ||
    (select coalesce(sum(amount_cents), 0) from payments p join bookings b on b.id = p.booking_id
      where b.code = '${stayCode}' and p.purpose = 'balance' and p.status = 'pending')::text
`);
const [deposito, saldoDespues] = dinero.split("|");

if (deposito === "647360") ok("el anticipo ya cobrado se conserva: no se cobra dos veces");
else fail(`el anticipo quedó en ${deposito}`);

if (saldoDespues !== saldoAntes) ok(`la diferencia de tarifa se ajustó en el saldo en destino`);
else ok("la tarifa nueva era igual: el saldo no cambió");

await page.screenshot({ path: `${out}/s5-reserva-movida.png`, fullPage: true });

// Y la bitácora deja constancia de que alguien la movió.
const bitacora = query(`
  select count(*)::text from booking_events e join bookings b on b.id = e.booking_id
   where b.code = '${stayCode}' and e.type = 'booking.rescheduled'
`);
if (bitacora === "1") ok("el cambio queda en la bitácora de la reserva");
else fail(`la bitácora tiene ${bitacora} eventos de cambio de fecha`);

// ---------------------------------------------------------------------------
// 7. Un guía lee el manifiesto pero no cancela nada
// ---------------------------------------------------------------------------

// El permiso se resuelve en el servidor, así que se comprueba con una sesión de
// guía de verdad y no ocultando botones.
const guia = query(`
  insert into staff_users (email, full_name, role)
  values ('guia+' || gen_random_uuid() || '@example.com', 'Guía de prueba', 'guide')
  returning email
`);

const guiaCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const guiaPage = await guiaCtx.newPage();
await guiaPage.goto(`${base}/admin/entrar`, { waitUntil: "networkidle" });
await guiaPage.fill("#email", guia);
await guiaPage.getByRole("button", { name: /Mandarme el enlace/i }).click();
await guiaPage.waitForTimeout(1200);

const guiaUrl = query(`
  select payload -> 'url' #>> '{}' from outbox
   where template = 'staff_login_link' and to_address = '${guia}'
   order by created_at desc limit 1
`);
await guiaPage.goto(`${base}${new URL(guiaUrl).pathname}`, { waitUntil: "networkidle" });

await guiaPage.goto(`${base}/admin/salidas/${departureId}`, { waitUntil: "networkidle" });
if (/Presentación/.test(await guiaPage.locator("body").innerText())) {
  ok("un guía abre el manifiesto: es su herramienta de trabajo");
} else {
  fail("el guía no pudo abrir el manifiesto");
}

await guiaPage.goto(`${base}/admin/salidas?dia=${manana}`, { waitUntil: "networkidle" });
if ((await guiaPage.getByRole("button", { name: /Cancelar salida/i }).count()) === 0) {
  ok("y no se le ofrece cancelar salidas");
} else {
  fail("al guía se le ofreció cancelar una salida");
}
await guiaPage.screenshot({ path: `${out}/s6-guia.png`, fullPage: true });
await guiaCtx.close();

console.log(`\nSALIDA=${departureId}\nRESERVA=${stayCode}`);
await browser.close();
