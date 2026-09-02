/**
 * Set de íconos pequeños de una sola pieza: la fila de datos de la ficha
 * (duración, personas, recámaras…) y las tres columnas de confianza del
 * inicio.
 *
 * Trazos propios, no una librería de íconos ni la fuente de íconos de la
 * plantilla de referencia (`gdl-travel-*`, parte de su tema de pago) — mismo
 * patrón visual, sin copiar el activo.
 */
export type SpecIconName =
  | "clock"
  | "users"
  | "bed"
  | "door"
  | "bath"
  | "pin"
  | "calendar"
  | "wallet"
  | "shield"
  | "bolt";

const PATHS: Record<SpecIconName, string> = {
  clock: "M12 7v5l3 3 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  users:
    "M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M17 8a2.5 2.5 0 1 0 0-5 M16 20c0-2.6-1.6-4.8-4-5.6 M17 14.4c2.4.8 4 3 4 5.6",
  bed: "M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6 M3 18v2 M21 18v2 M3 13V7a1 1 0 0 1 1-1h6v5 M3 20h18",
  door: "M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17 M5 21h14 M14 12v.01",
  bath: "M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z M7 12V6a2 2 0 0 1 3-1.7 M4 20v1 M18 20v1",
  pin: "M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  calendar: "M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M3 10h18 M8 3v4 M16 3v4",
  wallet:
    "M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2 M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z M16 14h.01",
  shield:
    "M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z M9 12l2 2 4-4",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
};

export function SpecIcon({ name }: { name: SpecIconName }) {
  return (
    <svg
      className="spec-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
