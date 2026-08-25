"use client";

import { useActionState } from "react";

import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

import { startCheckout, type CheckoutState } from "./actions";

/**
 * Formulario del checkout.
 *
 * El estado del error viene del servidor: la validación que importa no puede
 * vivir en el navegador. Lo que el cliente aporta es no perder lo capturado
 * cuando algo falla, que es la diferencia entre corregir un dato y volver a
 * escribir todo.
 */
export function CheckoutForm({
  locale,
  hidden,
  paxSlots,
  depositLabel,
  holdMinutes,
  policyText,
}: {
  locale: Locale;
  hidden: Record<string, string>;
  paxSlots: { paxType: "adult" | "child" | "infant"; label: string }[];
  depositLabel: string;
  holdMinutes: number;
  policyText: string | null;
}) {
  const t = getMessages(locale);
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {
    error: null,
  });

  const errorMessage =
    state.error === null
      ? null
      : state.error === "missing"
        ? t.requiredField
        : state.error === "email"
          ? t.invalidEmail
          : state.error === "policy"
            ? t.mustAcceptPolicy
            : state.error === "AM001"
              ? t.errSoldOut(0)
              : state.error === "AM002"
                ? t.quoteUnavailable
                : state.error === "AM004"
                  ? t.couponRedeemedOut
                  : t.checkoutError;

  return (
    <form action={action} className="checkout-form">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="locale" value={locale} />

      {errorMessage ? (
        <p className="quote-warning" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <fieldset className="checkout-fieldset">
        <legend>{t.checkoutHolder}</legend>
        <div className="field">
          <label htmlFor="fullName">{t.fieldName}</label>
          <input id="fullName" name="fullName" type="text" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="email">{t.fieldEmail}</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="phone">{t.fieldPhone}</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" />
        </div>
      </fieldset>

      {paxSlots.length > 0 ? (
        <fieldset className="checkout-fieldset">
          <legend>{t.paxHeading}</legend>
          {paxSlots.map((slot, index) => (
            <div className="pax-row" key={index}>
              <input type="hidden" name="paxType" value={slot.paxType} />
              <div className="field">
                <label htmlFor={`paxName-${index}`}>
                  {slot.label} · {t.paxName}
                </label>
                <input id={`paxName-${index}`} name="paxName" type="text" />
              </div>
              {slot.paxType === "adult" ? (
                <input type="hidden" name="paxAge" value="" />
              ) : (
                <div className="field field-narrow">
                  <label htmlFor={`paxAge-${index}`}>{t.paxAge}</label>
                  <input
                    id={`paxAge-${index}`}
                    name="paxAge"
                    type="number"
                    min="0"
                    max="17"
                    inputMode="numeric"
                  />
                </div>
              )}
            </div>
          ))}
        </fieldset>
      ) : null}

      {policyText ? <p className="policy-text">{policyText}</p> : null}

      <label className="check">
        <input type="checkbox" name="acceptPolicy" />
        <span>{t.acceptPolicy}</span>
      </label>
      <label className="check">
        <input type="checkbox" name="acceptPrivacy" required />
        <span>{t.acceptPrivacy}</span>
      </label>

      <button className="btn btn-block" type="submit" disabled={pending}>
        {pending ? "…" : t.payDeposit(depositLabel)}
      </button>
      <p className="muted small">{t.holdNotice(holdMinutes)}</p>
    </form>
  );
}
