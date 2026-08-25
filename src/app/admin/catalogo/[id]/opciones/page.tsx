import Link from "next/link";
import { notFound } from "next/navigation";

import { listProductTourOptions, productDetail } from "@/modules/admin/authoring";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../../../nav";
import { OptionForms } from "./option-forms";

export const dynamic = "force-dynamic";

/**
 * Opciones y precios de un tour · S6-6
 *
 * Cierra la deuda declarada al cierre del Sprint 6: antes, un tour nuevo
 * necesitaba su opción —hora, duración, punto de encuentro, precios por
 * pasajero— insertada a mano, directo en la base.
 */
export default async function OpcionesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("manager");
  const { id } = await params;

  const [product, options] = await Promise.all([productDetail(id), listProductTourOptions(id)]);
  if (!product || product.kind !== "tour") notFound();

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/catalogo" />

      <p className="breadcrumb">
        <Link href="/admin/catalogo">Catálogo</Link> ·{" "}
        <Link href={`/admin/catalogo/${id}`}>{product.name}</Link>
      </p>

      <h1 className="page-title">Opciones y precios</h1>
      <p className="muted">
        Cada opción es un horario o modalidad distinta del mismo tour — por ejemplo compartido y
        privado. Las salidas del calendario (Ajustes → salidas del mes) se generan sobre estas
        opciones, así que hace falta al menos una con precio de adulto antes de programarlas.
      </p>

      <OptionForms productId={id} options={options} />
    </div>
  );
}
