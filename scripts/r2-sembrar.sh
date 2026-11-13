#!/usr/bin/env bash
# r2-sembrar.sh — sube las fotos de demostración (var/media) a R2 (decisión 0023).
# Es el equivalente de que en Node la ruta /media lea var/media del disco: el
# seed apunta a /media/<archivo>.svg y, en el Worker, /media lee del bucket.
#
#   ./scripts/r2-sembrar.sh                        # al R2 local de wrangler dev
#   ./scripts/r2-sembrar.sh --remoto vista-previa  # al bucket del entorno vista-previa
#
# **Al remoto, sólo a un bucket de vista previa, y lo comprueba este guion.** El
# seed no se corre en producción, y sus fotos tampoco tienen nada que hacer allá:
# un bucket cuyo nombre no termine en `-vista-previa` se rechaza antes de subir
# nada. No es un acuerdo de "no lo hagas": es una puerta cerrada.
set -euo pipefail
cd "$(dirname "$0")/.."

modo="--local"
entorno=""
if [[ "${1:-}" == "--remoto" ]]; then
  entorno="${2:?Falta el entorno: ./scripts/r2-sembrar.sh --remoto <entorno>}"
  modo="--remote"
fi

# El bucket sale de wrangler.jsonc: el de arriba en local, el del entorno en remoto.
BUCKET="$(ENTORNO="$entorno" node -e '
  const texto = require("fs").readFileSync("wrangler.jsonc", "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  const config = JSON.parse(texto);
  const de = process.env.ENTORNO ? config.env?.[process.env.ENTORNO] : config;
  const bucket = de?.r2_buckets?.find((b) => b.binding === "MEDIA")?.bucket_name;
  if (!bucket) { console.error("No hay bucket MEDIA para ese entorno en wrangler.jsonc."); process.exit(1); }
  console.log(bucket);
')"

if [[ "$modo" == "--remote" && "$BUCKET" != *-vista-previa ]]; then
  echo "Se rechaza: $BUCKET no es un bucket de vista previa." >&2
  echo "Las fotos de demostración no se suben a un bucket que pueda ser de producción." >&2
  exit 1
fi

n=0
for archivo in var/media/*; do
  [ -f "$archivo" ] || continue
  nombre="$(basename "$archivo")"
  npx wrangler r2 object put "$BUCKET/$nombre" --file "$archivo" "$modo" >/dev/null
  n=$((n + 1))
done
echo "Listo: $n archivo(s) en $BUCKET (${modo#--})."
