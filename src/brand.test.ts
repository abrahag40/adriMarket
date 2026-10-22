import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import { BRAND_IDS, brandFor } from "@/brand";

/**
 * La marca de cada sitio · un código, varios clientes.
 *
 * Lo que tiene que ser cierto para que un cliente nuevo no estrene su sitio con
 * el nombre de otro.
 */
describe("marca del sitio", () => {
  it("sin variable, la marca es adriMarket: el sitio que ya existía no cambia", () => {
    assert.equal(brandFor(undefined).name, "adriMarket");
    assert.equal(brandFor("").name, "adriMarket");
  });

  it("una marca desconocida detiene todo en lugar de caer en otra", () => {
    assert.throws(() => brandFor("conquest"), /no es una marca conocida/);
  });

  for (const id of BRAND_IDS) {
    const b = brandFor(id);
    it(`«${id}»: el encabezado en dos tonos dice el nombre completo`, () => {
      assert.equal((b.lead + b.accent).replace(/\s+/g, " ").trim(), b.name);
    });
    it(`«${id}»: tiene leyenda en los dos idiomas`, () => {
      assert.ok(b.tagline.es && b.tagline.en && b.emailTagline.es && b.emailTagline.en);
    });
    if (b.logo) {
      it(`«${id}»: el logo existe en public/`, () => {
        assert.ok(existsSync(`public${b.logo!.src}`), `falta public${b.logo!.src}`);
      });
    }
  }
});
