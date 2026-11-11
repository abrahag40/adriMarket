import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roundCents } from "./money";
import { buildStayQuote, buildTourQuote, type StayQuoteInput, type TourQuoteInput } from "./quote";
import { QuoteError, type NightRate, type TaxRule } from "./types";

/**
 * Pruebas de la aritmética del precio.
 *
 * No tocan la base ni el reloj, así que corren en milisegundos y se pueden
 * escribir por decenas. Es el nivel donde conviene probar el redondeo: un
 * centavo de diferencia entre lo mostrado y lo cobrado es una discrepancia con
 * la pasarela.
 */

const ISH: TaxRule = { name: "ISH Quintana Roo", kind: "percent", rate: 3, included_in_price: false };
const IVA: TaxRule = { name: "IVA", kind: "percent", rate: 16, included_in_price: false };

const NOW = new Date("2026-09-01T12:00:00Z");

function night(date: string, cents: number | null, extra: Partial<NightRate> = {}): NightRate {
  return {
    night: date,
    cents,
    rateId: cents === null ? null : `rate-${date}`,
    minNights: null,
    closedToArrival: false,
    closedToDeparture: false,
    ...extra,
  };
}

function stayInput(overrides: Partial<StayQuoteInput> = {}): StayQuoteInput {
  return {
    currency: "MXN",
    range: { from: "2026-09-17", to: "2026-09-20" },
    guests: 5,
    unit: {
      maxGuests: 6,
      baseGuests: 4,
      extraGuestFeeCents: 60_000,
      cleaningFeeCents: 80_000,
      minNights: 2,
    },
    nights: [
      night("2026-09-17", 320_000),
      night("2026-09-18", 390_000),
      night("2026-09-19", 390_000),
    ],
    departureRate: null,
    taxes: [ISH, IVA],
    depositPct: 40,
    today: "2026-09-01",
    now: NOW,
    ...overrides,
  };
}

function tourInput(overrides: Partial<TourQuoteInput> = {}): TourQuoteInput {
  return {
    currency: "MXN",
    pax: { adult: 2, child: 1, infant: 1 },
    prices: [
      { paxType: "adult", priceCents: 180_000, countsTowardCapacity: true },
      { paxType: "child", priceCents: 120_000, countsTowardCapacity: true },
      { paxType: "infant", priceCents: 0, countsTowardCapacity: false },
    ],
    seatsLeft: 12,
    departureOpen: true,
    startsAt: new Date("2026-09-21T14:00:00Z"),
    taxes: [IVA],
    depositPct: 30,
    now: NOW,
    ...overrides,
  };
}

/* Extras de prueba. El grupo de `tourInput` ocupa 3 lugares —2 adultos y un
   menor; el infante no cuenta— así que cada extra se multiplica por 3. */
const TIROLESA = { id: "e1", code: "tirolesa", name: "Tirolesa", note: null, priceCents: 45_000 };
const KAYAK = { id: "e2", code: "kayak", name: "Kayak", note: null, priceCents: 30_000 };

/** Las dos invariantes que deben cumplirse en toda cotización, siempre. */
function assertInvariants(quote: ReturnType<typeof buildStayQuote>) {
  const sum = quote.lines.reduce((total, line) => total + line.cents, 0);
  assert.equal(sum, quote.total_cents, "la suma de las líneas debe ser exactamente el total");
  assert.equal(
    quote.deposit_cents + quote.balance_cents,
    quote.total_cents,
    "anticipo más saldo debe ser exactamente el total",
  );
  assert.ok(quote.deposit_cents <= quote.total_cents, "el anticipo no puede exceder el total");
}

describe("redondeo de dinero", () => {
  it("manda los medios al lado contrario al cero", () => {
    assert.equal(roundCents(2.5), 3);
    // Math.round daría −2 y el descuento saldría un centavo corto.
    assert.equal(roundCents(-2.5), -3);
    assert.equal(roundCents(2.4), 2);
    assert.equal(roundCents(-2.4), -2);
    assert.equal(roundCents(0), 0);
  });
});

describe("cotización de estancia", () => {
  it("cotiza el caso de la Casa Akumal noche por noche", () => {
    const quote = buildStayQuote(stayInput());

    const nightly = quote.lines.filter((line) => line.kind === "nightly");
    assert.equal(nightly.length, 3, "tres noches");
    assert.deepEqual(
      nightly.map((line) => line.cents),
      [320_000, 390_000, 390_000],
      "jueves a tarifa base, viernes y sábado a tarifa de fin de semana",
    );

    const occupancy = quote.lines.find((line) => line.kind === "occupancy");
    assert.equal(occupancy?.cents, 180_000, "un huésped extra por cada una de las tres noches");

    const fees = quote.lines.filter((line) => line.kind === "fee");
    assert.equal(fees.length, 1, "la limpieza se cobra una sola vez, no por noche");
    assert.equal(fees[0]?.cents, 80_000);

    const taxes = quote.lines.filter((line) => line.kind === "tax");
    assert.equal(taxes.length, 2);
    assert.equal(taxes[0]?.cents, 40_800, "ISH 3% sobre 1,360,000");
    assert.equal(taxes[1]?.cents, 217_600, "IVA 16% sobre 1,360,000");

    assert.equal(quote.total_cents, 1_618_400);
    assert.equal(quote.deposit_cents, 647_360, "anticipo del 40% de esta casa");
    assert.equal(quote.balance_cents, 971_040, "el saldo se paga en destino");
    assertInvariants(quote);
  });

  it("mantiene las invariantes con cifras de redondeo incómodo", () => {
    const casos = [
      { rate: 333_333, nights: 3, pct: 33 },
      { rate: 100_001, nights: 1, pct: 7 },
      { rate: 99_999, nights: 5, pct: 50 },
      { rate: 1, nights: 2, pct: 99 },
      { rate: 777_777, nights: 7, pct: 15 },
    ];

    for (const caso of casos) {
      const nights = Array.from({ length: caso.nights }, (_, index) =>
        night(`2026-10-${String(index + 1).padStart(2, "0")}`, caso.rate),
      );
      const quote = buildStayQuote(
        stayInput({
          range: { from: "2026-10-01", to: `2026-10-${String(caso.nights + 1).padStart(2, "0")}` },
          nights,
          depositPct: caso.pct,
          today: "2026-09-01",
          unit: {
            maxGuests: 6,
            baseGuests: 4,
            extraGuestFeeCents: 33_333,
            cleaningFeeCents: 12_345,
            minNights: 1,
          },
        }),
      );
      assertInvariants(quote);
    }
  });

  it("no cotiza una noche sin tarifa configurada", () => {
    const quote = () =>
      buildStayQuote(
        stayInput({
          nights: [
            night("2026-09-17", 320_000),
            night("2026-09-18", null),
            night("2026-09-19", 390_000),
          ],
        }),
      );

    assert.throws(quote, (error: unknown) => {
      assert.ok(error instanceof QuoteError);
      assert.equal(error.code, "no_rate");
      assert.equal(error.params.night, "2026-09-18");
      return true;
    });
  });

  it("rechaza noches anteriores a hoy, pero permite llegar hoy mismo", () => {
    // Una llegada de último momento es normal en este negocio, así que "hoy"
    // sí se puede reservar. Lo que no se puede es una noche que ya pasó.
    assert.throws(
      () =>
        buildStayQuote(
          stayInput({
            range: { from: "2026-09-16", to: "2026-09-19" },
            nights: [
              night("2026-09-16", 320_000),
              night("2026-09-17", 320_000),
              night("2026-09-18", 390_000),
            ],
            today: "2026-09-17",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "past_dates");
        return true;
      },
    );

    const hoyMismo = buildStayQuote(stayInput({ today: "2026-09-17" }));
    assertInvariants(hoyMismo);
  });

  it("depende de la zona de la propiedad para saber qué es hoy", () => {
    // Son las 04:30 UTC del 18 de septiembre. En Cancún (UTC−5, sin horario de
    // verano) son las 23:30 del 17, así que la noche del 17 todavía se puede
    // vender. Un servidor que usara su propia zona calcularía "hoy = 18" y
    // rechazaría una noche perfectamente válida.
    const now = new Date("2026-09-18T04:30:00Z");

    const enCancun = buildStayQuote(
      stayInput({ range: { from: "2026-09-17", to: "2026-09-20" }, today: "2026-09-17", now }),
    );
    assertInvariants(enCancun);

    assert.throws(
      () =>
        buildStayQuote(
          stayInput({ range: { from: "2026-09-17", to: "2026-09-20" }, today: "2026-09-18", now }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "past_dates");
        return true;
      },
    );
  });

  it("aplica el mínimo de noches más alto de las temporadas que toca", () => {
    assert.throws(
      () =>
        buildStayQuote(
          stayInput({
            range: { from: "2026-12-20", to: "2026-12-23" },
            nights: [
              night("2026-12-20", 580_000, { minNights: 4 }),
              night("2026-12-21", 580_000, { minNights: 2 }),
              night("2026-12-22", 580_000, { minNights: 2 }),
            ],
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "min_nights");
        assert.equal(error.params.min, 4, "gana el mínimo más alto, no el de la primera noche");
        return true;
      },
    );
  });

  it("respeta el cierre a la llegada y a la salida", () => {
    assert.throws(
      () =>
        buildStayQuote(
          stayInput({
            nights: [
              night("2026-09-17", 320_000, { closedToArrival: true }),
              night("2026-09-18", 390_000),
              night("2026-09-19", 390_000),
            ],
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "closed_to_arrival");
        return true;
      },
    );

    assert.throws(
      () => buildStayQuote(stayInput({ departureRate: { closedToDeparture: true } })),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "closed_to_departure");
        return true;
      },
    );
  });

  it("rechaza más personas que la capacidad", () => {
    assert.throws(
      () => buildStayQuote(stayInput({ guests: 7 })),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "over_capacity");
        assert.equal(error.params.max, 6);
        return true;
      },
    );
  });

  it("no agrega línea de impuesto cuando la tarifa ya lo incluye", () => {
    const quote = buildStayQuote(
      stayInput({ taxes: [{ ...IVA, included_in_price: true }, ISH] }),
    );
    const taxes = quote.lines.filter((line) => line.kind === "tax");
    assert.equal(taxes.length, 1, "solo el ISH, que no viene incluido");
    assert.equal(taxes[0]?.concept, "ISH Quintana Roo");
    assertInvariants(quote);
  });

  it("no cobra huésped extra cuando la ocupación cabe en la base", () => {
    const quote = buildStayQuote(stayInput({ guests: 4 }));
    assert.equal(
      quote.lines.find((line) => line.kind === "occupancy"),
      undefined,
    );
    assertInvariants(quote);
  });
});

describe("cupones", () => {
  it("un cupón porcentual descuenta antes de impuestos, no después", () => {
    // Subtotal sin cupón: 1,100,000 (noches) + 180,000 (ocupación) + 80,000
    // (limpieza) = 1,360,000. El comentario de applyTaxes lo dice desde el
    // Sprint 2: los impuestos van sobre el subtotal "ya con descuentos".
    const quote = buildStayQuote(
      stayInput({ coupon: { code: "PROMO10", kind: "percent", value: 10, minTotalCents: 0, appliesToExtras: false } }),
    );

    const discount = quote.lines.find((line) => line.kind === "discount");
    assert.equal(discount?.cents, -136_000, "10% de 1,360,000");
    assert.deepEqual(quote.coupon, { code: "PROMO10", applied: true });

    // 1,360,000 − 136,000 = 1,224,000 taxable; 19% de impuestos = 232,560.
    assert.equal(quote.total_cents, 1_456_560);
    assertInvariants(quote);
  });

  it("un cupón fijo nunca deja el total en negativo, aunque el cupón valga más que la compra", () => {
    const quote = buildStayQuote(
      stayInput({
        coupon: { code: "REGALO", kind: "fixed", value: 2_000_000, minTotalCents: 0, appliesToExtras: false },
      }),
    );

    const discount = quote.lines.find((line) => line.kind === "discount");
    assert.equal(discount?.cents, -1_360_000, "se topa en el subtotal, no en el valor nominal del cupón");
    assert.equal(quote.total_cents, 0);
    assert.equal(quote.deposit_cents, 0);
    assert.equal(quote.balance_cents, 0);
    assertInvariants(quote);
  });

  it("no aplica el cupón cuando la compra no alcanza el mínimo, y lo dice", () => {
    const sinCupon = buildStayQuote(stayInput());
    const conCupon = buildStayQuote(
      stayInput({
        coupon: { code: "GRANDE", kind: "fixed", value: 100_000, minTotalCents: 2_000_000, appliesToExtras: false },
      }),
    );

    assert.equal(
      conCupon.lines.find((line) => line.kind === "discount"),
      undefined,
      "sin línea de descuento: no se aplicó",
    );
    assert.equal(conCupon.total_cents, sinCupon.total_cents, "el precio queda igual que sin cupón");
    assert.deepEqual(conCupon.coupon, { code: "GRANDE", applied: false, reason: "min_total" });
    assertInvariants(conCupon);
  });

  it("sin código de cupón, el desglose no lleva la llave coupon", () => {
    const quote = buildStayQuote(stayInput());
    assert.equal(quote.coupon, undefined);
  });

  it("también descuenta en un tour, sobre el subtotal de pasajeros", () => {
    // Subtotal: 2 adultos × 1,800 + 1 menor × 1,200 = 480,000 (el infante sin
    // costo no genera línea, así que no hay nada que descontarle).
    const quote = buildTourQuote(
      tourInput({ coupon: { code: "TOUR10", kind: "percent", value: 10, minTotalCents: 0, appliesToExtras: false } }),
    );

    const discount = quote.lines.find((line) => line.kind === "discount");
    assert.equal(discount?.cents, -48_000);
    // 480,000 − 48,000 = 432,000 taxable; IVA 16% = 69,120.
    assert.equal(quote.total_cents, 501_120);
    assertInvariants(quote);
  });
});

describe("extras de tour", () => {
  it("se cobra por lugar ocupado, no por persona: el infante en brazos no sube a la tirolesa", () => {
    // El grupo son CUATRO personas —2 adultos, 1 menor, 1 infante— pero solo
    // TRES ocupan lugar. Es la misma regla que decide el cupo, y cobrar por
    // personas aquí sería una segunda definición de "cuántos son" que tarde o
    // temprano se separa de la primera.
    const quote = buildTourQuote(tourInput({ extras: [TIROLESA] }));

    const extra = quote.lines.find((line) => line.kind === "extra");
    assert.equal(extra?.cents, 135_000, "45,000 × 3 lugares, no × 4 personas");
    assert.equal(extra?.concept, "extra:3:Tirolesa");
    assertInvariants(quote);
  });

  it("los extras pagan impuestos sobre su importe completo", () => {
    // 480,000 (pasajeros) + 135,000 (tirolesa) = 615,000; IVA 16% = 98,400.
    const quote = buildTourQuote(tourInput({ extras: [TIROLESA] }));

    assert.equal(quote.total_cents, 713_400);
    assert.equal(quote.lines.find((line) => line.kind === "tax")?.cents, 98_400);
    assertInvariants(quote);
  });

  it("dos extras suman dos renglones, y el orden lo pone el catálogo", () => {
    const quote = buildTourQuote(tourInput({ extras: [TIROLESA, KAYAK] }));

    const extras = quote.lines.filter((line) => line.kind === "extra");
    assert.deepEqual(
      extras.map((line) => line.concept),
      ["extra:3:Tirolesa", "extra:3:Kayak"],
    );
    assert.equal(extras[0]!.cents + extras[1]!.cents, 225_000);
    assertInvariants(quote);
  });

  it("un extra sin precio no genera renglón, igual que el infante sin costo", () => {
    const quote = buildTourQuote(tourInput({ extras: [{ ...KAYAK, priceCents: 0 }] }));

    assert.equal(quote.lines.filter((line) => line.kind === "extra").length, 0);
    assert.equal(quote.total_cents, 556_800, "el mismo total que sin extras");
    assertInvariants(quote);
  });

  // -------------------------------------------------------------------------
  // La decisión 0019, hecha prueba
  // -------------------------------------------------------------------------

  it("el cupón NO descuenta los extras: el descuento sale solo del servicio base", () => {
    const quote = buildTourQuote(
      tourInput({
        extras: [TIROLESA],
        coupon: { code: "TOUR10", kind: "percent", value: 10, minTotalCents: 0, appliesToExtras: false },
      }),
    );

    const discount = quote.lines.find((line) => line.kind === "discount");
    assert.equal(discount?.cents, -48_000, "10% de los 480,000 de pasajeros");
    assert.notEqual(discount?.cents, -61_500, "no es 10% de 615,000: la tirolesa no se descuenta");

    // 480,000 + 135,000 − 48,000 = 567,000; IVA 16% = 90,720.
    assert.equal(quote.total_cents, 657_720);
    assertInvariants(quote);
  });

  it("con applies_to_extras el mismo cupón sí los alcanza, y la diferencia son 15,660", () => {
    const base = { code: "TODO10", kind: "percent" as const, value: 10, minTotalCents: 0 };

    const acotado = buildTourQuote(
      tourInput({ extras: [TIROLESA], coupon: { ...base, appliesToExtras: false } }),
    );
    const completo = buildTourQuote(
      tourInput({ extras: [TIROLESA], coupon: { ...base, appliesToExtras: true } }),
    );

    assert.equal(completo.lines.find((line) => line.kind === "discount")?.cents, -61_500);
    assert.equal(completo.total_cents, 642_060);
    // 13,500 de descuento sobre la tirolesa más 2,160 del IVA que ya no se
    // cobra sobre ellos. Es el número que la decisión 0019 pone en la balanza.
    assert.equal(acotado.total_cents - completo.total_cents, 15_660);

    assertInvariants(acotado);
    assertInvariants(completo);
  });

  it("los extras SÍ cuentan para alcanzar el mínimo del cupón, aunque no reciban el descuento", () => {
    // Esta es la asimetría entera en un caso: el servicio base son 480,000 y
    // el cupón pide 600,000. Sin la tirolesa no alcanza; con ella sí —y aun
    // así el descuento sale solo de los 480,000—.
    const cupon = {
      code: "GRANDE10",
      kind: "percent" as const,
      value: 10,
      minTotalCents: 600_000,
      appliesToExtras: false,
    };

    const sinExtras = buildTourQuote(tourInput({ coupon: cupon }));
    assert.deepEqual(sinExtras.coupon, { code: "GRANDE10", applied: false, reason: "min_total" });

    const conExtras = buildTourQuote(tourInput({ extras: [TIROLESA], coupon: cupon }));
    assert.deepEqual(conExtras.coupon, { code: "GRANDE10", applied: true });
    assert.equal(
      conExtras.lines.find((line) => line.kind === "discount")?.cents,
      -48_000,
      "la tirolesa ayudó a alcanzar el mínimo pero no se descontó a sí misma",
    );
    assertInvariants(conExtras);
  });

  it("el renglón del descuento dice su alcance solo cuando hay algo que aclarar", () => {
    const cupon = {
      code: "TOUR10",
      kind: "percent" as const,
      value: 10,
      minTotalCents: 0,
      appliesToExtras: false,
    };

    const conExtras = buildTourQuote(tourInput({ extras: [TIROLESA], coupon: cupon }));
    assert.equal(
      conExtras.lines.find((line) => line.kind === "discount")?.concept,
      "coupon:TOUR10:base",
      "el huésped lee POR QUÉ bajó menos de lo que esperaba",
    );

    const sinExtras = buildTourQuote(tourInput({ coupon: cupon }));
    assert.equal(
      sinExtras.lines.find((line) => line.kind === "discount")?.concept,
      "coupon:TOUR10",
      "sin extras la aclaración sobraría: el renglón se lee como siempre",
    );

    // Y con el cupón que sí los alcanza tampoco hay nada que aclarar.
    const completo = buildTourQuote(
      tourInput({ extras: [TIROLESA], coupon: { ...cupon, appliesToExtras: true } }),
    );
    assert.equal(completo.lines.find((line) => line.kind === "discount")?.concept, "coupon:TOUR10");
  });

  it("el anticipo sube con los extras, y sigue cuadrando", () => {
    const sinExtras = buildTourQuote(tourInput());
    const conExtras = buildTourQuote(tourInput({ extras: [TIROLESA] }));

    // 30% de 713,400 = 214,020, contra 30% de 556,800 = 167,040. Es la
    // consecuencia aceptada en la decisión 0019: el upsell sube lo que se
    // cobra hoy en línea, no solo el total.
    assert.equal(sinExtras.deposit_cents, 167_040);
    assert.equal(conExtras.deposit_cents, 214_020);
    assertInvariants(conExtras);
  });

  it("una estancia no cambia de comportamiento: minimoSobre cae en descontables", () => {
    // La firma de applyCoupon creció por los extras. Este es el caso que
    // comprueba que el camino que no los tiene se cotiza exactamente igual.
    const quote = buildStayQuote(
      stayInput({
        coupon: { code: "PROMO10", kind: "percent", value: 10, minTotalCents: 0, appliesToExtras: false },
      }),
    );
    assert.equal(quote.lines.find((line) => line.kind === "discount")?.cents, -136_000);
    assert.equal(quote.total_cents, 1_456_560);
  });
});

describe("cotización de tour", () => {
  it("cobra por tipo de pasajero y no cobra al infante", () => {
    const quote = buildTourQuote(tourInput());

    const pax = quote.lines.filter((line) => line.kind === "pax");
    assert.equal(pax.length, 2, "adulto y menor generan línea; el infante sin costo no");
    assert.equal(pax[0]?.cents, 360_000, "dos adultos a 1,800");
    assert.equal(pax[1]?.cents, 120_000, "un menor a 1,200");

    const iva = quote.lines.find((line) => line.kind === "tax");
    assert.equal(iva?.cents, 76_800, "IVA 16% sobre 480,000");
    assert.equal(quote.total_cents, 556_800);
    assertInvariants(quote);
  });

  it("cuenta lugares ocupados, no personas", () => {
    // Cuatro personas, pero el infante no ocupa asiento: caben en 3 lugares.
    const quote = buildTourQuote(tourInput({ seatsLeft: 3 }));
    assertInvariants(quote);

    assert.throws(
      () => buildTourQuote(tourInput({ pax: { adult: 3, child: 0, infant: 0 }, seatsLeft: 2 })),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "sold_out");
        assert.equal(error.params.left, 2);
        assert.equal(error.params.asked, 3);
        return true;
      },
    );
  });

  it("exige al menos un adulto", () => {
    assert.throws(
      () => buildTourQuote(tourInput({ pax: { adult: 0, child: 2, infant: 0 } })),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "no_pax");
        return true;
      },
    );
  });

  it("no cotiza una salida cerrada ni una que ya salió", () => {
    assert.throws(
      () => buildTourQuote(tourInput({ departureOpen: false })),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "departure_closed");
        return true;
      },
    );

    assert.throws(
      () => buildTourQuote(tourInput({ startsAt: new Date("2026-08-01T14:00:00Z") })),
      (error: unknown) => {
        assert.ok(error instanceof QuoteError);
        assert.equal(error.code, "past_dates");
        return true;
      },
    );
  });
});

/* Las cifras son las de la ficha del Leopard 47 de Adri, 4 horas: US$2,300
   por el barco para hasta 15 personas, US$100 cada pasajero extra, niños de
   2 a 6 al 50% y US$20 de muelle por persona; caben 35. */
function charterInput(overrides: Partial<TourQuoteInput> = {}): TourQuoteInput {
  return tourInput({
    currency: "USD",
    pax: { adult: 10, child: 0, infant: 0 },
    prices: [
      { paxType: "adult", priceCents: 10_000, countsTowardCapacity: true },
      { paxType: "child", priceCents: 5_000, countsTowardCapacity: true },
    ],
    seatsLeft: 35,
    taxes: [],
    charter: { basePriceCents: 230_000, includedPax: 15, capacity: 35, perPaxFeeCents: 2_000 },
    ...overrides,
  });
}

describe("embarcación privada", () => {
  it("cobra el barco, no a cada pasajero, mientras quepan en lo incluido", () => {
    const quote = buildTourQuote(charterInput());
    assertInvariants(quote);
    assert.deepEqual(
      quote.lines.map((line) => [line.kind, line.concept, line.cents]),
      [
        ["charter", "charter:15", 230_000],
        ["fee", "dock:10", 20_000],
      ],
    );
    assert.equal(quote.total_cents, 250_000);
  });

  it("los adultos llenan primero lo incluido: un niño solo paga extra si ya no cabe", () => {
    // 13 adultos y 4 niños: los 15 incluidos cubren a los 13 adultos y a 2
    // niños; solo los otros 2 niños pagan, y al 50%.
    const quote = buildTourQuote(charterInput({ pax: { adult: 13, child: 4, infant: 0 } }));
    assertInvariants(quote);
    assert.deepEqual(
      quote.lines.filter((line) => line.kind === "charter_extra").map((line) => [line.concept, line.cents]),
      [["charter_extra:child:2", 10_000]],
    );

    // 17 adultos y 2 niños: pagan 2 adultos y los 2 niños.
    const lleno = buildTourQuote(charterInput({ pax: { adult: 17, child: 2, infant: 0 } }));
    assertInvariants(lleno);
    assert.deepEqual(
      lleno.lines.filter((line) => line.kind === "charter_extra").map((line) => [line.concept, line.cents]),
      [
        ["charter_extra:adult:2", 20_000],
        ["charter_extra:child:2", 10_000],
      ],
    );
    assert.equal(lleno.total_cents, 230_000 + 30_000 + 19 * 2_000);
  });

  it("el muelle no lo descuenta el cupón ni lo graba el impuesto", () => {
    const quote = buildTourQuote(
      charterInput({
        taxes: [IVA],
        coupon: { code: "VERANO", kind: "percent", value: 10, minTotalCents: 0, appliesToExtras: false },
      }),
    );
    assertInvariants(quote);
    const by = (kind: string) => quote.lines.filter((line) => line.kind === kind);
    // 10% de 2,300 = 230; el IVA va sobre 2,070, no sobre el muelle.
    assert.equal(by("discount")[0]?.cents, -23_000);
    assert.equal(by("tax")[0]?.cents, roundCents(207_000 * 0.16));
    assert.equal(by("fee")[0]?.cents, 20_000);
  });

  it("un grupo que no cabe es 'no cabe', y un barco ya apartado es 'agotado'", () => {
    assert.throws(
      () => buildTourQuote(charterInput({ pax: { adult: 36, child: 0, infant: 0 } })),
      (error: unknown) => error instanceof QuoteError && error.code === "over_capacity" && error.params.max === 35,
    );
    assert.throws(
      () => buildTourQuote(charterInput({ seatsLeft: 0 })),
      (error: unknown) => error instanceof QuoteError && error.code === "sold_out",
    );
  });

  it("no inventa tarifa de niño donde el operador no la dio", () => {
    assert.throws(
      () =>
        buildTourQuote(
          charterInput({
            pax: { adult: 4, child: 1, infant: 0 },
            prices: [{ paxType: "adult", priceCents: 0, countsTowardCapacity: true }],
          }),
        ),
      (error: unknown) => error instanceof QuoteError && error.code === "no_rate",
    );
  });
});
