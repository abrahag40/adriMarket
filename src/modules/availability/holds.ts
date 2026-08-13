import { sql } from "drizzle-orm";

import { db, toDateRangeLiteral, type DateRange } from "@/db/index.js";

/**
 * Apartado de inventario durante el checkout.
 *
 * Las garantías viven en la base de datos (restricción de exclusión para
 * fechas, bloqueo de fila para cupos), así que este módulo no revalida nada:
 * llama y traduce el resultado. Revalidar en la aplicación daría una falsa
 * sensación de seguridad y una ventana de carrera entre la revisión y la
 * escritura.
 *
 * Códigos de error del dominio (ver db/migrations/0008_domain_functions.sql):
 *   AM001  cupo agotado
 *   AM002  fechas ocupadas
 *   AM003  transición de estado inválida
 */

export type UnavailableCode = "AM001" | "AM002" | "AM003";

const MESSAGES: Record<UnavailableCode, string> = {
  AM001: "Ya no quedan lugares disponibles en esa salida.",
  AM002: "Esas fechas acaban de ocuparse.",
  AM003: "La reserva no está en un estado que permita esta operación.",
};

/** Error de dominio esperado: el inventario se agotó mientras el huésped decidía. */
export class InventoryUnavailableError extends Error {
  readonly code: UnavailableCode;
  /** Mensaje seguro para mostrarle al huésped. */
  readonly guestMessage: string;

  constructor(code: UnavailableCode, detail: string) {
    super(detail);
    this.name = "InventoryUnavailableError";
    this.code = code;
    this.guestMessage = MESSAGES[code];
  }
}

const DOMAIN_CODES = new Set<string>(["AM001", "AM002", "AM003"]);

/**
 * Busca el SQLSTATE en la cadena de causas.
 *
 * Hace falta porque drizzle envuelve la excepción del driver en un
 * DrizzleQueryError: el `code` de Postgres no está en el error que se atrapa,
 * sino en `cause`. Sin recorrer la cadena, todo error de dominio se escaparía
 * como un fallo genérico y el huésped vería "algo salió mal" en lugar de
 * "esas fechas acaban de ocuparse".
 */
function findSqlState(error: unknown): { code: string; message: string } | null {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const { code } = current as { code: unknown };
      if (typeof code === "string" && DOMAIN_CODES.has(code)) {
        const message =
          "message" in current && typeof (current as { message: unknown }).message === "string"
            ? (current as { message: string }).message
            : code;
        return { code, message };
      }
    }
    current = typeof current === "object" && "cause" in current
      ? (current as { cause: unknown }).cause
      : null;
  }
  return null;
}

function rethrow(error: unknown): never {
  const domain = findSqlState(error);
  if (domain) {
    throw new InventoryUnavailableError(domain.code as UnavailableCode, domain.message);
  }
  throw error;
}

export type HoldOptions = {
  /** Minutos que el inventario queda apartado. Por omisión, settings.checkout. */
  ttlMinutes?: number;
};

/**
 * Aparta las noches de una unidad. Falla con AM002 si las fechas ya están
 * ocupadas por otra reserva, un hold vigente o un bloqueo de mantenimiento.
 */
export async function holdStay(
  unitId: string,
  range: DateRange,
  bookingItemId: string | null,
  { ttlMinutes = 15 }: HoldOptions = {},
): Promise<string> {
  try {
    const rows = await db.execute<{ hold_id: string }>(sql`
      select stay_hold_create(
        ${unitId}::uuid,
        ${toDateRangeLiteral(range)}::daterange,
        ${bookingItemId}::uuid,
        make_interval(mins => ${ttlMinutes})
      ) as hold_id
    `);
    return rows[0]!.hold_id;
  } catch (error) {
    rethrow(error);
  }
}

/**
 * Aparta lugares de una salida. Falla con AM001 si el cupo se agotó — incluido
 * el caso en que dos peticiones simultáneas pidan los últimos lugares.
 */
export async function holdTourSeats(
  departureId: string,
  seats: number,
  bookingItemId: string | null,
  { ttlMinutes = 15 }: HoldOptions = {},
): Promise<string> {
  if (!Number.isInteger(seats) || seats <= 0) {
    throw new RangeError(`El número de lugares debe ser un entero positivo, se recibió ${seats}.`);
  }
  try {
    const rows = await db.execute<{ hold_id: string }>(sql`
      select tour_hold_create(
        ${departureId}::uuid,
        ${seats},
        ${bookingItemId}::uuid,
        make_interval(mins => ${ttlMinutes})
      ) as hold_id
    `);
    return rows[0]!.hold_id;
  } catch (error) {
    rethrow(error);
  }
}

/**
 * Convierte los apartados en ocupación firme, registra el saldo por cobrar y
 * encola los avisos. Se llama desde el webhook de la pasarela, nunca desde el
 * regreso del navegador. Es idempotente: el mismo webhook repetido no duplica
 * nada.
 */
export async function confirmBooking(bookingId: string, actor = "system"): Promise<string> {
  try {
    const rows = await db.execute<{ status: string }>(sql`
      select booking_confirm(${bookingId}::uuid, ${actor}) as status
    `);
    return rows[0]!.status;
  } catch (error) {
    rethrow(error);
  }
}

export type ExpiryReport = {
  bookings_expired: number;
  orphan_holds_released: number;
  orphan_seats_returned: number;
};

/**
 * Libera el inventario de las reservas cuyo anticipo no llegó, más los
 * apartados huérfanos de checkouts abandonados. Lo corre el worker cada
 * minuto; es seguro que varios workers lo llamen a la vez.
 */
export async function expireHolds(): Promise<ExpiryReport> {
  const rows = await db.execute<{ report: ExpiryReport }>(sql`
    select booking_expire_holds() as report
  `);
  return rows[0]!.report;
}

/** Consulta sin efectos: ¿están libres estas fechas? */
export async function isStayAvailable(unitId: string, range: DateRange): Promise<boolean> {
  const rows = await db.execute<{ available: boolean }>(sql`
    select stay_is_available(${unitId}::uuid, ${toDateRangeLiteral(range)}::daterange) as available
  `);
  return rows[0]!.available;
}

/** Lugares que quedan en una salida. */
export async function tourSeatsLeft(departureId: string): Promise<number> {
  const rows = await db.execute<{ seats: number }>(sql`
    select tour_seats_left(${departureId}::uuid) as seats
  `);
  return rows[0]!.seats;
}
