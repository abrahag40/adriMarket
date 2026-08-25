import Link from "next/link";
import { notFound } from "next/navigation";

import { listProductStayUnits, productDetail } from "@/modules/admin/authoring";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../../../nav";
import { UnitForms } from "./unit-forms";

export const dynamic = "force-dynamic";

/**
 * Unidades de estancia · S8
 *
 * Cierra la otra mitad de la deuda declarada al cierre del Sprint 7. Una
 * unidad nace con su primer plan de tarifa: sin plan, la pantalla de Tarifas
 * no tiene sobre qué cargar una tarifa.
 */
export default async function UnidadesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("manager");
  const { id } = await params;

  const [product, units] = await Promise.all([productDetail(id), listProductStayUnits(id)]);
  if (!product || product.kind !== "stay") notFound();

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/catalogo" />

      <p className="breadcrumb">
        <Link href="/admin/catalogo">Catálogo</Link> ·{" "}
        <Link href={`/admin/catalogo/${id}`}>{product.name}</Link>
      </p>

      <h1 className="page-title">Unidades de estancia</h1>
      <p className="muted">
        Una propiedad puede tener varias unidades — por ejemplo la casa completa y una cabaña
        aparte. Cada una nace con un plan de tarifa; las tarifas por temporada se cargan después,
        en <Link href={`/admin/catalogo/${id}/tarifas`}>Tarifas y temporadas</Link>.
      </p>

      <UnitForms productId={id} units={units} />
    </div>
  );
}
