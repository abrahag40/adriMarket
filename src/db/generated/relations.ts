import { relations } from "drizzle-orm/relations";
import { tourOptions, tourDepartures, staffUsers, tourSeatHolds, bookingItems, customers, bookings, cancellationPolicies, coupons, rentalBlocks, rentalUnits, auditLog, locations, taxRates, products, tourPaxPrices, productMedia, rentalRatePlans, rentalRates, bookingGuests, bookingEvents, payments, paymentEvents, refunds, mediaJobs, outbox, staffLoginTokens, staffSessions, tourItinerarySteps, productTags, tags, productTranslations } from "./schema";

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

export const tourOptionsRelations = relations(tourOptions, ({one, many}) => ({
	tourDepartures: many(tourDepartures),
	product: one(products, {
		fields: [tourOptions.productId],
		references: [products.id]
	}),
	tourPaxPrices: many(tourPaxPrices),
	tourItinerarySteps: many(tourItinerarySteps),
}));

export const staffUsersRelations = relations(staffUsers, ({many}) => ({
	tourDepartures: many(tourDepartures),
	bookings: many(bookings),
	rentalBlocks: many(rentalBlocks),
	auditLogs: many(auditLog),
	productMedias: many(productMedia),
	payments: many(payments),
	refunds: many(refunds),
	staffLoginTokens: many(staffLoginTokens),
	staffSessions: many(staffSessions),
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

export const bookingItemsRelations = relations(bookingItems, ({one, many}) => ({
	tourSeatHolds: many(tourSeatHolds),
	rentalBlocks: many(rentalBlocks),
	booking: one(bookings, {
		fields: [bookingItems.bookingId],
		references: [bookings.id]
	}),
	product: one(products, {
		fields: [bookingItems.productId],
		references: [products.id]
	}),
	rentalUnit: one(rentalUnits, {
		fields: [bookingItems.rentalUnitId],
		references: [rentalUnits.id]
	}),
	tourDeparture: one(tourDepartures, {
		fields: [bookingItems.tourDepartureId],
		references: [tourDepartures.id]
	}),
	bookingGuests: many(bookingGuests),
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
	coupon: one(coupons, {
		fields: [bookings.couponId],
		references: [coupons.id]
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

export const cancellationPoliciesRelations = relations(cancellationPolicies, ({many}) => ({
	bookings: many(bookings),
	products: many(products),
}));

export const couponsRelations = relations(coupons, ({many}) => ({
	bookings: many(bookings),
}));

export const rentalBlocksRelations = relations(rentalBlocks, ({one}) => ({
	bookingItem: one(bookingItems, {
		fields: [rentalBlocks.bookingItemId],
		references: [bookingItems.id]
	}),
	staffUser: one(staffUsers, {
		fields: [rentalBlocks.createdBy],
		references: [staffUsers.id]
	}),
	rentalUnit: one(rentalUnits, {
		fields: [rentalBlocks.unitId],
		references: [rentalUnits.id]
	}),
}));

export const rentalUnitsRelations = relations(rentalUnits, ({one, many}) => ({
	rentalBlocks: many(rentalBlocks),
	product: one(products, {
		fields: [rentalUnits.productId],
		references: [products.id]
	}),
	rentalRatePlans: many(rentalRatePlans),
	bookingItems: many(bookingItems),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	staffUser: one(staffUsers, {
		fields: [auditLog.actorStaffId],
		references: [staffUsers.id]
	}),
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
	tourOptions: many(tourOptions),
	productMedias: many(productMedia),
	rentalUnits: many(rentalUnits),
	bookingItems: many(bookingItems),
	productTags: many(productTags),
	productTranslations: many(productTranslations),
}));

export const tourPaxPricesRelations = relations(tourPaxPrices, ({one}) => ({
	tourOption: one(tourOptions, {
		fields: [tourPaxPrices.tourOptionId],
		references: [tourOptions.id]
	}),
}));

export const productMediaRelations = relations(productMedia, ({one, many}) => ({
	product: one(products, {
		fields: [productMedia.productId],
		references: [products.id]
	}),
	staffUser: one(staffUsers, {
		fields: [productMedia.uploadedBy],
		references: [staffUsers.id]
	}),
	mediaJobs: many(mediaJobs),
}));

export const rentalRatePlansRelations = relations(rentalRatePlans, ({one, many}) => ({
	rentalUnit: one(rentalUnits, {
		fields: [rentalRatePlans.unitId],
		references: [rentalUnits.id]
	}),
	rentalRates: many(rentalRates),
}));

export const rentalRatesRelations = relations(rentalRates, ({one}) => ({
	rentalRatePlan: one(rentalRatePlans, {
		fields: [rentalRates.ratePlanId],
		references: [rentalRatePlans.id]
	}),
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

export const mediaJobsRelations = relations(mediaJobs, ({one}) => ({
	productMedia: one(productMedia, {
		fields: [mediaJobs.mediaId],
		references: [productMedia.id]
	}),
}));

export const outboxRelations = relations(outbox, ({one}) => ({
	booking: one(bookings, {
		fields: [outbox.bookingId],
		references: [bookings.id]
	}),
}));

export const staffLoginTokensRelations = relations(staffLoginTokens, ({one}) => ({
	staffUser: one(staffUsers, {
		fields: [staffLoginTokens.staffUserId],
		references: [staffUsers.id]
	}),
}));

export const staffSessionsRelations = relations(staffSessions, ({one}) => ({
	staffUser: one(staffUsers, {
		fields: [staffSessions.staffUserId],
		references: [staffUsers.id]
	}),
}));

export const tourItineraryStepsRelations = relations(tourItinerarySteps, ({one}) => ({
	tourOption: one(tourOptions, {
		fields: [tourItinerarySteps.tourOptionId],
		references: [tourOptions.id]
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