import { pgTable, text, timestamp, index, foreignKey, check, uuid, unique, integer, char, bigint, numeric, jsonb, uniqueIndex, boolean, bigserial, inet, date, time, smallint, primaryKey, pgView, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { daterange } from "../types"

export const blockReason = pgEnum("block_reason", ['hold', 'booking', 'maintenance', 'owner_use', 'other'])
export const bookingStatus = pgEnum("booking_status", ['hold', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired', 'no_show'])
export const couponKind = pgEnum("coupon_kind", ['percent', 'fixed'])
export const departureStatus = pgEnum("departure_status", ['open', 'closed', 'cancelled'])
export const notificationChannel = pgEnum("notification_channel", ['email', 'whatsapp', 'sms'])
export const notificationStatus = pgEnum("notification_status", ['pending', 'sending', 'sent', 'failed', 'dead'])
export const paxType = pgEnum("pax_type", ['adult', 'child', 'infant'])
export const paymentMethod = pgEnum("payment_method", ['card', 'cash', 'transfer', 'oxxo', 'spei', 'other'])
export const paymentPurpose = pgEnum("payment_purpose", ['deposit', 'balance', 'penalty'])
export const paymentStatus = pgEnum("payment_status", ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'])
export const productKind = pgEnum("product_kind", ['tour', 'stay'])
export const productStatus = pgEnum("product_status", ['draft', 'published', 'archived'])
export const staffRole = pgEnum("staff_role", ['owner', 'manager', 'front_desk', 'guide'])
export const taxKind = pgEnum("tax_kind", ['percent', 'fixed_per_night', 'fixed_per_pax'])


export const schemaMigrations = pgTable("schema_migrations", {
	filename: text().primaryKey().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const stayBlocks = pgTable("stay_blocks", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: uuid("unit_id").notNull(),
	stay: daterange("stay").notNull(),
	reason: blockReason().notNull(),
	bookingItemId: uuid("booking_item_id"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	releasedAt: timestamp("released_at", { withTimezone: true, mode: 'string' }),
	note: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("stay_blocks_expiry_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((reason = 'hold'::block_reason) AND (released_at IS NULL))`),
	index("stay_blocks_unit_idx").using("btree", table.unitId.asc().nullsLast().op("uuid_ops")).where(sql`(released_at IS NULL)`),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [stayUnits.id],
			name: "stay_blocks_unit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [staffUsers.id],
			name: "stay_blocks_created_by_fkey"
		}),
	foreignKey({
			columns: [table.bookingItemId],
			foreignColumns: [bookingItems.id],
			name: "stay_blocks_booking_item_fk"
		}).onDelete("set null"),
	check("stay_blocks_not_empty", sql`NOT isempty(stay)`),
	check("stay_blocks_hold_has_expiry", sql`((reason = 'hold'::block_reason) AND (expires_at IS NOT NULL)) OR ((reason <> 'hold'::block_reason) AND (expires_at IS NULL))`),
]);

export const tourDepartures = pgTable("tour_departures", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tourOptionId: uuid("tour_option_id").notNull(),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }),
	capacity: integer().notNull(),
	seatsTaken: integer("seats_taken").default(0).notNull(),
	status: departureStatus().default('open').notNull(),
	guideStaffId: uuid("guide_staff_id"),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("tour_departures_calendar_idx").using("btree", table.tourOptionId.asc().nullsLast().op("timestamptz_ops"), table.startsAt.asc().nullsLast().op("uuid_ops")).where(sql`(status = 'open'::departure_status)`),
	foreignKey({
			columns: [table.tourOptionId],
			foreignColumns: [tourOptions.id],
			name: "tour_departures_tour_option_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.guideStaffId],
			foreignColumns: [staffUsers.id],
			name: "tour_departures_guide_staff_id_fkey"
		}),
	unique("tour_departures_tour_option_id_starts_at_key").on(table.tourOptionId, table.startsAt),
	check("tour_departures_capacity_check", sql`capacity > 0`),
	check("tour_departures_seats_taken_check", sql`seats_taken >= 0`),
	check("tour_departures_capacity_not_exceeded", sql`seats_taken <= capacity`),
]);

export const tourSeatHolds = pgTable("tour_seat_holds", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	departureId: uuid("departure_id").notNull(),
	bookingItemId: uuid("booking_item_id"),
	seats: integer().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
	releasedAt: timestamp("released_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("tour_seat_holds_departure_idx").using("btree", table.departureId.asc().nullsLast().op("uuid_ops")).where(sql`(released_at IS NULL)`),
	index("tour_seat_holds_expiry_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`((confirmed_at IS NULL) AND (released_at IS NULL))`),
	foreignKey({
			columns: [table.departureId],
			foreignColumns: [tourDepartures.id],
			name: "tour_seat_holds_departure_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookingItemId],
			foreignColumns: [bookingItems.id],
			name: "tour_seat_holds_booking_item_fk"
		}).onDelete("set null"),
	check("tour_seat_holds_seats_check", sql`seats > 0`),
	check("tour_seat_holds_state_ok", sql`((confirmed_at IS NULL) AND (expires_at IS NOT NULL)) OR ((confirmed_at IS NOT NULL) AND (expires_at IS NULL)) OR (released_at IS NOT NULL)`),
]);

export const bookings = pgTable("bookings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().default(sql`generate_booking_code()`).notNull(),
	customerId: uuid("customer_id").notNull(),
	status: bookingStatus().default('hold').notNull(),
	currency: char({ length: 3 }).default('MXN').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalCents: bigint("total_cents", { mode: "number" }).notNull(),
	depositPct: numeric("deposit_pct", { precision: 5, scale:  2 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	depositCents: bigint("deposit_cents", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	balanceCents: bigint("balance_cents", { mode: "number" }).generatedAlwaysAs(sql`(total_cents - deposit_cents)`),
	quote: jsonb().notNull(),
	fxRate: numeric("fx_rate", { precision: 12, scale:  6 }),
	fxBase: char("fx_base", { length: 3 }),
	cancellationPolicyId: uuid("cancellation_policy_id"),
	cancellationPolicySnapshot: jsonb("cancellation_policy_snapshot"),
	depositDueAt: timestamp("deposit_due_at", { withTimezone: true, mode: 'string' }),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: 'string' }),
	cancelReason: text("cancel_reason"),
	source: text().default('web').notNull(),
	locale: text().default('es').notNull(),
	guestNote: text("guest_note"),
	staffNote: text("staff_note"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	couponId: uuid("coupon_id"),
	couponCode: text("coupon_code"),
}, (table) => [
	index("bookings_customer_idx").using("btree", table.customerId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("uuid_ops")),
	index("bookings_expiring_idx").using("btree", table.depositDueAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = 'hold'::booking_status)`),
	index("bookings_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops"), table.createdAt.desc().nullsFirst().op("enum_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "bookings_customer_id_fkey"
		}),
	foreignKey({
			columns: [table.cancellationPolicyId],
			foreignColumns: [cancellationPolicies.id],
			name: "bookings_cancellation_policy_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [staffUsers.id],
			name: "bookings_created_by_fkey"
		}),
	foreignKey({
			columns: [table.couponId],
			foreignColumns: [coupons.id],
			name: "bookings_coupon_id_fkey"
		}),
	unique("bookings_code_key").on(table.code),
	check("bookings_total_cents_check", sql`total_cents >= 0`),
	check("bookings_deposit_pct_check", sql`(deposit_pct >= (0)::numeric) AND (deposit_pct <= (100)::numeric)`),
	check("bookings_deposit_cents_check", sql`deposit_cents >= 0`),
	check("bookings_deposit_within_total", sql`deposit_cents <= total_cents`),
	check("bookings_hold_has_due_date", sql`(status <> 'hold'::booking_status) OR (deposit_due_at IS NOT NULL)`),
]);

export const customers = pgTable("customers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text(),
	phone: text(),
	fullName: text("full_name").notNull(),
	locale: text().default('es').notNull(),
	country: char({ length: 2 }),
	marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
	privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true, mode: 'string' }),
	privacyVersion: text("privacy_version"),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("customers_email_key").using("btree", sql`lower(email)`).where(sql`(email IS NOT NULL)`),
	index("customers_phone_idx").using("btree", table.phone.asc().nullsLast().op("text_ops")).where(sql`(phone IS NOT NULL)`),
	check("customers_locale_check", sql`locale = ANY (ARRAY['es'::text, 'en'::text])`),
]);

export const settings = pgTable("settings", {
	key: text().primaryKey().notNull(),
	value: jsonb().notNull(),
	description: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedBy: uuid("updated_by"),
});

export const staffUsers = pgTable("staff_users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	authUserId: uuid("auth_user_id"),
	email: text().notNull(),
	fullName: text("full_name").notNull(),
	role: staffRole().default('front_desk').notNull(),
	active: boolean().default(true).notNull(),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("staff_users_email_key").using("btree", sql`lower(email)`),
	unique("staff_users_auth_user_id_key").on(table.authUserId),
]);

export const auditLog = pgTable("audit_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	actorStaffId: uuid("actor_staff_id"),
	actorLabel: text("actor_label"),
	action: text().notNull(),
	entity: text().notNull(),
	entityId: text("entity_id"),
	before: jsonb(),
	after: jsonb(),
	ip: inet(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("audit_log_entity_idx").using("btree", table.entity.asc().nullsLast().op("timestamptz_ops"), table.entityId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	foreignKey({
			columns: [table.actorStaffId],
			foreignColumns: [staffUsers.id],
			name: "audit_log_actor_staff_id_fkey"
		}),
]);

export const locations = pgTable("locations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	city: text(),
	state: text(),
	country: char({ length: 2 }).default('MX').notNull(),
	lat: numeric({ precision: 9, scale:  6 }),
	lng: numeric({ precision: 9, scale:  6 }),
	timezone: text().default('America/Cancun').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("locations_slug_key").on(table.slug),
]);

export const cancellationPolicies = pgTable("cancellation_policies", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	rules: jsonb().default([]).notNull(),
	depositRefundable: boolean("deposit_refundable").default(false).notNull(),
	textEs: text("text_es"),
	textEn: text("text_en"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const taxRates = pgTable("tax_rates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	kind: taxKind().default('percent').notNull(),
	rate: numeric({ precision: 8, scale:  4 }).notNull(),
	appliesTo: productKind("applies_to"),
	locationId: uuid("location_id"),
	includedInPrice: boolean("included_in_price").default(false).notNull(),
	active: boolean().default(true).notNull(),
	validFrom: date("valid_from"),
	validTo: date("valid_to"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "tax_rates_location_id_fkey"
		}).onDelete("cascade"),
	check("tax_rates_rate_check", sql`rate >= (0)::numeric`),
]);

export const products = pgTable("products", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	kind: productKind().notNull(),
	slug: text().notNull(),
	status: productStatus().default('draft').notNull(),
	locationId: uuid("location_id"),
	cancellationPolicyId: uuid("cancellation_policy_id"),
	currency: char({ length: 3 }).default('MXN').notNull(),
	depositPct: numeric("deposit_pct", { precision: 5, scale:  2 }),
	position: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("products_kind_status_idx").using("btree", table.kind.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "products_location_id_fkey"
		}),
	foreignKey({
			columns: [table.cancellationPolicyId],
			foreignColumns: [cancellationPolicies.id],
			name: "products_cancellation_policy_id_fkey"
		}),
	unique("products_slug_key").on(table.slug),
	check("products_deposit_pct_check", sql`(deposit_pct >= (0)::numeric) AND (deposit_pct <= (100)::numeric)`),
]);

export const tags = pgTable("tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	slug: text().notNull(),
	nameEs: text("name_es").notNull(),
	nameEn: text("name_en"),
}, (table) => [
	unique("tags_slug_key").on(table.slug),
]);

export const tourOptions = pgTable("tour_options", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	code: text().notNull(),
	nameEs: text("name_es").notNull(),
	nameEn: text("name_en"),
	durationMinutes: integer("duration_minutes"),
	meetingPoint: text("meeting_point"),
	defaultCapacity: integer("default_capacity").notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "tour_options_product_id_fkey"
		}).onDelete("cascade"),
	unique("tour_options_product_id_code_key").on(table.productId, table.code),
	check("tour_options_duration_minutes_check", sql`duration_minutes > 0`),
	check("tour_options_default_capacity_check", sql`default_capacity > 0`),
]);

export const tourPaxPrices = pgTable("tour_pax_prices", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tourOptionId: uuid("tour_option_id").notNull(),
	paxType: paxType("pax_type").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	priceCents: bigint("price_cents", { mode: "number" }).notNull(),
	minAge: integer("min_age"),
	maxAge: integer("max_age"),
	countsTowardCapacity: boolean("counts_toward_capacity").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tourOptionId],
			foreignColumns: [tourOptions.id],
			name: "tour_pax_prices_tour_option_id_fkey"
		}).onDelete("cascade"),
	unique("tour_pax_prices_tour_option_id_pax_type_key").on(table.tourOptionId, table.paxType),
	check("tour_pax_prices_price_cents_check", sql`price_cents >= 0`),
]);

export const productMedia = pgTable("product_media", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	url: text().notNull(),
	kind: text().default('image').notNull(),
	altEs: text("alt_es"),
	altEn: text("alt_en"),
	width: integer(),
	height: integer(),
	position: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	variants: jsonb().default({}).notNull(),
	originalUrl: text("original_url"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	bytes: bigint({ mode: "number" }),
	uploadedBy: uuid("uploaded_by"),
}, (table) => [
	index("product_media_product_idx").using("btree", table.productId.asc().nullsLast().op("int4_ops"), table.position.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_media_product_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [staffUsers.id],
			name: "product_media_uploaded_by_fkey"
		}),
]);

export const stayUnits = pgTable("stay_units", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	code: text().notNull(),
	maxGuests: integer("max_guests").notNull(),
	baseGuests: integer("base_guests").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	extraGuestFeeCents: bigint("extra_guest_fee_cents", { mode: "number" }).default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	cleaningFeeCents: bigint("cleaning_fee_cents", { mode: "number" }).default(0).notNull(),
	bedrooms: integer().default(1).notNull(),
	beds: integer().default(1).notNull(),
	bathrooms: numeric({ precision: 3, scale:  1 }).default('1').notNull(),
	minNights: integer("min_nights").default(1).notNull(),
	checkinTime: time("checkin_time").default('15:00:00').notNull(),
	checkoutTime: time("checkout_time").default('11:00:00').notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "stay_units_product_id_fkey"
		}).onDelete("cascade"),
	unique("stay_units_product_id_code_key").on(table.productId, table.code),
	check("stay_units_max_guests_check", sql`max_guests > 0`),
	check("stay_units_base_guests_check", sql`base_guests > 0`),
	check("stay_units_extra_guest_fee_cents_check", sql`extra_guest_fee_cents >= 0`),
	check("stay_units_cleaning_fee_cents_check", sql`cleaning_fee_cents >= 0`),
	check("stay_units_min_nights_check", sql`min_nights > 0`),
	check("stay_units_guests_ok", sql`base_guests <= max_guests`),
]);

export const stayRatePlans = pgTable("stay_rate_plans", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	unitId: uuid("unit_id").notNull(),
	name: text().notNull(),
	currency: char({ length: 3 }).default('MXN').notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [stayUnits.id],
			name: "stay_rate_plans_unit_id_fkey"
		}).onDelete("cascade"),
]);

export const stayRates = pgTable("stay_rates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ratePlanId: uuid("rate_plan_id").notNull(),
	name: text(),
	season: daterange("season").notNull(),
	dows: smallint().array(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nightlyCents: bigint("nightly_cents", { mode: "number" }).notNull(),
	minNights: integer("min_nights"),
	closedToArrival: boolean("closed_to_arrival").default(false).notNull(),
	closedToDeparture: boolean("closed_to_departure").default(false).notNull(),
	priority: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("stay_rates_lookup_idx").using("gist", table.ratePlanId.asc().nullsLast().op("range_ops"), table.season.asc().nullsLast().op("range_ops")),
	foreignKey({
			columns: [table.ratePlanId],
			foreignColumns: [stayRatePlans.id],
			name: "stay_rates_rate_plan_id_fkey"
		}).onDelete("cascade"),
	check("stay_rates_nightly_cents_check", sql`nightly_cents >= 0`),
	check("stay_rates_min_nights_check", sql`min_nights > 0`),
	check("stay_rates_season_not_empty", sql`NOT isempty(season)`),
	check("stay_rates_dows_valid", sql`(dows IS NULL) OR (((array_length(dows, 1) >= 1) AND (array_length(dows, 1) <= 7)) AND (dows <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))`),
]);

export const bookingItems = pgTable("booking_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bookingId: uuid("booking_id").notNull(),
	kind: productKind().notNull(),
	productId: uuid("product_id").notNull(),
	stayUnitId: uuid("stay_unit_id"),
	stayRange: daterange("stay_range"),
	guests: integer(),
	tourDepartureId: uuid("tour_departure_id"),
	seats: integer(),
	paxBreakdown: jsonb("pax_breakdown"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
	quote: jsonb().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("booking_items_booking_idx").using("btree", table.bookingId.asc().nullsLast().op("uuid_ops")),
	index("booking_items_departure_idx").using("btree", table.tourDepartureId.asc().nullsLast().op("uuid_ops")).where(sql`(tour_departure_id IS NOT NULL)`),
	index("booking_items_stay_idx").using("btree", table.stayUnitId.asc().nullsLast().op("uuid_ops")).where(sql`(stay_unit_id IS NOT NULL)`),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "booking_items_booking_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "booking_items_product_id_fkey"
		}),
	foreignKey({
			columns: [table.stayUnitId],
			foreignColumns: [stayUnits.id],
			name: "booking_items_stay_unit_id_fkey"
		}),
	foreignKey({
			columns: [table.tourDepartureId],
			foreignColumns: [tourDepartures.id],
			name: "booking_items_tour_departure_id_fkey"
		}),
	check("booking_items_guests_check", sql`guests > 0`),
	check("booking_items_seats_check", sql`seats > 0`),
	check("booking_items_subtotal_cents_check", sql`subtotal_cents >= 0`),
	check("booking_items_shape", sql`((kind = 'stay'::product_kind) AND (stay_unit_id IS NOT NULL) AND (stay_range IS NOT NULL) AND (guests IS NOT NULL) AND (tour_departure_id IS NULL) AND (seats IS NULL)) OR ((kind = 'tour'::product_kind) AND (tour_departure_id IS NOT NULL) AND (seats IS NOT NULL) AND (stay_unit_id IS NULL) AND (stay_range IS NULL))`),
]);

export const bookingGuests = pgTable("booking_guests", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bookingId: uuid("booking_id").notNull(),
	bookingItemId: uuid("booking_item_id"),
	isLead: boolean("is_lead").default(false).notNull(),
	fullName: text("full_name").notNull(),
	paxType: paxType("pax_type").default('adult').notNull(),
	birthdate: date(),
	email: text(),
	phone: text(),
	docType: text("doc_type"),
	docLast4: text("doc_last4"),
	dietaryNote: text("dietary_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("booking_guests_booking_idx").using("btree", table.bookingId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("booking_guests_one_lead_idx").using("btree", table.bookingId.asc().nullsLast().op("uuid_ops")).where(sql`is_lead`),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "booking_guests_booking_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.bookingItemId],
			foreignColumns: [bookingItems.id],
			name: "booking_guests_booking_item_id_fkey"
		}).onDelete("cascade"),
]);

export const bookingEvents = pgTable("booking_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	bookingId: uuid("booking_id").notNull(),
	type: text().notNull(),
	payload: jsonb().default({}).notNull(),
	actorType: text("actor_type").default('system').notNull(),
	actorId: text("actor_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("booking_events_booking_idx").using("btree", table.bookingId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "booking_events_booking_id_fkey"
		}).onDelete("cascade"),
]);

export const coupons = pgTable("coupons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	kind: couponKind().notNull(),
	value: numeric({ precision: 12, scale:  2 }).notNull(),
	currency: char({ length: 3 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	minTotalCents: bigint("min_total_cents", { mode: "number" }).default(0).notNull(),
	maxRedemptions: integer("max_redemptions"),
	redemptions: integer().default(0).notNull(),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }),
	validTo: timestamp("valid_to", { withTimezone: true, mode: 'string' }),
	appliesTo: jsonb("applies_to").default({}).notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("coupons_code_key").using("btree", sql`upper(code)`),
	check("coupons_value_check", sql`value > (0)::numeric`),
	check("coupons_fixed_needs_currency", sql`(kind <> 'fixed'::coupon_kind) OR (currency IS NOT NULL)`),
	check("coupons_percent_range", sql`(kind <> 'percent'::coupon_kind) OR (value <= (100)::numeric)`),
	check("coupons_redemptions_ok", sql`(max_redemptions IS NULL) OR (redemptions <= max_redemptions)`),
]);

export const payments = pgTable("payments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bookingId: uuid("booking_id").notNull(),
	purpose: paymentPurpose().notNull(),
	status: paymentStatus().default('pending').notNull(),
	method: paymentMethod().default('card').notNull(),
	provider: text(),
	providerRef: text("provider_ref"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
	currency: char({ length: 3 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	feeCents: bigint("fee_cents", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	netCents: bigint("net_cents", { mode: "number" }),
	fxRate: numeric("fx_rate", { precision: 12, scale:  6 }),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	failedReason: text("failed_reason"),
	collectedBy: uuid("collected_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("payments_booking_idx").using("btree", table.bookingId.asc().nullsLast().op("enum_ops"), table.purpose.asc().nullsLast().op("uuid_ops")),
	index("payments_pending_balance_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")).where(sql`((purpose = 'balance'::payment_purpose) AND (status = 'pending'::payment_status))`),
	uniqueIndex("payments_provider_ref_key").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.providerRef.asc().nullsLast().op("text_ops")).where(sql`(provider_ref IS NOT NULL)`),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "payments_booking_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.collectedBy],
			foreignColumns: [staffUsers.id],
			name: "payments_collected_by_fkey"
		}),
	check("payments_amount_cents_check", sql`amount_cents >= 0`),
]);

export const paymentEvents = pgTable("payment_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: text().notNull(),
	providerEventId: text("provider_event_id").notNull(),
	type: text().notNull(),
	paymentId: uuid("payment_id"),
	bookingId: uuid("booking_id"),
	payload: jsonb().notNull(),
	signatureOk: boolean("signature_ok").default(false).notNull(),
	receivedAt: timestamp("received_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
	processError: text("process_error"),
}, (table) => [
	index("payment_events_unprocessed_idx").using("btree", table.receivedAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(processed_at IS NULL)`),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "payment_events_payment_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "payment_events_booking_id_fkey"
		}).onDelete("set null"),
	unique("payment_events_provider_provider_event_id_key").on(table.provider, table.providerEventId),
]);

export const refunds = pgTable("refunds", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	paymentId: uuid("payment_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
	currency: char({ length: 3 }).notNull(),
	reason: text(),
	providerRef: text("provider_ref"),
	status: paymentStatus().default('pending').notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("refunds_payment_idx").using("btree", table.paymentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.paymentId],
			foreignColumns: [payments.id],
			name: "refunds_payment_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [staffUsers.id],
			name: "refunds_created_by_fkey"
		}),
	check("refunds_amount_cents_check", sql`amount_cents > 0`),
]);

export const mediaJobs = pgTable("media_jobs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	mediaId: uuid("media_id").notNull(),
	status: text().default('pending').notNull(),
	attempts: integer().default(0).notNull(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("media_jobs_pending_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = 'pending'::text)`),
	foreignKey({
			columns: [table.mediaId],
			foreignColumns: [productMedia.id],
			name: "media_jobs_media_id_fkey"
		}).onDelete("cascade"),
	check("media_jobs_status_check", sql`status = ANY (ARRAY['pending'::text, 'done'::text, 'failed'::text])`),
]);

export const outbox = pgTable("outbox", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	channel: notificationChannel().notNull(),
	template: text().notNull(),
	locale: text().default('es').notNull(),
	toAddress: text("to_address").notNull(),
	payload: jsonb().default({}).notNull(),
	bookingId: uuid("booking_id"),
	dedupeKey: text("dedupe_key").notNull(),
	status: notificationStatus().default('pending').notNull(),
	attempts: integer().default(0).notNull(),
	nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	lastError: text("last_error"),
	providerRef: text("provider_ref"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("outbox_booking_idx").using("btree", table.bookingId.asc().nullsLast().op("uuid_ops")),
	index("outbox_due_idx").using("btree", table.nextAttemptAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(status = ANY (ARRAY['pending'::notification_status, 'failed'::notification_status]))`),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookings.id],
			name: "outbox_booking_id_fkey"
		}).onDelete("cascade"),
	unique("outbox_dedupe_key_key").on(table.dedupeKey),
]);

export const staffLoginTokens = pgTable("staff_login_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	staffUserId: uuid("staff_user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: 'string' }),
	requestedIp: inet("requested_ip"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("staff_login_tokens_pending_idx").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(used_at IS NULL)`),
	foreignKey({
			columns: [table.staffUserId],
			foreignColumns: [staffUsers.id],
			name: "staff_login_tokens_staff_user_id_fkey"
		}).onDelete("cascade"),
	unique("staff_login_tokens_token_hash_key").on(table.tokenHash),
]);

export const staffSessions = pgTable("staff_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	staffUserId: uuid("staff_user_id").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	userAgent: text("user_agent"),
	ip: inet(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("staff_sessions_active_idx").using("btree", table.staffUserId.asc().nullsLast().op("uuid_ops")).where(sql`(revoked_at IS NULL)`),
	foreignKey({
			columns: [table.staffUserId],
			foreignColumns: [staffUsers.id],
			name: "staff_sessions_staff_user_id_fkey"
		}).onDelete("cascade"),
	unique("staff_sessions_token_hash_key").on(table.tokenHash),
]);

export const tourItinerarySteps = pgTable("tour_itinerary_steps", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tourOptionId: uuid("tour_option_id").notNull(),
	position: integer().default(0).notNull(),
	timeLabel: text("time_label"),
	titleEs: text("title_es").notNull(),
	titleEn: text("title_en"),
	descriptionEs: text("description_es"),
	descriptionEn: text("description_en"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("tour_itinerary_steps_option_idx").using("btree", table.tourOptionId.asc().nullsLast().op("int4_ops"), table.position.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.tourOptionId],
			foreignColumns: [tourOptions.id],
			name: "tour_itinerary_steps_tour_option_id_fkey"
		}).onDelete("cascade"),
]);

export const productTags = pgTable("product_tags", {
	productId: uuid("product_id").notNull(),
	tagId: uuid("tag_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_tags_product_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "product_tags_tag_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.productId, table.tagId], name: "product_tags_pkey"}),
]);

export const productTranslations = pgTable("product_translations", {
	productId: uuid("product_id").notNull(),
	locale: text().notNull(),
	name: text().notNull(),
	summary: text(),
	description: text(),
	highlights: jsonb().default([]).notNull(),
	included: jsonb().default([]).notNull(),
	excluded: jsonb().default([]).notNull(),
	metaTitle: text("meta_title"),
	metaDescription: text("meta_description"),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_translations_product_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.productId, table.locale], name: "product_translations_pkey"}),
	check("product_translations_locale_check", sql`locale = ANY (ARRAY['es'::text, 'en'::text])`),
]);
export const tourDepartureSeatAudit = pgView("tour_departure_seat_audit", {	departureId: uuid("departure_id"),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }),
	capacity: integer(),
	seatsTaken: integer("seats_taken"),
	seatsFromHolds: integer("seats_from_holds"),
	drift: integer(),
}).as(sql`SELECT td.id AS departure_id, td.starts_at, td.capacity, td.seats_taken, COALESCE(sum(tsh.seats), 0::bigint)::integer AS seats_from_holds, td.seats_taken - COALESCE(sum(tsh.seats), 0::bigint)::integer AS drift FROM tour_departures td LEFT JOIN tour_seat_holds tsh ON tsh.departure_id = td.id AND tsh.released_at IS NULL GROUP BY td.id, td.starts_at, td.capacity, td.seats_taken`);

export const bookingPaymentStatus = pgView("booking_payment_status", {	bookingId: uuid("booking_id"),
	code: text(),
	status: bookingStatus(),
	currency: char({ length: 3 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalCents: bigint("total_cents", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	depositCents: bigint("deposit_cents", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	balanceCents: bigint("balance_cents", { mode: "number" }),
	depositPaidCents: numeric("deposit_paid_cents"),
	balancePaidCents: numeric("balance_paid_cents"),
	balanceDueCents: numeric("balance_due_cents"),
}).as(sql`SELECT b.id AS booking_id, b.code, b.status, b.currency, b.total_cents, b.deposit_cents, b.balance_cents, COALESCE(sum(p.amount_cents) FILTER (WHERE p.purpose = 'deposit'::payment_purpose AND p.status = 'succeeded'::payment_status), 0::numeric) AS deposit_paid_cents, COALESCE(sum(p.amount_cents) FILTER (WHERE p.purpose = 'balance'::payment_purpose AND p.status = 'succeeded'::payment_status), 0::numeric) AS balance_paid_cents, COALESCE(sum(p.amount_cents) FILTER (WHERE p.purpose = 'balance'::payment_purpose AND p.status = 'pending'::payment_status), 0::numeric) AS balance_due_cents FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id GROUP BY b.id, b.code, b.status, b.currency, b.total_cents, b.deposit_cents, b.balance_cents`);