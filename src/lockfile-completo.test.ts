import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Guardián: el `package-lock.json` trae todo lo que `npm ci` va a pedir en Linux.
 *
 * Un lock generado en macOS **no trae las dependencias opcionales de Linux**, y
 * la CI se cae en `npm ci` con «Missing: @emnapi/runtime@… from lock file» antes
 * de correr una sola prueba. La nota de `ci.yml` lo explica desde el primer PR
 * de este repositorio, y el 2026-11-13 volvió a pasar: el PR de Cloudflare
 * subió Next a 15.5.28, el lock se regeneró en macOS y **cuatro corridas de la
 * CI fallaron al instalar** sin que nadie las leyera. La barra se había corrido
 * en local, donde el lock sí alcanza.
 *
 * Una nota no se ejecuta. Esta prueba sí, y corre en la barra local: recorre
 * el lock como lo recorre npm (cada paquete busca sus dependencias en su
 * `node_modules` y luego en los de arriba) y falla si alguna no está.
 *
 * Mira presencia, no versiones: es lo que faltó las dos veces. El arreglo, el
 * de `ci.yml`: regenerar el lock dentro de un contenedor Linux.
 */

type LockPackage = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  dev?: boolean;
};

type Lock = { packages: Record<string, LockPackage> };

/** Las dependencias que el lock no puede resolver, como «paquete → dependencia». */
export function faltantes(lock: Lock): string[] {
  const paquetes = lock.packages;
  const resuelve = (desde: string, nombre: string): boolean => {
    // npm busca en `desde/node_modules/nombre` y sube un nivel cada vez, hasta
    // la raíz. `desde` es "" para el proyecto o "node_modules/a/node_modules/b".
    let ruta = desde;
    for (;;) {
      const candidato = ruta ? `${ruta}/node_modules/${nombre}` : `node_modules/${nombre}`;
      if (candidato in paquetes) return true;
      if (!ruta) return false;
      const corte = ruta.lastIndexOf("/node_modules/");
      ruta = corte === -1 ? "" : ruta.slice(0, corte);
    }
  };

  const fallas: string[] = [];
  for (const [ruta, pkg] of Object.entries(paquetes)) {
    // Un paquete enlazado («link») no se instala desde el lock.
    if (ruta.startsWith("node_modules/") === false && ruta !== "") continue;
    const requeridas = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}).filter((n) => !pkg.peerDependenciesMeta?.[n]?.optional),
    ];
    // Las opcionales que faltan en el lock son justo el caso de Linux: npm las
    // instala si existen para la plataforma, y si no están en el lock, falla.
    const opcionales = Object.keys(pkg.optionalDependencies ?? {});
    for (const nombre of [...requeridas, ...opcionales]) {
      if (!resuelve(ruta, nombre)) fallas.push(`${ruta || "(raíz)"} → ${nombre}`);
    }
  }
  return fallas;
}

describe("el lockfile", () => {
  it("resuelve cada dependencia, como la va a pedir npm ci en Linux", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as Lock;
    assert.deepEqual(
      faltantes(lock),
      [],
      "El lock no trae estas dependencias. Regenéralo en Linux (ver ci.yml):\n" +
        '  docker run --rm -v "$PWD":/app -w /app node:22-bookworm npm install --package-lock-only --ignore-scripts',
    );
  });

  it("se pone rojo con el lock que tiró la CI del 2026-11-13", () => {
    // La forma exacta de aquel lock: sharp-wasm32 pedía @emnapi/runtime y
    // wasm-runtime lo pedía como peer, y ninguno estaba arriba.
    const roto: Lock = {
      packages: {
        "": { dependencies: { next: "15.5.28" } },
        "node_modules/next": { optionalDependencies: { "@img/sharp-wasm32": "0.35.0" } },
        "node_modules/@img/sharp-wasm32": { dependencies: { "@emnapi/runtime": "^1.11.3" } },
        "node_modules/@napi-rs/wasm-runtime": {
          peerDependencies: { "@emnapi/core": "^1.7.1", "@emnapi/runtime": "^1.7.1" },
        },
        // La copia anidada no le sirve a nadie más que a su dueño.
        "node_modules/@unrs/binding": { dependencies: { "@emnapi/core": "1.10.0" } },
        "node_modules/@unrs/binding/node_modules/@emnapi/core": {},
      },
    };
    assert.deepEqual(faltantes(roto), [
      "node_modules/@img/sharp-wasm32 → @emnapi/runtime",
      "node_modules/@napi-rs/wasm-runtime → @emnapi/core",
      "node_modules/@napi-rs/wasm-runtime → @emnapi/runtime",
    ]);
  });
});
