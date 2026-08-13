import { defineConfig } from "drizzle-kit";

// El SQL es la fuente de verdad: las migraciones se escriben a mano en
// db/migrations (necesitamos EXCLUDE, daterange, FOR UPDATE y funciones que
// ningún generador expresa). Los tipos de TypeScript se generan DESDE la base
// con `npm run db:pull`, así el código no puede desviarse del esquema real.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/generated",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  introspect: { casing: "camel" },
  verbose: true,
});
