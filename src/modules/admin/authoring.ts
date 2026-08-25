import { sql } from "drizzle-orm";

import { db } from "@/db/index";

/**
 * Lecturas y escrituras del catálogo desde el panel · S6-1 a S6-5
 *
 * Todo lo que aquí se escribe pasa por `audit_record`. No es ceremonia: son
 * cambios que mueven dinero y que después nadie recuerda haber hecho. El día que
 * alguien pregunte por qué el anticipo bajó al 10% en temporada alta, la
 * respuesta tiene que estar escrita con nombre y fecha.
 *
 * Dos reglas que atraviesan el módulo:
 *
 * - **Publicar exige traducción.** Un producto sin nombre en un idioma responde
 *   404 en ese idioma desde el Sprint 1; publicarlo así es publicar una página
 *   rota. Se valida al publicar, no al guardar: se puede trabajar a medias.
 * - **Ningún cambio toca reservas ya tomadas.** El precio, el anticipo y la
 *   política se congelan al reservar. Aquí se edita lo que se le va a ofrecer al
 *   siguiente huésped, no lo que se le prometió al anterior.
 */

export type ProductRow = {
  id: string;
  kind: "tour" | "stay";
  slug: string;
  status: string;
  name: string;
  locationName: string | null;
  depositPct: number | null;
  currency: string;
  translations: string[];
  mediaCount: number;
};

export async function listProducts(): Promise<ProductRow[]> {
  const rows = await db.execute<{
    id: string;
    kind: "tour" | "stay";
    slug: string;
    status: string;
    name: string;
    location_name: string | null;
    deposit_pct: string | null;
    currency: string;
    translations: string[];
    media_count: number;
  }>(sql`
    select p.id, p.kind, p.slug, p.status::text as status,
           coalesce(nullif(t.name, ''), p.slug) as name,
           l.name as location_name,
           p.deposit_pct::text as deposit_pct,
           p.currency,
           coalesce(array_agg(distinct tr.locale) filter (where tr.locale is not null), '{}') as translations,
           (select count(*)::int from product_media m where m.product_id = p.id) as media_count
      from products p
      left join product_translations t on t.product_id = p.id and t.locale = 'es'
      left join product_translations tr on tr.product_id = p.id
      left join locations l on l.id = p.location_id
     group by p.id, t.name, l.name
     order by p.status, p.kind, name
  `);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    status: row.status,
    name: row.name,
    locationName: row.location_name,
    depositPct: row.deposit_pct === null ? null : Number(row.deposit_pct),
    currency: row.currency,
    translations: row.translations,
    mediaCount: Number(row.media_count),
  }));
}

export type Translation = {
  locale: string;
  name: string;
  summary: string | null;
  description: string | null;
};

export type MediaRow = {
  id: string;
  url: string;
  altEs: string | null;
  width: number | null;
  height: number | null;
  /** Falso mientras el latido no haya generado los anchos. */
  processed: boolean;
};

export type ProductDetail = ProductRow & {
  locationId: string | null;
  cancellationPolicyId: string | null;
  translations: string[];
  texts: Translation[];
  media: MediaRow[];
};

export async function productDetail(id: string): Promise<ProductDetail | null> {
  const rows = await db.execute<{
    id: string;
    kind: "tour" | "stay";
    slug: string;
    status: string;
    location_id: string | null;
    location_name: string | null;
    cancellation_policy_id: string | null;
    deposit_pct: string | null;
    currency: string;
  }>(sql`
    select p.id, p.kind, p.slug, p.status::text as status, p.location_id,
           l.name as location_name, p.cancellation_policy_id,
           p.deposit_pct::text as deposit_pct, p.currency
      from products p
      left join locations l on l.id = p.location_id
     where p.id = ${id}::uuid
  `);

  const row = rows[0];
  if (!row) return null;

  const texts = await db.execute<{
    locale: string;
    name: string;
    summary: string | null;
    description: string | null;
  }>(sql`
    select locale, name, summary, description
      from product_translations where product_id = ${id}::uuid
     order by locale
  `);

  const media = await db.execute<{
    id: string;
    url: string;
    alt_es: string | null;
    width: number | null;
    height: number | null;
    processed: boolean;
  }>(sql`
    select id, url, alt_es, width, height, variants <> '{}'::jsonb as processed
      from product_media where product_id = ${id}::uuid
     order by position, created_at
  `);

  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    status: row.status,
    name: texts.find((text) => text.locale === "es")?.name ?? row.slug,
    locationId: row.location_id,
    locationName: row.location_name,
    cancellationPolicyId: row.cancellation_policy_id,
    depositPct: row.deposit_pct === null ? null : Number(row.deposit_pct),
    currency: row.currency,
    translations: texts.map((text) => text.locale),
    mediaCount: media.length,
    texts: texts.map((text) => ({
      locale: text.locale,
      name: text.name,
      summary: text.summary,
      description: text.description,
    })),
    media: media.map((item) => ({
      id: item.id,
      url: item.url,
      altEs: item.alt_es,
      width: item.width === null ? null : Number(item.width),
      height: item.height === null ? null : Number(item.height),
      processed: item.processed,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------------

export type RateRow = {
  id: string;
  planId: string;
  unitLabel: string;
  name: string | null;
  from: string;
  to: string;
  dows: number[] | null;
  nightlyCents: number;
  minNights: number | null;
  priority: number;
};

export async function listRates(productId: string): Promise<RateRow[]> {
  const rows = await db.execute<{
    id: string;
    plan_id: string;
    unit_label: string;
    name: string | null;
    from: string;
    to: string;
    dows: number[] | null;
    nightly_cents: string;
    min_nights: number | null;
    priority: number;
  }>(sql`
    select r.id, p.id as plan_id, su.code as unit_label, r.name,
           lower(r.season)::text as from, upper(r.season)::text as to,
           r.dows, r.nightly_cents::text, r.min_nights, r.priority
      from stay_rates r
      join stay_rate_plans p on p.id = r.rate_plan_id
      join stay_units su on su.id = p.unit_id
     where su.product_id = ${productId}::uuid
     -- Mayor prioridad primero: es el orden en que gana una sobre otra, así que
     -- es el orden en que hay que leerlas para entender qué se cobra.
     order by su.code, r.priority desc, lower(r.season)
  `);

  return rows.map((row) => ({
    id: row.id,
    planId: row.plan_id,
    unitLabel: row.unit_label,
    name: row.name,
    from: row.from,
    to: row.to,
    dows: row.dows,
    nightlyCents: Number(row.nightly_cents),
    minNights: row.min_nights === null ? null : Number(row.min_nights),
    priority: Number(row.priority),
  }));
}

export type RatePlanOption = { id: string; label: string };

export async function listRatePlans(productId: string): Promise<RatePlanOption[]> {
  const rows = await db.execute<{ id: string; label: string }>(sql`
    select p.id, su.code || ' · ' || p.name as label
      from stay_rate_plans p
      join stay_units su on su.id = p.unit_id
     where su.product_id = ${productId}::uuid and p.active
     order by label
  `);
  return rows.map((row) => ({ id: row.id, label: row.label }));
}

// ---------------------------------------------------------------------------
// Cupones
// ---------------------------------------------------------------------------

export type CouponRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  currency: string | null;
  minTotalCents: number;
  maxRedemptions: number | null;
  redemptions: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
};

export async function listCoupons(): Promise<CouponRow[]> {
  const rows = await db.execute<{
    id: string;
    code: string;
    kind: "percent" | "fixed";
    value: string;
    currency: string | null;
    min_total_cents: string;
    max_redemptions: number | null;
    redemptions: number;
    valid_from: string | null;
    valid_to: string | null;
    active: boolean;
  }>(sql`
    select id, code, kind::text as kind, value::text, currency,
           min_total_cents::text, max_redemptions, redemptions,
           valid_from::text, valid_to::text, active
      from coupons
     order by active desc, code
  `);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    kind: row.kind,
    value: Number(row.value),
    currency: row.currency,
    minTotalCents: Number(row.min_total_cents),
    maxRedemptions: row.max_redemptions === null ? null : Number(row.max_redemptions),
    redemptions: Number(row.redemptions),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    active: row.active,
  }));
}

// ---------------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------------

export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const rows = await db.execute<{
    id: string;
    actor: string | null;
    action: string;
    entity: string;
    entity_id: string | null;
    before: unknown;
    after: unknown;
    created_at: string;
  }>(sql`
    select a.id::text, coalesce(u.full_name, a.actor_label, 'sistema') as actor,
           a.action, a.entity, a.entity_id, a.before, a.after, a.created_at::text
      from audit_log a
      left join staff_users u on u.id = a.actor_staff_id
     order by a.created_at desc, a.id desc
     limit ${limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    actor: row.actor ?? "sistema",
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    before: row.before,
    after: row.after,
    createdAt: row.created_at,
  }));
}

/** Porcentaje de anticipo por omisión, el que heredan los productos sin uno propio. */
export async function globalDepositPct(): Promise<number> {
  const rows = await db.execute<{ pct: string }>(sql`
    select coalesce((value -> 'default_pct')::text, '30') as pct
      from settings where key = 'deposit'
  `);
  return Number(rows[0]?.pct ?? 30);
}

export type LocationOption = { id: string; name: string };

export async function listLocations(): Promise<LocationOption[]> {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select id, name from locations order by name
  `);
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export type TourOptionRow = { id: string; label: string; productId: string };

export async function listTourOptions(): Promise<TourOptionRow[]> {
  const rows = await db.execute<{ id: string; label: string; product_id: string }>(sql`
    select o.id, coalesce(nullif(t.name, ''), pr.slug) || ' · ' || o.name_es as label,
           o.product_id
      from tour_options o
      join products pr on pr.id = o.product_id
      left join product_translations t on t.product_id = pr.id and t.locale = 'es'
     where o.active
     order by label
  `);
  return rows.map((row) => ({ id: row.id, label: row.label, productId: row.product_id }));
}

// ---------------------------------------------------------------------------
// S6-6 · Opciones de tour y precio por pasajero
// ---------------------------------------------------------------------------

export type TourOptionPaxPrice = {
  paxType: "adult" | "child" | "infant";
  priceCents: number;
  countsTowardCapacity: boolean;
};

export type TourOptionDetail = {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string | null;
  durationMinutes: number | null;
  meetingPoint: string | null;
  defaultCapacity: number;
  active: boolean;
  prices: TourOptionPaxPrice[];
};

/** Opciones de un tour concreto, con su precio por tipo de pasajero. A
    diferencia de `listTourOptions`, esta sí trae las inactivas: el panel del
    producto necesita verlas todas para poder reactivarlas. */
export async function listProductTourOptions(productId: string): Promise<TourOptionDetail[]> {
  const rows = await db.execute<{
    id: string;
    code: string;
    name_es: string;
    name_en: string | null;
    duration_minutes: number | null;
    meeting_point: string | null;
    default_capacity: number;
    active: boolean;
  }>(sql`
    select id, code, name_es, name_en, duration_minutes, meeting_point,
           default_capacity, active
      from tour_options
     where product_id = ${productId}::uuid
     order by active desc, code
  `);

  const prices = await db.execute<{
    tour_option_id: string;
    pax_type: "adult" | "child" | "infant";
    price_cents: string;
    counts_toward_capacity: boolean;
  }>(sql`
    select tp.tour_option_id, tp.pax_type::text as pax_type, tp.price_cents::text,
           tp.counts_toward_capacity
      from tour_pax_prices tp
      join tour_options o on o.id = tp.tour_option_id
     where o.product_id = ${productId}::uuid
  `);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    nameEs: row.name_es,
    nameEn: row.name_en,
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    meetingPoint: row.meeting_point,
    defaultCapacity: Number(row.default_capacity),
    active: row.active,
    prices: prices
      .filter((price) => price.tour_option_id === row.id)
      .map((price) => ({
        paxType: price.pax_type,
        priceCents: Number(price.price_cents),
        countsTowardCapacity: price.counts_toward_capacity,
      })),
  }));
}

// ---------------------------------------------------------------------------
// S8 · Unidades de estancia y sus planes de tarifa
// ---------------------------------------------------------------------------

export type StayRatePlanRow = { id: string; name: string; active: boolean; rateCount: number };

export type StayUnitDetail = {
  id: string;
  code: string;
  maxGuests: number;
  baseGuests: number;
  extraGuestFeeCents: number;
  cleaningFeeCents: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  minNights: number;
  checkinTime: string;
  checkoutTime: string;
  active: boolean;
  plans: StayRatePlanRow[];
};

/** Unidades de un producto tipo estancia, con sus planes de tarifa. Trae las
    inactivas también: hace falta poder reactivarlas desde el panel. */
export async function listProductStayUnits(productId: string): Promise<StayUnitDetail[]> {
  const rows = await db.execute<{
    id: string;
    code: string;
    max_guests: number;
    base_guests: number;
    extra_guest_fee_cents: string;
    cleaning_fee_cents: string;
    bedrooms: number;
    beds: number;
    bathrooms: string;
    min_nights: number;
    checkin_time: string;
    checkout_time: string;
    active: boolean;
  }>(sql`
    select id, code, max_guests, base_guests, extra_guest_fee_cents::text as extra_guest_fee_cents,
           cleaning_fee_cents::text as cleaning_fee_cents, bedrooms, beds, bathrooms::text as bathrooms,
           min_nights, checkin_time::text as checkin_time, checkout_time::text as checkout_time, active
      from stay_units
     where product_id = ${productId}::uuid
     order by active desc, code
  `);

  const plans = await db.execute<{
    id: string;
    unit_id: string;
    name: string;
    active: boolean;
    rate_count: number;
  }>(sql`
    select p.id, p.unit_id, p.name, p.active,
           (select count(*)::int from stay_rates r where r.rate_plan_id = p.id) as rate_count
      from stay_rate_plans p
      join stay_units su on su.id = p.unit_id
     where su.product_id = ${productId}::uuid
     order by p.name
  `);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    maxGuests: Number(row.max_guests),
    baseGuests: Number(row.base_guests),
    extraGuestFeeCents: Number(row.extra_guest_fee_cents),
    cleaningFeeCents: Number(row.cleaning_fee_cents),
    bedrooms: Number(row.bedrooms),
    beds: Number(row.beds),
    bathrooms: Number(row.bathrooms),
    minNights: Number(row.min_nights),
    checkinTime: row.checkin_time,
    checkoutTime: row.checkout_time,
    active: row.active,
    plans: plans
      .filter((plan) => plan.unit_id === row.id)
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        active: plan.active,
        rateCount: Number(plan.rate_count),
      })),
  }));
}
