#!/usr/bin/env bash
# clonar-catalogo.sh — copiar el catálogo de un sitio a otro recién creado.
#
#   ./scripts/clonar-catalogo.sh <sitio-origen> <sitio-destino> <correo-de-avisos>
#
#   ./scripts/clonar-catalogo.sh conquest-tours martours abrahamhdz@zahardev.com
#
# Para qué: un sitio nuevo que arranca como réplica de otro (MarTours salió de
# Conquest Tours el 2026-11-05). Ver docs/decisiones/0020.
#
# **Qué cruza y qué no.** Cruza el catálogo: destinos, etiquetas, la política de
# cancelación, impuestos, productos con sus traducciones, fotos, opciones,
# precios, itinerario, extras, salidas y los ajustes. **No** cruza nada que tenga
# dueño: reservas, huéspedes, pagos, reembolsos, cupones, la bandeja de avisos,
# el personal del panel, la bitácora, ni el origen de las fichas
# (`product_sources`, que liga los tours al formulario de intake del cliente de
# origen). El correo de avisos del origen se reemplaza por el que se pasa aquí.
#
# Las fotos se copian **como direcciones**: las que viven en el Blob del origen
# siguen sirviéndose desde ahí hasta que `scripts/mudar-fotos.ts` las sube al
# Blob del destino.
#
# Las cadenas salen de `.env.neon.<sitio>`, verificadas contra su ancla igual
# que en produccion.sh: no se teclean. El origen se lee en una transacción de
# solo lectura. Para probarlo sin tocar producción, el destino puede ser una
# base local: DESTINO_LOCAL=postgres://postgres@127.0.0.1:5444/prueba.
#
# Se niega a correr si el destino ya tiene productos (no mezcla catálogos) o si
# los dos no están en la misma migración (las columnas tienen que coincidir).

set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/cargar-env.sh
source scripts/cargar-env.sh

ORIGEN="${1:-}"; DESTINO="${2:-}"; CORREO="${3:-}"
if [[ -z "$ORIGEN" || -z "$DESTINO" || -z "$CORREO" ]]; then
  echo "Uso: $0 <sitio-origen> <sitio-destino> <correo-de-avisos>" >&2
  exit 1
fi
if [[ "$ORIGEN" == "$DESTINO" ]]; then
  echo "El origen y el destino son el mismo sitio." >&2
  exit 1
fi

# La cadena de un sitio, verificada contra el servidor anclado en su archivo.
cadena_de() {
  (
    unset DATABASE_URL PRODUCTION_DB_HOST
    local archivo=".env.neon.$1"
    cargar_env "$archivo" || { echo "No existe $archivo." >&2; exit 1; }
    local host servidor
    host="$(printf '%s' "${DATABASE_URL:-}" | sed -E 's#^[^@]*@##; s#[:/?].*$##')"
    servidor="${host%%.*}"
    if [[ -z "${DATABASE_URL:-}" || -z "${PRODUCTION_DB_HOST:-}" \
          || "${servidor%-pooler}" != "${PRODUCTION_DB_HOST%-pooler}" ]]; then
      echo "$archivo no trae una cadena anclada a su servidor. Cancelado." >&2
      exit 1
    fi
    printf '%s' "$DATABASE_URL"
  )
}

# El nombre del servidor: el de Neon sin `-pooler`, o la dirección local tal cual.
servidor_de() {
  local host
  host="$(printf '%s' "$1" | sed -E 's#^[^@]*@##; s#[:/?].*$##')"
  case "$host" in
    127.0.0.1|localhost|::1) printf '%s' "$host" ;;
    *) host="${host%%.*}"; printf '%s' "${host%-pooler}" ;;
  esac
}

URL_ORIGEN="$(cadena_de "$ORIGEN")"
if [[ -n "${DESTINO_LOCAL:-}" ]]; then
  case "$(printf '%s' "$DESTINO_LOCAL" | sed -E 's#^[^@]*@##; s#[:/?].*$##')" in
    127.0.0.1|localhost|::1) URL_DESTINO="$DESTINO_LOCAL" ;;
    *) echo "DESTINO_LOCAL solo admite una base local." >&2; exit 1 ;;
  esac
else
  URL_DESTINO="$(cadena_de "$DESTINO")"
fi
if [[ "$(servidor_de "$URL_ORIGEN")" == "$(servidor_de "$URL_DESTINO")" ]]; then
  echo "Las dos cadenas apuntan al mismo servidor. Cancelado." >&2
  exit 1
fi

echo "→ origen:  $ORIGEN ($(servidor_de "$URL_ORIGEN"), solo lectura)"
echo "→ destino: $DESTINO ($(servidor_de "$URL_DESTINO"))"
echo

leer()     { PGOPTIONS='-c default_transaction_read_only=on' psql "$URL_ORIGEN" -X -v ON_ERROR_STOP=1 -At "$@"; }
escribir() { psql "$URL_DESTINO" -X -v ON_ERROR_STOP=1 -At "$@"; }

MIG_O="$(leer -c 'select max(filename) from schema_migrations')"
MIG_D="$(escribir -c 'select max(filename) from schema_migrations')"
if [[ "$MIG_O" != "$MIG_D" ]]; then
  echo "Origen en $MIG_O y destino en $MIG_D: migra primero el que vaya atrás." >&2
  exit 1
fi
if [[ "$(escribir -c 'select count(*) from products')" != "0" ]]; then
  echo "El destino ya tiene productos: este guion no mezcla catálogos." >&2
  exit 1
fi

# En orden de dependencia: cada tabla después de las que referencia.
TABLAS=(
  locations tags cancellation_policies tax_rates
  products product_translations product_tags product_media
  tour_options tour_pax_prices tour_itinerary_steps tour_extras tour_departures
)

carga="$(mktemp)"
trap 'rm -f "$carga"' EXIT

for t in "${TABLAS[@]}"; do
  cols="$(leer -c "select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
                     from information_schema.columns
                    where table_schema = 'public' and table_name = '$t' and is_generated = 'NEVER'")"
  printf 'COPY %s (%s) FROM stdin;\n' "$t" "$cols" >>"$carga"
  leer -c "COPY (select $cols from $t) TO STDOUT" >>"$carga"
  printf '\\.\n' >>"$carga"
done

# Los ajustes, con el valor del origen; la migración pudo haber sembrado alguno.
leer -c "select format('insert into settings (key, value, description) values (%L, %L::jsonb, %L)
                        on conflict (key) do update set value = excluded.value, description = excluded.description;',
                       key, value, description)
           from settings order by key" >>"$carga"

cat >>"$carga" <<SQL
-- Nada en el destino apunta a personas del origen.
update product_media   set uploaded_by = null where uploaded_by is not null;
update tour_departures set guide_staff_id = null where guide_staff_id is not null;
-- Los lugares vendidos son reservas del origen, que no cruzan.
update tour_departures set seats_taken = 0 where seats_taken <> 0;
-- Los avisos de la administración van a quien opera el destino.
update settings set value = jsonb_set(value, '{admin_email}', to_jsonb('$CORREO'::text))
 where key = 'notifications';
SQL

escribir -q -1 -f "$carga" >/dev/null

echo "tabla                  origen  destino"
falla=0
for t in "${TABLAS[@]}" settings; do
  o="$(leer -c "select count(*) from $t")"
  d="$(escribir -c "select count(*) from $t")"
  marca="✓"; [[ "$o" == "$d" ]] || { marca="✗"; falla=1; }
  printf '%s %-22s %6s %8s\n' "$marca" "$t" "$o" "$d"
done
echo
echo "Correo de avisos del destino: $(escribir -c "select value->>'admin_email' from settings where key = 'notifications'")"
exit "$falla"
