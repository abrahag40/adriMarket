-- 0023_extras_de_tour.sql
-- Complementos de un tour: tirolesa, kayak, buffet. Se venden en un paso
-- propio, antes del checkout.
--
-- Lo que este inventario NO es: no se agota. No hay cupo, no hay apartado y no
-- hay carrera que ganar — por eso aquí no aparece ni un `for update` ni un
-- CHECK de contador, a diferencia de tour_departures. Si algún día hay ocho
-- kayaks y no nueve, esto necesita el mismo aparato que las salidas y esa es
-- una migración distinta, no una columna.
--
-- Ver docs/decisiones/0019-el-cupon-no-descuenta-los-extras.md.

begin;

-- ---------------------------------------------------------------------------
-- Catálogo de extras
-- ---------------------------------------------------------------------------

-- Cuelgan del producto y no de la opción de tour: la tirolesa del parque es la
-- misma la venda el horario de las 9:00 o el de las 14:00. Si algún día un
-- extra depende de la variante, se agrega tour_option_id nullable.
create table tour_extras (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products (id) on delete cascade,
  code            text not null,
  name_es         text not null,
  name_en         text,
  -- Una línea de apoyo bajo el nombre: "incluye equipo y guía". Opcional a
  -- propósito; un extra que necesita un párrafo para entenderse no se vende
  -- en una casilla.
  note_es         text,
  note_en         text,
  -- Precio POR LUGAR OCUPADO, no por reserva ni por persona a secas: la
  -- cantidad sale de counts_toward_capacity, que ya distingue al pasajero del
  -- infante en brazos. Un extra por reserva sería otra columna y otra regla;
  -- no se construyó porque nadie la pidió.
  price_cents     bigint not null check (price_cents >= 0),
  active          boolean not null default true,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, code)
);

create index tour_extras_producto_idx on tour_extras (product_id, position)
  where active;

create trigger tour_extras_touch before update on tour_extras
  for each row execute function touch_updated_at();

comment on table tour_extras is
  'Complementos vendibles de un tour. Sin cupo: no se apartan (decisión 0019).';

-- ---------------------------------------------------------------------------
-- Lo que compró cada reserva
-- ---------------------------------------------------------------------------

-- El desglose ya queda congelado en bookings.quote como líneas `extra`, pero
-- eso es jsonb: sirve para releer un comprobante, no para preguntarle a la
-- base cuántos kayaks salen el sábado. Esta tabla es la que responde eso y la
-- que alimenta el manifiesto del guía. Es el mismo reparto que ya existe
-- entre booking_items.pax_breakdown y booking_guests.
create table booking_extras (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings (id) on delete cascade,
  booking_item_id  uuid not null references booking_items (id) on delete cascade,
  -- Se queda en nulo si el extra se borra del catálogo. La reserva no pierde
  -- nada: el código, el nombre y el precio están congelados abajo, por la
  -- misma razón por la que bookings guarda coupon_code además de coupon_id.
  tour_extra_id    uuid references tour_extras (id) on delete set null,
  code             text not null,
  name             text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  qty              integer not null check (qty > 0),
  subtotal_cents   bigint not null check (subtotal_cents >= 0),
  created_at       timestamptz not null default now(),

  -- ► La aritmética del renglón no depende de que la aplicación se acuerde.
  constraint booking_extras_subtotal_cuadra
    check (subtotal_cents = unit_price_cents * qty),
  -- Marcar dos veces la misma casilla no es comprar dos veces.
  unique (booking_item_id, code)
);

create index booking_extras_booking_idx on booking_extras (booking_id);
create index booking_extras_code_idx on booking_extras (code);

comment on constraint booking_extras_subtotal_cuadra on booking_extras is
  'El renglón cuadra por construcción, no por revisión de la aplicación.';

-- ---------------------------------------------------------------------------
-- El cupón, por omisión, no los descuenta
-- ---------------------------------------------------------------------------

-- Un extra revendido deja margen delgado: un cupón del 15% sobre una tirolesa
-- que deja 11% de margen la vende a pérdida. El descuento sale del tour, que
-- es donde está el margen, y el extra se cobra completo.
--
-- Columna propia y no una llave más en `applies_to`: ese campo significa "a
-- qué productos aplica el cupón" y meterle una tercera idea lo vuelve un cajón.
alter table coupons
  add column applies_to_extras boolean not null default false;

comment on column coupons.applies_to_extras is
  'false = el descuento sale solo del servicio base. Los extras cuentan para min_total_cents de todas formas (decisión 0019).';

commit;
