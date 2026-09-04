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

# `.env` **no pisa una DATABASE_URL ya exportada**. Antes sí lo hacía, y eso
# convertía en trampa la instrucción del §1 de puesta-en-produccion:
# `DATABASE_URL=<neon> npm run db:migrate` decía "aplicando…" y migraba la base
# local, porque el archivo se cargaba después. En una máquina sin .env
# funcionaba; en la de quien desarrolla, no — y sin decirlo. Es el mismo error
# que `demo-content.sh` ya evitaba.
if [[ -f .env && -z "${DATABASE_URL:-}" ]]; then
  set -a; source .env; set +a
fi

: "${DATABASE_URL:?Falta DATABASE_URL (ver .env.example)}"

# Y se enseña a dónde va. Contra una base remota el identificador del servidor
# va **tapado**: enseñarlo entero no evitó que el 2026-09-04 se migrara la base
# de otro proyecto de Neon con la cadena a la vista. Dos cadenas de Neon se
# diferencian en ocho caracteres a media línea, y el ojo lee lo que espera.
DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^@]*@##; s#[:/?].*$##')"
DB_SERVIDOR="${DB_HOST%%.*}"

es_local() {
  [[ "$DATABASE_URL" == *localhost* || "$DATABASE_URL" == *127.0.0.1* ]]
}

if es_local; then
  echo "→ destino: $(printf '%s' "$DATABASE_URL" | sed -E 's#://[^@/]*@#://***@#')" >&2
else
  echo "→ destino: ***@${DB_SERVIDOR%%-*}-••••••••${DB_HOST#"$DB_SERVIDOR"}  (servidor tapado)" >&2
fi

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q)

ensure_registry() {
  "${PSQL[@]}" -c "
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    );" >/dev/null
}

# Confirmación antes de escribir en una base que no es la propia.
#
# Enseñar el destino no bastó. El 2026-09-04 se pegó la cadena de otro proyecto
# de Neon: el guion imprimió el destino correctamente, decía "Neon", y nadie
# comparó *cuál* Neon. Se aplicaron las 16 migraciones en una base ajena y vacía
# mientras producción se quedaba sin migrar.
#
# La pista estaba en pantalla y era inconfundible: **una base ya desplegada no
# tiene pendiente 0001_foundation.sql**. Si el primer archivo está pendiente, la
# base está vacía, y eso casi nunca es lo que uno quiere en un servidor remoto.
# Así que ahora se dice en voz alta y hay que teclear para seguir.
confirmar_destino() {
  local pendientes="$1" desde_cero="$2"

  echo >&2
  echo "  ⚠ Esta base NO es local." >&2
  echo "    pendientes: $pendientes migración(es)" >&2
  if [[ "$desde_cero" == "si" ]]; then
    echo >&2
    echo "    ATENCIÓN: incluye la primera migración, así que esta base está" >&2
    echo "    VACÍA. Una base ya desplegada no tiene pendiente 0001. Si creías" >&2
    echo "    estar apuntando a producción, esta NO es." >&2
  fi
  echo >&2

  # Una automatización nunca debe estrenar un esquema en una base remota.
  #
  # `DB_CONFIRM=si` existe para que un workflow migre producción sin humano
  # delante. Pero migrar de cero es otra cosa: significa que la base está
  # vacía, y una base de producción vacía es siempre un error de destino, no
  # una intención. Se necesita decirlo aparte y a propósito.
  if [[ "$desde_cero" == "si" && "${DB_BOOTSTRAP:-}" != "si" ]]; then
    echo "  Esta base está vacía y no es local: NO se estrena un esquema aquí." >&2
    echo "  Si de verdad es lo que quieres, DB_BOOTSTRAP=si." >&2
    exit 1
  fi

  if [[ "${DB_CONFIRM:-}" == "si" ]]; then
    echo "  (DB_CONFIRM=si: se continúa sin preguntar)" >&2
    return
  fi

  if ! { : < /dev/tty; } 2>/dev/null; then
    echo "  Sin terminal para confirmar. Exporta DB_CONFIRM=si si es a propósito." >&2
    exit 1
  fi

  # Se pide el identificador del servidor, no una palabra fija: teclear
  # "aplicar" demuestra que se leyó el aviso, no que se sabe en qué base se
  # está. Y como arriba va tapado, no se puede copiar de la pantalla.
  local respuesta
  printf "  Escribe el identificador del servidor (ep-…) para continuar: " >&2
  IFS= read -r respuesta < /dev/tty || respuesta=""
  if [[ "${respuesta%-pooler}" != "${DB_SERVIDOR%-pooler}" ]]; then
    echo "  No coincide con este servidor. Cancelado, no se tocó nada." >&2
    exit 1
  fi
}

cmd_migrate() {
  ensure_registry

  # Primero se calcula qué falta, y recién entonces se decide si preguntar: hay
  # que poder decir cuántas son y si empiezan desde cero antes de aplicar nada.
  local pendientes=() desde_cero="no" primera=""
  for f in db/migrations/*.sql; do
    local name; name="$(basename "$f")"
    [[ -z "$primera" ]] && primera="$name"
    local seen; seen="$("${PSQL[@]}" -tAc \
      "select 1 from schema_migrations where filename = '$name'")"
    if [[ -z "$seen" ]]; then
      pendientes+=("$f")
      [[ "$name" == "$primera" ]] && desde_cero="si"
    fi
  done

  if [[ ${#pendientes[@]} -eq 0 ]]; then
    echo "Sin migraciones pendientes."
    return
  fi

  if ! es_local; then
    confirmar_destino "${#pendientes[@]}" "$desde_cero"
  fi

  for f in "${pendientes[@]}"; do
    local name; name="$(basename "$f")"
    echo "→ aplicando $name"
    "${PSQL[@]}" -f "$f"
    "${PSQL[@]}" -c \
      "insert into schema_migrations (filename) values ('$name')" >/dev/null
  done
  echo "Listo: ${#pendientes[@]} migración(es) aplicada(s)."
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
