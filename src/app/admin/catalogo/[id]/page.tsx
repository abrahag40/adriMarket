import Link from "next/link";
import { notFound } from "next/navigation";

import { globalDepositPct, productDetail } from "@/modules/admin/authoring";
import { requireStaff } from "@/modules/identity/session";

import { AdminNav } from "../../nav";
import { DepositForm, PhotoManager, PublishForm, TranslationForm } from "./product-forms";

export const dynamic = "force-dynamic";

/**
 * Ficha de edición del producto · S6-1 y S6-4
 *
 * El orden de la pantalla es el orden en que se publica algo: primero se
 * describe, después se le ponen fotos, después se decide el anticipo, y hasta el
 * final se publica. El botón de publicar está abajo porque publicar es lo último
 * que se hace, no lo primero que se toca.
 */
export default async function ProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff("manager");
  const { id } = await params;

  const [product, globalPct] = await Promise.all([productDetail(id), globalDepositPct()]);
  if (!product) notFound();

  const es = product.texts.find((text) => text.locale === "es");
  const en = product.texts.find((text) => text.locale === "en");

  return (
    <div className="stack">
      <AdminNav user={user} active="/admin/catalogo" />

      <p className="breadcrumb">
        <Link href="/admin/catalogo">Catálogo</Link>
      </p>

      <h1 className="page-title">{product.name}</h1>
      <p className="muted">
        {product.kind === "tour" ? "Tour" : "Estancia"} · /{product.slug}
        {product.status === "published" ? (
          <>
            {" · "}
            <Link
              href={`/es/${product.kind === "tour" ? "tours" : "estancias"}/${product.slug}`}
              target="_blank"
            >
              ver en el sitio
            </Link>
          </>
        ) : null}
      </p>

      <TranslationForm productId={product.id} locale="es" current={es ?? null} />
      <TranslationForm productId={product.id} locale="en" current={en ?? null} />

      <PhotoManager productId={product.id} media={product.media} />

      <DepositForm
        productId={product.id}
        current={product.depositPct}
        globalPct={globalPct}
      />

      {product.kind === "stay" ? (
        <p className="admin-card-actions">
          <Link className="btn btn-secondary" href={`/admin/catalogo/${product.id}/unidades`}>
            Unidades de estancia
          </Link>
          <Link className="btn btn-secondary" href={`/admin/catalogo/${product.id}/tarifas`}>
            Tarifas y temporadas
          </Link>
        </p>
      ) : null}

      {product.kind === "tour" ? (
        <p>
          <Link className="btn btn-secondary" href={`/admin/catalogo/${product.id}/opciones`}>
            Opciones y precios
          </Link>
        </p>
      ) : null}

      <PublishForm
        productId={product.id}
        status={product.status}
        hasSpanish={Boolean(es)}
        hasPhotos={product.media.length > 0}
      />
    </div>
  );
}
