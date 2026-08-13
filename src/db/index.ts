import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./generated/schema";
import * as relations from "./generated/relations";

export * as schema from "./generated/schema";
export * from "./types";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta DATABASE_URL. Ver .env.example.");
}

/**
 * Cliente de Postgres.
 *
 * `max` se mantiene bajo a propósito: en un despliegue sin servidor cada
 * instancia abre su propio pool, así que el límite real es (instancias × max).
 * Con Supabase conviene apuntar al pooler en modo transacción.
 */
const client = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  idle_timeout: 20,
  connect_timeout: 10,
  // Toda fecha y hora se maneja en UTC; la zona de presentación viene de
  // locations.timezone (America/Cancun no tiene horario de verano).
  types: {},
});

export const db = drizzle(client, { schema: { ...schema, ...relations } });

export type Database = typeof db;

/** Ejecuta una función dentro de una transacción. */
export function transaction<T>(fn: (tx: Parameters<Parameters<Database["transaction"]>[0]>[0]) => Promise<T>) {
  return db.transaction(fn);
}

export { client as sqlClient };
