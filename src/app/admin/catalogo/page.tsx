import Link from "next/link";

import { listLocations, listProducts } from "@/modules/admin/authoring";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../nav";
import { NewProductForm } from "./new-product-form";

export const dynamic = "force-dynamic";

const KIND = { tour: "Tour", stay: "Estancia" };
const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Borrador", tone: "wait" },
  published: { label: "Publicado", tone: "ok" },
  archived: { label: "Archivado", tone: "off" },
};

/**
 * Catálogo · S6-1
 *
 * La lista dice de un vistazo lo que impide publicar: si falta el inglés o si no
 * hay fotos. Es información que el cliente necesita **antes** de intentar
 * publicar y toparse con un error.
 */
export default async function CatalogoPage() {
  const user = await requireStaff("manager");
  const [products, locations] = await Promise.all([listProducts(), listLocations()]);

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/catalogo" />

      <h1 className="page-title">Catálogo</h1>

      <NewProductForm locations={locations} />

      <ul className="admin-list">
        {products.map((product) => {
          const status = STATUS[product.status] ?? { label: product.status, tone: "off" };
          const faltaIngles = !product.translations.includes("en");
          return (
            <li key={product.id}>
              <Link href={`/admin/catalogo/${product.id}`} className="admin-card">
                <span className="admin-card-head">
                  <span className="admin-code">{product.name}</span>
                  <span className={`admin-badge admin-badge-${status.tone}`}>{status.label}</span>
                </span>
                <span className="admin-card-meta">
                  {KIND[product.kind]}
                  {product.locationName ? ` · ${product.locationName}` : ""} ·{" "}
                  {product.mediaCount} foto{product.mediaCount === 1 ? "" : "s"}
                </span>
                <span className="admin-card-meta">
                  Anticipo:{" "}
                  {product.depositPct === null ? "el global" : `${product.depositPct}% propio`}
                </span>
                {faltaIngles || product.mediaCount === 0 ? (
                  <span className="admin-card-warn">
                    {[
                      faltaIngles ? "falta el texto en inglés" : null,
                      product.mediaCount === 0 ? "sin fotos" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
