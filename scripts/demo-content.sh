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
#   ./scripts/demo-content.sh --from-env   (pide la cadena y la lee él mismo)
#
# La otra opción, sin credenciales en esta máquina, es pegar
# db/seed/demo_content.sql en el editor SQL de Neon.

set -euo pipefail

origen="${1:-}"

if [[ "$origen" == "--from-env" ]]; then
  # La cadena viene del entorno y **no se pisa con .env**, que es el error
  # que comete `scripts/db.sh`. Si no viene, se pide aquí adentro.
  #
  # Pedirla aquí y no en la línea de comandos es a propósito: un
  # `read -rs DATABASE_URL` escrito para zsh no muestra prompt, así que se ve
  # como una terminal colgada, se presiona Enter y la variable llega vacía.
  # Este guion corre en bash y `read -rsp` sí imprime el prompt.
  cd "$(dirname "$0")/.."

  if [[ -z "${DATABASE_URL:-}" ]]; then
    # La terminal se prueba abriéndola, no con `-r`: en un entorno sin
    # terminal de control /dev/tty aparece legible y falla al abrirse
    # ("Device not configured"). Si no hay terminal, se acepta por tubería,
    # que es como la pasa un guion.
    if { : < /dev/tty; } 2>/dev/null; then
      printf 'Pega la cadena de conexión de Neon (no se muestra) y Enter: ' >&2
      IFS= read -rs DATABASE_URL < /dev/tty || DATABASE_URL=""
      printf '\n' >&2
    elif [[ ! -t 0 ]]; then
      IFS= read -rs DATABASE_URL || DATABASE_URL=""
    fi
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "Sin cadena de conexión: no hay nada que hacer." >&2
    echo "Se saca de la consola de Neon → Connection string." >&2
    exit 1
  fi

  echo "→ origen:   cadena de conexión dada a mano"
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
