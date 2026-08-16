import { listAudit } from "@/modules/admin/authoring";
import { requireStaff } from "@/modules/identity/session";

import { instantLabel } from "../labels";
import { AdminNav } from "../nav";

export const dynamic = "force-dynamic";

const ACTION: Record<string, string> = {
  "product.create": "creó un producto",
  "product.translate": "editó un texto",
  "product.status": "cambió la publicación",
  "product.deposit_pct": "cambió el anticipo del producto",
  "media.upload": "subió una foto",
  "media.delete": "quitó una foto",
  "rate.create": "agregó una tarifa",
  "rate.delete": "quitó una tarifa",
  "departures.generate": "generó salidas",
  "settings.deposit_pct": "cambió el anticipo global",
  "coupon.create": "creó un cupón",
  "coupon.toggle": "activó o desactivó un cupón",
};

/**
 * Bitácora de cambios · S6-5
 *
 * Quién cambió qué y cuándo. Existe por una razón concreta: el día que alguien
 * pregunte por qué el anticipo bajó al 10% en plena temporada alta, la respuesta
 * tiene que estar escrita y no depender de la memoria de nadie.
 *
 * Se muestra el antes y el después en crudo. No es bonito, pero es exacto, y
 * para esto la exactitud importa más que la presentación.
 */
export default async function BitacoraPage() {
  const user = await requireStaff("manager");
  const entries = await listAudit();

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/bitacora" />
      <h1 className="page-title">Bitácora</h1>

      {entries.length === 0 ? (
        <p className="muted">Todavía no hay cambios registrados.</p>
      ) : (
        <ul className="admin-log">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="admin-log-type">
                {entry.actor} {ACTION[entry.action] ?? entry.action}
              </span>
              <span className="admin-log-meta">
                {instantLabel(entry.createdAt, "America/Cancun")}
                {entry.entityId ? ` · ${entry.entity} ${entry.entityId.slice(0, 8)}` : ""}
              </span>
              {entry.after || entry.before ? (
                <code className="admin-log-diff">
                  {entry.before ? `antes: ${JSON.stringify(entry.before)} ` : ""}
                  {entry.after ? `después: ${JSON.stringify(entry.after)}` : ""}
                </code>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
