import Link from "next/link";
import { notFound } from "next/navigation";

import { listRatePlans, listRates, productDetail } from "@/modules/admin/authoring";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../../../nav";
import { RateForms } from "./rate-forms";

export const dynamic = "force-dynamic";

/**
 * Tarifas y temporadas · S6-2
 *
 * La pantalla enseña las reglas **ordenadas por prioridad**, que es el orden en
 * que ganan. Verlas por fecha escondería lo único que hay que entender: cuál se
 * impone cuando dos se traslapan.
 */
export default async function TarifasPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("manager");
  const { id } = await params;

  const [product, rates, plans] = await Promise.all([
    productDetail(id),
    listRates(id),
    listRatePlans(id),
  ]);
  if (!product) notFound();

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/catalogo" />

      <p className="breadcrumb">
        <Link href="/admin/catalogo">Catálogo</Link> ·{" "}
        <Link href={`/admin/catalogo/${id}`}>{product.name}</Link>
      </p>

      <h1 className="page-title">Tarifas</h1>

      <p className="muted">
        Cuando dos reglas cubren la misma noche gana la de mayor prioridad. Para un puente o una
        fecha especial <strong>no partas la temporada</strong>: agrega una regla encima con más
        prioridad. Partirla deja huecos y solapes que se pagan con noches sin precio.
      </p>

      <RateForms productId={id} plans={plans} rates={rates} />
    </div>
  );
}
