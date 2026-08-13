# Referencia del esquema

30 tablas en seis bloques. El detalle está en los comentarios de
`db/migrations/`; aquí está el mapa y los formatos que el SQL no puede
declarar por sí solo.

## Bloques

| Bloque | Tablas | Nota |
|---|---|---|
| Plataforma | `settings`, `staff_users`, `audit_log`, `schema_migrations` | `settings` es configuración editable en caliente, una fila por concepto |
| Catálogo | `products`, `product_translations`, `product_media`, `locations`, `tags`, `product_tags`, `cancellation_policies`, `tax_rates` | `products.kind` distingue `tour` de `stay`; el texto vive aparte para dos idiomas |
| Inventario · estancias | `stay_units`, `stay_rate_plans`, `stay_rates`, `stay_blocks` | `stay_blocks` es la tabla crítica: lleva la restricción de exclusión |
| Inventario · tours | `tour_options`, `tour_pax_prices`, `tour_departures`, `tour_seat_holds` | `tour_departures.seats_taken` solo se toca dentro de funciones que bloquean la fila |
| Reserva | `customers`, `bookings`, `booking_items`, `booking_guests`, `booking_events` | una reserva puede llevar un tour y dos noches |
| Dinero | `payments`, `payment_events`, `refunds`, `coupons` | el saldo en destino es un pago `pending`, no un dato faltante |
| Avisos | `outbox` | bandeja de salida transaccional |

Vistas: `booking_payment_status` (estado real del dinero por reserva) y
`tour_departure_seat_audit` (delata desalineación del contador de lugares; en
operación normal `drift` siempre es 0 y vale la pena alertar si no lo es).

## Ocupación de una unidad

`stay_blocks` cubre **todo** lo que ocupa una unidad — holds del checkout,
reservas confirmadas, mantenimiento y uso del propietario — precisamente para
que todo comparta la misma restricción de exclusión. Un bloqueo de
mantenimiento impide vender esas noches por la misma vía que una reserva.

```sql
EXCLUDE USING gist (unit_id WITH =, stay WITH &&) WHERE (released_at IS NULL)
```

El rango es `daterange`, que Postgres normaliza a `[entrada, salida)`. Por eso
la salida de un huésped y la llegada del siguiente el mismo día no cuentan como
traslape. En TypeScript el tipo es `DateRange` (`src/db/types.ts`), con `from`
inclusivo y `to` exclusivo.

## El desglose de la cotización

`bookings.quote` y `booking_items.quote` guardan el desglose completo, no solo
el total: en seis meses alguien va a preguntar por qué esa noche costó eso y la
tarifa de temporada ya habrá cambiado.

```json
{
  "currency": "MXN",
  "lines": [
    { "concept": "2026-09-17", "cents": 320000, "kind": "nightly" },
    { "concept": "2026-09-18", "cents": 390000, "kind": "nightly" },
    { "concept": "2026-09-19", "cents": 390000, "kind": "nightly" },
    { "concept": "occupancy:1x3", "cents": 180000, "kind": "occupancy" },
    { "concept": "cleaning", "cents": 80000, "kind": "fee" },
    { "concept": "ISH Quintana Roo", "cents": 40800, "kind": "tax" },
    { "concept": "IVA", "cents": 217600, "kind": "tax" }
  ],
  "total_cents": 1618400,
  "deposit_pct": 40,
  "deposit_cents": 647360,
  "balance_cents": 971040,
  "nights": [
    { "night": "2026-09-17", "cents": 320000, "rate_id": "…" }
  ],
  "quoted_at": "2026-09-01T12:00:00.000Z"
}
```

**`concept` es una clave, no un texto.** El motor de precios no arma frases
porque no sabe en qué idioma está leyendo el huésped: emite `occupancy:1x3` y la
interfaz lo traduce a "1 huésped extra × 3 noches" o "1 extra guest × 3 nights".
Los nombres de impuestos y cupones sí van tal cual, porque vienen configurados y
ya son legibles.

Cuando el Sprint 3 congele la cotización en la reserva, guardará además el texto
ya traducido al idioma del huésped: un comprobante que se relee dos años después
no debe depender del código de hoy para ser legible.

Reglas invariantes, verificadas en cada caso de prueba:

1. `lines` suma **exactamente** `total_cents`;
2. `deposit_cents + balance_cents` es **exactamente** `total_cents`;
3. los descuentos van en negativo;
4. `balance_cents` en la reserva es columna derivada y no se escribe a mano.

## Máquina de estados de la reserva

```
hold ──anticipo pagado──► confirmed ──check-in──► in_progress ──check-out──► completed
 │                          │  │
 └─15 min sin pago─► expired│  └─pasó la fecha─► no_show
                            └─cancela huésped o staff─► cancelled
```

Cada transición escribe en `booking_events` el **hecho** que la provocó, no el
cambio que produjo. El reembolso no es un estado de la reserva: vive en la
máquina del pago, porque una reserva cancelada puede quedar con o sin
devolución.

## Funciones del dominio

| Función | Qué garantiza |
|---|---|
| `resolve_deposit_pct(product)` | cascada producto → global → 30 |
| `stay_is_available(unit, range)` | consulta sin efectos |
| `stay_nightly_rates(unit, range)` | tarifa **y restricciones** noche por noche; una noche sin tarifa sale `null` para que la app se niegue en lugar de inventar un precio |
| `stay_rate_at(unit, date)` | tarifa de un día suelto; se usa con el día de salida, que no es una noche pero cuya tarifa decide si admite salidas |
| `stay_availability_range(unit, range)` | disponibilidad noche por noche para el calendario, **sin el motivo del bloqueo** |
| `stay_hold_create(...)` | aparta noches o falla con `AM002` |
| `tour_seats_left(departure)` | lugares disponibles |
| `tour_hold_create(...)` | aparta lugares con `FOR UPDATE` o falla con `AM001` |
| `booking_confirm(booking, actor)` | idempotente; convierte holds en ocupación firme, registra el saldo y encola avisos |
| `booking_expire_holds()` | libera inventario de holds vencidos y de apartados huérfanos; seguro con varios workers a la vez |

## Detalle a no perder de vista

`booking_expire_holds()` distingue dos casos. Los apartados que pertenecen a
una reserva se liberan según el vencimiento **de la reserva**
(`bookings.deposit_due_at`), no el del apartado. Los apartados huérfanos —los
que se crearon durante un checkout que se abandonó antes de que existiera la
reserva— se liberan por su propio `expires_at`. Sin ese segundo barrido esas
fechas y esos lugares quedarían fuera de venta para siempre.
