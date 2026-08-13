"use server";

import { redirect } from "next/navigation";

import { isLocale, productPath, type Locale, type ProductKind } from "@/i18n/config";
import { InventoryUnavailableError } from "@/modules/availability/holds";
import { createBookingWithHold, type BookingInput, type PaxInput } from "@/modules/booking/create";
import { paymentProvider } from "@/modules/payments";
import { QuoteError } from "@/modules/pricing/types";
import { absoluteUrl } from "@/site";

/**
 * Acción del checkout · S3-1 y S3-2
 *
 * Recibe el formulario, arma la reserva con su apartado y manda al huésped a
 * pagar. **De la selección solo se leen identificadores y fechas: ningún monto.**
 * El precio se vuelve a calcular en el servidor dentro de `createBookingWithHold`.
 *
 * Devuelve un mensaje de error en lugar de lanzar cuando el problema es del
 * huésped —fechas que se ocuparon, cupo agotado, datos incompletos— porque eso
 * no es una falla del sistema y la página tiene que seguir siendo usable.
 */

export type CheckoutState = { error: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function count(form: FormData, key: string): number {
  const parsed = Number.parseInt(text(form, key), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function startCheckout(
  _previous: CheckoutState,
  form: FormData,
): Promise<CheckoutState> {
  const rawLocale = text(form, "locale");
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";

  const fullName = text(form, "fullName");
  const email = text(form, "email");
  const phone = text(form, "phone") || null;
  const acceptedPolicy = form.get("acceptPolicy") === "on";

  if (!fullName || !email) return { error: "missing" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return { error: "email" };
  if (!acceptedPolicy) return { error: "policy" };

  const kind = text(form, "kind") as ProductKind;
  const productId = text(form, "productId");
  const slug = text(form, "slug");

  let input: BookingInput;
  if (kind === "stay") {
    const from = text(form, "from");
    const to = text(form, "to");
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return { error: "missing" };
    input = { kind: "stay", productId, range: { from, to }, guests: Math.max(1, count(form, "guests")) };
  } else {
    const departureId = text(form, "departure");
    if (!departureId) return { error: "missing" };
    input = {
      kind: "tour",
      productId,
      departureId,
      pax: {
        adult: Math.max(1, count(form, "adults")),
        child: count(form, "children"),
        infant: count(form, "infants"),
      },
    };
  }

  // Pax adicionales: el nombre y la edad de los menores (regla del SME: edad, no
  // documento). Llegan como campos repetidos del formulario.
  const pax: PaxInput[] = [];
  const names = form.getAll("paxName");
  const ages = form.getAll("paxAge");
  const types = form.getAll("paxType");
  for (const [index, name] of names.entries()) {
    if (typeof name !== "string" || !name.trim()) continue;
    const rawAge = ages[index];
    const parsedAge = typeof rawAge === "string" ? Number.parseInt(rawAge, 10) : Number.NaN;
    const rawType = types[index];
    pax.push({
      fullName: name.trim(),
      paxType: rawType === "child" ? "child" : rawType === "infant" ? "infant" : "adult",
      age: Number.isInteger(parsedAge) && parsedAge >= 0 && parsedAge < 120 ? parsedAge : null,
    });
  }

  let destination: string;
  try {
    const booking = await createBookingWithHold(input, {
      fullName,
      email,
      phone,
      locale,
      privacyVersion: process.env.PRIVACY_VERSION ?? "sin-version",
    }, pax);

    const session = await paymentProvider().createDepositSession({
      bookingId: booking.bookingId,
      bookingCode: booking.code,
      amountCents: booking.depositCents,
      currency: booking.currency,
      email,
      description: `Anticipo reserva ${booking.code}`,
      successUrl: absoluteUrl(`/${locale}/reserva/${booking.code}`),
      cancelUrl: absoluteUrl(productPath(locale, kind, slug)),
    });

    destination = session.url;
  } catch (error) {
    if (error instanceof InventoryUnavailableError) return { error: error.code };
    if (error instanceof QuoteError) return { error: error.code };
    throw error;
  }

  // El redirect va fuera del try: lanza una excepción de control que no se debe
  // atrapar como si fuera un fallo.
  redirect(destination);
}
