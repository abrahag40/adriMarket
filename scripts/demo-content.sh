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
#   ./scripts/demo-content.sh              # usa .env (desarrollo)
#   ./scripts/demo-content.sh archivo.env  # usa ese archivo
#   ./scripts/demo-content.sh --from-env   # usa la DATABASE_URL ya exportada
#
# **Para producción no sirve `vercel env pull`.** DATABASE_URL está marcada
# como sensible en el proyecto de Vercel, y las sensibles son de solo
# escritura: el archivo baja con `DATABASE_URL=""`. La cadena se saca de la
# consola de Neon y se pasa sin dejarla en el historial:
#
#   read -rs DATABASE_URL; export DATABASE_URL
#   ./scripts/demo-content.sh --from-env
#
# La otra opción, sin credenciales en esta máquina, es pegar
# db/seed/demo_content.sql en el editor SQL de Neon.

set -euo pipefail

origen="${1:-}"

if [[ "$origen" == "--from-env" ]]; then
  # La cadena ya viene en el entorno y **no se pisa con .env**, que es el
  # error que comete `scripts/db.sh`. Es el camino para producción: las
  # variables sensibles de Vercel no se pueden volver a leer con
  # `vercel env pull` —salen en blanco— así que la cadena se saca de Neon y
  # se pasa sin dejarla en el historial:
  #
  #   read -rs DATABASE_URL; export DATABASE_URL
  #   ./scripts/demo-content.sh --from-env
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Con --from-env, DATABASE_URL tiene que venir exportada." >&2
    exit 1
  fi
  cd "$(dirname "$0")/.."
  echo "→ origen:   DATABASE_URL del entorno"
else
  # La ruta del archivo se resuelve **antes** de moverse al repositorio: si
  # no, un `.env.production.local` relativo se buscaría en la raíz del
  # proyecto y no donde está parado quien corre esto.
  env_file="${origen:-.env}"
  if [[ "$env_file" != /* ]]; then
    env_file="$PWD/$env_file"
  fi

  cd "$(dirname "$0")/.."

  if [[ ! -f "$env_file" ]]; then
    echo "No existe $env_file." >&2
    echo "Para producción, ver --from-env en la cabecera de este guion." >&2
    exit 1
  fi

  # `source` en subshell no serviría: las variables se necesitan aquí.
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a

  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "$env_file no trae DATABASE_URL (o la trae vacía)." >&2
    echo >&2
    echo "Si lo bajaste con 'vercel env pull': las variables marcadas como" >&2
    echo "sensibles en Vercel son de solo escritura y salen en blanco. Saca la" >&2
    echo "cadena de Neon y usa --from-env (ver la cabecera de este guion)." >&2
    exit 1
  fi

  echo "→ archivo:  $env_file"
fi

# Se enseña el destino con la contraseña tapada: es la única forma de saber,
# antes de escribir, si vamos a la base que creemos.
destino="$(printf '%s' "$DATABASE_URL" | sed -E 's#://[^@/]*@#://***@#')"
echo "→ destino:  $destino"
echo

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q -f db/seed/demo_content.sql
