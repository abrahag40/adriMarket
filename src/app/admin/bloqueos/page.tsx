import { listManualBlocks, listUnits } from "@/modules/admin/queries";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../nav";
import { BlockForms } from "./block-forms";

export const dynamic = "force-dynamic";

/**
 * Bloqueos manuales · S4-4
 *
 * Mantenimiento, uso del propietario u otro. El motivo se guarda para la
 * operación y **nunca llega a la vitrina**: el huésped solo ve que esas noches no
 * están disponibles.
 */
export default async function BloqueosPage() {
  const user = await requireStaff("front_desk");
  const [units, blocks] = await Promise.all([listUnits(), listManualBlocks()]);

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/bloqueos" />
      <h1 className="page-title">Bloqueos</h1>
      <p className="muted">
        El motivo queda registrado para la operación. En la vitrina esas noches solo se ven
        como no disponibles.
      </p>
      <BlockForms units={units} blocks={blocks} />
    </div>
  );
}
