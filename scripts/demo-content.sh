#!/usr/bin/env bash
# demo-content.sh — rellena los bloques vacíos de la ficha de producto.
#
# Envuelve db/seed/demo_content.sql para que no pueda escribir en la base
# equivocada sin avisar. La primera corrida contra producción no cambió nada y
# el camino a mano no dejaba forma de saber por qué: si `source` no encuentra
# el archivo, o el archivo no trae DATABASE_URL, `psql ""` se conecta a la
# base local por omisión y el guion "funciona" contra la base de al lado.
#
# Aquí eso truena, y antes de escribir se imprime a qué servidor va a ir con
# la contraseña tapada.
#
#   ./scripts/demo-content.sh                          # .env (desarrollo)
#   ./scripts/demo-content.sh .env.production.local    # producción
#
# Para producción, el archivo se trae así:
#
#   vercel env pull .env.production.local --environment=production --yes
#
# y se borra al terminar: ahí viene la cadena de conexión completa.

set -euo pipefail

cd "$(dirname "$0")/.."

env_file="${1:-.env}"

if [[ ! -f "$env_file" ]]; then
  echo "No existe $env_file." >&2
  echo "Para producción: vercel env pull .env.production.local --environment=production --yes" >&2
  exit 1
fi

# `source` en subshell no serviría: las variables se necesitan aquí.
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "$env_file no trae DATABASE_URL." >&2
  echo "Revisa el nombre de la variable en el proyecto de Vercel." >&2
  exit 1
fi

# Se enseña el destino con la contraseña tapada: es la única forma de saber,
# antes de escribir, si vamos a la base que creemos.
destino="$(printf '%s' "$DATABASE_URL" | sed -E 's#://[^@/]*@#://***@#')"
echo "→ archivo:  $env_file"
echo "→ destino:  $destino"
echo

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q -f db/seed/demo_content.sql
