import { relations } from "drizzle-orm/relations";
import { bookings, bookingEvents, bookingGuests, bookingItems, products, rentalUnits, tourDepartures, productMedia, mediaJobs, staffUsers, auditLog, outbox, payments, cancellationPolicies, coupons, customers, paymentEvents, locations, rentalBlocks, rentalRatePlans, rentalRates, taxRates, staffSessions, tourSeatHolds, staffLoginTokens, tourOptions, tourPaxPrices, tourItinerarySteps, refunds, productTags, tags, productTranslations } from "./schema";

export const bookingEventsRelations = relations(bookingEvents, ({one}) => ({
	booking: one(bookings, {
		fields: [bookingEvents.bookingId],
		references: [bookings.id]
	}),
}));

export const bookingsRelations = relations(bookings, ({one, many}) => ({
	bookingEvents: many(bookingEvents),
	bookingGuests: many(bookingGuests),
	bookingItems: many(bookingItems),
	outboxes: many(outbox),
	payments: many(payments),
	cancellationPolicy: one(cancellationPolicies, {
		fields: [bookings.cancellationPolicyId],
		references: [cancellationPolicies.id]
	}),
	coupon: one(coupons, {
		fields: [bookings.couponId],
		references: [coupons.id]
	}),
	staffUser: one(staffUsers, {
		fields: [bookings.createdBy],
		references: [staffUsers.id]
	}),
	customer: one(customers, {
		fields: [bookings.customerId],
		references: [customers.id]
	}),
	paymentEvents: many(paymentEvents),
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

export const bookingItemsRelations = relations(bookingItems, ({one, many}) => ({
	bookingGuests: many(bookingGuests),
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
	rentalBlocks: many(rentalBlocks),
	tourSeatHolds: many(tourSeatHolds),
}));

export const productsRelations = relations(products, ({one, many}) => ({
	bookingItems: many(bookingItems),
	cancellationPolicy: one(cancellationPolicies, {
		fields: [products.cancellationPolicyId],
		references: [cancellationPolicies.id]
	}),
	location: one(locations, {
		fields: [products.locationId],
		references: [locations.id]
	}),
	productMedias: many(productMedia),
	rentalUnits: many(rentalUnits),
	tourOptions: many(tourOptions),
	productTags: many(productTags),
	productTranslations: many(productTranslations),
}));

export const rentalUnitsRelations = relations(rentalUnits, ({one, many}) => ({
	bookingItems: many(bookingItems),
	rentalBlocks: many(rentalBlocks),
	rentalRatePlans: many(rentalRatePlans),
	product: one(products, {
		fields: [rentalUnits.productId],
		references: [products.id]
	}),
}));

export const tourDeparturesRelations = relations(tourDepartures, ({one, many}) => ({
	bookingItems: many(bookingItems),
	tourSeatHolds: many(tourSeatHolds),
	staffUser: one(staffUsers, {
		fields: [tourDepartures.guideStaffId],
		references: [staffUsers.id]
	}),
	tourOption: one(tourOptions, {
		fields: [tourDepartures.tourOptionId],
		references: [tourOptions.id]
	}),
}));

export const mediaJobsRelations = relations(mediaJobs, ({one}) => ({
	productMedia: one(productMedia, {
		fields: [mediaJobs.mediaId],
		references: [productMedia.id]
	}),
}));

export const productMediaRelations = relations(productMedia, ({one, many}) => ({
	mediaJobs: many(mediaJobs),
	product: one(products, {
		fields: [productMedia.productId],
		references: [products.id]
	}),
	staffUser: one(staffUsers, {
		fields: [productMedia.uploadedBy],
		references: [staffUsers.id]
	}),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	staffUser: one(staffUsers, {
		fields: [auditLog.actorStaffId],
		references: [staffUsers.id]
	}),
}));

export const staffUsersRelations = relations(staffUsers, ({many}) => ({
	auditLogs: many(auditLog),
	payments: many(payments),
	bookings: many(bookings),
	productMedias: many(productMedia),
	rentalBlocks: many(rentalBlocks),
	staffSessions: many(staffSessions),
	staffLoginTokens: many(staffLoginTokens),
	tourDepartures: many(tourDepartures),
	refunds_createdBy: many(refunds, {
		relationName: "refunds_createdBy_staffUsers_id"
	}),
	refunds_settledBy: many(refunds, {
		relationName: "refunds_settledBy_staffUsers_id"
	}),
}));

export const outboxRelations = relations(outbox, ({one}) => ({
	booking: one(bookings, {
		fields: [outbox.bookingId],
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

export const cancellationPoliciesRelations = relations(cancellationPolicies, ({many}) => ({
	bookings: many(bookings),
	products: many(products),
}));

export const couponsRelations = relations(coupons, ({many}) => ({
	bookings: many(bookings),
}));

export const customersRelations = relations(customers, ({many}) => ({
	bookings: many(bookings),
}));

export const paymentEventsRelations = relations(paymentEvents, ({one}) => ({
	booking: one(bookings, {
		fields: [paymentEvents.bookingId],
		references: [bookings.id]
	}),
	payment: one(payments, {
		fields: [paymentEvents.paymentId],
		references: [payments.id]
	}),
}));

export const locationsRelations = relations(locations, ({many}) => ({
	products: many(products),
	taxRates: many(taxRates),
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

export const taxRatesRelations = relations(taxRates, ({one}) => ({
	location: one(locations, {
		fields: [taxRates.locationId],
		references: [locations.id]
	}),
}));

export const staffSessionsRelations = relations(staffSessions, ({one}) => ({
	staffUser: one(staffUsers, {
		fields: [staffSessions.staffUserId],
		references: [staffUsers.id]
	}),
}));

export const tourSeatHoldsRelations = relations(tourSeatHolds, ({one}) => ({
	bookingItem: one(bookingItems, {
		fields: [tourSeatHolds.bookingItemId],
		references: [bookingItems.id]
	}),
	tourDeparture: one(tourDepartures, {
		fields: [tourSeatHolds.departureId],
		references: [tourDepartures.id]
	}),
}));

export const staffLoginTokensRelations = relations(staffLoginTokens, ({one}) => ({
	staffUser: one(staffUsers, {
		fields: [staffLoginTokens.staffUserId],
		references: [staffUsers.id]
	}),
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

export const tourPaxPricesRelations = relations(tourPaxPrices, ({one}) => ({
	tourOption: one(tourOptions, {
		fields: [tourPaxPrices.tourOptionId],
		references: [tourOptions.id]
	}),
}));

export const tourItineraryStepsRelations = relations(tourItinerarySteps, ({one}) => ({
	tourOption: one(tourOptions, {
		fields: [tourItinerarySteps.tourOptionId],
		references: [tourOptions.id]
	}),
}));

export const refundsRelations = relations(refunds, ({one}) => ({
	staffUser_createdBy: one(staffUsers, {
		fields: [refunds.createdBy],
		references: [staffUsers.id],
		relationName: "refunds_createdBy_staffUsers_id"
	}),
	payment: one(payments, {
		fields: [refunds.paymentId],
		references: [payments.id]
	}),
	staffUser_settledBy: one(staffUsers, {
		fields: [refunds.settledBy],
		references: [staffUsers.id],
		relationName: "refunds_settledBy_staffUsers_id"
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