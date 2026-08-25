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
  heroTitle: string;
  exploreByLocation: string;
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
  guests: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  minNights: (n: number) => string;
  checkInOut: string;
  duration: string;
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
};

const es: Messages = {
  siteName: "adriMarket",
  tagline: "Tours y casas en el Caribe mexicano",
  skipToContent: "Ir al contenido",
  switchLanguage: "Ver en inglés",
  heroEyebrow: "Anticipo en línea · saldo en destino",
  heroTitle: "Encuentra tu próximo destino en el Caribe",
  exploreByLocation: "Explora por destino",
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
  guests: "Capacidad",
  bedrooms: "Recámaras",
  beds: "Camas",
  bathrooms: "Baños",
  minNights: (n) => (n === 1 ? "1 noche mínimo" : `${n} noches mínimo`),
  checkInOut: "Llegada y salida",
  duration: "Duración",
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
};

const en: Messages = {
  siteName: "adriMarket",
  tagline: "Tours and homes in the Mexican Caribbean",
  skipToContent: "Skip to content",
  switchLanguage: "Ver en español",
  heroEyebrow: "Deposit online · balance on arrival",
  heroTitle: "Find your next Caribbean getaway",
  exploreByLocation: "Explore by location",
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
  guests: "Sleeps",
  bedrooms: "Bedrooms",
  beds: "Beds",
  bathrooms: "Bathrooms",
  minNights: (n) => (n === 1 ? "1 night minimum" : `${n} nights minimum`),
  checkInOut: "Check-in and check-out",
  duration: "Duration",
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
};

const MESSAGES: Record<Locale, Messages> = { es, en };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
