#!/usr/bin/env bash
# correo.sh — deja el correo funcionando de punta a punta, en una sola corrida.
#
#   ./scripts/correo.sh
#
# Pide las credenciales una vez, **comprueba que sirven**, y solo entonces las
# carga en Vercel. Al terminar no queda nada que hacer a mano salvo desplegar,
# que el guion ofrece hacer.
#
# ---------------------------------------------------------------------------
# Por qué comprueba ANTES de cargar, y no al revés
# ---------------------------------------------------------------------------
#
# Es la lección del 2026-09-07. Se cargó una contraseña de aplicación de Google
# en Vercel sin comprobarla; Gmail la rechazó con `535-5.7.8 BadCredentials` y
# el sistema siguió como si nada. El síntoma no fue un error: fueron cuatro
# confirmaciones de reserva muriendo en silencio tras seis intentos cada una.
# Nadie se enteró hasta que alguien fue a mirar `/api/health`.
#
# Una credencial que no funciona **no debe llegar a producción**. Aquí la
# compuerta es `npm run verificar:correo`, que autentica contra el proveedor
# sin mandar nada. Si falla, el guion se detiene y Vercel no se toca.
#
# ---------------------------------------------------------------------------
# Los dos caminos
# ---------------------------------------------------------------------------
#
#   SMTP    · la propia cuenta de correo. Funciona sin dominio propio y puede
#             escribirle a cualquiera. Es el camino de hoy.
#
#   Resend  · exige un dominio verificado con SPF, DKIM y DMARC. Sin él, Resend
#             solo entrega a la dirección dueña de la cuenta. Es el camino
#             cuando el cliente entregue su dominio.
#
# `transport()` prefiere Resend en cuanto su llave está presente, para que el
# día del dominio tome el relevo sin que nadie tenga que acordarse de quitar lo
# anterior. Por eso este guion, al elegir SMTP, **quita** RESEND_API_KEY de
# Vercel si estaba: dejarla puesta sin dominio verificado es peor que no
# tenerla.

set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVO=".env.correo"

# La terminal se prueba abriéndola, no con `-t`: en un entorno sin terminal de
# control /dev/tty aparece legible y falla al abrirse. Es la lección que ya
# cargaba `demo-content.sh`.
hay_tty() { { : < /dev/tty; } 2>/dev/null; }

pedir() {
  # $1 nombre · $2 descripción · $3 tapado(si/no) · $4 obligatorio(si/no)
  local nombre="$1" descripcion="$2" tapado="$3" obligatorio="$4"
  # Lo ya exportado manda. Sirve para automatizar (y para las pruebas de este
  # guion) sin que nada se teclee dos veces.
  local valor="${!nombre:-}"
  if [[ -n "$valor" ]]; then
    echo "  → $nombre tomada del entorno"
    echo
  elif hay_tty; then
    printf '  %s\n' "$descripcion"
    printf '  > '
    if [[ "$tapado" == "si" ]]; then
      IFS= read -rs valor < /dev/tty || valor=""
      printf '\n'
    else
      IFS= read -r valor < /dev/tty || valor=""
    fi
    printf '\n'
  fi
  # Espacios de los extremos y de en medio en los secretos: Google enseña la
  # contraseña de aplicación en cuatro bloques de cuatro **para que se lea**, y
  # pegada con espacios da un 535 que parece contraseña equivocada y no lo es.
  if [[ "$tapado" == "si" ]]; then
    valor="${valor//[$' \t\r\n']/}"
  else
    valor="$(printf '%s' "$valor" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  fi
  if [[ -z "$valor" && "$obligatorio" == "si" ]]; then
    echo "✘ $nombre es obligatorio. No se tocó nada." >&2
    exit 1
  fi
  printf -v "$nombre" '%s' "$valor"
}

echo
echo "Correo · configuración de punta a punta"
echo "───────────────────────────────────────"
echo

camino="${CAMINO:-}"
if [[ -z "$camino" ]] && hay_tty; then
  echo "  ¿Por dónde se manda el correo?"
  echo "    1) SMTP de la propia cuenta  · sin dominio propio, escribe a cualquiera"
  echo "    2) Resend                    · exige dominio verificado"
  printf '  > '
  IFS= read -r opcion < /dev/tty || opcion=""
  echo
  case "$opcion" in
    2) camino="resend" ;;
    *) camino="smtp" ;;
  esac
fi
camino="${camino:-smtp}"

declare -a GUARDADAS=()

pedir MAIL_FROM "Dirección remitente (la MISMA que autentica, o el correo cae en no deseado)" no si
GUARDADAS+=(MAIL_FROM)

if [[ "$camino" == "resend" ]]; then
  pedir RESEND_API_KEY "Llave de Resend (re_…)" si si
  case "$RESEND_API_KEY" in
    re_*) ;;
    *) echo "✘ Una llave de Resend empieza con re_. No se tocó nada." >&2; exit 1 ;;
  esac
  GUARDADAS+=(RESEND_API_KEY)
else
  # El servidor, el puerto y el usuario **no son datos que haya que buscar**:
  # los dos primeros son constantes del proveedor y el tercero es la misma
  # dirección que ya se pidió. Preguntarlos uno por uno era pedirle al usuario
  # que supiera algo que este guion ya sabe.
  #
  # `SMTP_USER` es MAIL_FROM y no una variante: SPF y DKIM alinean con quien
  # autentica, así que si el remitente no es esa misma dirección el correo llega
  # a no deseado aunque el envío diga que salió bien. Es la razón por la que no
  # se eligió un ESP con "remitente verificado" — ver `send.ts`.
  if [[ -z "${SMTP_HOST:-}" ]]; then
    case "${MAIL_FROM##*@}" in
      gmail.com|googlemail.com) SMTP_HOST="smtp.gmail.com" ;;
      outlook.com|hotmail.com|live.com) SMTP_HOST="smtp-mail.outlook.com" ;;
      yahoo.com|yahoo.com.mx) SMTP_HOST="smtp.mail.yahoo.com" ;;
      icloud.com|me.com) SMTP_HOST="smtp.mail.me.com" ;;
    esac
  fi

  if [[ -n "${SMTP_HOST:-}" ]]; then
    echo "  → servidor: $SMTP_HOST (deducido de $MAIL_FROM)"
    echo
  else
    echo "  No conozco el servidor de ${MAIL_FROM##*@}. Búscalo como"
    echo "  \"SMTP settings\" en la ayuda de ese proveedor."
    echo
    pedir SMTP_HOST "Servidor SMTP" no si
  fi

  SMTP_PORT="${SMTP_PORT:-465}"   # 465 es TLS implícito; 587 sube con STARTTLS
  SMTP_USER="${SMTP_USER:-$MAIL_FROM}"
  echo "  → puerto:   $SMTP_PORT"
  echo "  → usuario:  $SMTP_USER"
  echo

  if [[ "$SMTP_HOST" == "smtp.gmail.com" ]]; then
    echo "  La contraseña NO es la de tu correo: es una contraseña de aplicación."
    echo "  Se genera en myaccount.google.com/apppasswords y exige verificación"
    echo "  en dos pasos activada. Son 16 caracteres; los espacios con que Google"
    echo "  los enseña **no son parte de ella** y este guion los quita."
    echo
  fi
  pedir SMTP_PASSWORD "Contraseña de aplicación (16 caracteres)" si si
  GUARDADAS+=(SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD)
fi

# ── Se guarda local primero, para poder comprobar ────────────────────────────
umask 077
{
  echo "# Credenciales de correo."
  echo "# Lo escribió scripts/correo.sh — no se edita a mano ni se comparte."
  echo "# git y Vercel lo ignoran por el patrón .env.*"
  for n in "${GUARDADAS[@]}"; do echo "$n=${!n}"; done
} > "$ARCHIVO"

echo "→ guardado en $ARCHIVO ($(stat -f '%Sp' "$ARCHIVO" 2>/dev/null || stat -c '%A' "$ARCHIVO"))"
echo

# ── La compuerta ─────────────────────────────────────────────────────────────
echo "Comprobando contra el proveedor…"
echo
if ! npm run --silent verificar:correo; then
  echo
  echo "✘ Las credenciales no sirven. **No se cargó nada en Vercel**, que es el" >&2
  echo "  punto de comprobar antes: en producción esto no da error, solo deja" >&2
  echo "  de entregar." >&2
  echo >&2
  echo "  Corrige y vuelve a correr este guion. Lo local queda en $ARCHIVO." >&2
  exit 1
fi

# ── Y solo ahora, Vercel ─────────────────────────────────────────────────────
echo
if [[ "${SIN_VERCEL:-}" == "si" ]]; then
  echo "SIN_VERCEL=si: no se toca producción."
  exit 0
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "⚠ No está el CLI de Vercel; las credenciales quedaron locales y comprobadas."
  exit 0
fi

echo "Cargando en Vercel (producción)…"
for n in "${GUARDADAS[@]}"; do
  # `rm` antes de `add` porque `vercel env add` no reemplaza: agrega otra con
  # el mismo nombre y la resolución queda a suerte.
  vercel env rm "$n" production --yes >/dev/null 2>&1 || true
  printf '%s' "${!n}" | vercel env add "$n" production >/dev/null 2>&1 \
    && echo "  ✔ $n" \
    || { echo "  ✘ $n — no se pudo cargar" >&2; exit 1; }
done

if [[ "$camino" == "smtp" ]]; then
  # Resend gana en cuanto su llave está presente. Con SMTP elegido, dejarla en
  # producción significaría intentar Resend sin dominio verificado: 403 por
  # huésped y avisos muertos.
  if vercel env ls production 2>/dev/null | grep -q RESEND_API_KEY; then
    vercel env rm RESEND_API_KEY production --yes >/dev/null 2>&1 \
      && echo "  ✔ RESEND_API_KEY quitada (SMTP manda, y Resend le ganaría)"
  fi
fi

echo
echo "Listo. Las variables se toman al desplegar, así que falta eso."
echo
echo "  El pipeline lo hace solo con cualquier push a la rama por defecto,"
echo "  o a mano desde Actions → «Desplegar producción» → Run workflow."
