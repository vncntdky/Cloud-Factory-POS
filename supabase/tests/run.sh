#!/usr/bin/env bash
# Runs the database tests on a throwaway local Postgres database.
#   PGHOST=… PGPORT=… PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
db="vape_pos_test_$$"
psql -q -d postgres -c "create database $db"
trap 'psql -q -d postgres -c "drop database $db" >/dev/null' EXIT
psql -q -d postgres -c "do \$\$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin; exception when duplicate_object then null; end \$\$"
psql -q -d "$db" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -q -d "$db" -v ON_ERROR_STOP=1 -f "$f"; done
psql -q -d "$db" -f supabase/tests/pos_test.sql
