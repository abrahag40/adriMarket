#!/usr/bin/env bash
# db.sh — ciclo de vida del esquema.
#
# El SQL escrito a mano es la fuente de verdad. Las migraciones se aplican en
# orden de nombre y se registran en schema_migrations para no repetirse.
#
#   ./scripts/db.sh migrate    aplica las migraciones pendientes
#   ./scripts/db.sh seed       carga datos de desarrollo
#   ./scripts/db.sh test       corre las pruebas de garantías (en transacción)
#   ./scripts/db.sh bench      prueba de carga: sobreventa bajo concurrencia
#   ./scripts/db.sh reset      recrea la base desde cero (solo desarrollo)
#
# Requiere DATABASE_URL, por ejemplo:
#   postgres://usuario:clave@host:5432/adrimarket

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

: "${DATABASE_URL:?Falta DATABASE_URL (ver .env.example)}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q)

ensure_registry() {
  "${PSQL[@]}" -c "
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    );" >/dev/null
}

cmd_migrate() {
  ensure_registry
  local applied=0
  for f in db/migrations/*.sql; do
    local name; name="$(basename "$f")"
    local seen; seen="$("${PSQL[@]}" -tAc \
      "select 1 from schema_migrations where filename = '$name'")"
    if [[ -n "$seen" ]]; then
      continue
    fi
    echo "→ aplicando $name"
    "${PSQL[@]}" -f "$f"
    "${PSQL[@]}" -c \
      "insert into schema_migrations (filename) values ('$name')" >/dev/null
    applied=$((applied + 1))
  done
  if [[ $applied -eq 0 ]]; then
    echo "Sin migraciones pendientes."
  else
    echo "Listo: $applied migración(es) aplicada(s)."
  fi
}

cmd_seed() {
  echo "→ cargando datos de desarrollo"
  "${PSQL[@]}" -f db/seed/dev_seed.sql
  echo "Listo."
}

# Las pruebas corren dentro de una transacción que termina en ROLLBACK:
# verifican el comportamiento real sin dejar basura en la base.
cmd_test() {
  echo "→ pruebas de garantías"
  "${PSQL[@]}" -f db/tests/guarantees.sql
}

cmd_bench() {
  local clients="${CLIENTS:-40}"
  local jobs="${JOBS:-4}"

  echo "→ preparando prueba de carga"
  "${PSQL[@]}" -f db/tests/concurrency.sql

  echo "→ A) $clients clientes concurrentes por 20 lugares (5 intentos cada uno)"
  pgbench "$DATABASE_URL" -n -f db/tests/concurrency_seats.pgbench \
    -c "$clients" -j "$jobs" -t 5 2>&1 | grep -E "actually processed|tps"
  "${PSQL[@]}" -f db/tests/concurrency_report.sql

  echo "→ B) $clients clientes por el MISMO rango de fechas"
  "${PSQL[@]}" -c "truncate bench_result" >/dev/null
  pgbench "$DATABASE_URL" -n -f db/tests/concurrency_same_dates.pgbench \
    -c "$clients" -j "$jobs" -t 2 2>&1 | grep -E "actually processed|tps"
  "${PSQL[@]}" -c "
    select count(*) as intentos,
           count(*) filter (where ok) as apartados
      from bench_result;"
  "${PSQL[@]}" -c "
    do \$\$
    declare v integer;
    begin
      select count(*) filter (where ok) into v from bench_result;
      assert v = 1, format('FALLO: %s clientes ganaron el mismo rango', v);
      raise notice '✔ un solo cliente se quedó con las fechas';
    end \$\$;"

  echo "→ C) $clients clientes por rangos contiguos (no deben chocar)"
  "${PSQL[@]}" -c "truncate bench_result" >/dev/null
  pgbench "$DATABASE_URL" -n -f db/tests/concurrency_adjacent_dates.pgbench \
    -c "$clients" -j "$jobs" -t 1 2>&1 | grep -E "actually processed|tps"
  "${PSQL[@]}" -c "
    do \$\$
    declare v_ok integer; v_no integer;
    begin
      select count(*) filter (where ok), count(*) filter (where not ok)
        into v_ok, v_no from bench_result;
      assert v_no = 0, format('FALLO: %s falsos conflictos en fechas libres', v_no);
      raise notice '✔ % rangos contiguos aceptados, 0 falsos conflictos', v_ok;
    end \$\$;"
}

# Solo desarrollo: se niega a correr contra una URL que no sea local.
cmd_reset() {
  if [[ "$DATABASE_URL" != *localhost* && "$DATABASE_URL" != *127.0.0.1* ]]; then
    echo "reset solo está permitido contra una base local. Abortando." >&2
    exit 1
  fi
  echo "→ borrando el esquema public"
  "${PSQL[@]}" -c "drop schema public cascade; create schema public;"
  cmd_migrate
  cmd_seed
}

case "${1:-}" in
  migrate) cmd_migrate ;;
  seed)    cmd_seed ;;
  test)    cmd_test ;;
  bench)   cmd_bench ;;
  reset)   cmd_reset ;;
  *)
    echo "Uso: $0 {migrate|seed|test|bench|reset}" >&2
    exit 1
    ;;
esac
