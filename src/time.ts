/**
 * Fechas en la zona del producto.
 *
 * Quintana Roo usa America/Cancun: UTC−5 y **sin horario de verano**, distinto
 * del resto del país. Nada de esto puede depender de la zona del servidor, que
 * en producción corre en UTC: a las 23:30 en Cancún el servidor ya cree que es
 * mañana, y con eso rechazaría una noche que todavía se puede vender.
 */

/** Hoy en la zona indicada, en formato YYYY-MM-DD. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return formatDateIn(timezone, now);
}

export function formatDateIn(timezone: string, instant: Date): string {
  // en-CA da el formato ISO (YYYY-MM-DD) de forma directa.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Suma días a una fecha YYYY-MM-DD sin pasar por husos horarios. */
export function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

/** Primer día del mes de una fecha YYYY-MM-DD. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Primer día del mes siguiente. */
export function startOfNextMonth(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha YYYY-MM-DD. */
export function isoDayOfWeek(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
