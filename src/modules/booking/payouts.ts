import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import { paymentProvider } from "@/modules/payments";
import { gatewayFeeCents, STRIPE_MX } from "@/modules/pricing/resale";

/**
 * Liquidación al proveedor · decisión 0026
 *
 * En un sitio que revende (decisión 0025) el turista paga todo a la cuenta del
 * sitio, y lo del proveedor sale a mano: Abraham le transfiere a Alexis, por
 * SPEI, el 100 % de su precio por cada reserva cobrada. Este módulo responde
 * las tres preguntas de esa transferencia:
 *
 *   - **cuánto** se le debe: `bookings.supplier_cents`, congelado al reservar;
 *   - **cuánto quedó de verdad** para el sitio: el cobro menos lo que se quedó
 *     la pasarela —leído del cargo, no supuesto— menos lo del proveedor;
 *   - **si ya se pagó**, cuándo, cómo, con qué referencia y quién lo registró.
 */

// ---------------------------------------------------------------------------
// Lo que cobró la pasarela de verdad
// ---------------------------------------------------------------------------

/**
 * Lee de la pasarela el país de la tarjeta y la comisión de los cobros de
 * reventa que todavía no los tienen.
 *
 * Corre en dos momentos: justo después de confirmar el pago (webhook), para
 * que el panel lo tenga al instante, y en cada latido, para lo que haya
 * fallado. Nunca dentro de la transacción que confirma: es una llamada de red,
 * y si la pasarela tarda, la reserva no debe esperarla ni caerse con ella.
 *
 * Sólo mira los últimos 30 días: un cargo que Stripe no asentó en un mes no lo
 * va a asentar en el siguiente latido, y reintentarlo para siempre es ruido.
 *
 * Lo que decide si se vuelve a leer es **la comisión**, no el país. Lo vio la
 * primera compra contra Stripe de verdad, el 2026-11-13 (AM-4ZFRYK): cuando
 * llega el webhook, el cargo ya trae su país, pero su registro contable todavía
 * no existe. El primer intento guardó el país y dejó la comisión en `null`.
 * Con el filtro anterior, «sin comisión **y** sin país», ese cobro nunca se
 * volvía a leer, y el panel lo habría enseñado como estimado para siempre.
 */
export async function captureChargeDetails(
  options: { bookingId?: string; limit?: number } = {},
): Promise<{ read: number; failed: number }> {
  const rows = await db.execute<{
    id: string;
    provider: string;
    provider_ref: string;
    amount_cents: string;
    currency: string;
  }>(sql`
    select p.id, p.provider, p.provider_ref, p.amount_cents::text, p.currency
      from payments p
      join bookings b on b.id = p.booking_id
     where b.supplier_cents is not null
       and p.status = 'succeeded'
       and p.provider_ref is not null
       and p.fee_cents is null
       and p.paid_at > now() - interval '30 days'
       ${options.bookingId ? sql`and p.booking_id = ${options.bookingId}::uuid` : sql``}
     order by p.paid_at
     limit ${options.limit ?? 20}
  `);

  let read = 0;
  let failed = 0;
  // Sin nada que leer no se construye la pasarela: en un sitio que no revende,
  // el latido no la toca.
  if (rows.length === 0) return { read, failed };
  const provider = paymentProvider();
  for (const row of rows) {
    // Un cobro de otra pasarela (el simulador en un sitio que ya cobra con
    // Stripe) no se le pregunta a ésta.
    if (row.provider !== provider.name) continue;
    try {
      const details = await provider.chargeDetails({
        providerRef: row.provider_ref,
        amountCents: Number(row.amount_cents),
        currency: row.currency,
      });
      await db.execute(sql`
        update payments
           set card_country = ${details.cardCountry},
               fee_cents = ${details.feeCents}::bigint,
               net_cents = ${details.netCents}::bigint
         where id = ${row.id}::uuid
      `);
      read++;
    } catch (error) {
      // Un cargo que no se pudo leer no detiene a los demás: se reintenta en el
      // siguiente latido.
      console.error(`liquidación: no se leyó el cargo del pago ${row.id}`, error);
      failed++;
    }
  }
  return { read, failed };
}

// ---------------------------------------------------------------------------
// La lista del panel
// ---------------------------------------------------------------------------

export type PayoutRow = {
  bookingId: string;
  bookingCode: string;
  guestName: string;
  tourName: string;
  /** Cuándo es el tour, en ISO. */
  startsAt: string | null;
  currency: string;
  /** Lo que pagó el turista: los cobros que entraron. */
  chargedCents: number;
  /** Lo que se le debe al proveedor por esta reserva. */
  supplierCents: number;
  /** Lo que se quedó la pasarela, leído del cargo. `null` si todavía no se lee. */
  feeCents: number | null;
  /** Cuando `feeCents` falta, el modelo con tarjeta extranjera: la peor para el margen. */
  estimatedFeeCents: number;
  cardCountry: string | null;
  /** El cobro fue del simulador, no de una pasarela: la comisión es un modelo. */
  simulated: boolean;
  /** Lo que queda para el sitio: cobro − pasarela − proveedor. */
  marginCents: number;
  /** El margen sale de la comisión real, no del modelo. */
  marginIsReal: boolean;
  payout: {
    amountCents: number;
    paidOn: string;
    method: string;
    reference: string;
    paidBy: string;
    notes: string | null;
  } | null;
};

/**
 * Las reservas de reventa ya cobradas, primero las que falta pagar.
 *
 * Una cancelada no aparece: lo que le toque al proveedor ahí depende de su
 * política y se resuelve aparte.
 */
export async function listPayouts(): Promise<PayoutRow[]> {
  const rows = await db.execute<{
    booking_id: string;
    code: string;
    guest_name: string;
    tour_name: string | null;
    starts_at: string | null;
    currency: string;
    charged_cents: string;
    supplier_cents: string;
    fee_cents: string | null;
    card_country: string | null;
    simulated: boolean;
    payout_amount: string | null;
    paid_on: string | null;
    method: string | null;
    reference: string | null;
    paid_by: string | null;
    notes: string | null;
  }>(sql`
    select b.id as booking_id, b.code, coalesce(c.full_name, 'sin nombre') as guest_name,
           pt.name as tour_name, d.starts_at::text as starts_at, b.currency,
           pay.charged_cents::text, b.supplier_cents::text,
           -- La comisión sólo cuenta si se leyó de TODOS los cobros: una suma a
           -- medias daría un margen inflado.
           case when pay.sin_leer = 0 then pay.fee_cents::text end as fee_cents,
           pay.card_country, pay.simulated,
           sp.amount_cents::text as payout_amount, sp.paid_on::text, sp.method::text,
           sp.reference, s.full_name as paid_by, sp.notes
      from bookings b
      join lateral (
        select sum(p.amount_cents) as charged_cents,
               sum(p.fee_cents) as fee_cents,
               count(*) filter (where p.fee_cents is null) as sin_leer,
               max(p.card_country) as card_country,
               bool_or(p.provider = 'local') as simulated
          from payments p
         where p.booking_id = b.id and p.status = 'succeeded'
      ) pay on pay.charged_cents is not null
      left join customers c on c.id = b.customer_id
      left join lateral (
        select bi.tour_departure_id, bi.product_id from booking_items bi
         where bi.booking_id = b.id order by bi.created_at limit 1
      ) bi on true
      left join tour_departures d on d.id = bi.tour_departure_id
      left join product_translations pt on pt.product_id = bi.product_id and pt.locale = 'es'
      left join supplier_payouts sp on sp.booking_id = b.id
      left join staff_users s on s.id = sp.paid_by
     where b.supplier_cents is not null
       and b.status in ('confirmed', 'in_progress', 'completed', 'no_show')
     order by (sp.id is not null), d.starts_at nulls last, b.created_at
  `);

  return rows.map((row) => {
    const charged = Number(row.charged_cents);
    const supplier = Number(row.supplier_cents);
    const fee = row.fee_cents === null ? null : Number(row.fee_cents);
    const estimated = gatewayFeeCents(charged, STRIPE_MX.extranjera);
    return {
      bookingId: row.booking_id,
      bookingCode: row.code,
      guestName: row.guest_name,
      tourName: row.tour_name ?? "Tour",
      startsAt: row.starts_at,
      currency: row.currency,
      chargedCents: charged,
      supplierCents: supplier,
      feeCents: fee,
      estimatedFeeCents: estimated,
      cardCountry: row.card_country,
      simulated: row.simulated,
      marginCents: charged - (fee ?? estimated) - supplier,
      marginIsReal: fee !== null && !row.simulated,
      payout:
        row.payout_amount === null
          ? null
          : {
              amountCents: Number(row.payout_amount),
              paidOn: row.paid_on!,
              method: row.method!,
              reference: row.reference!,
              paidBy: row.paid_by ?? "—",
              notes: row.notes,
            },
    };
  });
}

/** ¿Este sitio revende? El menú del panel sólo ofrece la liquidación si sí. */
export async function siteResells(): Promise<boolean> {
  const rows = await db.execute<{ si: boolean }>(sql`
    select exists (select 1 from settings where key = 'resale') as si
  `);
  return rows[0]?.si ?? false;
}

// ---------------------------------------------------------------------------
// Registrar la transferencia
// ---------------------------------------------------------------------------

/** Un error que sí se le puede contar a quien opera el panel. */
export class PayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutError";
  }
}

export type PayoutMethod = "spei" | "transfer" | "cash" | "other";

/**
 * Registra que ya se le transfirió al proveedor lo de una reserva.
 *
 * El monto no viaja: lo pone la base (`supplier_payout_record`), y es lo que se
 * congeló al reservar.
 */
export async function recordPayout(input: {
  bookingId: string;
  paidOn: string;
  method: PayoutMethod;
  reference: string;
  notes: string | null;
  staffId: string;
}): Promise<string> {
  try {
    const rows = await db.execute<{ id: string }>(sql`
      select supplier_payout_record(${input.bookingId}::uuid, ${input.paidOn}::date,
                                    ${input.method}::payment_method, ${input.reference},
                                    ${input.notes}, ${input.staffId}::uuid) as id
    `);
    return rows[0]!.id;
  } catch (error) {
    const pg = postgresError(error);
    if (pg?.code === "23505") throw new PayoutError("Esta reserva ya tiene su transferencia registrada.");
    if (pg?.code === "AM006") throw new PayoutError(pg.message);
    throw error;
  }
}

function postgresError(error: unknown): { code: string; message: string } | null {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current && typeof (current as { code: unknown }).code === "string") {
      const { code, message } = current as { code: string; message?: unknown };
      return { code, message: typeof message === "string" ? message : "" };
    }
    current = typeof current === "object" && "cause" in current ? (current as { cause: unknown }).cause : null;
  }
  return null;
}
