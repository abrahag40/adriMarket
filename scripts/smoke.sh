#!/usr/bin/env bash
# smoke.sh — verifica los criterios de aceptación del Sprint 1 contra un
# servidor corriendo. Es la evidencia que se presenta en el Sprint Review.
#
#   BASE_URL=http://127.0.0.1:3000 ./scripts/smoke.sh
#
# Cada bloque corresponde a un criterio escrito en docs/sprint-01.md.
# Sale con código distinto de cero al primer fallo.

set -uo pipefail

cd "$(dirname "$0")/.."

# Carga `.env` si existe, como hacen los demás scripts.
#
# Sin esto, `JOBS_SECRET` llega vacío y el latido que provoca el bloque S7 se
# rechaza con 401 en silencio, así que `/api/health` responde 503 y la barra
# falla **solo la primera vez** que se corre sobre una base recién creada —
# después cualquier otro recorrido ya dejó un latido y el fallo desaparece.
# Un fallo que se cura solo al segundo intento es peor que uno constante.
if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

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

expect_status_method() {
  local method="$1" path="$2" want="$3" label="$4" got
  got="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' -d '{}' "$BASE_URL$path")"
  if [[ "$got" == "$want" ]]; then ok "$label ($path → $got)"; else no "$label ($path → $got, esperado $want)"; fi
}

# El middleware del Sprint 1 redirigía /api hacia /es/api: un proveedor de pagos
# no sigue redirecciones ni firma la URL nueva, así que la reserva nunca se
# confirmaba. Esta comprobación existe para que no vuelva a pasar.
expect_not_redirect() {
  local method="$1" path="$2" label="$3" got
  got="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' -d '{}' "$BASE_URL$path")"
  if [[ "$got" == 3* ]]; then no "$label (→ $got)"; else ok "$label (→ $got, no es redirección)"; fi
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
# Un producto sin fotos no reserva el hueco de la imagen: un rectángulo gris se
# lee como "no cargó" y en una vitrina eso resta confianza.
#
# Se comprueba en la ficha y no contando el listado. Contar medía cuánto
# inventario hay —que cambia cada vez que alguien publica algo— en vez de la
# propiedad, y se rompía sola; y el listado no tiene filtro de texto, así que
# tampoco se puede aislar un producto ahí.
expect_absent "/es/estancias/depa-centro-tulum" 'class="gallery"' \
  "el producto sin fotos no reserva espacio de imagen"
expect_contains "/es/estancias/casa-akumal" 'class="gallery"' "y el que sí tiene fotos lo reserva"
expect_contains "/es?guests=6" 'class="card-media"' "las tarjetas con foto la muestran"

echo
echo "S1-4 · solo lo publicado llega a la vitrina"
expect_absent "/es" "Tour en borrador" "el borrador no aparece en el listado"
expect_status "/es/tours/borrador-no-publicado" 404 "la ficha del borrador responde 404"
expect_status "/es/estancias/depa-centro-tulum" 200 "el producto publicado solo en español sí responde en /es"
expect_status "/en/stays/depa-centro-tulum" 404 "y responde 404 en /en por no tener traducción"

echo
echo "S1-5 · ficha de producto"
expect_contains "/es/estancias/casa-akumal" "recámaras" "la estancia muestra sus especificaciones"
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
echo "S3 · checkout y cobro del anticipo"
# Este bloque necesita que 2026-09-17→20 esté libre en la Casa Akumal, porque
# comprueba montos exactos y no puede consultar la base para elegir fechas.
#
# **Ese rango está reservado para smoke.sh.** Los recorridos de navegador trabajan
# en otros años a propósito: el del checkout busca jueves libres desde el 24 de
# septiembre y los del panel operan en 2028. Un recorrido nuevo que venda aquí
# rompe cinco criterios sin que nada del sistema esté mal.
CHECKOUT="/es/checkout?kind=stay&slug=casa-akumal&from=2026-09-17&to=2026-09-20&guests=5"
expect_contains "$CASA?from=2026-09-17&to=2026-09-20&guests=5" 'href="/es/checkout' "la ficha ofrece reservar cuando hay disponibilidad"
expect_contains "$CHECKOUT" "Confirma tu reserva" "el checkout responde"
expect_contains "$CHECKOUT" "\$6,474" "el checkout vuelve a calcular el anticipo en el servidor"
expect_contains "$CHECKOUT" 'name="fullName"' "pide los datos del titular"
expect_contains "$CHECKOUT" "Acepto la política de cancelación" "exige aceptar la política"
expect_contains "$CHECKOUT" "noindex" "el checkout no se indexa"
expect_status "/es/reserva/AM-NOEXISTE" 404 "un código de reserva inexistente responde 404"
# El checkout de un tour pide nombre y edad de los menores, no documento. La
# salida se toma del desplegable de la ficha, que es de donde la tomaría un
# huésped: inventarla haría que la comprobación probara otra cosa.
DEPARTURE="$(body "/es/tours/snorkel-cenotes-tulum" | grep -oE 'value="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"' | head -1 | cut -d'"' -f2)"
if [[ -n "$DEPARTURE" ]]; then
  TOURCHK="/es/checkout?kind=tour&slug=snorkel-cenotes-tulum&departure=$DEPARTURE&adults=2&children=1&infants=0"
  expect_contains "$TOURCHK" "Edad" "en un tour se pide la edad del menor"
  expect_absent "$TOURCHK" "Documento" "y nunca un documento de identidad"
  expect_contains "$TOURCHK" 'name="paxName"' "cada pasajero se captura por separado"
  expect_contains "$TOURCHK" 'name="paxAge"' "y el menor lleva campo de edad"
else
  no "no se pudo extraer una salida de la ficha del tour"
fi

echo
echo "S3 · el webhook y el worker"
expect_status_method POST "/api/webhooks/local" 400 "una firma inválida se rechaza"
expect_not_redirect POST "/api/webhooks/local" "el webhook no se redirige por el prefijo de idioma"
expect_status_method POST "/api/jobs/tick" 401 "el latido del worker exige secreto"

echo
echo "S4 · el panel no se entra sin sesión"
# El panel se protege en el servidor, no escondiendo enlaces. Cada ruta se
# comprueba por separado: proteger el índice y olvidar una sección es la forma
# más común de dejar una puerta abierta.
for ruta in /admin /admin/reservas /admin/calendario /admin/bloqueos /admin/salidas \
            /admin/catalogo /admin/ajustes /admin/bitacora; do
  expect_redirect "$ruta" "Accept-Language: es-MX" "/admin/entrar" "sin sesión, $ruta manda a la pantalla de acceso"
done
expect_status "/admin/entrar" 200 "la pantalla de acceso responde"
expect_contains "/admin/entrar" 'name="email"' "pide el correo del staff"
expect_contains "/admin/entrar" "noindex" "el panel no se indexa"

# El panel NO lleva prefijo de idioma. Antes de arreglarlo, el middleware lo
# mandaba a /es/admin —que no existe— y la operación no podía entrar. Es el
# mismo error que ya había roto el webhook: se comprueba para que no vuelva.
expect_not_redirect GET "/admin/entrar" "el panel no se redirige por el prefijo de idioma"
expect_redirect "/admin" "Accept-Language: en-US,en;q=0.9" "/admin/entrar" "tampoco con el navegador en inglés"

# Un enlace inventado no entrega sesión, y la respuesta no dice por qué.
expect_redirect "/admin/entrar/token-inventado" "Accept-Language: es-MX" "/admin/entrar?vencido=1" "un enlace inválido no abre sesión"

# La pantalla de acceso responde igual exista o no el correo: si distinguiera,
# sería una forma de averiguar quién trabaja aquí.
expect_absent "/admin/entrar" "no existe" "la pantalla de acceso no delata correos"

echo
echo "S5 · el manifiesto tampoco es público"
# El manifiesto lleva nombres, edades de menores y teléfonos. Es el documento
# con más datos personales de todo el sistema y no puede quedar detrás de
# adivinar un UUID.
expect_redirect "/admin/salidas/00000000-0000-0000-0000-000000000000" "Accept-Language: es-MX" \
  "/admin/entrar" "sin sesión, el manifiesto manda a la pantalla de acceso"
# Y el destino es la pantalla de acceso, no /es/admin/...: el prefijo de idioma
# no debe tocar el panel.
expect_redirect "/admin/salidas" "Accept-Language: en-US,en;q=0.9" "/admin/entrar" \
  "las salidas no se redirigen por el prefijo de idioma"

echo
echo "S6 · lo que se publica desde el panel"
# Un borrador no puede llegar a la vitrina por descuido: es la única barrera
# entre "estoy preparando algo" y "lo estoy vendiendo".
expect_absent "/es" "borrador-no-publicado" "un borrador no aparece en el listado"
expect_status "/es/tours/borrador-no-publicado" 404 "y su ficha responde 404"
# Las fotos se sirven como archivos estáticos, sin transformación al leer
# (decisión 0001). Si /media dejara de servirse, la vitrina se queda sin fotos.
expect_not_redirect GET "/media" "las fotos no pasan por el prefijo de idioma"

echo
echo "S7 · listo para producción"
# Un latido antes de preguntar por la salud, porque el primer criterio depende
# de que el worker haya corrido al menos una vez y **eso es correcto**: sobre una
# base recién creada, `/api/health` responde 503 con "nunca ha latido", que es
# justo lo que tiene que decirle a alguien que olvidó configurar el cron. Sin
# esta llamada, la barra fallaba contra una instalación nueva y el fallo no era
# del sistema sino de la barra. En producción el cron ya late; aquí se provoca
# uno, que es idempotente y de paso comprueba que el secreto sirve.
curl -s -o /dev/null -X POST -H "x-job-secret: ${JOBS_SECRET:-}" "$BASE_URL/api/jobs/tick" || true

# La salud responde 503 cuando algo está mal, no 200 con un campo dentro: es lo
# que un monitor entiende sin configurarle reglas.
expect_status "/api/health" 200 "la salud del sistema responde"
expect_contains "/api/health" '"worker"' "y dice si el worker está latiendo"
expect_contains "/api/health" '"refunds"' "y si hay reembolsos atorados"
expect_not_redirect GET "/api/health" "la salud no se redirige por el prefijo de idioma"

# robots.txt no existía: el middleware ya lo excluía —así que alguien lo dio por
# hecho— pero nada lo generaba y respondía 404.
expect_status "/robots.txt" 200 "robots.txt existe"
expect_contains "/robots.txt" "Disallow: /admin" "y bloquea el panel"
expect_contains "/robots.txt" "Sitemap:" "y apunta al sitemap"
expect_status "/sitemap.xml" 200 "el sitemap responde"
expect_contains "/sitemap.xml" "/es/estancias/casa-akumal" "y lista las fichas publicadas"
expect_absent "/sitemap.xml" "borrador-no-publicado" "pero no los borradores"
# Un producto sin traducción responde 404 en ese idioma: listarlo sería mandar
# al rastreador a una página rota.
expect_absent "/sitemap.xml" "/en/stays/depa-centro-tulum" "ni las fichas sin traducir"

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
