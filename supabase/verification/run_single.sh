#!/bin/sh
# Verificação SQL sem servidor; não substitui concorrência/HTTP do test:db.
set -eu
: "${PG_BIN:?Informe PG_BIN com initdb e postgres (PostgreSQL 17)}"
work=$(mktemp -d /tmp/revive-preferences-sql-XXXXXX)
trap 'rm -rf "$work"' EXIT INT TERM
"$PG_BIN/initdb" -D "$work/cluster" -A trust -U postgres > "$work/init.log"
node - "$work" <<'JS'
const fs = require('node:fs'), path = require('node:path');
const work = process.argv[2], root = 'supabase/verification/';
const read = file => fs.readFileSync(file, 'utf8');
const migrations = fs.readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort();
const assertions = ['assert_base_schema.sql', 'assert_full_schema.sql', 'assert_personal_reason.sql', 'assert_journey_preferences.sql', 'assert_journey_preferences_behavior.sql'];
for (const mode of ['fresh', 'legacy']) {
  const parts = [read(root + (mode === 'fresh' ? 'ci_roles.sql' : 'ci_schema_grants.sql'))];
  migrations.forEach((file, index) => {
    parts.push(read('supabase/migrations/' + file));
    if (index === 0 && mode === 'legacy') parts.push(read(root + 'legacy_fixture.sql'));
  });
  parts.push(...assertions.map(file => read(root + file)));
  if (mode === 'legacy') parts.push(read(root + 'assert_synthetic_upgrade.sql'));
  // -j termina a entrada em linha vazia; conserva comandos e corpos SQL no mesmo lote.
  fs.writeFileSync(path.join(work, mode + '.sql'), parts.join('\n').split('\n').filter(line => line.trim()).join('\n') + '\n\n');
}
JS
for mode in fresh legacy; do
  if [ "$mode" = legacy ]; then
    printf 'create database legacy;\n\n' | "$PG_BIN/postgres" --single -j -D "$work/cluster" postgres > "$work/create.log" 2>&1
    dbname=legacy
  else dbname=postgres; fi
  "$PG_BIN/postgres" --single -j -D "$work/cluster" "$dbname" < "$work/$mode.sql" > "$work/$mode.log" 2>&1
  if grep -E 'ERROR:|FATAL:' "$work/$mode.log"; then exit 1; fi
  echo "PostgreSQL SQL: $mode migrations, schema, ownership, revision, archive, restore and cascades passed"
done
