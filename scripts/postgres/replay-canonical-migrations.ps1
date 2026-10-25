[CmdletBinding()]
param(
  [int]$Port = 55441,
  [string]$PostgresBin = "$env:USERPROFILE\scoop\apps\postgresql\current\bin",
  [string[]]$ProposalFiles = @(),
  [string[]]$AdditionalTestFiles = @(),
  [switch]$RequireSupabaseLint,
  [switch]$SkipSupabaseLint,
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
$dataDirectory = Join-Path $tempRoot "postgres-canonical-$suffix"
$logPath = Join-Path $tempRoot "postgres-canonical-$suffix.log"
$database = "gieomo_canonical_$suffix"
$databaseUser = "gieomo_canonical_admin_$suffix"
$started = $false

foreach ($executable in @("initdb.exe", "pg_ctl.exe", "pg_isready.exe", "createdb.exe", "psql.exe")) {
  $path = Join-Path $PostgresBin $executable
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "BLOCKED: required PostgreSQL executable is missing: $path"
  }
}

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
  throw "BLOCKED: loopback test port $Port is already in use"
}

$migrationFiles = Get-ChildItem (Join-Path $repoRoot "supabase/migrations") -File -Filter "*.sql" |
  Sort-Object Name
if ($migrationFiles.Count -eq 0) {
  throw "No canonical migrations found"
}

try {
  if (-not (Test-Path -LiteralPath $tempRoot)) {
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
  }
  if (Test-Path -LiteralPath $dataDirectory) {
    throw "Refusing to reuse existing data directory: $dataDirectory"
  }

  Invoke-Checked "migration chain validation" {
    $env:GIEOMO_EXPECTED_MIGRATION_TIP = "037"
    try { & node (Join-Path $repoRoot "scripts/migrations/validate-chain.mjs") | Out-Null }
    finally { Remove-Item Env:GIEOMO_EXPECTED_MIGRATION_TIP -ErrorAction SilentlyContinue }
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
  Invoke-Checked "Supabase test-role bootstrap" {
    & $psql @psqlArgs -f (Join-Path $repoRoot "scripts/postgres/bootstrap_supabase_test_roles.sql")
  }

  foreach ($migration in $migrationFiles) {
    Write-Host "Applying $($migration.Name)"
    Invoke-Checked "migration $($migration.Name)" { & $psql @psqlArgs -f $migration.FullName }
  }

  foreach ($proposalRelativePath in $ProposalFiles) {
    $proposalPath = (Resolve-Path (Join-Path $repoRoot $proposalRelativePath)).Path
    $proposalRoot = (Resolve-Path (Join-Path $repoRoot "supabase/migrations/proposals")).Path
    if (-not $proposalPath.StartsWith($proposalRoot + [IO.Path]::DirectorySeparatorChar)) {
      throw "Refusing proposal outside proposal directory: $proposalPath"
    }
    Write-Host "Applying proposal $proposalRelativePath"
    Invoke-Checked "proposal $proposalRelativePath" { & $psql @psqlArgs -f $proposalPath }
  }

  Invoke-Checked "canonical object verification" {
    & $psql @psqlArgs -c @"
DO `$`$
BEGIN
  IF to_regprocedure('public.create_order_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.cancel_order_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.apply_payment_event(jsonb)') IS NULL
     OR to_regprocedure('public.reject_payment_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.save_combo_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.swap_order_item_variant_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.manage_order_deletion_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.mark_duplicate_order_atomic(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'canonical RPC set is incomplete';
  END IF;
  IF has_function_privilege('anon', 'public.create_order_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.apply_payment_event(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'runtime role can execute a protected writer';
  END IF;
END `$`$;
"@
  }

  Invoke-Checked "payment integrity PostgreSQL tests" {
    & $psql @psqlArgs -f (Join-Path $repoRoot "scripts/postgres/test-payment-integrity.sql")
  }

  Invoke-Checked "order identity/idempotency PostgreSQL tests" {
    & $psql @psqlArgs -f (Join-Path $repoRoot "scripts/postgres/test-order-integrity.sql")
  }

  $connectionString = "postgresql://${databaseUser}@127.0.0.1:${Port}/${database}?sslmode=disable"
  $env:ATOMIC_PG_URL = $connectionString
  $env:GIEOMO_PG_ISOLATED = "1"
  Push-Location $repoRoot
  try {
    Invoke-Checked "mandatory Node PostgreSQL tests" {
      & node scripts/postgres/run-mandatory-pg-tests.mjs
    }
    if ($AdditionalTestFiles.Count -gt 0) {
      $normalizedAdditionalTests = $AdditionalTestFiles |
        ForEach-Object { $_ -split ',' } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
      $resolvedAdditionalTests = foreach ($testFile in $normalizedAdditionalTests) {
        $resolved = (Resolve-Path (Join-Path $repoRoot $testFile)).Path
        $testsRoot = (Resolve-Path (Join-Path $repoRoot "tests")).Path
        if (-not $resolved.StartsWith("$testsRoot\", [System.StringComparison]::OrdinalIgnoreCase) -or
            $resolved -notlike "*.test.ts") {
          throw "Refusing additional test outside tests/*.test.ts: $resolved"
        }
        $resolved
      }
      Invoke-Checked "additional Node PostgreSQL tests" {
        & node --test @resolvedAdditionalTests
      }
    }
    if ($ProposalFiles.Count -gt 0) {
      Invoke-Checked "remediation proposal PostgreSQL tests" {
        & node --test tests/paymentRejectionPg.integration.test.ts
      }
    }
  }
  finally {
    Pop-Location
    Remove-Item Env:ATOMIC_PG_URL -ErrorAction SilentlyContinue
    Remove-Item Env:GIEOMO_PG_ISOLATED -ErrorAction SilentlyContinue
  }

  if ($SkipSupabaseLint) {
    $lintResult = "skipped_by_explicit_switch"
  }
  else {
    $env:PGSSLMODE = "disable"
    try { & supabase db lint --db-url $connectionString --fail-on error --schema public }
    finally { Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue }
    $lintExit = $LASTEXITCODE
    $lintResult = "exit=$lintExit"
    if ($lintExit -ne 0) {
      if ($RequireSupabaseLint) {
        throw "Supabase database lint failed with exit code $lintExit"
      }
      Write-Warning "SUPABASE_LINT_BLOCKED exit=$lintExit (vanilla PostgreSQL may not provide plpgsql_check)"
    }
  }

  Write-Host "CANONICAL_REPLAY_PASS migrations=$($migrationFiles.Count) tip=$($migrationFiles[-1].Name) lint=$lintResult"
}
finally {
  if ($started -and -not $KeepCluster) {
    & (Join-Path $PostgresBin "pg_ctl.exe") -D $dataDirectory stop -m fast
  }
  if (-not $KeepCluster) {
    $expectedParent = [IO.Path]::GetFullPath($tempRoot).TrimEnd('\')
    foreach ($target in @($dataDirectory, $logPath)) {
      if (Test-Path -LiteralPath $target) {
        $resolved = (Resolve-Path -LiteralPath $target).Path
        $leaf = [IO.Path]::GetFileName($resolved)
        if ([IO.Path]::GetDirectoryName($resolved) -ne $expectedParent -or
            ($leaf -notlike "postgres-canonical-*")) {
          throw "Refusing unsafe teardown target: $resolved"
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
      }
    }
  }
  elseif (Test-Path -LiteralPath $dataDirectory) {
    Write-Host "Cluster retained by explicit -KeepCluster: $dataDirectory"
  }
}
