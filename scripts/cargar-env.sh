#!/usr/bin/env bash
# cargar-env.sh — leer un archivo de variables sin dejar que bash lo interprete.
#
# `set -a; source archivo; set +a` es el idioma común y es una trampa con las
# cadenas de Neon:
#
#   DATABASE_URL=postgresql://…/neondb?sslmode=require&channel_binding=require
#
# Ese `&` sin comillas no es parte del valor para bash: es "ejecuta lo anterior
# en segundo plano". La asignación se va a un subshell, no toca al shell actual,
# y `DATABASE_URL` **queda vacía** — sin ningún error, que es lo peor. Pasó el
# 2026-09-04 y el guion reportó "no trae DATABASE_URL" sobre un archivo que sí
# la traía.
#
# Aquí las líneas se parten en la primera `=` y el resto se toma literal. Nada
# se expande, nada se ejecuta: un valor con `&`, `$`, comillas o espacios entra
# tal cual.
#
#   source scripts/cargar-env.sh
#   cargar_env .env.neon

cargar_env() {
  local archivo="$1"
  local clave valor

  [[ -f "$archivo" ]] || return 1

  while IFS= read -r linea || [[ -n "$linea" ]]; do
    # Windows deja un retorno de carro al final que se colaría en el valor.
    linea="${linea%$'\r'}"

    # Comentarios, líneas en blanco y el `export` de adorno.
    [[ -z "$linea" || "$linea" == \#* ]] && continue
    linea="${linea#export }"

    clave="${linea%%=*}"
    valor="${linea#*=}"

    # Solo nombres de variable válidos: así una línea rara no se convierte en
    # nada raro.
    [[ "$clave" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    # Comillas envolventes, si quien lo escribió las puso.
    if [[ "$valor" == \"*\" || "$valor" == \'*\' ]]; then
      valor="${valor:1:${#valor}-2}"
    fi

    export "$clave=$valor"
  done < "$archivo"
}
