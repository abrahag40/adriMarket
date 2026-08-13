import { relations } from "drizzle-orm/relations";
import { staffUsers, auditLog, locations, taxRates, products, cancellationPolicies, stayUnits, stayRatePlans, productMedia, stayRates, stayBlocks, bookingItems, tourOptions, tourPaxPrices, tourDepartures, tourSeatHolds, customers, bookings, bookingGuests, bookingEvents, payments, paymentEvents, refunds, outbox, productTags, tags, productTranslations } from "./schema";

export const auditLogRelations = relations(auditLog, ({one}) => ({
	staffUser: one(staffUsers, {
		fields: [auditLog.actorStaffId],
		references: [staffUsers.id]
	}),
}));

export const staffUsersRelations = relations(staffUsers, ({many}) => ({
	auditLogs: many(auditLog),
	stayBlocks: many(stayBlocks),
	tourDepartures: many(tourDepartures),
	bookings: many(bookings),
	payments: many(payments),
	refunds: many(refunds),
}));

export const taxRatesRelations = relations(taxRates, ({one}) => ({
	location: one(locations, {
		fields: [taxRates.locationId],
		references: [locations.id]
	}),
}));

export const locationsRelations = relations(locations, ({many}) => ({
	taxRates: many(taxRates),
	products: many(products),
}));

export const productsRelations = relations(products, ({one, many}) => ({
	location: one(locations, {
		fields: [products.locationId],
		references: [locations.id]
	}),
	cancellationPolicy: one(cancellationPolicies, {
		fields: [products.cancellationPolicyId],
		references: [cancellationPolicies.id]
	}),
	productMedias: many(productMedia),
	stayUnits: many(stayUnits),
	tourOptions: many(tourOptions),
	bookingItems: many(bookingItems),
	productTags: many(productTags),
	productTranslations: many(productTranslations),
}));

export const cancellationPoliciesRelations = relations(cancellationPolicies, ({many}) => ({
	products: many(products),
	bookings: many(bookings),
}));

export const stayRatePlansRelations = relations(stayRatePlans, ({one, many}) => ({
	stayUnit: one(stayUnits, {
		fields: [stayRatePlans.unitId],
		references: [stayUnits.id]
	}),
	stayRates: many(stayRates),
}));

export const stayUnitsRelations = relations(stayUnits, ({one, many}) => ({
	stayRatePlans: many(stayRatePlans),
	product: one(products, {
		fields: [stayUnits.productId],
		references: [products.id]
	}),
	stayBlocks: many(stayBlocks),
	bookingItems: many(bookingItems),
}));

export const productMediaRelations = relations(productMedia, ({one}) => ({
	product: one(products, {
		fields: [productMedia.productId],
		references: [products.id]
	}),
}));

export const stayRatesRelations = relations(stayRates, ({one}) => ({
	stayRatePlan: one(stayRatePlans, {
		fields: [stayRates.ratePlanId],
		references: [stayRatePlans.id]
	}),
}));

export const stayBlocksRelations = relations(stayBlocks, ({one}) => ({
	stayUnit: one(stayUnits, {
		fields: [stayBlocks.unitId],
		references: [stayUnits.id]
	}),
	staffUser: one(staffUsers, {
		fields: [stayBlocks.createdBy],
		references: [staffUsers.id]
	}),
	bookingItem: one(bookingItems, {
		fields: [stayBlocks.bookingItemId],
		references: [bookingItems.id]
	}),
}));

export const bookingItemsRelations = relations(bookingItems, ({one, many}) => ({
	stayBlocks: many(stayBlocks),
	tourSeatHolds: many(tourSeatHolds),
	booking: one(bookings, {
		fields: [bookingItems.bookingId],
		references: [bookings.id]
	}),
	product: one(products, {
		fields: [bookingItems.productId],
		references: [products.id]
	}),
	stayUnit: one(stayUnits, {
		fields: [bookingItems.stayUnitId],
		references: [stayUnits.id]
	}),
	tourDeparture: one(tourDepartures, {
		fields: [bookingItems.tourDepartureId],
		references: [tourDepartures.id]
	}),
	bookingGuests: many(bookingGuests),
}));

export const tourOptionsRelations = relations(tourOptions, ({one, many}) => ({
	product: one(products, {
		fields: [tourOptions.productId],
		references: [products.id]
	}),
	tourPaxPrices: many(tourPaxPrices),
	tourDepartures: many(tourDepartures),
}));

export const tourPaxPricesRelations = relations(tourPaxPrices, ({one}) => ({
	tourOption: one(tourOptions, {
		fields: [tourPaxPrices.tourOptionId],
		references: [tourOptions.id]
	}),
}));

export const tourDeparturesRelations = relations(tourDepartures, ({one, many}) => ({
	tourOption: one(tourOptions, {
		fields: [tourDepartures.tourOptionId],
		references: [tourOptions.id]
	}),
	staffUser: one(staffUsers, {
		fields: [tourDepartures.guideStaffId],
		references: [staffUsers.id]
	}),
	tourSeatHolds: many(tourSeatHolds),
	bookingItems: many(bookingItems),
}));

export const tourSeatHoldsRelations = relations(tourSeatHolds, ({one}) => ({
	tourDeparture: one(tourDepartures, {
		fields: [tourSeatHolds.departureId],
		references: [tourDepartures.id]
	}),
	bookingItem: one(bookingItems, {
		fields: [tourSeatHolds.bookingItemId],
		references: [bookingItems.id]
	}),
}));

export const bookingsRelations = relations(bookings, ({one, many}) => ({
	customer: one(customers, {
		fields: [bookings.customerId],
		references: [customers.id]
	}),
	cancellationPolicy: one(cancellationPolicies, {
		fields: [bookings.cancellationPolicyId],
		references: [cancellationPolicies.id]
	}),
	staffUser: one(staffUsers, {
		fields: [bookings.createdBy],
		references: [staffUsers.id]
	}),
	bookingItems: many(bookingItems),
	bookingGuests: many(bookingGuests),
	bookingEvents: many(bookingEvents),
	payments: many(payments),
	paymentEvents: many(paymentEvents),
	outboxes: many(outbox),
}));

export const customersRelations = relations(customers, ({many}) => ({
	bookings: many(bookings),
}));

export const bookingGuestsRelations = relations(bookingGuests, ({one}) => ({
	booking: one(bookings, {
		fields: [bookingGuests.bookingId],
		references: [bookings.id]
	}),
	bookingItem: one(bookingItems, {
		fields: [bookingGuests.bookingItemId],
		references: [bookingItems.id]
	}),
}));

export const bookingEventsRelations = relations(bookingEvents, ({one}) => ({
	booking: one(bookings, {
		fields: [bookingEvents.bookingId],
		references: [bookings.id]
	}),
}));

export const paymentsRelations = relations(payments, ({one, many}) => ({
	booking: one(bookings, {
		fields: [payments.bookingId],
		references: [bookings.id]
	}),
	staffUser: one(staffUsers, {
		fields: [payments.collectedBy],
		references: [staffUsers.id]
	}),
	paymentEvents: many(paymentEvents),
	refunds: many(refunds),
}));

export const paymentEventsRelations = relations(paymentEvents, ({one}) => ({
	payment: one(payments, {
		fields: [paymentEvents.paymentId],
		references: [payments.id]
	}),
	booking: one(bookings, {
		fields: [paymentEvents.bookingId],
		references: [bookings.id]
	}),
}));

export const refundsRelations = relations(refunds, ({one}) => ({
	payment: one(payments, {
		fields: [refunds.paymentId],
		references: [payments.id]
	}),
	staffUser: one(staffUsers, {
		fields: [refunds.createdBy],
		references: [staffUsers.id]
	}),
}));

export const outboxRelations = relations(outbox, ({one}) => ({
	booking: one(bookings, {
		fields: [outbox.bookingId],
		references: [bookings.id]
	}),
}));

export const productTagsRelations = relations(productTags, ({one}) => ({
	product: one(products, {
		fields: [productTags.productId],
		references: [products.id]
	}),
	tag: one(tags, {
		fields: [productTags.tagId],
		references: [tags.id]
	}),
}));

export const tagsRelations = relations(tags, ({many}) => ({
	productTags: many(productTags),
}));

export const productTranslationsRelations = relations(productTranslations, ({one}) => ({
	product: one(products, {
		fields: [productTranslations.productId],
		references: [products.id]
	}),
}));