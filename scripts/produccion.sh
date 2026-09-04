#!/usr/bin/env bash
# produccion.sh — trabajar contra producción sin volver a pegar la cadena.
#
#   ./scripts/produccion.sh migrate            aplica las migraciones pendientes
#   ./scripts/produccion.sh sql archivo.sql    corre un archivo SQL
#   ./scripts/produccion.sh psql               abre una sesión interactiva
#
# La cadena vive en `.env.production.local`, que git ignora. Se escribe **una
# vez** y nunca más: el error del 2026-09-04 —migrar la base de otro proyecto
# de Neon— fue de teclado, y un teclado que no se usa no se equivoca.
#
# Ese archivo también ancla a qué servidor pertenece:
#
#   DATABASE_URL=postgresql://…@ep-late-king-avk9v1d6-pooler.…/neondb?sslmode=require
#   PRODUCTION_DB_HOST=ep-late-king-avk9v1d6
#
# Si algún día la cadena del archivo deja de coincidir con ese servidor, esto
# se niega a correr. Una cadena pegada mal se detecta al pegarla, no tres
# comandos después.
#
# **No sirve `vercel env pull`**: DATABASE_URL está marcada como sensible en el
# proyecto de Vercel y las sensibles son de solo escritura, así que el archivo
# baja en blanco. La cadena se saca de la consola de Neon → proyecto
# `adrimarket` → Connect.

set -euo pipefail

cd "$(dirname "$0")/.."

ARCHIVO=".env.production.local"

if [[ ! -f "$ARCHIVO" ]]; then
  cat >&2 <<AYUDA
No existe $ARCHIVO.

Se crea una sola vez, con la cadena de la consola de Neon (proyecto
adrimarket, región US East 1) y el servidor al que debe pertenecer:

  DATABASE_URL=postgresql://…@ep-late-king-avk9v1d6-pooler.…/neondb?sslmode=require
  PRODUCTION_DB_HOST=ep-late-king-avk9v1d6

git lo ignora (.env.* está en .gitignore, menos .env.example).
AYUDA
  exit 1
fi

# Se lee sin interpretar: la cadena de Neon trae `&channel_binding=require`, y
# con `source` ese `&` manda la asignación a segundo plano y la variable llega
# vacía sin decir nada. Ver scripts/cargar-env.sh.
# shellcheck source=scripts/cargar-env.sh
source "$(dirname "$0")/cargar-env.sh"
cargar_env "$ARCHIVO"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "$ARCHIVO no trae DATABASE_URL (o la trae vacía)." >&2
  echo "Si lo bajaste con 'vercel env pull', las variables sensibles salen en" >&2
  echo "blanco: la cadena se saca de la consola de Neon." >&2
  exit 1
fi

host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^@]*@##; s#[:/?].*$##')"
servidor="${host%%.*}"

if [[ -z "${PRODUCTION_DB_HOST:-}" ]]; then
  cat >&2 <<AYUDA
$ARCHIVO no ancla el servidor.

La cadena que trae apunta a:  ${servidor%-pooler}

Si ese es producción, agrega esta línea al archivo y vuelve a correr:

  PRODUCTION_DB_HOST=${servidor%-pooler}

Sirve para que una cadena cambiada por equivocación no pase inadvertida.
AYUDA
  exit 1
fi

if [[ "${servidor%-pooler}" != "${PRODUCTION_DB_HOST%-pooler}" ]]; then
  echo "La cadena de $ARCHIVO NO es la de producción." >&2
  echo "  anclado:  ${PRODUCTION_DB_HOST%-pooler}" >&2
  echo "  la cadena: ${servidor%-pooler}" >&2
  echo "Cancelado, no se tocó nada." >&2
  exit 1
fi

echo "→ producción: ${PRODUCTION_DB_HOST%-pooler} (anclado y verificado)"
echo

case "${1:-}" in
  migrate)
    # Ya está verificado el destino, así que la pregunta interactiva de db.sh
    # sobraría: preguntar dos veces por lo mismo enseña a contestar sin leer.
    # Lo que NO se hereda es el permiso de estrenar esquema: si esta base
    # estuviera vacía, db.sh se niega igual (falta DB_BOOTSTRAP).
    DB_CONFIRM=si ./scripts/db.sh migrate
    ;;
  sql)
    archivo="${2:-}"
    if [[ -z "$archivo" || ! -f "$archivo" ]]; then
      echo "Uso: $0 sql <archivo.sql>" >&2
      exit 1
    fi
    echo "→ guion: $archivo"
    echo
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q -f "$archivo"
    ;;
  psql)
    psql "$DATABASE_URL"
    ;;
  *)
    echo "Uso: $0 {migrate|sql <archivo>|psql}" >&2
    exit 1
    ;;
esac
