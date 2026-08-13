import { sql } from "drizzle-orm";

import { db, toDateRangeLiteral, type DateRange } from "@/db/index";
import { rethrowDomainError } from "@/modules/availability/holds";
import { freezeQuoteLabels } from "@/modules/pricing/labels";
import { quoteStay, quoteTour } from "@/modules/pricing/service";
import type { PaxCounts, Quote } from "@/modules/pricing/types";
import type { Locale } from "@/i18n/config";

/**
 * Creación de la reserva con apartado · S3-1 y S3-2
 *
 * Todo ocurre en una transacción: reserva, renglón, pax y apartado del
 * inventario entran juntos o no entran. Si el apartado falla porque las fechas
 * acaban de ocuparse, no queda una reserva a medias esperando un pago que no
 * debería poder hacerse.
 *
 * **El precio se recalcula aquí, en el servidor, y se ignora cualquier monto que
 * venga del navegador.** Entre la cotización que vio el huésped y el momento del
 * pago pueden pasar minutos: el único número en el que se puede confiar es el que
 * el servidor acaba de calcular.
 */

export type HolderInput = {
  fullName: string;
  email: string;
  phone: string | null;
  locale: Locale;
  privacyVersion: string;
};

export type PaxInput = {
  fullName: string;
  paxType: "adult" | "child" | "infant";
  /** Solo para menores: se pide edad, no documento (regla del SME). */
  age: number | null;
};

export type StayBookingInput = {
  kind: "stay";
  productId: string;
  range: DateRange;
  guests: number;
};

export type TourBookingInput = {
  kind: "tour";
  productId: string;
  departureId: string;
  pax: PaxCounts;
};

export type BookingInput = StayBookingInput | TourBookingInput;

export type CreatedBooking = {
  bookingId: string;
  code: string;
  quote: Quote;
  depositCents: number;
  currency: string;
  depositDueAt: string;
};

async function holdMinutes(): Promise<number> {
  const rows = await db.execute<{ minutes: number | null }>(sql`
    select (value -> 'hold_minutes')::int as minutes from settings where key = 'checkout'
  `);
  return rows[0]?.minutes ?? 15;
}

/** Política vigente del producto, para congelarla en la reserva. */
async function policyFor(productId: string): Promise<{ id: string | null; snapshot: unknown }> {
  const rows = await db.execute<{
    id: string | null;
    name: string | null;
    rules: unknown;
    deposit_refundable: boolean | null;
    text_es: string | null;
    text_en: string | null;
  }>(sql`
    select c.id, c.name, c.rules, c.deposit_refundable, c.text_es, c.text_en
      from products p
      left join cancellation_policies c on c.id = p.cancellation_policy_id
     where p.id = ${productId}::uuid
  `);

  const row = rows[0];
  if (!row?.id) return { id: null, snapshot: null };

  return {
    id: row.id,
    // Copia congelada: si el cliente edita la política mañana, lo que el huésped
    // aceptó hoy no cambia. Es el texto que se le puede mostrar en un reclamo.
    snapshot: {
      policy_id: row.id,
      name: row.name,
      rules: row.rules,
      deposit_refundable: row.deposit_refundable,
      text_es: row.text_es,
      text_en: row.text_en,
      accepted_at: new Date().toISOString(),
    },
  };
}

export async function createBookingWithHold(
  input: BookingInput,
  holder: HolderInput,
  pax: PaxInput[],
): Promise<CreatedBooking> {
  // Se cotiza antes de abrir la transacción: es solo lectura, y el apartado que
  // viene después es lo que garantiza que el inventario siga disponible.
  let quote: Quote;
  let unitId: string | null = null;
  let seatsNeeded = 0;

  if (input.kind === "stay") {
    const quoted = await quoteStay(input.productId, input.range, input.guests);
    quote = quoted.quote;
    unitId = quoted.unitId;
  } else {
    const quoted = await quoteTour(input.productId, input.departureId, input.pax);
    quote = quoted.quote;
    // Los lugares que ocupa el grupo los decide el motor de precios, que ya
    // consultó `counts_toward_capacity`. Aquí no se recalcula.
    seatsNeeded = quoted.seatsNeeded;
  }

  const ttl = await holdMinutes();
  const policy = await policyFor(input.productId);
  const frozen = freezeQuoteLabels(quote, holder.locale);

  try {
    return await db.transaction(async (tx) => {
      // Un huésped que vuelve no genera un cliente nuevo, pero tampoco se le
      // sobreescribe el nombre con el que ya estaba.
      const customers = await tx.execute<{ id: string }>(sql`
        insert into customers (full_name, email, phone, locale, privacy_accepted_at, privacy_version)
        values (${holder.fullName}, ${holder.email}, ${holder.phone}, ${holder.locale},
                now(), ${holder.privacyVersion})
        on conflict (lower(email)) where email is not null
        do update set phone = coalesce(excluded.phone, customers.phone),
                      locale = excluded.locale,
                      privacy_accepted_at = now(),
                      privacy_version = excluded.privacy_version
        returning id
      `);
      const customerId = customers[0]!.id;

      const bookings = await tx.execute<{ id: string; code: string; deposit_due_at: string }>(sql`
        insert into bookings (customer_id, status, currency, total_cents, deposit_pct,
                              deposit_cents, quote, cancellation_policy_id,
                              cancellation_policy_snapshot, deposit_due_at, locale, source)
        values (${customerId}::uuid, 'hold', ${quote.currency}, ${quote.total_cents},
                ${quote.deposit_pct}, ${quote.deposit_cents}, ${JSON.stringify(frozen)}::jsonb,
                ${policy.id}::uuid, ${policy.snapshot ? JSON.stringify(policy.snapshot) : null}::jsonb,
                now() + make_interval(mins => ${ttl}), ${holder.locale}, 'web')
        returning id, code, deposit_due_at
      `);
      const booking = bookings[0]!;

      const items = await tx.execute<{ id: string }>(sql`
        insert into booking_items (booking_id, kind, product_id, stay_unit_id, stay_range, guests,
                                   tour_departure_id, seats, pax_breakdown, subtotal_cents, quote)
        values (
          ${booking.id}::uuid,
          ${input.kind}::product_kind,
          ${input.productId}::uuid,
          ${unitId}::uuid,
          ${input.kind === "stay" ? toDateRangeLiteral(input.range) : null}::daterange,
          ${input.kind === "stay" ? input.guests : null}::int,
          ${input.kind === "tour" ? input.departureId : null}::uuid,
          ${input.kind === "tour" ? seatsNeeded : null}::int,
          ${input.kind === "tour" ? JSON.stringify(input.pax) : null}::jsonb,
          ${quote.total_cents},
          ${JSON.stringify(frozen)}::jsonb
        )
        returning id
      `);
      const itemId = items[0]!.id;

      // El titular es un pax con bandera; así el manifiesto del guía sale de una
      // sola tabla (regla del SME, C4).
      await tx.execute(sql`
        insert into booking_guests (booking_id, booking_item_id, is_lead, full_name, pax_type, email, phone)
        values (${booking.id}::uuid, ${itemId}::uuid, true, ${holder.fullName}, 'adult',
                ${holder.email}, ${holder.phone})
      `);

      for (const person of pax) {
        await tx.execute(sql`
          insert into booking_guests (booking_id, booking_item_id, is_lead, full_name, pax_type, birthdate)
          values (${booking.id}::uuid, ${itemId}::uuid, false, ${person.fullName},
                  ${person.paxType}::pax_type,
                  ${person.age === null ? null : sql`(current_date - make_interval(years => ${person.age}))::date`})
        `);
      }

      // El apartado va en la misma transacción que la reserva. Si revienta por
      // traslape o cupo, no queda nada escrito.
      if (input.kind === "stay") {
        await tx.execute(sql`
          select stay_hold_create(${unitId}::uuid,
                                  ${toDateRangeLiteral(input.range)}::daterange,
                                  ${itemId}::uuid,
                                  make_interval(mins => ${ttl}))
        `);
      } else {
        await tx.execute(sql`
          select tour_hold_create(${input.departureId}::uuid, ${seatsNeeded},
                                  ${itemId}::uuid, make_interval(mins => ${ttl}))
        `);
      }

      await tx.execute(sql`
        insert into booking_events (booking_id, type, payload, actor_type)
        values (${booking.id}::uuid, 'hold.created',
                -- Los casts son necesarios: jsonb_build_object no puede inferir
                -- el tipo de un parámetro y Postgres se niega a adivinar.
                jsonb_build_object('deposit_cents', ${quote.deposit_cents}::bigint,
                                   'expires_in_minutes', ${ttl}::int),
                'guest')
      `);

      return {
        bookingId: booking.id,
        code: booking.code,
        quote,
        depositCents: quote.deposit_cents,
        currency: quote.currency,
        depositDueAt: booking.deposit_due_at,
      };
    });
  } catch (error) {
    rethrowDomainError(error);
  }
}
