import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/**
 * Campo de cupón del checkout · S8
 *
 * Formulario GET, sin una línea de JavaScript, igual que `CatalogFilters`: al
 * enviarlo, el código queda en la URL de la propia página del checkout, que
 * vuelve a cotizar en el servidor con el código incluido. El huésped ve el
 * descuento (o por qué no aplicó) **antes** de escribir sus datos — nunca se
 * calcula nada en el navegador, ni siquiera un cupón.
 */
export function CouponForm({
  locale,
  hidden,
  current,
}: {
  locale: Locale;
  /** Un arreglo se pinta como campos repetidos: así viajan los extras. */
  hidden: Record<string, string | readonly string[]>;
  current: string;
}) {
  const t = getMessages(locale);

  return (
    <form className="filters" method="get" action={`/${locale}/checkout`}>
      {Object.entries(hidden).flatMap(([name, value]) =>
        Array.isArray(value)
          ? value.map((one, index) => (
              <input key={`${name}-${index}`} type="hidden" name={name} value={one} />
            ))
          : [<input key={name} type="hidden" name={name} value={value as string} />],
      )}
      <div className="filters-row">
        <div className="field field-wide">
          <label htmlFor="coupon">{t.couponLabel}</label>
          <input id="coupon" name="coupon" type="text" defaultValue={current} />
        </div>
        <button className="btn btn-secondary" type="submit">
          {t.couponApply}
        </button>
      </div>
    </form>
  );
}
