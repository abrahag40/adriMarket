import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";


import { sql } from "drizzle-orm";

import { db, sqlClient } from "@/db/index";
import { stayAvailability, tourDepartures } from "@/modules/availability/calendar";

import { quoteStay, quoteTour, taxFactorFor } from "./service";
import { QuoteError } from "./types";

/**
 * Pruebas de integración de la cotización.
 *
 * La aritmética ya está probada en quote.test.ts sin base de datos. Lo que se
 * verifica aquí es lo que solo se puede verificar con Postgres: que la
 * resolución de tarifas por temporada y prioridad, la elección de unidad, los
 * impuestos configurados y la disponibilidad lleguen bien a la composición.
 *
 * Requiere DATABASE_URL con el esquema y el seed:
 *   npm run db:reset && npm run test:integration
 */

const CASA = "55555555-5555-5555-5555-555555555555";
const TOUR = "33333333-3333-3333-3333-333333333333";
const CASA_GRANDE = "66666666-6666-6666-6666-666666666666";

// Reloj fijo para las estancias, anterior a todas las fechas de prueba: así los
// casos no caducan con el paso del tiempo.
const NOW = new Date("2026-05-01T12:00:00Z");

// Las salidas de tour se siembran relativas al día de hoy, así que sus pruebas
// usan el reloj real.
const REAL_NOW = new Date();

/**
 * Rango de fechas propio de esta corrida.
 *
 * Los casos que insertan bloqueos no pueden usar fechas fijas: la restricción de
 * exclusión los haría chocar consigo mismos al correr dos veces sobre la misma
 * base. Cada llamada avanza dentro de la ventana que el seed tiene tarifada
 * (junio a noviembre de 2026), posterior al reloj fijo de las pruebas.
 */
let offset = 40;
function freshRange(nights: number): { from: string; to: string } {
  offset += nights + 2;
  const from = new Date(Date.UTC(2026, 5, 1 + offset));
  const to = new Date(Date.UTC(2026, 5, 1 + offset + nights));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Los bloqueos que dejaron corridas anteriores se liberan al empezar: sin esto,
// la restricción de exclusión haría fallar la segunda ejecución sobre la misma
// base. Liberar es un UPDATE, igual que en producción.
before(async () => {
  await db.execute(sql`
    update stay_blocks set released_at = now()
     where released_at is null and note = 'prueba'
  `);
});

// El cierre de la conexión va una sola vez, al final del archivo: dentro de un
// describe cerraría el cliente compartido y los siguientes bloques fallarían.
after(async () => {
  await sqlClient.end();
});

describe("cotización de estancia contra la base", () => {
  it("reproduce el caso de la Casa Akumal con las tarifas configuradas", async () => {
    const { quote, unitId } = await quoteStay(
      CASA,
      { from: "2026-09-17", to: "2026-09-20" },
      5,
      NOW,
    );

    assert.equal(unitId, CASA_GRANDE, "cinco personas no caben en la casita");

    const nightly = quote.lines.filter((line) => line.kind === "nightly");
    assert.deepEqual(
      nightly.map((line) => line.cents),
      [320_000, 390_000, 390_000],
      "jueves base, viernes y sábado a tarifa de fin de semana",
    );

    // Los mismos números que la prueba pura: la base y la composición coinciden.
    assert.equal(quote.total_cents, 1_618_400);
    assert.equal(quote.deposit_pct, 40, "el anticipo propio de este producto");
    assert.equal(quote.deposit_cents, 647_360);
    assert.equal(quote.balance_cents, 971_040);

    const sum = quote.lines.reduce((total, line) => total + line.cents, 0);
    assert.equal(sum, quote.total_cents);
  });

  it("elige la unidad más chica que alcanza", async () => {
    const pareja = await quoteStay(CASA, { from: "2026-09-17", to: "2026-09-19" }, 2, NOW);
    assert.notEqual(pareja.unitId, CASA_GRANDE, "una pareja va a la casita");

    const nightly = pareja.quote.lines.filter((line) => line.kind === "nightly");
    assert.deepEqual(nightly.map((line) => line.cents), [180_000, 180_000]);

    const familia = await quoteStay(CASA, { from: "2026-09-17", to: "2026-09-19" }, 5, NOW);
    assert.equal(familia.unitId, CASA_GRANDE);
  });

  it("aplica el mínimo de noches de la temporada alta", async () => {
    await assert.rejects(
      () => quoteStay(CASA, { from: "2026-12-24", to: "2026-12-27" }, 5, NOW),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "min_nights");
        assert.equal(error.params.min, 4, "navidad exige cuatro noches");
        return true;
      },
    );

    // Con cuatro noches sí cotiza, y a tarifa de temporada alta.
    const { quote } = await quoteStay(CASA, { from: "2026-12-24", to: "2026-12-28" }, 5, NOW);
    const nightly = quote.lines.filter((line) => line.kind === "nightly");
    assert.equal(nightly.length, 4);
    assert.ok(
      nightly.every((line) => line.cents === 580_000),
      "la temporada alta gana por prioridad incluso en fin de semana",
    );
  });

  it("rechaza más personas que la capacidad de cualquier unidad", async () => {
    await assert.rejects(
      () => quoteStay(CASA, { from: "2026-09-17", to: "2026-09-19" }, 9, NOW),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "over_capacity");
        assert.equal(error.params.max, 6);
        return true;
      },
    );
  });

  it("no cotiza fechas sin tarifa configurada", async () => {
    await assert.rejects(
      () => quoteStay(CASA, { from: "2029-03-01", to: "2029-03-04" }, 5, NOW),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "no_rate");
        return true;
      },
    );
  });

  it("informa disponibilidad sin apartar nada", async () => {
    const range = { from: "2026-05-10", to: "2026-05-13" };

    const contar = async (unitId: string) => {
      const rows = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from stay_blocks
         where unit_id = ${unitId}::uuid and released_at is null
      `);
      return rows[0]?.n ?? -1;
    };

    const antes = await quoteStay(CASA, range, 5, NOW);
    assert.equal(antes.available, true);
    // Se compara contra el estado previo, no contra cero: la base puede traer
    // bloqueos legítimos del seed o de otra prueba.
    const bloqueosAntes = await contar(antes.unitId);

    // Cotizar dos veces no deja rastro: si apartara, la segunda diría ocupado.
    const despues = await quoteStay(CASA, range, 5, NOW);
    assert.equal(despues.available, true, "cotizar no debe apartar inventario");

    assert.equal(
      await contar(antes.unitId),
      bloqueosAntes,
      "cotizar no debe crear ni liberar bloqueos",
    );
  });

  it("reporta no disponible cuando las fechas están ocupadas", async () => {
    const range = freshRange(3);
    await db.execute(sql`
      insert into stay_blocks (unit_id, stay, reason, note)
      values (${CASA_GRANDE}::uuid, daterange(${range.from}, ${range.to}), 'maintenance', 'prueba')
    `);

    const { quote, available } = await quoteStay(CASA, range, 5, NOW);
    assert.equal(available, false, "las fechas están bloqueadas");
    assert.ok(quote.total_cents > 0, "el precio sigue siendo válido: lo que no está libre es la fecha");
  });
});

describe("cotización de tour contra la base", () => {
  /**
   * Salidas que todavía no ocurren.
   *
   * Tomar "la primera del seed" hacía que la prueba se pudriera con el
   * calendario: el seed genera salidas relativas a hoy y, pasados unos días, la
   * primera ya está en el pasado y el motor la rechaza —correctamente— con
   * `past_dates`. El fallo era de la prueba, no del motor.
   */
  async function futureDepartures() {
    const all = await tourDepartures(TOUR, "2026-01-01", "2030-01-01");
    return all.filter((row) => new Date(row.startsAt) > REAL_NOW);
  }

  it("cobra por tipo de pasajero y no cobra al infante", async () => {
    const departures = await futureDepartures();
    const first = departures[0];
    assert.ok(first, "el seed genera salidas futuras");

    const { quote, seatsLeft } = await quoteTour(
      TOUR,
      first.departureId,
      { adult: 2, child: 1, infant: 1 },
      REAL_NOW,
    );

    const pax = quote.lines.filter((line) => line.kind === "pax");
    assert.equal(pax.length, 2, "el infante sin costo no genera línea");
    assert.equal(pax[0]?.cents, 360_000);
    assert.equal(pax[1]?.cents, 120_000);

    const iva = quote.lines.filter((line) => line.kind === "tax");
    assert.equal(iva.length, 1, "al tour solo le aplica el IVA, no el impuesto al hospedaje");
    assert.equal(iva[0]?.cents, 76_800);
    assert.equal(quote.total_cents, 556_800);
    assert.equal(quote.deposit_pct, 30, "el tour hereda el anticipo global");

    // El cupo de una salida se edita (la prueba de carga lo cambia, y la
    // operación también podrá). Lo que debe cumplirse no es un número fijo del
    // seed sino que la cotización reporte lo que dice el inventario.
    const restantes = await db.execute<{ n: number }>(sql`
      select tour_seats_left(${first.departureId}::uuid) as n
    `);
    assert.equal(seatsLeft, restantes[0]!.n, "el cupo reportado debe venir del inventario");
  });

  it("rechaza más lugares que el cupo disponible", async () => {
    const departures = await futureDepartures();
    const target = departures[1];
    assert.ok(target);

    await assert.rejects(
      () => quoteTour(TOUR, target.departureId, { adult: 20, child: 0, infant: 0 }, REAL_NOW),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "sold_out");
        return true;
      },
    );
  });
});

describe("impuestos configurados", () => {
  it("aplica el impuesto al hospedaje solo a estancias", async () => {
    const estancia = await taxFactorFor(CASA);
    const tour = await taxFactorFor(TOUR);

    // ISH 3% + IVA 16% en estancias; solo IVA en tours.
    assert.ok(Math.abs(estancia - 1.19) < 1e-9, `factor de estancia: ${estancia}`);
    assert.ok(Math.abs(tour - 1.16) < 1e-9, `factor de tour: ${tour}`);
  });
});

describe("calendario de disponibilidad", () => {
  it("marca ocupadas las noches de una reserva, pero no el día de salida", async () => {
    const range = freshRange(3);
    await db.execute(sql`
      insert into stay_blocks (unit_id, stay, reason, note)
      values (${CASA_GRANDE}::uuid, daterange(${range.from}, ${range.to}), 'booking', 'prueba')
    `);

    const dia = (offsetDays: number) => {
      const date = new Date(`${range.from}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offsetDays);
      return date.toISOString().slice(0, 10);
    };

    const nights = await stayAvailability(CASA_GRANDE, dia(-2), dia(5));
    const byNight = new Map(nights.map((night) => [night.night, night.available]));

    assert.equal(byNight.get(dia(-1)), true, "la noche previa sigue libre");
    assert.equal(byNight.get(dia(0)), false);
    assert.equal(byNight.get(dia(1)), false);
    assert.equal(byNight.get(dia(2)), false);
    assert.equal(
      byNight.get(dia(3)),
      true,
      "el día de salida no ocupa noche: otro huésped puede llegar ese día",
    );
  });

  it("no revela el motivo del bloqueo", async () => {
    const nights = await stayAvailability(CASA_GRANDE, "2026-10-05", "2026-10-07");
    for (const night of nights) {
      assert.deepEqual(
        Object.keys(night).sort(),
        ["available", "night", "nightlyCents"],
        "el calendario no debe exponer el motivo",
      );
    }
  });

  it("agrupa las salidas de tour por fecha en la zona del producto", async () => {
    const departures = await tourDepartures(TOUR, "2026-01-01", "2030-01-01");
    assert.ok(departures.length >= 20, "el seed genera salidas futuras suficientes");

    for (const day of departures) {
      // Lo que se verifica es la propiedad, no la hora del seed: **la fecha con
      // la que se agrupa es la del destino**. Afirmar "todas salen a las 09:00"
      // medía un dato del seed y se rompía en cuanto otra prueba creaba una
      // salida a otra hora — sin que nada del agrupamiento estuviera mal.
      const dateInCancun = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Cancun",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(day.startsAt));
      assert.equal(
        day.date,
        dateInCancun,
        "una salida nocturna agrupada en UTC caería en el día siguiente",
      );
      assert.ok(day.seatsLeft <= day.capacity);
      assert.ok(new Date(day.startsAt) > new Date(), "una salida que ya partió no se ofrece");
    }
  });
});
