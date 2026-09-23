#!/bin/sh
set -eu

compose_file=docker-compose.ci.yml
postgres_service=postgres

cleanup() {
  docker compose -f "$compose_file" down -v --remove-orphans
}
trap cleanup EXIT INT TERM

psql_file() {
  database=$1
  file=$2
  docker compose -f "$compose_file" exec -T "$postgres_service" \
    psql -X -q -v ON_ERROR_STOP=1 -U postgres -d "$database" < "$file"
}

expect_error() {
  database=$1
  file=$2
  pattern=$3
  output=$(mktemp)
  if psql_file "$database" "$file" > "$output" 2>&1; then
    rm -f "$output"
    echo "Expected SQL failure did not occur: $file" >&2
    exit 1
  fi
  if ! grep -F "$pattern" "$output" > /dev/null; then
    cat "$output" >&2
    rm -f "$output"
    echo "Unexpected SQL failure: $file" >&2
    exit 1
  fi
  rm -f "$output"
}

docker compose -f "$compose_file" up -d --wait postgres
psql_file revive_fixture supabase/verification/ci_roles.sql
docker compose -f "$compose_file" exec -T "$postgres_service" \
  createdb -U postgres revive_legacy_fixture
psql_file revive_legacy_fixture supabase/verification/ci_schema_grants.sql

for file in supabase/migrations/*.sql; do
  psql_file revive_fixture "$file"
done
psql_file revive_fixture supabase/verification/assert_base_schema.sql
psql_file revive_fixture supabase/verification/assert_full_schema.sql

psql_file revive_legacy_fixture supabase/migrations/20260615000000_initial_schema.sql
psql_file revive_legacy_fixture supabase/verification/legacy_fixture.sql
for file in supabase/migrations/*.sql; do
  case "$file" in
    *20260615000000_initial_schema.sql) continue ;;
  esac
  psql_file revive_legacy_fixture "$file"
done
psql_file revive_legacy_fixture supabase/verification/assert_base_schema.sql
psql_file revive_legacy_fixture supabase/verification/assert_full_schema.sql
psql_file revive_legacy_fixture supabase/verification/assert_synthetic_upgrade.sql

expect_error revive_fixture supabase/verification/expect_invalid_constraint.sql \
  'violates foreign key constraint'
expect_error revive_fixture supabase/verification/expect_public_role_denied.sql \
  'permission denied for table usuarios'

docker compose -f "$compose_file" up -d --wait postgrest
node tests/db/real-postgres.mjs
echo 'PostgreSQL 17.6: fresh, legacy, negative SQL and API tests passed.'
