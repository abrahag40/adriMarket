import Link from "next/link";

import { formatMoney } from "@/i18n/config";
import type { BookingRow } from "@/modules/admin/queries";

import { instantLabel, nightLabel, statusOf } from "../labels";

function when(value: string | null): string {
  if (!value) return "—";
  // Una noche es una fecha; una salida de tour es un instante.
  return value.length > 10 ? instantLabel(value, "America/Cancun") : nightLabel(value);
}

/**
 * Lista de reservas en tarjetas, no en tabla.
 *
 * Una tabla de ocho columnas en un teléfono obliga a desplazarse en horizontal
 * para leer una fila. Aquí cada reserva es una tarjeta que se lee de un vistazo
 * y se toca completa.
 */
export function BookingList({ rows }: { rows: BookingRow[] }) {
  return (
    <ul className="admin-list">
      {rows.map((row) => {
        const status = statusOf(row.status);
        return (
          <li key={row.code}>
            <Link href={`/admin/reservas/${row.code}`} className="admin-card">
              <span className="admin-card-head">
                <span className="admin-code">{row.code}</span>
                <span className={`admin-badge admin-badge-${status.tone}`}>{status.label}</span>
              </span>
              <span className="admin-card-title">{row.productName}</span>
              <span className="admin-card-meta">
                {row.holderName} · {when(row.when)}
              </span>
              {row.balanceDueCents > 0 ? (
                <span className="admin-card-due">
                  Por cobrar: {formatMoney(row.balanceDueCents, row.currency, "es")}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
