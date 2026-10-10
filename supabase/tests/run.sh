#!/usr/bin/env bash
# Runs the migration + seed on a scratch database and executes test_db.py.
# Needs: psql, python3 with psycopg2-binary, and a reachable Postgres (set PGHOST/PGPORT/PGUSER/PGPASSWORD).
# Plain Postgres has no Supabase auth schema and no pgvector, so shim.sql stands in for the first and the
# migration is rewritten to use float8[] instead of vector(768) for this test only.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export TESTDB="${TESTDB:-ix_test}"

psql -q -d postgres -c "drop database if exists ${TESTDB}" -c "create database ${TESTDB}"
psql -q -d "$TESTDB" -v ON_ERROR_STOP=1 -f "$HERE/shim.sql"

sed -e '/create extension if not exists vector;/d' \
    -e 's/vector(768)/float8[]/g' \
    -e 's/match_similar(uuid, vector, uuid, int)/match_similar(uuid, float8[], uuid, int)/' \
    "$HERE/../migrations/0001_init.sql" > "$HERE/.migration_shimmed.sql"

psql -q -d "$TESTDB" -v ON_ERROR_STOP=1 -f "$HERE/.migration_shimmed.sql" 2>&1 | grep -v NOTICE || true
psql -q -d "$TESTDB" -v ON_ERROR_STOP=1 -f "$HERE/../seed.sql"
rm -f "$HERE/.migration_shimmed.sql"

python3 "$HERE/test_db.py"
