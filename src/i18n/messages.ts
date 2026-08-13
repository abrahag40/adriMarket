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
};

const es: Messages = {
  siteName: "adriMarket",
  tagline: "Tours y casas en el Caribe mexicano",
  skipToContent: "Ir al contenido",
  switchLanguage: "Ver en inglés",
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
};

const en: Messages = {
  siteName: "adriMarket",
  tagline: "Tours and homes in the Mexican Caribbean",
  skipToContent: "Skip to content",
  switchLanguage: "Ver en español",
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
};

const MESSAGES: Record<Locale, Messages> = { es, en };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
