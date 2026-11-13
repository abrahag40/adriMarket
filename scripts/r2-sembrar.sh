#!/usr/bin/env bash
# r2-sembrar.sh — sube las fotos de demostración (var/media) al R2 LOCAL de la
# vista previa del Worker (decisión 0023). Es el equivalente de que en Node la
# ruta /media lea var/media del disco: el seed apunta a /media/<archivo>.svg y,
# en el Worker, /media lee del bucket.
#
# Solo local, a propósito: el seed no se corre en producción y sus fotos
# tampoco tienen nada que hacer allá.
#
#   ./scripts/r2-sembrar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="$(node -e 'const c=require("fs").readFileSync("wrangler.jsonc","utf8");console.log(/"bucket_name":\s*"([^"]+)"/.exec(c)[1])')"
n=0
for archivo in var/media/*; do
  [ -f "$archivo" ] || continue
  nombre="$(basename "$archivo")"
  npx wrangler r2 object put "$BUCKET/$nombre" --file "$archivo" --local >/dev/null
  n=$((n + 1))
done
echo "Listo: $n archivo(s) en el R2 local de $BUCKET."
