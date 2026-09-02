import { sql } from "drizzle-orm";

import { db } from "@/db/index";
import type { ImageVariants } from "@/components/responsive-image";
import type { Locale, ProductKind } from "@/i18n/config";
import { taxFactorFor } from "@/modules/pricing/service";

/**
 * Modelos de lectura del catálogo.
 *
 * Están escritos en SQL y no con el constructor de consultas porque son joins
 * sobre cinco tablas con agregados y subconsultas laterales; expresarlos con el
 * constructor los volvería ilegibles sin ganar seguridad de tipos real — la
 * forma de la fila se declara aquí de todos modos.
 *
 * Regla que atraviesa todo el módulo: solo se devuelve lo publicado. Un
 * borrador no aparece en listados y su ficha responde 404, aunque alguien tenga
 * la URL.
 */

export type CatalogFilters = {
  kind?: ProductKind;
  locationSlug?: string;
  guests?: number;
};

export type CatalogCard = {
  id: string;
  kind: ProductKind;
  slug: string;
  currency: string;
  name: string;
  summary: string | null;
  locationName: string | null;
  locationSlug: string | null;
  city: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
  coverVariants: ImageVariants | null;
  capacity: number | null;
  fromCents: number | null;
};

export async function listCatalog(
  locale: Locale,
  filters: CatalogFilters = {},
): Promise<CatalogCard[]> {
  const rows = await db.execute<{
    id: string;
    kind: ProductKind;
    slug: string;
    currency: string;
    name: string;
    summary: string | null;
    location_name: string | null;
    location_slug: string | null;
    city: string | null;
    cover_url: string | null;
    cover_width: number | null;
    cover_height: number | null;
    cover_variants: ImageVariants | null;
    cover_alt: string | null;
    capacity: number | null;
    from_cents: number | null;
  }>(sql`
    select
      p.id,
      p.kind,
      p.slug,
      p.currency,
      t.name,
      t.summary,
      l.name as location_name,
      l.slug as location_slug,
      l.city,
      cover.url as cover_url,
      cover.alt as cover_alt,
      cover.width as cover_width,
      cover.height as cover_height,
      cover.variants as cover_variants,
      cap.capacity::int as capacity,
      round(price.from_cents * tax.factor)::bigint as from_cents
    from products p
    join product_translations t
      on t.product_id = p.id and t.locale = ${locale}
    left join locations l on l.id = p.location_id
    left join lateral (
      select
        m.url, m.variants, m.width, m.height,
        case when ${locale} = 'en' then coalesce(m.alt_en, m.alt_es) else m.alt_es end as alt
      from product_media m
      where m.product_id = p.id
      order by m.position, m.created_at
      limit 1
    ) cover on true
    left join lateral (
      select case p.kind
        when 'stay' then (
          select max(su.max_guests) from stay_units su
           where su.product_id = p.id and su.active
        )
        else (
          select max(o.default_capacity) from tour_options o
           where o.product_id = p.id and o.active
        )
      end as capacity
    ) cap on true
    left join lateral (
      select case p.kind
        when 'stay' then (
          select min(sr.nightly_cents)
            from stay_rates sr
            join stay_rate_plans rp on rp.id = sr.rate_plan_id
            join stay_units su on su.id = rp.unit_id
           where su.product_id = p.id
             and su.active
             and rp.active
             and upper(sr.season) > current_date
        )
        else (
          select min(pp.price_cents)
            from tour_pax_prices pp
            join tour_options o on o.id = pp.tour_option_id
           where o.product_id = p.id
             and o.active
             and pp.pax_type = 'adult'
        )
      end as from_cents
    ) price on true
    -- Los precios que se exhiben al huésped incluyen impuestos: la ley obliga a
    -- exhibir el total, así que un "desde" neto sería un precio que nadie paga.
    left join lateral (
      select coalesce(1 + sum(t.rate) / 100, 1) as factor
        from tax_rates t
       where t.active
         and t.kind = 'percent'
         and not t.included_in_price
         and (t.applies_to is null or t.applies_to = p.kind)
         and (t.location_id is null or t.location_id = p.location_id)
         and (t.valid_from is null or t.valid_from <= current_date)
         and (t.valid_to is null or t.valid_to >= current_date)
    ) tax on true
    where p.status = 'published'
      and (${filters.kind ?? null}::product_kind is null or p.kind = ${filters.kind ?? null}::product_kind)
      and (${filters.locationSlug ?? null}::text is null or l.slug = ${filters.locationSlug ?? null}::text)
      and (${filters.guests ?? null}::int is null or cap.capacity >= ${filters.guests ?? null}::int)
    order by p.position, t.name
  `);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    currency: row.currency,
    name: row.name,
    summary: row.summary,
    locationName: row.location_name,
    locationSlug: row.location_slug,
    city: row.city,
    coverUrl: row.cover_url,
    coverAlt: row.cover_alt,
    coverWidth: row.cover_width === null ? null : Number(row.cover_width),
    coverHeight: row.cover_height === null ? null : Number(row.cover_height),
    coverVariants: row.cover_variants ?? null,
    capacity: row.capacity === null ? null : Number(row.capacity),
    fromCents: row.from_cents === null ? null : Number(row.from_cents),
  }));
}

export type LocationOption = { slug: string; name: string };

export async function listLocations(): Promise<LocationOption[]> {
  const rows = await db.execute<{ slug: string; name: string }>(sql`
    select distinct l.slug, l.name
      from locations l
      join products p on p.location_id = l.id and p.status = 'published'
     order by l.name
  `);
  return rows.map((row) => ({ slug: row.slug, name: row.name }));
}

export type MediaItem = {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  /** Anchos generados al subir. Vacío mientras el latido no los haya hecho. */
  variants: ImageVariants | null;
};

export type StayDetail = {
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  minNights: number;
  checkinTime: string;
  checkoutTime: string;
  cleaningFeeCents: number;
};

export type TourPrice = { paxType: "adult" | "child" | "infant"; priceCents: number };

export type TourItineraryStep = { timeLabel: string | null; title: string; description: string | null };

export type TourDetail = {
  durationMinutes: number | null;
  meetingPoint: string | null;
  capacity: number;
  prices: TourPrice[];
  itinerary: TourItineraryStep[];
};

export type ProductDetail = {
  id: string;
  kind: ProductKind;
  slug: string;
  currency: string;
  name: string;
  summary: string | null;
  description: string | null;
  highlights: string[];
  included: string[];
  excluded: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  locationName: string | null;
  city: string | null;
  state: string | null;
  timezone: string;
  media: MediaItem[];
  fromCents: number | null;
  hasTranslation: boolean;
  stay: StayDetail | null;
  tour: TourDetail | null;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Ficha completa. Devuelve null cuando el producto no existe, no está publicado
 * o no tiene traducción al idioma pedido — los tres casos terminan en 404,
 * porque mostrar contenido a medio traducir es peor que no mostrarlo.
 */
export async function getProductDetail(
  locale: Locale,
  kind: ProductKind,
  slug: string,
): Promise<ProductDetail | null> {
  const rows = await db.execute<{
    id: string;
    kind: ProductKind;
    slug: string;
    currency: string;
    name: string;
    summary: string | null;
    description: string | null;
    highlights: unknown;
    included: unknown;
    excluded: unknown;
    meta_title: string | null;
    meta_description: string | null;
    location_name: string | null;
    city: string | null;
    state: string | null;
    timezone: string;
  }>(sql`
    select
      p.id, p.kind, p.slug, p.currency,
      t.name, t.summary, t.description, t.highlights, t.included, t.excluded,
      t.meta_title, t.meta_description,
      l.name as location_name, l.city, l.state,
      coalesce(l.timezone, 'America/Cancun') as timezone
    from products p
    join product_translations t
      on t.product_id = p.id and t.locale = ${locale}
    left join locations l on l.id = p.location_id
    where p.status = 'published'
      and p.kind = ${kind}::product_kind
      and p.slug = ${slug}
    limit 1
  `);

  const product = rows[0];
  if (!product) return null;

  const media = await db.execute<{
    variants: ImageVariants | null;
    url: string;
    alt: string | null;
    width: number | null;
    height: number | null;
  }>(sql`
    select
      m.url, m.variants,
      case when ${locale} = 'en' then coalesce(m.alt_en, m.alt_es) else m.alt_es end as alt,
      m.width, m.height
    from product_media m
    where m.product_id = ${product.id}::uuid
    order by m.position, m.created_at
  `);

  let stay: StayDetail | null = null;
  let tour: TourDetail | null = null;
  let fromCents: number | null = null;

  if (kind === "stay") {
    const units = await db.execute<{
      max_guests: number;
      bedrooms: number;
      beds: number;
      bathrooms: string;
      min_nights: number;
      checkin_time: string;
      checkout_time: string;
      cleaning_fee_cents: string;
      from_cents: string | null;
    }>(sql`
      select
        su.max_guests, su.bedrooms, su.beds, su.bathrooms, su.min_nights,
        su.checkin_time, su.checkout_time, su.cleaning_fee_cents,
        (select min(sr.nightly_cents)
           from stay_rates sr
           join stay_rate_plans rp on rp.id = sr.rate_plan_id
          where rp.unit_id = su.id and rp.active and upper(sr.season) > current_date
        ) as from_cents
      from stay_units su
      where su.product_id = ${product.id}::uuid and su.active
      order by su.max_guests desc
      limit 1
    `);
    const unit = units[0];
    if (unit) {
      stay = {
        maxGuests: Number(unit.max_guests),
        bedrooms: Number(unit.bedrooms),
        beds: Number(unit.beds),
        bathrooms: Number(unit.bathrooms),
        minNights: Number(unit.min_nights),
        checkinTime: unit.checkin_time,
        checkoutTime: unit.checkout_time,
        cleaningFeeCents: Number(unit.cleaning_fee_cents),
      };
      fromCents = unit.from_cents === null ? null : Number(unit.from_cents);
    }
  } else {
    const options = await db.execute<{
      id: string;
      duration_minutes: number | null;
      meeting_point: string | null;
      default_capacity: number;
    }>(sql`
      select o.id, o.duration_minutes, o.meeting_point, o.default_capacity
        from tour_options o
       where o.product_id = ${product.id}::uuid and o.active
       order by o.default_capacity desc
       limit 1
    `);
    const option = options[0];
    if (option) {
      const prices = await db.execute<{ pax_type: TourPrice["paxType"]; price_cents: string }>(sql`
        select pp.pax_type, pp.price_cents
          from tour_pax_prices pp
         where pp.tour_option_id = ${option.id}::uuid
         order by pp.price_cents desc
      `);
      const itinerarySteps = await db.execute<{
        time_label: string | null;
        title: string;
        description: string | null;
      }>(sql`
        select s.time_label,
               case when ${locale} = 'en' then coalesce(s.title_en, s.title_es) else s.title_es end as title,
               case when ${locale} = 'en' then coalesce(s.description_en, s.description_es)
                    else s.description_es end as description
          from tour_itinerary_steps s
         where s.tour_option_id = ${option.id}::uuid
         order by s.position, s.created_at
      `);
      tour = {
        durationMinutes: option.duration_minutes === null ? null : Number(option.duration_minutes),
        meetingPoint: option.meeting_point,
        capacity: Number(option.default_capacity),
        prices: prices.map((row) => ({ paxType: row.pax_type, priceCents: Number(row.price_cents) })),
        itinerary: itinerarySteps.map((row) => ({
          timeLabel: row.time_label,
          title: row.title,
          description: row.description,
        })),
      };
      const adult = tour.prices.find((price) => price.paxType === "adult");
      fromCents = adult?.priceCents ?? null;
    }
  }

  // Igual que en el listado: el "desde" que se exhibe lleva impuestos.
  const taxFactor = await taxFactorFor(product.id);
  const fromCentsWithTax = fromCents === null ? null : Math.round(fromCents * taxFactor);

  return {
    id: product.id,
    kind: product.kind,
    slug: product.slug,
    currency: product.currency,
    name: product.name,
    summary: product.summary,
    description: product.description,
    highlights: asStringArray(product.highlights),
    included: asStringArray(product.included),
    excluded: asStringArray(product.excluded),
    metaTitle: product.meta_title,
    metaDescription: product.meta_description,
    locationName: product.location_name,
    city: product.city,
    state: product.state,
    timezone: product.timezone,
    media: media.map((row) => ({
      variants: row.variants ?? null,
      url: row.url,
      alt: row.alt,
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height),
    })),
    fromCents: fromCentsWithTax,
    hasTranslation: true,
    stay,
    tour,
  };
}

/** Rutas a pre-generar: todas las combinaciones publicadas de producto e idioma. */
export async function listPublishedSlugs(): Promise<
  { locale: Locale; kind: ProductKind; slug: string }[]
> {
  const rows = await db.execute<{ locale: Locale; kind: ProductKind; slug: string }>(sql`
    select t.locale, p.kind, p.slug
      from products p
      join product_translations t on t.product_id = p.id
     where p.status = 'published'
  `);
  return rows.map((row) => ({ locale: row.locale, kind: row.kind, slug: row.slug }));
}
