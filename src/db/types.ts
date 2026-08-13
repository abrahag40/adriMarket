import { customType } from "drizzle-orm/pg-core";

/**
 * Rango de fechas de Postgres.
 *
 * drizzle-kit no sabe leer `daterange` al introspectar (lo deja como
 * `unknown`), así que le damos su propio tipo. `scripts/patch-generated.mjs`
 * lo inyecta en el esquema generado después de cada `npm run db:pull`.
 *
 * Postgres normaliza todo daterange a la forma `[inicio, fin)`: cerrado al
 * inicio y abierto al final. Es exactamente lo que necesita una estancia —
 * la noche de salida no se ocupa — y por eso la salida de un huésped y la
 * llegada del siguiente el mismo día no cuentan como traslape.
 */
export type DateRange = {
  /** Primera noche ocupada, en formato YYYY-MM-DD. */
  from: string;
  /** Día de salida, NO ocupado, en formato YYYY-MM-DD. */
  to: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toDateRangeLiteral({ from, to }: DateRange): string {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw new Error(`Fecha inválida en el rango: ${from} → ${to}. Se espera YYYY-MM-DD.`);
  }
  if (from >= to) {
    throw new Error(`El rango ${from} → ${to} está vacío: la salida debe ser posterior a la llegada.`);
  }
  return `[${from},${to})`;
}

export function parseDateRangeLiteral(value: string): DateRange {
  // Postgres siempre devuelve la forma canónica [inicio,fin).
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/.exec(value);
  const [, from, to] = match ?? [];
  if (!from || !to) {
    throw new Error(`No se pudo interpretar el daterange recibido: ${value}`);
  }
  return { from, to };
}

/** Número de noches que cubre el rango. */
export function nightsIn({ from, to }: DateRange): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export const daterange = customType<{ data: DateRange; driverData: string }>({
  dataType() {
    return "daterange";
  },
  toDriver(value: DateRange): string {
    return toDateRangeLiteral(value);
  },
  fromDriver(value: string): DateRange {
    return parseDateRangeLiteral(value);
  },
});
