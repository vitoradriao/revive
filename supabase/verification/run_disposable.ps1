param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Fresh', 'Legacy')]
  [string]$Mode
)

$ErrorActionPreference = 'Stop'
if (-not $env:PGHOST -or -not $env:PGDATABASE -or
    $env:PGDATABASE -notmatch '_revive_fixture$') {
  throw 'Configure PGHOST and a disposable PGDATABASE ending in _revive_fixture.'
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw 'psql is required. Use a PostgreSQL 17 client or Supabase CLI environment.'
}

function Invoke-PsqlFile([string]$Path) {
  & psql -X --set=ON_ERROR_STOP=1 --file=$Path
  if ($LASTEXITCODE -ne 0) { throw "SQL verification failed: $Path" }
}

$existing = & psql -X -A -t --set=ON_ERROR_STOP=1 --command="select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relname in ('usuarios','vicios','registros_diarios','historico_recaidas','metas','mensagens_motivacionais','marcos','app_sessions','api_idempotency','device_push_tokens')"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the target database.' }
if ($existing.Trim() -ne '0') { throw 'Target already has Revive tables; refusing to apply the fixture.' }

$roles = & psql -X -A -t --set=ON_ERROR_STOP=1 --command="select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')"
if ($LASTEXITCODE -ne 0 -or $roles.Trim() -ne '3') {
  throw 'Target needs the Supabase anon, authenticated and service_role roles.'
}

$root = Split-Path -Parent $PSScriptRoot
$migrationDirectory = Join-Path $root 'migrations'
$verificationDirectory = $PSScriptRoot
Invoke-PsqlFile (Join-Path $migrationDirectory '20260615000000_initial_schema.sql')
if ($Mode -eq 'Legacy') {
  Invoke-PsqlFile (Join-Path $verificationDirectory 'legacy_fixture.sql')
}

$incremental = @(
  '20260616000000_add_goal_progress_baseline.sql',
  '20260828223303_mobile_sessions_and_idempotency.sql',
  '20260907002648_mobile_bootstrap_author.sql',
  '20260907002650_restrict_revive_tables_to_api.sql',
  '20260907004754_harden_modification_trigger_search_path.sql',
  '20260923163030_restrict_modification_trigger_execute.sql'
)
foreach ($migration in $incremental) {
  Invoke-PsqlFile (Join-Path $migrationDirectory $migration)
}

Invoke-PsqlFile (Join-Path $verificationDirectory 'assert_base_schema.sql')
Invoke-PsqlFile (Join-Path $verificationDirectory 'assert_full_schema.sql')
if ($Mode -eq 'Legacy') {
  Invoke-PsqlFile (Join-Path $verificationDirectory 'assert_synthetic_upgrade.sql')
}
Write-Host "Validated $Mode schema in $env:PGDATABASE."
