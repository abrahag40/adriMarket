import { notFound } from "next/navigation";

import { formatMoney } from "@/i18n/config";
import { listPayouts, siteResells } from "@/modules/booking/payouts";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../nav";
import { PayoutList } from "./payout-forms";

export const dynamic = "force-dynamic";

/**
 * Liquidación al proveedor · decisión 0026.
 *
 * En un sitio que revende, el turista paga todo a la cuenta del sitio y lo del
 * proveedor sale a mano, por SPEI. Aquí se ve, por cada reserva cobrada, cuánto
 * se le debe, cuánto se quedó la pasarela de verdad y cuánto quedó para el
 * sitio; y se registra la transferencia, igual que una devolución.
 *
 * En un sitio que no revende esta página no existe.
 */
export default async function LiquidacionPage() {
  const user = await requireStaff("manager");
  if (!(await siteResells())) notFound();

  const rows = await listPayouts();
  const pendientes = rows.filter((row) => !row.payout);
  const porTransferir = pendientes.reduce((total, row) => total + row.supplierCents, 0);
  const moneda = rows[0]?.currency ?? "MXN";

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/liquidacion" />
      <h1 className="page-title">Liquidación al proveedor</h1>
      <p className="muted">
        Por cada reserva cobrada, el proveedor recibe el 100 % de su precio. Haz la transferencia en el
        banco y regístrala aquí con su clave de rastreo.
      </p>
      {pendientes.length > 0 ? (
        <p className="notice">
          Por transferir: <strong>{formatMoney(porTransferir, moneda, "es")}</strong> de{" "}
          {pendientes.length} reserva{pendientes.length === 1 ? "" : "s"}.
        </p>
      ) : null}
      <PayoutList rows={rows} />
    </div>
  );
}
