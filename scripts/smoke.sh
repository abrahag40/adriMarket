#!/usr/bin/env bash
# smoke.sh — verifica los criterios de aceptación del Sprint 1 contra un
# servidor corriendo. Es la evidencia que se presenta en el Sprint Review.
#
#   BASE_URL=http://127.0.0.1:3000 ./scripts/smoke.sh
#
# Cada bloque corresponde a un criterio escrito en docs/sprint-01.md.
# Sale con código distinto de cero al primer fallo.

set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
PASS=0
FAIL=0

ok() { printf '  \033[32m✔\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
no() { printf '  \033[31m✘\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }

status() { curl -s -o /dev/null -w '%{http_code}' "$BASE_URL$1"; }
body() { curl -s "$BASE_URL$1"; }

expect_status() {
  local path="$1" want="$2" label="$3" got
  got="$(status "$path")"
  if [[ "$got" == "$want" ]]; then ok "$label ($path → $got)"; else no "$label ($path → $got, esperado $want)"; fi
}

expect_contains() {
  local path="$1" needle="$2" label="$3"
  if body "$path" | grep -qF -- "$needle"; then ok "$label"; else no "$label — no se encontró: $needle"; fi
}

expect_absent() {
  local path="$1" needle="$2" label="$3"
  if body "$path" | grep -qF -- "$needle"; then no "$label — apareció: $needle"; else ok "$label"; fi
}

expect_matches() {
  local path="$1" pattern="$2" label="$3"
  if body "$path" | grep -qiE -- "$pattern"; then ok "$label"; else no "$label — no coincidió: $pattern"; fi
}

expect_count() {
  local path="$1" needle="$2" want="$3" label="$4" got
  got="$(body "$path" | grep -oF -- "$needle" | wc -l | tr -d ' ')"
  if [[ "$got" == "$want" ]]; then ok "$label ($got)"; else no "$label ($got, esperado $want)"; fi
}

expect_redirect() {
  local path="$1" header="$2" want="$3" label="$4" got
  got="$(curl -s -o /dev/null -w '%{redirect_url}' -H "$header" "$BASE_URL$path")"
  if [[ "$got" == *"$want" ]]; then ok "$label ($got)"; else no "$label (→ $got, esperado …$want)"; fi
}

echo
echo "S1-3 · rutas en dos idiomas"
expect_status "/es" 200 "el listado responde en español"
expect_status "/en" 200 "el listado responde en inglés"
expect_contains "/es" '<html lang="es"' "el documento declara lang=es"
expect_contains "/en" '<html lang="en"' "el documento declara lang=en"
expect_redirect "/" "Accept-Language: en-US,en;q=0.9" "/en" "la raíz manda a inglés si el navegador lo prefiere"
expect_redirect "/" "Accept-Language: es-MX,es;q=0.9" "/es" "la raíz manda a español si el navegador lo prefiere"
expect_redirect "/" "Accept-Language: de-DE,de;q=0.9" "/es" "un idioma no soportado cae en español"
# Next emite el atributo como hrefLang; HTML no distingue mayúsculas, así que
# la comprobación tampoco debe hacerlo. Se exige URL absoluta porque los
# buscadores ignoran hreflang relativo.
expect_matches "/es/estancias/casa-akumal" 'hreflang="en" href="https?://[^"]*/en/stays/casa-akumal"' "la ficha declara su alternativa en inglés con URL absoluta"
expect_matches "/en/stays/casa-akumal" 'hreflang="es" href="https?://[^"]*/es/estancias/casa-akumal"' "la ficha declara su alternativa en español con URL absoluta"
expect_matches "/es/estancias/casa-akumal" 'rel="canonical" href="https?://' "la ficha declara canonical absoluto"
expect_contains "/es/estancias/casa-akumal" '/en/stays/casa-akumal' "el selector de idioma traduce el segmento de la URL"
expect_status "/en/estancias/casa-akumal" 404 "el segmento en español no existe en inglés"

echo
echo "S1-4 · listado y filtros"
expect_contains "/es?kind=tour" "Snorkel en cenotes de Tulum" "el filtro por tipo tour incluye los tours"
expect_absent "/es?kind=tour" "Casa Akumal" "el filtro por tipo tour excluye las estancias"
expect_contains "/es?kind=stay" "Casa Akumal" "el filtro por tipo estancia incluye las casas"
expect_absent "/es?kind=stay" "Snorkel en cenotes" "el filtro por tipo estancia excluye los tours"
expect_contains "/es?guests=6" "Casa Akumal" "capacidad 6: aparece la casa para 6"
expect_absent "/es?guests=6" "Depa en el centro" "capacidad 6: no aparece el estudio para 2"
expect_contains "/es?location=playa-del-carmen" "Catamarán al arrecife" "el filtro por ubicación funciona"
expect_absent "/es?location=playa-del-carmen" "Casa Akumal" "el filtro por ubicación excluye otras ubicaciones"
expect_contains "/es?kind=tour&guests=20" "Catamarán al arrecife" "dos filtros combinados"
expect_contains "/es?guests=49" "Nada coincide con esos filtros" "sin resultados se explica, no se deja vacío"
expect_contains "/es?guests=49" "Quitar filtros" "sin resultados se ofrece la salida"
expect_status "/es?guests=abc&kind=inventado" 200 "un filtro inválido se ignora en lugar de reventar"
expect_status "/es?guests=-5" 200 "un número negativo se ignora"
# Tres de los cuatro productos publicados tienen foto. El cuarto no debe
# reservar un hueco vacío en su tarjeta.
expect_count "/es" 'class="card-media"' 3 "solo las tarjetas con foto reservan espacio de imagen"

echo
echo "S1-4 · solo lo publicado llega a la vitrina"
expect_absent "/es" "Tour en borrador" "el borrador no aparece en el listado"
expect_status "/es/tours/borrador-no-publicado" 404 "la ficha del borrador responde 404"
expect_status "/es/estancias/depa-centro-tulum" 200 "el producto publicado solo en español sí responde en /es"
expect_status "/en/stays/depa-centro-tulum" 404 "y responde 404 en /en por no tener traducción"

echo
echo "S1-5 · ficha de producto"
expect_contains "/es/estancias/casa-akumal" "Recámaras" "la estancia muestra sus especificaciones"
expect_contains "/es/estancias/casa-akumal" "Qué incluye" "la estancia muestra qué incluye"
expect_contains "/es/estancias/casa-akumal" "Qué no incluye" "la estancia muestra qué no incluye"
expect_contains "/es/estancias/casa-akumal" "noches mínimo" "la estancia muestra el mínimo de noches"
expect_contains "/es/tours/snorkel-cenotes-tulum" "Punto de encuentro" "el tour muestra el punto de encuentro"
expect_contains "/es/tours/snorkel-cenotes-tulum" "Adulto" "el tour muestra precios por tipo de pasajero"
expect_contains "/es/tours/snorkel-cenotes-tulum" "Sin costo" "el infante aparece sin costo"
expect_contains "/en/tours/snorkel-cenotes-tulum" "Meeting point" "la ficha en inglés está en inglés"
expect_contains "/es/estancias/casa-akumal" "Desde" "la ficha muestra precio desde"
expect_status "/es/estancias/no-existe-esta-casa" 404 "un slug inexistente responde 404"

echo
echo "S2-1 · cotización de estancia"
CASA="/es/estancias/casa-akumal"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" "\$16,184" "total de 3 noches con huésped extra, limpieza e impuestos"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" "\$6,474" "anticipo del 40% de este producto"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" "\$9,710" "saldo a pagar en destino"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" "Anticipo hoy (40%)" "se dice qué se paga hoy"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" "Saldo al llegar" "se dice qué se paga al llegar"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" "Limpieza" "la limpieza aparece como concepto"
# El precio del catálogo también incluye impuestos: 3,200 netos son 3,808 con
# ISH e IVA. La ley obliga a exhibir el total.
expect_contains "$CASA" "\$3,808" "el precio desde se exhibe con impuestos incluidos"
expect_contains "$CASA?from=2029-03-01&to=2029-03-04&guests=5" "No tenemos tarifa publicada" "sin tarifa no se inventa un precio"
expect_absent "$CASA?from=2029-03-01&to=2029-03-04&guests=5" "quote-total" "y no se muestra ningún total"

echo
echo "S2-5 · restricciones de estancia"
expect_contains "$CASA?from=2026-12-24&to=2026-12-26&guests=5" "mínimo es de 4 noches" "el mínimo de la temporada alta se explica"
expect_contains "$CASA?from=2026-12-24&to=2026-12-28&guests=5" "quote-total" "con cuatro noches sí cotiza"
expect_contains "/en/stays/casa-akumal?from=2026-12-24&to=2026-12-26&guests=5" "minimum of 4 nights" "la restricción se explica en inglés"

echo
echo "S2-2 · cotización de tour por tipo de pasajero"
TOUR="/en/tours/snorkel-cenotes-tulum"
expect_contains "$TOUR?adults=2&children=1&infants=1" "Adult × 2" "los adultos se cobran por cabeza"
expect_contains "$TOUR?adults=2&children=1&infants=1" "Child × 1" "el menor tiene su propia tarifa"
expect_absent "$TOUR?adults=2&children=1&infants=1" "Infant × 1" "el infante sin costo no genera línea"
expect_contains "$TOUR?adults=2&children=1&infants=1" "Deposit today (30%)" "el tour hereda el anticipo global"
expect_contains "$TOUR" "seats left" "el desplegable dice cuántos lugares quedan"

echo
echo "S2-3 · calendario de disponibilidad"
expect_contains "$CASA?month=2026-10-01" "cal-busy" "el bloqueo de mantenimiento se ve ocupado"
expect_absent "$CASA?month=2026-10-01" "Pintura de la terraza" "no se revela el motivo del bloqueo"
expect_absent "$CASA?month=2026-10-01" "mantenimiento" "tampoco la palabra mantenimiento"
expect_contains "$CASA?month=2026-10-01" 'cal-busy"><span class="cal-number">5<' "la primera noche bloqueada se ve ocupada"
expect_contains "$CASA?month=2026-10-01" 'cal-busy"><span class="cal-number">8<' "la última noche bloqueada también"
expect_contains "$CASA?month=2026-10-01" 'cal-free"><span class="cal-number">9<' "el día de salida queda libre: otro huésped puede llegar ese día"
expect_contains "$CASA?month=2026-10-01" 'cal-free"><span class="cal-number">4<' "la noche previa al bloqueo sigue libre"
expect_contains "$CASA?month=2026-10-01" "octubre de 2026" "el mes se nombra en el idioma de la página"
expect_contains "/en/stays/casa-akumal?month=2026-10-01" "October 2026" "y en inglés"

echo
echo "S2-4 · el selector funciona sin JavaScript y el precio lo calcula el servidor"
expect_contains "$CASA" 'method="get"' "el formulario es GET: funciona sin JavaScript"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" 'value="2026-09-17"' "la selección queda en la URL y se refleja en el campo"
# El total viene en el HTML de la primera respuesta: no lo calculó el navegador.
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" 'class="quote-total"' "el desglose llega renderizado del servidor"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=6&month=2026-10-01" "quote-total" "el mes del calendario no rompe la cotización"

echo
echo "S1-2 · accesibilidad básica"
expect_contains "/es" "Ir al contenido" "hay enlace para saltar al contenido"
expect_contains "/en" "Skip to content" "el enlace de salto también está traducido"
expect_contains "/es" 'id="content"' "el destino del salto existe"
expect_contains "/es" 'alt="' "las imágenes llevan texto alternativo"
expect_contains "/es" 'prefers-color-scheme' "los dos temas están definidos"
expect_contains "/es" '<label for="guests"' "los campos del filtro tienen etiqueta asociada"
expect_contains "/es/estancias/casa-akumal" '<label for="from"' "los campos del selector también"

echo
printf '\n%s\n' "----------------------------------------"
if [[ $FAIL -eq 0 ]]; then
  printf '\033[32m%d criterios verificados, 0 fallos\033[0m\n' "$PASS"
  exit 0
fi
printf '\033[31m%d fallos de %d criterios\033[0m\n' "$FAIL" "$((PASS + FAIL))"
exit 1
