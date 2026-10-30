# Production migrations 043-045 plan

Status: prepared only. Execution is explicitly out of scope for the local
validation task. Production project ref is `snmmiwpvlpknkinhfqsv`.

## Release gate

All conditions below must be independently confirmed immediately before any
write:

1. The reviewed artifact contains the contiguous migration chain `001` through
   `045` and its commit SHA is the approved release SHA.
2. The target project ref is exactly `snmmiwpvlpknkinhfqsv`; the database host
   fingerprint belongs to that project. Never print the connection URL.
3. Remote migration history is known and contains exactly `001` through `042`,
   once each, with no missing, repaired, duplicate, or unexpected version.
   This is also the prerequisite for accepting the candidate edit to migration
   044. If any environment has already recorded 044, do not rewrite its file;
   preserve it and ship the portability correction as a new additive migration.
4. `supabase db push --dry-run` reports exactly `043`, `044`, and `045`, in that
   order. Do not use `--include-all`, `migration repair`, reset, or history edits.
5. A current restorable backup or PITR restore point is visible in the
   Supabase Dashboard, and the release owner has confirmed the recovery owner
   and acceptable recovery window.
6. PostgreSQL 17 replay of `001` through `045` and the mandatory zero-skip PG
   suite has passed. PostgreSQL 16 CI and PostgreSQL 18 portability evidence do
   not replace this gate.
7. The application release containing the archive API/UI changes is ready, and
   no older writer depends on direct execution of
   `create_order_atomic_v25(jsonb)`.
8. A separate, explicit Production write approval has been recorded. This plan
   is not that approval.

Stop if any condition is unknown or false.

## Reviewed SQL effects

### 043_admin_order_archival.sql

- Creates `public.admin_order_archives` with a restrictive FK to `orders` and
  members, a bounded non-empty reason, snapshot, actor, and timestamp.
- Enables RLS; revokes all access from `PUBLIC`, `anon`, and `authenticated`;
  grants only `SELECT`/`INSERT` to `service_role` and creates the matching
  service-role policy.
- Creates `archive_order_atomic(jsonb)` as `SECURITY DEFINER` with fixed
  `search_path = public, pg_temp`, order row locking, active-admin validation,
  archive snapshot, and audit insert.
- Does not delete or rewrite existing business rows. The new table starts empty.

### 044_combo_bottom_up_allocation.sql

- Reads `pg_get_functiondef(create_order_atomic_v25(jsonb))` and requires
  exactly one wildcard allocation-loop match before replacement.
- Replaces only allocation priority with
  `sort_order DESC, variant_id DESC`; the preceding deterministic lock pass is
  unchanged.
- Uses whitespace-tolerant matching so LF and CRLF definitions behave the same.
- Revokes direct execution of the internal `create_order_atomic_v25(jsonb)`
  implementation from runtime roles and `service_role`; the public service
  entry point remains `create_order_atomic(jsonb)`.
- Performs no migration-time stock, reservation, order, or payment writes.

### 045_guard_admin_order_archival.sql

- Replaces `archive_order_atomic(jsonb)` with a terminal-state guard.
- Only `completed` and `cancelled` orders can be archived. Pending, confirmed,
  processing, ready-to-ship, and shipping orders return `not_terminal`.
- Archive is visibility metadata only: it does not change order status,
  inventory, reservations, payments, provider references, shipments, refunds,
  or restocks.
- Archive and audit inserts are in the same RPC transaction. An audit failure
  rolls back the archive row.
- Execute remains restricted to `service_role`.

## Target-pinned preflight commands

Run only in an isolated operator shell/runner. Secrets must be injected by the
approved secret store and never echoed:

```powershell
$env:GIEOMO_EXPECTED_MIGRATION_TIP = "045"
node scripts/migrations/validate-chain.mjs

# Read-only: the URL must be a separately verified Production secret.
supabase migration list --db-url "$env:SUPABASE_PRODUCTION_DB_URL"
supabase db push --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --dry-run
```

The operator must copy the redacted history and dry-run migration names into
the change record. Stop unless the dry-run contains only:

1. `043_admin_order_archival.sql`
2. `044_combo_bottom_up_allocation.sql`
3. `045_guard_admin_order_archival.sql`

## Apply command — requires a separate approval

Do not run this command as part of preparation or read-only verification:

```powershell
supabase db push --db-url "$env:SUPABASE_PRODUCTION_DB_URL"
```

Do not link the local developer worktree to Production. Do not seed or reset.

## Post-apply read-only verification

```powershell
supabase migration list --db-url "$env:SUPABASE_PRODUCTION_DB_URL"
supabase db lint --db-url "$env:SUPABASE_PRODUCTION_DB_URL" --fail-on error --schema public
```

Run the following through an approved read-only SQL session:

```sql
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('043', '044', '045')
ORDER BY version;

SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'admin_order_archives';

SELECT has_table_privilege('anon', 'public.admin_order_archives', 'SELECT') AS anon_select,
       has_table_privilege('authenticated', 'public.admin_order_archives', 'SELECT') AS authenticated_select,
       has_table_privilege('service_role', 'public.admin_order_archives', 'SELECT') AS service_select;

SELECT p.prosecdef,
       p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid = 'public.archive_order_atomic(jsonb)'::regprocedure;

SELECT position('ORDER BY pv.sort_order DESC, pv.variant_id DESC'
                IN pg_get_functiondef('public.create_order_atomic_v25(jsonb)'::regprocedure)) > 0
       AS bottom_up_allocation_installed;
```

Expected: history has exactly three rows; RLS is enabled; runtime table access
and RPC execution are false; service-role access is true; the bottom-up marker
is true. These checks do not authorize writing synthetic orders to Production.

## Failure handling and recovery

- If preflight/history/dry-run differs: stop without repair or reset. Reconcile
  evidence with a separately reviewed forward migration plan.
- If 043 fails: verify no `043` history row and inspect whether its transaction
  rolled back. Do not manually mark it applied.
- If 044 reports zero or multiple allocation-loop matches: stop. Do not edit a
  live function manually. Capture the redacted definition and prepare a new
  reviewed migration.
- If 045 fails: do not expose archive UI against the unguarded 043 RPC. Stop the
  application rollout and prepare a forward fix.
- There is no automatic down migration. Restoring a backup/PITR point is the
  database-level rollback. After any archive activity, dropping the archive
  table would destroy audit evidence; prefer a reviewed forward migration.
- Application rollback and database recovery are separate decisions. Record
  the owner, timestamps, applied history, and observed error before acting.

## PostgreSQL 17 zero-cost rehearsal

This machine currently has PostgreSQL 18.6 only and no Docker/Podman. To close
the PG17 gate without a paid Supabase branch, the owner may install Docker
Desktop/Podman or PostgreSQL 17 locally, then point the existing harness at the
PostgreSQL 17 `bin` directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/postgres/replay-canonical-migrations.ps1 `
  -PostgresBin "<PostgreSQL-17-bin>" `
  -Port 55445 `
  -DatabaseName gieomo_migration_test
```

The required evidence is `CANONICAL_REPLAY_PASS migrations=45`, mandatory PG
tests with `skipped=0`, and the server identity showing PostgreSQL 17.
