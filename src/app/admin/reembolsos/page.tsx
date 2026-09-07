import { listPendingRefunds } from "@/modules/booking/refunds";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../nav";
import { PendingRefunds } from "./refund-forms";

export const dynamic = "force-dynamic";

/**
 * Devoluciones pendientes de pagar.
 *
 * El dinero sale **fuera del sistema** —transferencia, SPEI o efectivo— y aquí
 * se registra que salió, con cómo, cuándo, quién y su comprobante. No es un
 * rodeo mientras llega Stripe: el saldo se cobra en destino en efectivo, así
 * que parte del dinero nunca pasa por la pasarela y no puede volver por ella.
 *
 * Antes de esta pantalla el procedimiento era un `UPDATE` a mano contra la base
 * de producción (`docs/operacion.md` §4). Quien opera el panel es recepción
 * desde un teléfono: un procedimiento que exige una consola SQL es un
 * procedimiento que no se ejecuta, y la consecuencia era `/api/health` en
 * `degraded` de forma permanente.
 *
 * **Exige gerencia.** Ver la lista es operación; declarar que el dinero salió
 * es contabilidad, y conviene que no sea la misma persona que canceló.
 */
export default async function ReembolsosPage() {
  const user = await requireStaff("manager");
  const refunds = await listPendingRefunds();

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/reembolsos" />
      <h1 className="page-title">Devoluciones</h1>
      <p className="muted">
        Haz el movimiento en el banco y regístralo aquí. A las 24 horas sin registrar, el
        sistema lo reporta como una falla en <code>/api/health</code>.
      </p>
      <PendingRefunds refunds={refunds} />
    </div>
  );
}
