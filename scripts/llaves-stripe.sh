#!/usr/bin/env bash
# llaves-stripe.sh — deja las llaves de Stripe donde el proyecto las busca,
# sin que pasen por ningún otro lado.
#
#   ./scripts/llaves-stripe.sh
#
# Pide la llave con el prompt tapado, la valida, y la guarda en `.env.stripe`
# con permisos de solo dueño. El secreto del webhook lo saca del CLI —que ya
# tiene sesión— sin imprimirlo nunca.
#
# ---------------------------------------------------------------------------
# Por qué existe este archivo
# ---------------------------------------------------------------------------
#
# Una llave que se teclea en un chat, en un historial de shell o en un mensaje
# queda ahí. No es desconfianza de nadie: es que los secretos se filtran por
# donde se copian, y el número de copias es lo único que se puede controlar.
# Aquí la llave viaja del portapapeles al archivo y de ahí a ningún lado.
#
# Es la misma razón por la que `demo-content.sh` pide la cadena de Neon con el
# prompt tapado en vez de recibirla por argumento: lo que se escribe en la
# línea de comandos vive después en `~/.zsh_history`.
#
# ---------------------------------------------------------------------------
# Por qué `.env.stripe` y no `.env`
# ---------------------------------------------------------------------------
#
# Poner las llaves de Stripe en `.env` cambia `gatewayState()` a "stripe" para
# todo el desarrollo local: el simulador de pagos se apaga y `npm run test:e2e`
# se cuelga esperando un botón que ya no se dibuja. `.env.stripe` lo lee solo
# `probar:stripe`, y git y Vercel ya lo ignoran por el patrón `.env.*`.

set -euo pipefail

cd "$(dirname "$0")/.."

ARCHIVO=".env.stripe"

echo
echo "Llaves de Stripe · modo de prueba"
echo "─────────────────────────────────"
echo

# --- Las llaves ---------------------------------------------------------------
#
# Tres, y solo una es imprescindible:
#
#   STRIPE_SECRET_KEY       lo que usan la aplicación y la sonda. Obligatoria.
#                           Sirve una secreta (sk_test_) o una restringida
#                           (rk_test_) con permiso de escritura en Checkout
#                           Sessions y en Refunds.
#
#   STRIPE_RESTRICTED_KEY   opcional. Una restringida aparte —de solo lectura,
#                           por ejemplo— para inspeccionar la cuenta sin poder
#                           mover dinero. Separarlas es útil: lo que solo lee no
#                           puede cobrar aunque alguien se equivoque.
#
#   STRIPE_PUBLISHABLE_KEY  opcional y **este proyecto no la usa**. No es un
#                           secreto —está hecha para ir en el navegador— pero
#                           aquí no hay dónde ponerla: el pago ocurre en la
#                           página de Stripe (Checkout alojado), así que no
#                           corre Stripe.js del lado del cliente. Se guarda si
#                           la das, para no discutir con quien la tenga a mano.
#
# La terminal se prueba abriendo /dev/tty y no con `-t`: en un entorno sin
# terminal de control aparece legible y falla al abrirse. Es la lección que ya
# cargaba `demo-content.sh`.

pedir_llave() {
  # $1 nombre de la variable · $2 prefijos válidos · $3 descripción · $4 obligatoria
  local nombre="$1" prefijos="$2" descripcion="$3" obligatoria="$4"
  local valor="${!nombre:-}"

  if [[ -n "$valor" ]]; then
    echo "→ $nombre tomada del entorno"
  elif { : < /dev/tty; } 2>/dev/null; then
    printf '%s\n' "$descripcion"
    printf '  Pega la llave (no se muestra), o Enter para omitir: '
    IFS= read -rs valor < /dev/tty || valor=""
    printf '\n\n'
  fi

  # Espacios de los extremos: pegar desde el panel a veces arrastra uno, y una
  # llave con espacio falla con un error que parece "llave inválida" y no lo es.
  # Es la misma trampa que la contraseña de aplicación de Google.
  valor="${valor//[$' \t\r\n']/}"

  if [[ -z "$valor" ]]; then
    if [[ "$obligatoria" == "si" ]]; then
      echo "✘ $nombre es obligatoria. No se tocó nada." >&2
      exit 1
    fi
    return 0
  fi

  # La guarda que de verdad importa: una llave de producción aquí sería un
  # desastre silencioso. La sonda crea sesiones de cobro **reales**.
  case "$valor" in
    *_live_*)
      echo "✘ $nombre es una llave de PRODUCCIÓN." >&2
      echo >&2
      echo "  Este archivo es para el modo de prueba. La sonda crea sesiones de" >&2
      echo "  cobro reales, y con esta llave le cobraría a personas de verdad." >&2
      echo >&2
      echo "  Enciende 'Modo de prueba' en dashboard.stripe.com/test/apikeys" >&2
      exit 1
      ;;
  esac

  local valida="no" prefijo
  for prefijo in $prefijos; do
    [[ "$valor" == ${prefijo}* ]] && valida="si"
  done
  if [[ "$valida" == "no" ]]; then
    echo "✘ $nombre no tiene el formato esperado (${prefijos// /, }). No se tocó nada." >&2
    exit 1
  fi

  printf -v "$nombre" '%s' "$valor"
  guardadas+=("$nombre")
}

declare -a guardadas=()

pedir_llave STRIPE_SECRET_KEY "sk_test_ rk_test_" \
  "La llave que usan la aplicación y la sonda (sk_test_… o rk_test_…) · OBLIGATORIA" si

pedir_llave STRIPE_RESTRICTED_KEY "rk_test_" \
  "Una restringida aparte para inspeccionar la cuenta (rk_test_…) · opcional" no

pedir_llave STRIPE_PUBLISHABLE_KEY "pk_test_" \
  "La publicable (pk_test_…) · opcional, este proyecto NO la usa" no

# --- El secreto del webhook --------------------------------------------------
#
# No sale del panel: el panel da uno distinto, para un endpoint desplegado. El
# de pruebas locales lo genera `stripe listen`, y `--print-secret` lo devuelve
# solo, sin abrir el reenvío.
secreto=""
if command -v stripe >/dev/null 2>&1; then
  echo "→ pidiéndole al CLI el secreto del webhook…"
  secreto="$(stripe listen --print-secret 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$secreto" == whsec_* ]]; then
    echo "  ✔ obtenido del CLI, sin imprimirlo"
  else
    secreto=""
    echo "  ⚠ el CLI no lo devolvió (¿falta 'stripe login'?)"
  fi
else
  echo "⚠ El CLI de Stripe no está instalado: se omite el secreto del webhook."
fi

# --- Escribir ----------------------------------------------------------------
#
# `umask` antes de crear, no `chmod` después: entre crear y cambiar permisos hay
# un instante en que el archivo es legible por todos.
umask 077
{
  echo "# Llaves de Stripe en modo de prueba."
  echo "# Lo escribió scripts/llaves-stripe.sh — no se edita a mano ni se comparte."
  echo "# git y Vercel lo ignoran por el patrón .env.*"
  for nombre in "${guardadas[@]}"; do
    echo "$nombre=${!nombre}"
  done
  [[ -n "$secreto" ]] && echo "STRIPE_WEBHOOK_SECRET=$secreto"
} > "$ARCHIVO"

echo
echo "✔ Guardado en $ARCHIVO ($(stat -f '%Sp' "$ARCHIVO" 2>/dev/null || stat -c '%A' "$ARCHIVO"))"
for nombre in "${guardadas[@]}"; do
  valor="${!nombre}"
  case "$valor" in
    rk_test_*) clase="restringida" ;;
    sk_test_*) clase="secreta" ;;
    pk_test_*) clase="publicable · este proyecto no la usa" ;;
    *)         clase="?" ;;
  esac
  printf '    %-22s %s, %s caracteres\n' "$nombre" "$clase" "${#valor}"
done
if [[ -n "$secreto" ]]; then
  echo "    STRIPE_WEBHOOK_SECRET del CLI, ${#secreto} caracteres"
else
  echo "    STRIPE_WEBHOOK_SECRET falta — se obtiene con:"
  echo "      printf 'STRIPE_WEBHOOK_SECRET=%s\\n' \"\$(stripe listen --print-secret)\" >> $ARCHIVO"
fi
echo
echo "Ahora:  npm run probar:stripe"
echo
