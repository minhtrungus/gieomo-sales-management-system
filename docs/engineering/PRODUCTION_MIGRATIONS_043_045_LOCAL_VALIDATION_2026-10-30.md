# Local validation evidence — migrations 001-045

Date: 2026-10-30 (Asia/Saigon)

Scope: local-only validation from detached worktree at expected base commit
`b65c1421909b9cf8084df56b27364eb183d74e9c`. No Supabase branch, paid resource,
Production write, code commit, or push was performed.

## Environment

- Database: `gieomo_migration_test`
- Bind address: loopback `127.0.0.1`
- PostgreSQL: 18.6 x86_64-windows
- Supabase CLI: 2.98.2
- Docker/Podman: unavailable
- PostgreSQL 17: unavailable; compatibility is not claimed
- Cluster lifecycle: unique task-scoped data directory, stopped and removed by
  guarded harness teardown

## Initial failure and remediation

The first replay applied migrations 001 through 043 and failed at 044 because
the exact `position()` matcher expected LF line endings while the Windows
function definition contained CRLF. The migration was changed to:

- match whitespace with a PostgreSQL regex;
- require exactly one source-loop match;
- replace only that one allocation loop;
- verify the old pattern is gone and the new ordering exists.

This is portability evidence on PG18, not direct PG17 evidence.
The 044 change remains an uncommitted candidate. It may be accepted only after
read-only Production history proves 044 has not been applied. If 044 is already
recorded anywhere, the repository file must remain immutable and the correction
must be delivered as an additive migration instead.

## Successful command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/postgres/replay-canonical-migrations.ps1 `
  -Port 55445 `
  -DatabaseName gieomo_migration_test
```

Final observed results:

- Migrations applied in lexical order: 45, tip
  `045_guard_admin_order_archival.sql`.
- SQL integrity markers: `PAYMENT_INTEGRITY_PG_PASS` and
  `ORDER_INTEGRITY_PG_PASS`.
- Mandatory PostgreSQL integration tests: 117 passed, 0 failed, 0 skipped,
  20 files, 54.450 seconds.
- Source tests: 650 passed, 0 failed, 0 skipped, 91 files, 33.560 seconds.
- Migration 044 priority regression confirmed that wildcard demand consumes the
  highest `sort_order` variant first and records matching reservation
  provenance.
- Canonical marker: `CANONICAL_REPLAY_PASS migrations=45`.
- Migration-chain/source contracts: 9 passed, 0 failed.
- Next.js/TypeScript type-check: passed.
- Diff whitespace check: passed (only the existing Git CRLF conversion warning).
- Secret-pattern scan of changed files: no matches.
- Final teardown: no listeners on test ports and no retained test cluster.
- Supabase lint could not enable `plpgsql_check` on vanilla PostgreSQL and was
  reported as blocked (`lint_exit=1`), not silently counted as a pass.

## Production read-only status

Read-only control-plane metadata confirmed project
`snmmiwpvlpknkinhfqsv` is `ACTIVE_HEALTHY` in `ap-southeast-1` and runs
PostgreSQL `17.6.1.166`. Its default branch reports `MIGRATIONS_FAILED`.

No verified database credential or local CLI link is configured. The GitHub
`Production` environment has no secret or variable names configured, while the
deployment workflow refers to the non-existent environments `production` and
`production-readonly`. Consequently, remote migration history, checksums,
schema state, and backup/PITR readiness remain unknown. Repository files and
local replay are not evidence of Production applied state.

Release decision: database deployment is blocked. Candidate 044 must remain
uncommitted until Production history proves whether 044 is unapplied (candidate
may become canonical 044) or already applied (the correction must be a new
additive migration). No migration repair or Production write was attempted.
