import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CatalogCard } from "./queries";
import {
  applyFacets,
  countWith,
  matches,
  parsePriceRange,
  priceBuckets,
  samePriceRange,
  serializePriceRange,
} from "./facets";

/**
 * Facetas del listado
 *
 * Se prueban porque son la única parte del catálogo que **no** valida la base:
 * el SQL decide qué está publicado y a qué precio, y esto recorta esa lista en
 * memoria para el filtro lateral. Un error aquí no truena ni deja rastro — solo
 * enseña de menos, o enseña una cuenta que no coincide con lo que devuelve al
 * pulsarla, que es la forma más segura de que nadie confíe en el filtro.
 *
 * Los casos que importan son los bordes: qué pasa con el producto que cuesta
 * exactamente el corte de dos cubetas, y con el que no tiene precio.
 */

let siguiente = 0;
function producto(campos: Partial<CatalogCard> = {}): CatalogCard {
  siguiente += 1;
  return {
    id: `p${siguiente}`,
    kind: "tour",
    slug: `producto-${siguiente}`,
    currency: "MXN",
    name: `Producto ${siguiente}`,
    summary: null,
    locationName: "Tulum",
    locationSlug: "tulum",
    city: "Tulum",
    coverUrl: null,
    coverAlt: null,
    coverWidth: null,
    coverHeight: null,
    coverVariants: null,
    capacity: 10,
    fromCents: 100_000,
    ...campos,
  };
}

describe("qué entra en una faceta", () => {
  it("el tipo, la ubicación y la capacidad se comparan como en el SQL que reemplazan", () => {
    const item = producto({ kind: "stay", locationSlug: "cozumel", capacity: 4 });

    assert.equal(matches(item, { kind: "stay" }), true);
    assert.equal(matches(item, { kind: "tour" }), false);
    assert.equal(matches(item, { locationSlug: "cozumel" }), true);
    assert.equal(matches(item, { locationSlug: "tulum" }), false);

    // "4 personas" es "caben 4 o más", no "caben exactamente 4".
    assert.equal(matches(item, { guests: 4 }), true);
    assert.equal(matches(item, { guests: 2 }), true);
    assert.equal(matches(item, { guests: 6 }), false);
  });

  it("sin capacidad declarada no entra en ninguna búsqueda por personas", () => {
    // Decir que sí sería vender un cupo que nadie cargó.
    const item = producto({ capacity: null });
    assert.equal(matches(item, { guests: 1 }), false);
    assert.equal(matches(item, {}), true);
  });

  it("el mínimo de una cubeta de precio entra y el máximo no", () => {
    // El borde compartido entre dos cubetas contiguas pertenece a la de
    // arriba: si no, un producto de exactamente $1,500 sale en las dos y la
    // suma de las cubetas no cuadra con el total.
    const barato = producto({ fromCents: 149_999 });
    const justo = producto({ fromCents: 150_000 });

    const hasta = { minCents: null, maxCents: 150_000 };
    const desde = { minCents: 150_000, maxCents: null };

    assert.equal(matches(barato, { price: hasta }), true);
    assert.equal(matches(barato, { price: desde }), false);
    assert.equal(matches(justo, { price: hasta }), false);
    assert.equal(matches(justo, { price: desde }), true);
  });

  it("sin precio publicado no cae en ninguna cubeta, pero sí en el listado sin filtrar", () => {
    const item = producto({ fromCents: null });
    assert.equal(matches(item, { price: { minCents: null, maxCents: 999_999_999 } }), false);
    assert.equal(matches(item, {}), true);
  });

  it("las facetas se acumulan: todas tienen que cumplirse", () => {
    const items = [
      producto({ kind: "stay", locationSlug: "tulum", capacity: 8, fromCents: 200_000 }),
      producto({ kind: "stay", locationSlug: "cozumel", capacity: 8, fromCents: 200_000 }),
      producto({ kind: "stay", locationSlug: "tulum", capacity: 2, fromCents: 200_000 }),
    ];

    const resultado = applyFacets(items, { kind: "stay", locationSlug: "tulum", guests: 4 });
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0]!.id, items[0]!.id);
  });
});

describe("las cuentas que se enseñan junto a cada opción", () => {
  it("cuentan con la faceta puesta encima de las demás", () => {
    const items = [
      producto({ kind: "tour", locationSlug: "tulum" }),
      producto({ kind: "tour", locationSlug: "cozumel" }),
      producto({ kind: "stay", locationSlug: "tulum" }),
    ];

    // Estando en tours, "Tulum" tiene que decir 1 —el tour de Tulum—, no 2.
    const base = { kind: "tour" as const };
    assert.equal(countWith(items, base, { locationSlug: "tulum" }), 1);
    assert.equal(countWith(items, base, { locationSlug: "cozumel" }), 1);
  });

  it("el override reemplaza la faceta, no se suma a ella", () => {
    // Es lo que hace posible contar "Cozumel" mientras se está viendo Tulum:
    // sin reemplazo, la cuenta de toda opción no elegida sería cero y el
    // filtro se volvería un callejón de una sola salida.
    const items = [
      producto({ locationSlug: "tulum" }),
      producto({ locationSlug: "cozumel" }),
      producto({ locationSlug: "cozumel" }),
    ];

    const viendoTulum = { locationSlug: "tulum" };
    assert.equal(countWith(items, viendoTulum, { locationSlug: "cozumel" }), 2);
    assert.equal(countWith(items, viendoTulum, {}), 1);
  });
});

describe("las cubetas de precio", () => {
  it("salen del catálogo, así que ninguna queda vacía", () => {
    const precios = [65_000, 80_000, 120_000, 150_000, 210_000, 380_000];
    const items = precios.map((fromCents) => producto({ fromCents }));

    const cubetas = priceBuckets(items);
    assert.ok(cubetas.length >= 2, "hay que poder partir en al menos dos");

    for (const cubeta of cubetas) {
      const dentro = items.filter((item) => matches(item, { price: cubeta }));
      assert.ok(dentro.length > 0, `la cubeta ${serializePriceRange(cubeta)} quedó vacía`);
    }

    // Y entre todas cubren el catálogo exactamente una vez.
    const suma = cubetas.reduce(
      (total, cubeta) => total + items.filter((item) => matches(item, { price: cubeta })).length,
      0,
    );
    assert.equal(suma, items.length);
  });

  it("la primera abre por abajo y la última por arriba", () => {
    // Un corte cerrado en los extremos deja fuera al producto más barato o al
    // más caro según cómo redondee, y desaparece del filtro sin decirlo.
    const items = [65_000, 120_000, 380_000, 900_000].map((fromCents) => producto({ fromCents }));
    const cubetas = priceBuckets(items);

    assert.equal(cubetas[0]!.minCents, null);
    assert.equal(cubetas[cubetas.length - 1]!.maxCents, null);
  });

  it("los cortes son cifras redondas, no el precio de un producto", () => {
    // Un corte en "$1,723" se lee como un error del sistema.
    const items = [172_300, 172_400, 458_800, 990_000].map((fromCents) => producto({ fromCents }));
    for (const cubeta of priceBuckets(items)) {
      for (const corte of [cubeta.minCents, cubeta.maxCents]) {
        if (corte === null) continue;
        assert.equal(corte % 10_000, 0, `el corte ${corte} no es redondo`);
      }
    }
  });

  it("no hay faceta de precio cuando no hay nada que separar", () => {
    assert.deepEqual(priceBuckets([]), []);
    assert.deepEqual(priceBuckets([producto({ fromCents: 100_000 })]), []);
    assert.deepEqual(
      priceBuckets([producto({ fromCents: 100_000 }), producto({ fromCents: 100_000 })]),
      [],
    );
    // Todos sin precio: tampoco.
    assert.deepEqual(
      priceBuckets([producto({ fromCents: null }), producto({ fromCents: null })]),
      [],
    );
  });
});

describe("el rango de precio en la URL", () => {
  it("acepta las tres formas y las devuelve tal cual", () => {
    assert.deepEqual(parsePriceRange("-150000"), { minCents: null, maxCents: 150_000 });
    assert.deepEqual(parsePriceRange("150000-"), { minCents: 150_000, maxCents: null });
    assert.deepEqual(parsePriceRange("150000-300000"), { minCents: 150_000, maxCents: 300_000 });
  });

  it("ignora lo que no puede confiar, en vez de reventar", () => {
    // Llega de la URL, así que llega de un desconocido: un valor inválido se
    // ignora y el listado sale sin ese filtro.
    for (const raw of ["", "-", "abc", "100", "100-abc", "1e5-2e5", "-100-200", "300000-150000"]) {
      assert.equal(parsePriceRange(raw), undefined, `debió ignorar ${JSON.stringify(raw)}`);
    }
    // Un rango invertido tampoco: no existe nada que valga entre 3000 y 1500.
    assert.equal(parsePriceRange("150000-150000"), undefined);
  });

  it("lo que se serializa se vuelve a leer igual", () => {
    for (const rango of [
      { minCents: null, maxCents: 150_000 },
      { minCents: 150_000, maxCents: null },
      { minCents: 150_000, maxCents: 300_000 },
    ]) {
      const vuelta = parsePriceRange(serializePriceRange(rango));
      assert.ok(vuelta && samePriceRange(vuelta, rango), serializePriceRange(rango));
    }
  });
});
