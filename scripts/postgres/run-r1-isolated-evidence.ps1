[CmdletBinding()]
param(
  [string]$Image = "postgres:16-alpine",
  [switch]$KeepContainer
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Description,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE"
  }
}

function Invoke-PsqlFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  Write-Host "Applying $([IO.Path]::GetFileName($Path))"
  Get-Content -Raw -LiteralPath $Path |
    & docker exec -i $script:ContainerName psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname gieomo_r1_test
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed for $Path with exit code $LASTEXITCODE"
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "BLOCKED: docker CLI is missing. No PostgreSQL test was run."
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "BLOCKED: Docker daemon is unavailable. No PostgreSQL test was run."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$expectedRoot = (Resolve-Path (Get-Location)).Path
if ($repoRoot -ne $expectedRoot) {
  Write-Host "Repository root resolved to $repoRoot"
}

$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 10)
$script:ContainerName = "gieomo-r1-isolated-$suffix"
$databasePassword = "gieomo-r1-synthetic-$suffix"
$started = $false

$migrationFiles = @(
  "supabase/migrations/001_initial_schema.sql",
  "supabase/migrations/002_grant_permissions_and_rls.sql",
  "supabase/migrations/011_fix_rls_security_policies.sql",
  "supabase/migrations/013_fix_rls_orders_customers_payment.rls.sql",
  "supabase/migrations/014_add_freeship_discount_type.sql",
  "supabase/migrations/015_order_idempotency.sql",
  "supabase/migrations/016_create_order_atomic.sql",
  "supabase/migrations/018_payments_unique_transaction.sql",
  "supabase/migrations/proposals/021_revoke_anon_insert_order_tables.sql.draft",
  "supabase/migrations/proposals/022_inbound_payment_events.sql.draft"
)

foreach ($relativePath in $migrationFiles) {
  $absolutePath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
    throw "Required migration is missing: $relativePath"
  }
}

try {
  Write-Host "Creating disposable PostgreSQL container $script:ContainerName (no host port, synthetic data only)"
  Invoke-Checked -Description "docker run" -Action {
    & docker run --detach --name $script:ContainerName `
      --label "gieomo.test-harness=r1" `
      --env "POSTGRES_PASSWORD=$databasePassword" `
      --env "POSTGRES_DB=gieomo_r1_test" `
      $Image
  }
  $started = $true

  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    & docker exec $script:ContainerName pg_isready --username postgres --dbname gieomo_r1_test *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw "Disposable PostgreSQL did not become ready within 30 seconds"
  }

  Invoke-PsqlFile (Join-Path $repoRoot "scripts/postgres/bootstrap_supabase_test_roles.sql")
  foreach ($relativePath in $migrationFiles) {
    Invoke-PsqlFile (Join-Path $repoRoot $relativePath)
  }

  Write-Host "Running isolated R1/RLS evidence matrix"
  Invoke-PsqlFile (Join-Path $repoRoot "tests/postgres/r1_isolated_evidence.sql")
  Write-Host "Harness completed. FAIL/BLOCKED rows are release-gate evidence, not PostgreSQL runner errors."
}
finally {
  if ($started -and -not $KeepContainer) {
    Write-Host "Removing disposable container $script:ContainerName"
    & docker rm --force $script:ContainerName *> $null
  }
  elseif ($started) {
    Write-Host "Container retained by explicit -KeepContainer: $script:ContainerName"
  }
}

