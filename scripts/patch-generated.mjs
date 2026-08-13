#!/usr/bin/env node
/**
 * Post-proceso de la introspección.
 *
 * drizzle-kit no sabe leer `daterange` y lo deja como `unknown("...")` con un
 * TODO. En lugar de editar a mano el archivo generado (que se reescribe en
 * cada `db:pull`), este script inyecta el tipo de src/db/types.ts.
 *
 * Es idempotente y falla ruidosamente: si un día drizzle-kit aprende a leer
 * daterange y ya no queda nada que parchar, avisa en lugar de callarse.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SCHEMA = "src/db/generated/schema.ts";

if (!existsSync(SCHEMA)) {
  console.error(`No existe ${SCHEMA}. Corre primero: npx drizzle-kit introspect`);
  process.exit(1);
}

let source = readFileSync(SCHEMA, "utf8");
const before = source;

// 1. Quitar el comentario TODO que precede a cada columna sin parsear.
source = source.replace(/\t\/\/ TODO: failed to parse database type 'daterange'\n/g, "");

// 2. unknown("season") → daterange("season")
const columns = [...source.matchAll(/unknown\("([^"]+)"\)/g)].map((m) => m[1]);
source = source.replace(/unknown\("([^"]+)"\)/g, 'daterange("$1")');

// 3. Importar el tipo propio (y dejar de importar `unknown` si quedó sin uso).
if (!source.includes('from "../types"')) {
  source = source.replace(
    /^(import \{ sql \} from "drizzle-orm")$/m,
    '$1\nimport { daterange } from "../types"',
  );
}
if (!/\bunknown\(/.test(source)) {
  source = source.replace(/import \{([^}]*)\} from "drizzle-orm\/pg-core"/, (all, names) => {
    const kept = names
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && n !== "unknown");
    return `import { ${kept.join(", ")} } from "drizzle-orm/pg-core"`;
  });
}

// 4. Los DEFAULT que llaman a una función de Postgres salen como si fueran
//    una llamada de JavaScript: .default(generate_booking_code()). Hay que
//    envolverlos en sql`` para que TypeScript no busque esa función.
const defaults = new Set();
source = source.replace(/\.default\((\w+)\(\)\)/g, (all, fn) => {
  defaults.add(fn);
  return `.default(sql\`${fn}()\`)`;
});

if (source === before) {
  console.log("Nada que parchar: el esquema generado ya está limpio.");
  process.exit(0);
}

writeFileSync(SCHEMA, source);
console.log(`Parchado ${SCHEMA}:`);
if (columns.length) {
  console.log(`  daterange → ${columns.join(", ")}`);
}
if (defaults.size) {
  console.log(`  default en SQL → ${[...defaults].join(", ")}`);
}
