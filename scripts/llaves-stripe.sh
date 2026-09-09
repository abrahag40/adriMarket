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

# --- La llave de API ---------------------------------------------------------
#
# Se pide con el prompt tapado. La terminal se prueba abriéndola y no con `-t`:
# en un entorno sin terminal de control, /dev/tty aparece legible y falla al
# abrirse. Es la misma lección que ya cargaba `demo-content.sh`.
if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
  llave="$STRIPE_SECRET_KEY"
  echo "→ llave tomada del entorno"
elif { : < /dev/tty; } 2>/dev/null; then
  echo "Sácala de dashboard.stripe.com/test/apikeys"
  echo "Sirve una secreta (sk_test_…) o una restringida (rk_test_…)."
  echo
  printf 'Pega la llave (no se muestra) y Enter: '
  IFS= read -rs llave < /dev/tty || llave=""
  printf '\n\n'
else
  echo "Sin terminal para pedir la llave. Pásala por STRIPE_SECRET_KEY." >&2
  exit 1
fi

if [[ -z "$llave" ]]; then
  echo "No se recibió ninguna llave. No se tocó nada." >&2
  exit 1
fi

# Se quitan espacios de los extremos: pegar desde el panel a veces arrastra uno,
# y una llave con espacio falla con un error que parece "llave inválida" y no lo
# es. Es la misma trampa que la contraseña de aplicación de Google, que se
# pagó una vez en este proyecto.
llave="${llave//[$' \t\r\n']/}"

# --- La guarda que de verdad importa ----------------------------------------
#
# Una llave de producción aquí sería un desastre silencioso: `probar:stripe`
# crea sesiones de cobro **reales**, y el checkout local empezaría a cobrarle a
# gente de verdad. Se rechaza antes de escribir nada.
case "$llave" in
  sk_live_*|rk_live_*)
    echo "✘ Esa es una llave de PRODUCCIÓN." >&2
    echo >&2
    echo "  Este archivo es para el modo de prueba. La sonda crea sesiones de" >&2
    echo "  cobro reales, y con esta llave le cobraría a personas de verdad." >&2
    echo >&2
    echo "  Las de prueba están en dashboard.stripe.com/test/apikeys" >&2
    echo "  (con el interruptor de 'Modo de prueba' encendido)." >&2
    exit 1
    ;;
  sk_test_*|rk_test_*) : ;;
  *)
    echo "✘ Eso no parece una llave de Stripe." >&2
    echo "  Debe empezar con sk_test_ o rk_test_. No se tocó nada." >&2
    exit 1
    ;;
esac

tipo="secreta"
[[ "$llave" == rk_test_* ]] && tipo="restringida"

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
  echo "STRIPE_SECRET_KEY=$llave"
  [[ -n "$secreto" ]] && echo "STRIPE_WEBHOOK_SECRET=$secreto"
} > "$ARCHIVO"

echo
echo "✔ Guardado en $ARCHIVO ($(stat -f '%Sp' "$ARCHIVO" 2>/dev/null || stat -c '%A' "$ARCHIVO"))"
echo "    STRIPE_SECRET_KEY     llave $tipo de prueba, ${#llave} caracteres"
if [[ -n "$secreto" ]]; then
  echo "    STRIPE_WEBHOOK_SECRET del CLI, ${#secreto} caracteres"
else
  echo "    STRIPE_WEBHOOK_SECRET falta — se obtiene con:"
  echo "      printf 'STRIPE_WEBHOOK_SECRET=%s\\n' \"\$(stripe listen --print-secret)\" >> $ARCHIVO"
fi
echo
echo "Ahora:  npm run probar:stripe"
echo
