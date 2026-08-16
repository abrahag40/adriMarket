import { globalDepositPct, listCoupons, listTourOptions } from "@/modules/admin/authoring";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../nav";
import { CouponForms, DepartureBatchForm, GlobalDepositForm } from "./settings-forms";

export const dynamic = "force-dynamic";

/**
 * Ajustes · S6-3 y S6-4
 *
 * Las tres cosas que el cliente cambia sin ayuda: el anticipo por omisión, las
 * salidas del mes y los cupones. Ninguna necesita despliegue.
 */
export default async function AjustesPage() {
  const user = await requireStaff("manager");
  const [pct, coupons, options] = await Promise.all([
    globalDepositPct(),
    listCoupons(),
    listTourOptions(),
  ]);

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/ajustes" />
      <h1 className="page-title">Ajustes</h1>

      <GlobalDepositForm current={pct} />
      <DepartureBatchForm options={options} />
      <CouponForms coupons={coupons} />
    </div>
  );
}
