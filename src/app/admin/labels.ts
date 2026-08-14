/**
 * Etiquetas del panel.
 *
 * Viven en un solo lugar porque el estado de una reserva se muestra en la lista
 * y en la ficha, y las dos deben decir lo mismo. Además, **nada de lo que ve la
 * operación puede ser el valor crudo del enum**: "confirmed" no es una palabra
 * que alguien use en el mostrador.
 */

export const STATUS: Record<string, { label: string; tone: string }> = {
  hold: { label: "Esperando pago", tone: "wait" },
  confirmed: { label: "Confirmada", tone: "ok" },
  in_progress: { label: "En curso", tone: "ok" },
  completed: { label: "Completada", tone: "done" },
  cancelled: { label: "Cancelada", tone: "off" },
  expired: { label: "Expirada", tone: "off" },
  no_show: { label: "No llegó", tone: "off" },
};

export function statusOf(status: string): { label: string; tone: string } {
  return STATUS[status] ?? { label: status, tone: "off" };
}

/**
 * Una noche es una fecha, no un instante.
 *
 * Se formatea en UTC a propósito: el valor ya viene siendo un día del calendario
 * y convertirlo a otra zona lo correría un día. Un check-in que se muestra con
 * un día de diferencia es una discusión en el mostrador.
 */
export function nightLabel(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

/** Una salida de tour sí es un instante, y se muestra en la zona del destino. */
export function instantLabel(value: string, timezone: string, long = false): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: long ? "full" : "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
