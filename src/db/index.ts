import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { cloudflare } from "@/runtime";

import * as schema from "./generated/schema";
import * as relations from "./generated/relations";

export * as schema from "./generated/schema";
export * from "./types";

/**
 * Cliente de Postgres.
 *
 * **En Node hay un cliente para todo el proceso**, como siempre. `max` se
 * mantiene bajo a propósito: en un despliegue sin servidor cada instancia abre
 * su propio pool, así que el límite real es (instancias × max).
 *
 * **En Cloudflare Workers hay un cliente por petición** (decisión 0023). Un
 * socket abierto durante una petición no puede usarse en otra —workerd lo
 * rechaza con "Cannot perform I/O on behalf of a different request"—, así que
 * el pool global de Node, reutilizado por la segunda visita, tronaría. No hace
 * falta un pool propio: Hyperdrive mantiene las conexiones calientes del otro
 * lado, y abrir un cliente contra él cuesta lo que cuesta un socket local.
 *
 * `db` y `sqlClient` son los mismos objetos de siempre para quien los importa:
 * un `Proxy` resuelve en cada acceso cuál es el cliente de la petición en curso.
 * Así ninguno de los módulos que leen la base tuvo que cambiar.
 *
 * Falta `DATABASE_URL` → truena en la primera consulta, no al importar: en
 * Workers las variables llegan con la petición, no antes.
 */

const OPTIONS = {
  idle_timeout: 20,
  connect_timeout: 10,
  // Toda fecha y hora se maneja en UTC; la zona de presentación viene de
  // locations.timezone (America/Cancun no tiene horario de verano).
  types: {},
} as const;

function connect(connectionString: string | undefined, max: number) {
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL (o el binding HYPERDRIVE en Workers). Ver .env.example.");
  }
  const client = postgres(connectionString, { ...OPTIONS, max });
  return { client, db: drizzle(client, { schema: { ...schema, ...relations } }) };
}

type Connection = ReturnType<typeof connect>;

let nodeConnection: Connection | undefined;

/**
 * La llave es el `ctx` de la petición: OpenNext lo guarda en un
 * AsyncLocalStorage, así que es distinto para cada petición aunque corran
 * varias a la vez en el mismo isolate. Al terminar la petición nadie lo
 * referencia y el `WeakMap` lo suelta.
 */
const perRequest = new WeakMap<object, Connection>();

function current(): Connection {
  const cf = cloudflare();
  if (!cf) {
    nodeConnection ??= connect(
      process.env.DATABASE_URL,
      Number(process.env.DATABASE_POOL_MAX ?? 5),
    );
    return nodeConnection;
  }

  let connection = perRequest.get(cf.ctx);
  if (!connection) {
    // Sin Hyperdrive se acepta DATABASE_URL: sirve para probar el Worker contra
    // una base sin pasar por el intermediario. En producción siempre hay binding.
    connection = connect(cf.env.HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL, 5);
    perRequest.set(cf.ctx, connection);
  }
  return connection;
}

/**
 * Un objeto que se comporta como `target()` en cada acceso. Las funciones se
 * atan al objeto real para que `this` dentro de drizzle y de postgres.js siga
 * siendo el suyo y no el `Proxy`.
 */
function delegate<T extends object>(base: T, target: () => T): T {
  return new Proxy(base, {
    get(_base, property) {
      const real = target();
      const value = Reflect.get(real, property, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
    has(_base, property) {
      return Reflect.has(target(), property);
    },
    apply(_base, _this, args: unknown[]) {
      return Reflect.apply(target() as (...a: unknown[]) => unknown, undefined, args);
    },
  });
}

export type Database = Connection["db"];

export const db: Database = delegate({} as Database, () => current().db);

/** Ejecuta una función dentro de una transacción. */
export function transaction<T>(fn: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>) {
  return db.transaction(fn);
}

/**
 * El cliente de postgres.js sin drizzle. Es una función (se usa como plantilla
 * etiquetada: sqlClient`select …`), así que la base del `Proxy` también lo es:
 * sin eso, la trampa `apply` no se dispara.
 */
const sqlClient: Connection["client"] = delegate(
  (() => undefined) as unknown as Connection["client"],
  () => current().client,
);

export { sqlClient };
