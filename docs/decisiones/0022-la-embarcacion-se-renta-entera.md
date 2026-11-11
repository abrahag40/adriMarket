# 0022 · La embarcación se renta entera

**Fecha:** 2026-11-10 · **Estado:** aceptada

## Contexto

Adri mandó 18 fichas en PDF (16 barcos: dos venían duplicadas) para vender en
adriMarket: lanchas de pesca, yates y catamaranes. Ninguna vende lugares en una
salida compartida. Todas venden **el barco**, por duración ("4 horas", "8 horas
Cozumel"), en **dólares**, con un precio que cubre a un grupo de hasta N personas.
Encima va un cargo por cada pasajero extra (a veces con niños al 50%) y una cuota
de muelle por persona.

El motor solo sabía cobrar por pasajero. Cargarlas así habría exhibido un precio
que el operador no cobra. Y el inventario no veía que "4 horas a las 9:00" y
"8 horas a las 9:00" son **el mismo casco**: cada una es una salida con su propio
contador.

## Decisión

**Un barco es un tour con opciones privadas.** Migración `0025`:

- `tour_options.pricing_mode = 'private'`, con el precio del barco
  (`private_price_cents`), cuántas personas cubre (`private_included_pax`) y la
  cuota de muelle por persona (`per_pax_fee_cents`). `tour_pax_prices` pasa a ser
  el precio del pasajero **extra**, por tipo.
- La cotización (`charterLines` en `quote.ts`) cobra el barco y luego a quien no
  cabe en lo incluido. **Los adultos llenan primero lo incluido**, así que un niño
  solo paga extra si el barco ya se llenó de adultos. La cuota de muelle va al
  final: el cupón no la descuenta y el impuesto no la grava, porque no es dinero
  del operador.
- **La garantía:** cada apartado de una opción privada guarda el producto y el
  rango de horas (`tour_seat_holds.period`). Una restricción de exclusión impide
  que dos apartados vivos del mismo barco se traslapen. Vive en `tour_seat_holds`
  porque **todos** los caminos que liberan (cancelar, vencer, reprogramar, cerrar
  el puerto) ya marcan `released_at` ahí. La garantía se suelta sola, sin
  acordarse de cinco funciones.
- Un apartado privado toma el cupo entero de su salida, y `tour_seats_left`
  responde 0 si otra opción del mismo barco se encima. El calendario y la
  cotización dejan de ofrecer un barco ocupado.
- La ficha ofrece **elegir la opción** cuando hay más de una. Un tour de una sola
  opción no ve nada nuevo.

Lo prueban la garantía 27, cinco casos de `quote.test.ts`, doce criterios de
`smoke.sh` y el escenario D de `npm run db:bench`: 40 clientes piden el mismo
barco a la misma hora, cada uno en una duración distinta, y gana uno solo. Se
comprobó que la 27 y el escenario D **fallan sin la restricción de exclusión**:
sin ella el banco reporta tres ganadores, uno por duración.

Lo que el banco **no** demostró: que el cerrojo consultivo sea indispensable.
Seis corridas de 60 clientes sin él no produjeron un interbloqueo. Se queda por
la misma razón que en la 0020 (dos inserciones que chocan en una exclusión pueden
esperarse entre sí), y porque cuesta lo mismo que no tenerlo: serializa solo los
apartados del mismo barco. El escenario D exige que **todos** los intentos
terminen en un sí o en un AM001, así que el día que aparezca un interbloqueo lo
reporta como fallo, no como éxito.

## Alternativas descartadas

**La renta por fechas (`rental_blocks`, la de casas y vehículos).** Ya tiene la
unidad concreta y la exclusión sobre rangos. Pero razona en días (`daterange`), y
el huésped de un barco elige lo mismo que en un tour: una duración y una hora.
Pasarla a horas tocaba las diez funciones de renta. Montarlo sobre los tours
reusa ficha, checkout, manifiesto y cierre de puerto tal como están.

**Aproximar por persona** (precio del barco ÷ cupo). Era lo más rápido, pero el
total cobrado no coincidiría con la tarifa del operador.

**Un tipo de producto nuevo (`boat`).** Para el huésped, un barco se compra igual
que un tour. Un cuarto tipo habría que enseñárselo a veinte archivos que preguntan
por `kind`, que es justo la trampa que `isRental` existe para evitar.

## Supuestos que hay que confirmar con Adri

La carga (`db/seed/embarcaciones_adri.sql`) los marca con «SUPUESTO»:

1. **Marina de cada barco.** Las fichas no lo dicen. Sin ella no hay destino ni
   punto de encuentro, y no se publica. Se carga con
   `db/arreglos/marinas-embarcaciones.sql`.
2. **Hora de salida:** 9:00 para todas. Si hay turno de tarde, es una opción más.
3. **Duración de "Cozumel"** sin horas en la ficha: 8 horas (10 en el Cracovia,
   que la cotiza por encima de sus 10 horas).
4. **Cupo máximo** del Sea Ray 55 y del Cracovia. Dan precio de pasajero extra
   pero no el tope. Hasta saberlo, no se venden extras en línea. El Sea Ray
   Sedan 40 queda en 15.
5. **Hatteras a Cozumel:** la ficha no trae precio, así que no se vende.
6. **Pasajero extra en Cozumel** del Cracovia (US$80) y del Sea Ray 55 (US$120):
   se tomó el de la duración más larga.
7. **Recargo de 10% con tarjeta o PayPal** (ficha del Fontaine). El anticipo en
   línea se paga con tarjeta. Hoy se cobra el precio de la ficha, sin recargo.
8. **Impuestos.** No hay tasas configuradas fuera de Tulum, así que se cobra el
   precio de la ficha. Si un barco zarpa de Tulum, el sistema le suma el 16% de
   IVA configurado ahí.
9. **Bruce Roberts 72 y Burger 80** tienen fichas idénticas (precios, cupo y
   menú). Hay que confirmar que no sea un copiar y pegar.
10. **Fotos:** el Catamarán 65, el Bruce Roberts 72, la Cabo 31 y la Dusky 33 solo
    traen fotos de 720 px, bajo el mínimo de 800 del panel. Agrandarlas las haría
    borrosas, así que hacen falta los originales.

## Lo que queda como deuda

- **El panel muestra las opciones privadas, pero no las crea ni las edita**:
  entran por SQL, igual que los extras de tour. Es la siguiente historia del panel.
- **Las salidas cubren 120 días.** Correr la carga otra vez agrega los días que
  faltan, sin tocar los existentes.
- **La hora extra** (US$250 a US$650 según el barco) no se vende en línea. Se
  arregla a bordo y así lo dice la ficha.
- El checkout pide el nombre de cada pasajero: 80 en el barco grande. Para el
  manifiesto sirve, pero para quien reserva es mucho.
