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
# La protección —enseñar el destino antes de escribir— vale para cualquier
# guion de `db/seed/`, no solo para este. `SEED_FILE` elige cuál se aplica:
#
#   SEED_FILE=db/seed/catalogo_caribe.sql ./scripts/demo-content.sh --from-env
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
seed_file="${SEED_FILE:-db/seed/demo_content.sql}"

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

  # Se lee sin interpretar: un `&` en la cadena mandaría la asignación a
  # segundo plano y la variable llegaría vacía. Ver scripts/cargar-env.sh.
  # shellcheck source=scripts/cargar-env.sh
  source "$(dirname "$0")/cargar-env.sh"
  cargar_env "$env_file"

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

# Se enseña el destino, pero con el identificador del servidor TAPADO.
#
# Enseñarlo entero no bastó. El 2026-09-04 se pegó aquí la cadena de otro
# proyecto de Neon: el destino salió impreso, correcto y completo, y aun así
# pasó. Cuando las dos cadenas empiezan igual —`postgresql://***@ep-…-pooler
# .…aws.neon.tech/neondb`— la diferencia son ocho caracteres a media línea, y
# el ojo lee lo que espera. **Leer no es verificar.**
#
# Así que se tapa justo la parte que distingue una base de otra y hay que
# escribirla. Quien no sabe en qué servidor está, no escribe nada, que es
# exactamente lo que debe pasar.
host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^@]*@##; s#[:/?].*$##')"
servidor="${host%%.*}"
resto="${host#"$servidor"}"

if [[ "$DATABASE_URL" == *localhost* || "$DATABASE_URL" == *127.0.0.1* ]]; then
  echo "→ destino:  $(printf '%s' "$DATABASE_URL" | sed -E 's#://[^@/]*@#://***@#')"
else
  echo "→ destino:  ***@${servidor%%-*}-••••••••${resto}  (servidor tapado a propósito)"
fi
echo "→ guion:    $seed_file"
echo

if [[ "$DATABASE_URL" != *localhost* && "$DATABASE_URL" != *127.0.0.1* ]]; then
  if [[ "${DB_CONFIRM:-}" == "si" ]]; then
    echo "  (DB_CONFIRM=si: se continúa sin preguntar)" >&2
  elif { : < /dev/tty; } 2>/dev/null; then
    printf 'Escribe el identificador del servidor (ep-…) para continuar: ' >&2
    IFS= read -r respuesta < /dev/tty || respuesta=""
    # Se acepta con o sin el sufijo -pooler: la consola de Neon lo enseña de
    # las dos formas y no es la parte que distingue nada.
    if [[ "${respuesta%-pooler}" != "${servidor%-pooler}" ]]; then
      echo "  No coincide con este servidor. Cancelado, no se tocó nada." >&2
      exit 1
    fi
    echo >&2
  else
    echo "Sin terminal para confirmar. Exporta DB_CONFIRM=si si es a propósito." >&2
    exit 1
  fi
fi

if [[ ! -f "$seed_file" ]]; then
  echo "No existe $seed_file (se eligió con SEED_FILE)." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q -f "$seed_file"
