#!/usr/bin/env bash
# pg-local.sh — el Postgres de desarrollo de este proyecto.
#
# Un clúster propio, en el puerto 5444 y con el rol `postgres`, para que
# `DATABASE_URL` de `.env` funcione sin tocar el Postgres del sistema ni
# mezclarse con las bases de otros proyectos. El 5444 y no el 5432 justamente
# por eso: en una máquina de trabajo suele haber ya un Postgres en el puerto
# de siempre, y este no tiene por qué pelearse con él.
#
#   ./scripts/pg-local.sh start | stop | status | crear
#
# **Vive fuera de /tmp, y eso no es una preferencia.** Estuvo en /tmp/ampg —así
# lo decía CLAUDE.md— hasta el 2026-09-07, cuando el limpiador periódico de
# macOS le borró los archivos sueltos del directorio de datos: PG_VERSION,
# postgresql.conf, pg_hba.conf y, lo que lo volvió irrecuperable,
# `global/pg_filenode.map` y los catálogos del sistema. Quedaron los
# directorios y 228 archivos de tablas sin forma de saber qué era cada uno.
#
# Lo caro no fue perder los datos —son de prueba y se regeneran con
# `db:reset`— sino **cómo se pierde**: el clúster no se apaga, se queda a medio
# comer. La aplicación responde 500, la barra reporta fallos que no existen, y
# hay que llegar hasta el log de Postgres para entender por qué. Se paga ese
# rato aunque los datos no valgan nada.
#
# `LC_ALL=C` tampoco es adorno: sin una configuración regional válida, el
# postmaster de Homebrew aborta al arrancar con "postmaster became
# multithreaded during startup", que no dice nada de lo que pasa.

set -euo pipefail

DIR="${ADRIMARKET_PGDIR:-$HOME/.local/share/adrimarket/pg}"
RUN="$(dirname "$DIR")/run"
LOG="$(dirname "$DIR")/pg.log"
PUERTO="${ADRIMARKET_PGPORT:-5444}"
BIN="${ADRIMARKET_PGBIN:-/opt/homebrew/opt/postgresql@16/bin}"

export PATH="$BIN:$PATH"

case "${1:-}" in
  crear)
    [[ -f "$DIR/PG_VERSION" ]] && { echo "ya existe en $DIR"; exit 0; }
    mkdir -p "$(dirname "$DIR")" "$RUN"
    LC_ALL=C initdb -D "$DIR" -U postgres
    echo "→ ahora: ./scripts/pg-local.sh start && createdb -h 127.0.0.1 -p $PUERTO -U postgres adrimarket"
    ;;
  start)
    mkdir -p "$RUN"
    LC_ALL=C pg_ctl -D "$DIR" -l "$LOG" \
      -o "-k $RUN -p $PUERTO -c listen_addresses=127.0.0.1" start
    ;;
  stop)
    LC_ALL=C pg_ctl -D "$DIR" stop
    ;;
  status)
    LC_ALL=C pg_ctl -D "$DIR" status || true
    echo "datos: $DIR"
    echo "log:   $LOG"
    ;;
  *)
    echo "uso: $0 crear|start|stop|status" >&2
    exit 1
    ;;
esac
