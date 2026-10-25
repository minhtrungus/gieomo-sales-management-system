[CmdletBinding()]
param(
  [int]$Port = 55439,
  [string]$PostgresBin = "$env:USERPROFILE\scoop\apps\postgresql\current\bin",
  [switch]$KeepCluster
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$tempRoot = Join-Path $repoRoot ".tmp"
$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 10)
$dataDirectory = Join-Path $tempRoot "postgres-r1-$suffix"
$logPath = Join-Path $tempRoot "postgres-r1-$suffix.log"
$database = "gieomo_r1_$suffix"
$databaseUser = "gieomo_r1_admin_$suffix"
$started = $false

$executables = @("initdb.exe", "pg_ctl.exe", "pg_isready.exe", "createdb.exe", "psql.exe")
foreach ($executable in $executables) {
  $path = Join-Path $PostgresBin $executable
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "BLOCKED: required PostgreSQL executable is missing: $path"
  }
}

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
  throw "BLOCKED: loopback test port $Port is already in use"
}

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

try {
  if (-not (Test-Path -LiteralPath $tempRoot)) {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
  }
  if (Test-Path -LiteralPath $dataDirectory) {
    throw "Refusing to reuse existing data directory: $dataDirectory"
  }

  Invoke-Checked "initdb" {
    & (Join-Path $PostgresBin "initdb.exe") --pgdata=$dataDirectory --username=$databaseUser `
      --encoding=UTF8 --locale=C --auth-host=trust --auth-local=trust --no-sync
  }
  Invoke-Checked "pg_ctl start" {
    & (Join-Path $PostgresBin "pg_ctl.exe") -D $dataDirectory -l $logPath `
      -o "`"-h 127.0.0.1 -p $Port`"" start
  }
  $started = $true

  Invoke-Checked "pg_isready" {
    & (Join-Path $PostgresBin "pg_isready.exe") -h 127.0.0.1 -p $Port -U $databaseUser
  }
  Invoke-Checked "createdb" {
    & (Join-Path $PostgresBin "createdb.exe") -h 127.0.0.1 -p $Port -U $databaseUser $database
  }

  $psql = Join-Path $PostgresBin "psql.exe"
  $psqlArgs = @("--no-psqlrc", "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", $Port, "-U", $databaseUser, "-d", $database)
  Invoke-Checked "database identity verification" {
    & $psql @psqlArgs -c "SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), current_setting('data_directory'), version();"
  }

  $sqlFiles = @("scripts/postgres/bootstrap_supabase_test_roles.sql") + $migrationFiles
  foreach ($relativePath in $sqlFiles) {
    $absolutePath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
      throw "Required SQL file is missing: $relativePath"
    }
    Write-Host "Applying $relativePath"
    Invoke-Checked "psql $relativePath" { & $psql @psqlArgs -f $absolutePath }
  }

  Write-Host "Running SQL evidence matrix"
  Invoke-Checked "SQL evidence matrix" {
    & $psql @psqlArgs -f (Join-Path $repoRoot "tests/postgres/r1_isolated_evidence.sql")
  }

  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "node_modules/pg/package.json"))) {
    throw "BLOCKED: optional pg driver is missing. Install temporarily with npm install --no-save --package-lock=false pg@8."
  }

  $env:ATOMIC_PG_URL = "postgresql://${databaseUser}@127.0.0.1:${Port}/${database}"
  $env:GIEOMO_PG_ISOLATED = "1"
  Push-Location $repoRoot
  try {
    Invoke-Checked "Node PostgreSQL integration tests" {
      & node --test tests/paymentIdempotencyPg.integration.test.ts `
        tests/r1PaymentPg.integration.test.ts tests/atomicOrderPg.integration.test.ts
    }
  }
  finally {
    Pop-Location
    Remove-Item Env:ATOMIC_PG_URL -ErrorAction SilentlyContinue
    Remove-Item Env:GIEOMO_PG_ISOLATED -ErrorAction SilentlyContinue
  }
}
finally {
  if ($started -and -not $KeepCluster) {
    & (Join-Path $PostgresBin "pg_ctl.exe") -D $dataDirectory stop -m fast
  }

  if (-not $KeepCluster) {
    $expectedParent = [IO.Path]::GetFullPath($tempRoot).TrimEnd('\')
    if (Test-Path -LiteralPath $dataDirectory) {
      $resolvedData = (Resolve-Path -LiteralPath $dataDirectory).Path
      if ([IO.Path]::GetDirectoryName($resolvedData) -ne $expectedParent -or
          -not ([IO.Path]::GetFileName($resolvedData) -like "postgres-r1-*")) {
        throw "Refusing unsafe teardown target: $resolvedData"
      }
      Remove-Item -LiteralPath $resolvedData -Recurse -Force
    }
    if (Test-Path -LiteralPath $logPath) {
      $resolvedLog = (Resolve-Path -LiteralPath $logPath).Path
      if ([IO.Path]::GetDirectoryName($resolvedLog) -ne $expectedParent -or
          -not ([IO.Path]::GetFileName($resolvedLog) -like "postgres-r1-*.log")) {
        throw "Refusing unsafe teardown target: $resolvedLog"
      }
      Remove-Item -LiteralPath $resolvedLog -Force
    }
  }
  elseif (Test-Path -LiteralPath $dataDirectory) {
    Write-Host "Cluster retained by explicit -KeepCluster: $dataDirectory"
  }
}
