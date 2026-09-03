import type { Locale } from "./config";

/**
 * Etiquetas de interfaz. El contenido de los productos no vive aquí: viene
 * traducido de la base.
 *
 * Las dos tablas se declaran con el mismo tipo, así que agregar una clave en
 * español y olvidarla en inglés es un error de compilación, no un texto en el
 * idioma equivocado en producción.
 */
export type Messages = {
  siteName: string;
  tagline: string;
  skipToContent: string;
  switchLanguage: string;
  heroEyebrow: string;
  heroTitleStart: string;
  heroTitleAccent: string;
  navHome: string;
  navTours: string;
  navStays: string;
  navDestinations: string;
  navPanel: string;
  navMenuOpen: string;
  navMenuClose: string;
  destinationsHeading: string;
  destinationsSubtitle: string;
  destinationViewMore: string;
  featuredToursHeading: string;
  featuredToursSubtitle: string;
  staysHeading: string;
  staysSubtitle: string;
  relatedHeading: string;
  detailNavOverview: string;
  confidenceHeading: string;
  carouselPrev: string;
  carouselNext: string;
  galleryOpen: string;
  galleryClose: string;
  galleryPhotoCount: (n: number) => string;
  galleryCounter: (index: number, total: number) => string;
  galleryOpenPhoto: (index: number) => string;
  trustBadgeText: string;
  newsletterHeading: string;
  newsletterBody: string;
  newsletterPlaceholder: string;
  newsletterSubmit: string;
  valuePropDepositHeading: string;
  valuePropDepositBody: string;
  valuePropInstantHeading: string;
  valuePropInstantBody: string;
  valuePropCancelHeading: string;
  valuePropCancelBody: string;
  ctaHeading: string;
  ctaBody: string;
  ctaButton: string;
  footerLinksHeading: string;
  footerHome: string;
  footerHowHeading: string;
  footerHowBody: string;
  footerRights: (year: number) => string;
  filterHeading: string;
  filterKind: string;
  filterKindAll: string;
  filterKindTour: string;
  filterKindStay: string;
  filterLocation: string;
  filterLocationAll: string;
  filterGuests: string;
  filterGuestsAny: string;
  filterApply: string;
  filterClear: string;
  resultsCount: (n: number) => string;
  emptyTitle: string;
  emptyBody: string;
  fromPrice: string;
  perNight: string;
  perPerson: string;
  viewDetail: string;
  upToGuests: (n: number) => string;
  included: string;
  notIncluded: string;
  highlights: string;
  location: string;
  details: string;
  itinerary: string;
  guestsCount: (n: number) => string;
  bedroomsCount: (n: number) => string;
  bedsCount: (n: number) => string;
  bathroomsCount: (n: number) => string;
  minNights: (n: number) => string;
  checkInOut: string;
  /** Solo para lectores de pantalla — el ícono ya lo dice visualmente. */
  meetingPoint: string;
  prices: string;
  paxAdult: string;
  paxChild: string;
  paxInfant: string;
  paxFree: string;
  priceNotice: string;
  minutes: (n: number) => string;

  // Selector y cotización · Sprint 2
  checkIn: string;
  checkOut: string;
  guestsLabel: string;
  quoteHeading: string;
  quoteTotal: string;
  quoteDepositNow: (pct: number) => string;
  quoteBalanceLater: string;
  quoteNights: (n: number) => string;
  quoteExtraGuests: (guests: number, nights: number) => string;
  quoteCleaning: string;
  quoteUnavailable: string;
  quoteAvailable: string;
  quoteRecalculate: string;
  paxAdults: string;
  paxChildren: string;
  paxInfants: string;
  paxInfantsHint: string;
  departureLabel: string;
  seatsLeft: (n: number) => string;
  soldOut: string;
  calendarHeading: string;
  calendarPrev: string;
  calendarNext: string;
  calendarBusy: string;
  calendarFree: string;
  calendarNoDeparture: string;
  weekdays: readonly string[];
  errNoRate: string;
  errMinNights: (n: number) => string;
  errClosedToArrival: string;
  errClosedToDeparture: string;
  errOverCapacity: (max: number) => string;
  errPastDates: string;
  errInvalidRange: string;
  errNoPax: string;
  errSoldOut: (left: number) => string;
  errDepartureClosed: string;

  // Checkout · Sprint 3
  bookNow: string;
  checkoutTitle: string;
  checkoutHolder: string;
  fieldName: string;
  fieldEmail: string;
  fieldPhone: string;
  paxHeading: string;
  paxName: string;
  paxAge: string;
  acceptPolicy: string;
  acceptPrivacy: string;
  payDeposit: (amount: string) => string;
  holdNotice: (minutes: number) => string;
  checkoutError: string;
  requiredField: string;
  invalidEmail: string;
  mustAcceptPolicy: string;
  bookingTitle: (code: string) => string;
  bookingHold: string;
  bookingConfirmed: string;
  bookingExpired: string;
  bookingCancelled: string;
  depositPaid: string;
  balanceOnArrival: string;
  simulateHeading: string;
  simulateSuccess: string;
  simulateFailure: string;
  simulateNotice: string;
  backToCatalog: string;
  reportAt: (time: string) => string;

  // Cupones en el checkout
  couponLabel: string;
  couponApply: string;
  couponDiscount: (code: string) => string;
  couponNotFound: string;
  couponExpired: string;
  couponNotYetValid: string;
  couponWrongProduct: string;
  couponRedeemedOut: string;
  couponCurrencyMismatch: string;
  couponMinTotal: string;
};

const es: Messages = {
  siteName: "adriMarket",
  tagline: "Tours y casas en el Caribe mexicano",
  skipToContent: "Ir al contenido",
  switchLanguage: "Ver en inglés",
  heroEyebrow: "Anticipo en línea · saldo en destino",
  heroTitleStart: "Encuentra tu próximo destino en el",
  heroTitleAccent: "Caribe",
  navHome: "Inicio",
  navTours: "Tours",
  navStays: "Estancias",
  navDestinations: "Destinos",
  navPanel: "Panel",
  navMenuOpen: "Abrir menú",
  navMenuClose: "Cerrar menú",
  destinationsHeading: "Destinos populares",
  destinationsSubtitle: "Los lugares que más reservan nuestros huéspedes.",
  destinationViewMore: "Ver más",
  featuredToursHeading: "Tours destacados",
  featuredToursSubtitle: "Los favoritos de nuestros huéspedes.",
  staysHeading: "Estancias",
  staysSubtitle: "Casas y departamentos listos para tu próxima escapada.",
  relatedHeading: "También te puede interesar",
  detailNavOverview: "Detalle",
  confidenceHeading: "Reserva con confianza",
  carouselPrev: "Anterior",
  carouselNext: "Siguiente",
  galleryOpen: "Galería",
  galleryClose: "Cerrar galería",
  galleryPhotoCount: (n) => (n === 1 ? "1 foto" : `${n} fotos`),
  galleryCounter: (index, total) => `${index} de ${total}`,
  galleryOpenPhoto: (index) => `Ver foto ${index} en grande`,
  trustBadgeText: "Pago seguro con tarjeta, por Stripe",
  newsletterHeading: "No te pierdas nada",
  newsletterBody: "Avisos de nuevos tours y estancias, sin relleno.",
  newsletterPlaceholder: "Tu correo",
  newsletterSubmit: "Suscribirme",
  valuePropDepositHeading: "Anticipo en línea, saldo en destino",
  valuePropDepositBody:
    "Confirmas tu lugar con un pago parcial seguro; liquidas el resto al llegar, sin cargos ocultos.",
  valuePropInstantHeading: "Confirmación al instante",
  valuePropInstantBody:
    "El cupo se aparta en el momento de reservar: nunca se vende el mismo lugar dos veces.",
  valuePropCancelHeading: "Cancelación clara",
  valuePropCancelBody:
    "Tu reserva queda con la política de cancelación vigente al reservar, congelada para ti.",
  ctaHeading: "Aparta hoy, paga el resto en destino",
  ctaBody:
    "Confirma tu lugar con un anticipo en línea y liquida el saldo al llegar. Sin sorpresas, sin cargos ocultos.",
  ctaButton: "Ver todo el catálogo",
  footerLinksHeading: "Explora",
  footerHome: "Inicio",
  footerHowHeading: "Cómo reservas",
  footerHowBody: "Un anticipo confirma tu reserva en línea; el resto se paga en destino, en pesos o en la moneda local.",
  footerRights: (year) => `© ${year} · Todos los derechos reservados.`,
  filterHeading: "Filtrar",
  filterKind: "Tipo",
  filterKindAll: "Todo",
  filterKindTour: "Tours",
  filterKindStay: "Estancias",
  filterLocation: "Ubicación",
  filterLocationAll: "Todas",
  filterGuests: "Personas",
  filterGuestsAny: "Cualquiera",
  filterApply: "Aplicar",
  filterClear: "Quitar filtros",
  resultsCount: (n) => (n === 1 ? "1 resultado" : `${n} resultados`),
  emptyTitle: "Nada coincide con esos filtros",
  emptyBody: "Prueba con menos personas o quita el filtro de tipo.",
  fromPrice: "Desde",
  perNight: "por noche",
  perPerson: "por persona",
  viewDetail: "Ver detalle",
  upToGuests: (n) => `Hasta ${n} personas`,
  included: "Qué incluye",
  notIncluded: "Qué no incluye",
  highlights: "Lo mejor",
  location: "Ubicación",
  details: "Detalles",
  itinerary: "Itinerario",
  guestsCount: (n) => (n === 1 ? "1 persona" : `${n} personas`),
  bedroomsCount: (n) => (n === 1 ? "1 recámara" : `${n} recámaras`),
  bedsCount: (n) => (n === 1 ? "1 cama" : `${n} camas`),
  bathroomsCount: (n) => (n === 1 ? "1 baño" : `${n} baños`),
  minNights: (n) => (n === 1 ? "1 noche mínimo" : `${n} noches mínimo`),
  checkInOut: "Llegada y salida",
  meetingPoint: "Punto de encuentro",
  prices: "Precios",
  paxAdult: "Adulto",
  paxChild: "Menor",
  paxInfant: "Infante",
  paxFree: "Sin costo",
  priceNotice:
    "El precio exacto depende de tus fechas y del número de personas. Lo verás antes de dar tus datos.",
  minutes: (n) => `${Math.round(n / 60)} h`,

  checkIn: "Llegada",
  checkOut: "Salida",
  guestsLabel: "Personas",
  quoteHeading: "Tu cotización",
  quoteTotal: "Total",
  quoteDepositNow: (pct) => `Anticipo hoy (${pct}%)`,
  quoteBalanceLater: "Saldo al llegar",
  quoteNights: (n) => (n === 1 ? "1 noche" : `${n} noches`),
  quoteExtraGuests: (guests, nights) =>
    `${guests} ${guests === 1 ? "huésped extra" : "huéspedes extra"} × ${nights} ${nights === 1 ? "noche" : "noches"}`,
  quoteCleaning: "Limpieza",
  quoteUnavailable: "Esas fechas ya están ocupadas",
  quoteAvailable: "Disponible",
  quoteRecalculate: "Cotizar",
  paxAdults: "Adultos",
  paxChildren: "Menores",
  paxInfants: "Infantes",
  paxInfantsHint: "No ocupan lugar",
  departureLabel: "Salida",
  seatsLeft: (n) => (n === 1 ? "1 lugar disponible" : `${n} lugares disponibles`),
  soldOut: "Sin lugares",
  calendarHeading: "Disponibilidad",
  calendarPrev: "Mes anterior",
  calendarNext: "Mes siguiente",
  calendarBusy: "Ocupado",
  calendarFree: "Libre",
  calendarNoDeparture: "Sin salida",
  weekdays: ["L", "M", "M", "J", "V", "S", "D"],
  errNoRate: "No tenemos tarifa publicada para esas fechas. Escríbenos y te cotizamos.",
  errMinNights: (n) => `Para esas fechas el mínimo es de ${n} noches.`,
  errClosedToArrival: "Ese día no admite llegadas. Prueba con otro.",
  errClosedToDeparture: "Ese día no admite salidas. Prueba con otro.",
  errOverCapacity: (max) => `La capacidad máxima es de ${max} personas.`,
  errPastDates: "Esas fechas ya pasaron.",
  errInvalidRange: "La salida debe ser posterior a la llegada.",
  errNoPax: "Se necesita al menos un adulto.",
  errSoldOut: (left) =>
    left === 0 ? "Ya no quedan lugares en esa salida." : `Solo quedan ${left} lugares en esa salida.`,
  errDepartureClosed: "Esa salida no está disponible.",

  bookNow: "Reservar",
  checkoutTitle: "Confirma tu reserva",
  checkoutHolder: "Datos de quien reserva",
  fieldName: "Nombre completo",
  fieldEmail: "Correo",
  fieldPhone: "Teléfono",
  paxHeading: "Pasajeros",
  paxName: "Nombre",
  paxAge: "Edad",
  acceptPolicy: "Acepto la política de cancelación",
  acceptPrivacy: "Acepto el aviso de privacidad",
  payDeposit: (amount) => `Pagar anticipo de ${amount}`,
  holdNotice: (minutes) =>
    `Apartamos tus fechas ${minutes} minutos mientras completas el pago.`,
  checkoutError: "No pudimos crear tu reserva.",
  requiredField: "Falta este dato.",
  invalidEmail: "Ese correo no parece válido.",
  mustAcceptPolicy: "Hay que aceptar la política para continuar.",
  bookingTitle: (code) => `Reserva ${code}`,
  bookingHold: "Esperando el pago del anticipo",
  bookingConfirmed: "Reserva confirmada",
  bookingExpired: "El apartado venció y las fechas se liberaron",
  bookingCancelled: "Reserva cancelada",
  depositPaid: "Anticipo pagado",
  balanceOnArrival: "Saldo a pagar en destino",
  simulateHeading: "Pasarela de prueba",
  simulateSuccess: "Simular pago exitoso",
  simulateFailure: "Simular pago rechazado",
  simulateNotice:
    "Sin llaves de la pasarela real, este paso simula su respuesta. El evento se firma y se procesa por el mismo camino que en producción.",
  backToCatalog: "Volver al catálogo",
  reportAt: (time) => `Preséntate a las ${time} (15 minutos antes)`,

  couponLabel: "Código de cupón",
  couponApply: "Aplicar cupón",
  couponDiscount: (code) => `Cupón ${code}`,
  couponNotFound: "Ese código no existe o ya no está activo.",
  couponExpired: "Ese cupón ya venció.",
  couponNotYetValid: "Ese cupón todavía no está vigente.",
  couponWrongProduct: "Ese cupón no aplica a este producto.",
  couponRedeemedOut: "Ese cupón ya se agotó.",
  couponCurrencyMismatch: "Ese cupón no aplica en esta moneda.",
  couponMinTotal: "Tu compra no alcanza el mínimo que pide ese cupón.",
};

const en: Messages = {
  siteName: "adriMarket",
  tagline: "Tours and homes in the Mexican Caribbean",
  skipToContent: "Skip to content",
  switchLanguage: "Ver en español",
  heroEyebrow: "Deposit online · balance on arrival",
  heroTitleStart: "Find your next getaway in the",
  heroTitleAccent: "Caribbean",
  navHome: "Home",
  navTours: "Tours",
  navStays: "Stays",
  navDestinations: "Destinations",
  navPanel: "Staff",
  navMenuOpen: "Open menu",
  navMenuClose: "Close menu",
  destinationsHeading: "Popular destinations",
  destinationsSubtitle: "The places our guests book the most.",
  destinationViewMore: "View more",
  featuredToursHeading: "Featured tours",
  featuredToursSubtitle: "Our guests' favorites.",
  staysHeading: "Stays",
  staysSubtitle: "Homes and apartments ready for your next getaway.",
  relatedHeading: "You might also like",
  detailNavOverview: "Detail",
  confidenceHeading: "Book with confidence",
  carouselPrev: "Previous",
  carouselNext: "Next",
  galleryOpen: "Gallery",
  galleryClose: "Close gallery",
  galleryPhotoCount: (n) => (n === 1 ? "1 photo" : `${n} photos`),
  galleryCounter: (index, total) => `${index} of ${total}`,
  galleryOpenPhoto: (index) => `View photo ${index} full size`,
  trustBadgeText: "Secure card payment, by Stripe",
  newsletterHeading: "Don't miss a thing",
  newsletterBody: "New tours and stays, straight to your inbox — no filler.",
  newsletterPlaceholder: "Your email",
  newsletterSubmit: "Subscribe",
  valuePropDepositHeading: "Deposit online, balance on arrival",
  valuePropDepositBody:
    "Confirm your spot with a secure partial payment; settle the rest when you arrive, no hidden fees.",
  valuePropInstantHeading: "Confirmed on the spot",
  valuePropInstantBody: "Your spot is held the moment you book — never sold twice.",
  valuePropCancelHeading: "Clear cancellation terms",
  valuePropCancelBody:
    "Your booking keeps the cancellation policy in effect when you booked, frozen for you.",
  ctaHeading: "Book today, pay the rest on arrival",
  ctaBody:
    "Secure your spot with a deposit online and settle the balance when you get there. No surprises, no hidden fees.",
  ctaButton: "See the full catalog",
  footerLinksHeading: "Explore",
  footerHome: "Home",
  footerHowHeading: "How booking works",
  footerHowBody: "A deposit confirms your booking online; the rest is paid on arrival, locally.",
  footerRights: (year) => `© ${year} · All rights reserved.`,
  filterHeading: "Filter",
  filterKind: "Type",
  filterKindAll: "All",
  filterKindTour: "Tours",
  filterKindStay: "Stays",
  filterLocation: "Location",
  filterLocationAll: "All",
  filterGuests: "Guests",
  filterGuestsAny: "Any",
  filterApply: "Apply",
  filterClear: "Clear filters",
  resultsCount: (n) => (n === 1 ? "1 result" : `${n} results`),
  emptyTitle: "Nothing matches those filters",
  emptyBody: "Try fewer guests, or clear the type filter.",
  fromPrice: "From",
  perNight: "per night",
  perPerson: "per person",
  viewDetail: "View details",
  upToGuests: (n) => `Up to ${n} guests`,
  included: "What's included",
  notIncluded: "Not included",
  highlights: "Highlights",
  location: "Location",
  details: "Details",
  itinerary: "Itinerary",
  guestsCount: (n) => (n === 1 ? "Sleeps 1" : `Sleeps ${n}`),
  bedroomsCount: (n) => (n === 1 ? "1 bedroom" : `${n} bedrooms`),
  bedsCount: (n) => (n === 1 ? "1 bed" : `${n} beds`),
  bathroomsCount: (n) => (n === 1 ? "1 bathroom" : `${n} bathrooms`),
  minNights: (n) => (n === 1 ? "1 night minimum" : `${n} nights minimum`),
  checkInOut: "Check-in and check-out",
  meetingPoint: "Meeting point",
  prices: "Prices",
  paxAdult: "Adult",
  paxChild: "Child",
  paxInfant: "Infant",
  paxFree: "Free",
  priceNotice:
    "The exact price depends on your dates and party size. You'll see it before entering any details.",
  minutes: (n) => `${Math.round(n / 60)} h`,

  checkIn: "Check-in",
  checkOut: "Check-out",
  guestsLabel: "Guests",
  quoteHeading: "Your quote",
  quoteTotal: "Total",
  quoteDepositNow: (pct) => `Deposit today (${pct}%)`,
  quoteBalanceLater: "Balance on arrival",
  quoteNights: (n) => (n === 1 ? "1 night" : `${n} nights`),
  quoteExtraGuests: (guests, nights) =>
    `${guests} extra ${guests === 1 ? "guest" : "guests"} × ${nights} ${nights === 1 ? "night" : "nights"}`,
  quoteCleaning: "Cleaning",
  quoteUnavailable: "Those dates are already taken",
  quoteAvailable: "Available",
  quoteRecalculate: "Get quote",
  paxAdults: "Adults",
  paxChildren: "Children",
  paxInfants: "Infants",
  paxInfantsHint: "Do not take a seat",
  departureLabel: "Departure",
  seatsLeft: (n) => (n === 1 ? "1 seat left" : `${n} seats left`),
  soldOut: "Sold out",
  calendarHeading: "Availability",
  calendarPrev: "Previous month",
  calendarNext: "Next month",
  calendarBusy: "Booked",
  calendarFree: "Free",
  calendarNoDeparture: "No departure",
  weekdays: ["M", "T", "W", "T", "F", "S", "S"],
  errNoRate: "We do not have a published rate for those dates. Write to us for a quote.",
  errMinNights: (n) => `Those dates require a minimum of ${n} nights.`,
  errClosedToArrival: "That day does not allow check-ins. Try another one.",
  errClosedToDeparture: "That day does not allow check-outs. Try another one.",
  errOverCapacity: (max) => `Maximum capacity is ${max} guests.`,
  errPastDates: "Those dates are in the past.",
  errInvalidRange: "Check-out must be after check-in.",
  errNoPax: "At least one adult is required.",
  errSoldOut: (left) =>
    left === 0 ? "That departure is sold out." : `Only ${left} seats left on that departure.`,
  errDepartureClosed: "That departure is not available.",

  bookNow: "Book now",
  checkoutTitle: "Confirm your booking",
  checkoutHolder: "Who is booking",
  fieldName: "Full name",
  fieldEmail: "Email",
  fieldPhone: "Phone",
  paxHeading: "Guests",
  paxName: "Name",
  paxAge: "Age",
  acceptPolicy: "I accept the cancellation policy",
  acceptPrivacy: "I accept the privacy notice",
  payDeposit: (amount) => `Pay ${amount} deposit`,
  holdNotice: (minutes) => `We hold your dates for ${minutes} minutes while you pay.`,
  checkoutError: "We could not create your booking.",
  requiredField: "This is required.",
  invalidEmail: "That email does not look valid.",
  mustAcceptPolicy: "You need to accept the policy to continue.",
  bookingTitle: (code) => `Booking ${code}`,
  bookingHold: "Waiting for the deposit payment",
  bookingConfirmed: "Booking confirmed",
  bookingExpired: "The hold expired and the dates were released",
  bookingCancelled: "Booking cancelled",
  depositPaid: "Deposit paid",
  balanceOnArrival: "Balance to pay on arrival",
  simulateHeading: "Test gateway",
  simulateSuccess: "Simulate a successful payment",
  simulateFailure: "Simulate a declined payment",
  simulateNotice:
    "Without real gateway keys, this step simulates its response. The event is signed and processed through the same path as production.",
  backToCatalog: "Back to catalog",
  reportAt: (time) => `Please arrive at ${time} (15 minutes early)`,

  couponLabel: "Coupon code",
  couponApply: "Apply coupon",
  couponDiscount: (code) => `Coupon ${code}`,
  couponNotFound: "That code does not exist or is no longer active.",
  couponExpired: "That coupon has expired.",
  couponNotYetValid: "That coupon is not active yet.",
  couponWrongProduct: "That coupon does not apply to this product.",
  couponRedeemedOut: "That coupon has already run out.",
  couponCurrencyMismatch: "That coupon does not apply in this currency.",
  couponMinTotal: "Your purchase does not reach that coupon's minimum.",
};

const MESSAGES: Record<Locale, Messages> = { es, en };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
