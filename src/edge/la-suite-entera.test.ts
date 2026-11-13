import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Guardián: `test:integration` corre la suite entera, no un pedazo.
 *
 * El 2026-11-13, al agregar `src/edge/page-cache.test.ts`, la suite pasó de 215
 * pruebas a 10 **sin un solo fallo**. El script decía `--test src/**\/*.test.ts`
 * sin comillas, y lo expande el shell: `sh` no conoce `**`, así que lo lee
 * como `*` y sólo encuentra archivos a un nivel de `src/`. Mientras no había
 * ninguno, el patrón le llegaba entero a Node, que sí lo recorre completo, y
 * por eso funcionaba. El primer archivo a un nivel lo rompió en silencio, en la
 * CI también.
 *
 * Esta prueba vive a un nivel de `src/` a propósito: es justo donde el patrón
 * roto la sigue encontrando, así que corre en el caso que vigila.
 */
describe("la suite", () => {
  it("el patrón de test:integration va entre comillas, para que lo expanda Node", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    assert.match(
      scripts["test:integration"] ?? "",
      /--test "src\/\*\*\/\*\.test\.ts"/,
      'test:integration debe decir --test "src/**/*.test.ts", con comillas',
    );
  });
});
