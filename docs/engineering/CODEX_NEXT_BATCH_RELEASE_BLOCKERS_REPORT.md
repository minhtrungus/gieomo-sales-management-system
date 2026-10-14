# CODEX — RELEASE BLOCKER CLOSURE WITHOUT DEPLOYMENT

## Final migration reconciliation addendum (authoritative)

This addendum supersedes older migration-state statements later in this report.
The operator confirms 001–020 ran and 020 is latest, but no target migration
ledger or catalog export was supplied. Staging/production objects and ledger
history therefore remain `UNKNOWN`; disposable evidence is not target evidence.

Audit found that 025 does **not** upgrade the V015 objects created by 015:
`CREATE TABLE IF NOT EXISTS` leaves incompatible text-key columns and constraints
in place. New additive migration `021_reconcile_v015_idempotency.sql` closes the
gap without editing 025. It accepts only exact post-020/V015 shape, preserves the
old ledger and order key under V015 names, disables the legacy 016/017 RPCs, and
installs the exact empty V025 shape. Verified order on disposable PostgreSQL is:

`001–020 → 021 reconciliation → 023 → 024 → 025 → 026`

The root-worktree 021 and 022 `.sql.draft` proposals are not applied and are not
part of this chain. Proposal 021 must be renumbered before any future promotion;
proposal 022 must be reconciled with 023's payment ledger first.

| Migration | Git state | Dependencies | Schema change | Applied confirmation | Action |
|---|---|---|---|---|---|
| 001 | tracked | base | core schema | operator says applied; ledger unverified | retain |
| 002 | tracked | 001 | grants/RLS | operator says applied; ledger unverified | retain |
| 003 | tracked | 001–002 | config CRUD/RLS | operator says applied; ledger unverified | retain |
| 004 | tracked | 001–003 | contact/catalog RLS | operator says applied; ledger unverified | retain |
| 005 | tracked | 003 | social config | operator says applied; ledger unverified | retain |
| 006 | tracked | members | password hash | operator says applied; ledger unverified | retain |
| 007 | tracked | storage | buckets/RLS | operator says applied; ledger unverified | retain |
| 008 | tracked | catalog/members | reviews | operator says applied; ledger unverified | retain |
| 009 | tracked | catalog | relationship repair | operator says applied; ledger unverified | retain |
| 010 | tracked | variants | image URL | operator says applied; ledger unverified | retain |
| 011 | tracked | core tables | RLS hardening | operator says applied; ledger unverified | retain |
| 012 | tracked | variants/RLS | stock/RLS hardening | operator says applied; ledger unverified | retain |
| 013 | root-only, absent candidate/HEAD | 001–012 | order/customer/payment RLS | operator says applied; ledger unverified | do not reapply blindly |
| 014 | root-only, absent candidate/HEAD | enum | freeship value | operator says applied; ledger unverified | do not reapply blindly |
| 015 | root-only, absent candidate/HEAD | orders | V015 text-key ledger | operator says applied; disposable replay only | prerequisite for 021 |
| 016 | root-only, absent candidate/HEAD | 015/catalog/orders | V015 create RPC | operator says applied; disposable replay only | archived/disabled by 021 |
| 017 | root-only, absent candidate/HEAD | 016/orders/vouchers | legacy cancel RPC | operator says applied; disposable replay only | archived/disabled by 021 |
| 018 | root-only, absent candidate/HEAD | payments | transaction uniqueness | operator says applied; disposable replay only | 023 verifies overlap |
| 019 | root-only, absent candidate/HEAD | variants/members | adjustment ledger/RPC | operator says applied; disposable replay only | retain |
| 020 | root-only, absent candidate/HEAD | 019 | delete-policy hardening | operator says latest applied; disposable replay only | baseline boundary |
| 021 | new candidate migration | exact post-020 V015 | archive V015; install V025 shape | not applied to real environment; disposable only | first pending migration |
| 021 proposal | root `.sql.draft` | 013/016/sign-off | revoke direct order DML | draft; not applied | exclude/renumber |
| 022 proposal | root `.sql.draft` | payment design | inbound event draft | draft; not applied | exclude/reconcile with 023 |
| 023 | untracked candidate | core schema; 018-compatible | payment integrity/RPC | no real-environment evidence; disposable only | independent payment lane |
| 024 | untracked candidate | 023 | payment/cash contract repair | no real-environment evidence; disposable only | follow 023 |
| 025 | tracked | exact V025 shape | scoped UUID atomic create | no real-environment evidence; disposable only | follow 021 |
| 026 | new candidate migration | 025/core order schema | reservation ledger/atomic cancel | no real-environment evidence; disposable only | follow 025 |

Migration 016 already deducts combo component variants, contradicting 017's
assumption that combo stock was untouched. The unsafe 017 signature is made
non-executable by 021. Migration 026 reverses only immutable reservations
recorded with the order and returns `inventory_unverified` for legacy orders.

The preflight now requires complete key types, columns, primary/unique
constraints, the order consistency constraint, and the scoped unique index.
It reports V015/V025 only for a complete recognized shape; `MIXED` and `UNKNOWN`
fail closed. Disposable results: exact post-020=`V015`/exit 0; post-026=`V025`/
exit 0; deliberately mixed=`MIXED`/exit 3; deliberately incomplete=`UNKNOWN`/
exit 3. Exact 001–020 followed by 021→023→024→025→026 applied with exit 0,
and the cancellation PostgreSQL suite passed 10/10 with zero skips.

Before staging, the database owner must run the read-only preflight on the
target, export the migration ledger/catalog evidence, verify a restorable
backup, and name execution and rollback owners. Apply nothing on `MIXED` or
`UNKNOWN`. Migration 026 was not applied to staging/production in this batch.
Local review is GO; staging and production remain NO-GO.

**Date:** 2026-10-14
**Worktree:** `integrated-candidate`
**Deployment:** none; staging/production were not contacted

## 1. Cancellation RCA — recorded before implementation

### Observed write path

`PATCH /api/orders` currently performs cancellation as independent PostgREST calls:

1. update `orders.order_status` to `cancelled` using a `neq(cancelled)` guard;
2. if the returned order has a voucher, call `releaseVoucherSlot` separately;
3. log a voucher-release error but still return cancellation success.

The browser-side `updateStoredOrderStatus` also marks the cached order cancelled immediately and independently adds item quantities to cached product inventory. It does not wait for, inspect, or roll back the API result.

### Failure and race modes

- A process/network/database failure between the order update and voucher release commits a partial cancellation.
- Two concurrent requests may both observe ambiguous results around the separate writes; the route has no single transaction covering status, stock, voucher, history, and audit.
- A failed server cancellation still leaves the browser cache showing a cancelled order and locally restored stock.
- The route does not restore authoritative PostgreSQL inventory and does not write cancellation history/audit as part of the same commit.
- The route does not enforce the lifecycle transition set (`pending`, `confirmed`, or `processing` only).
- Payment state is not reconciled atomically. A paid order must remain paid and be flagged for a real refund workflow; writing a synthetic refund would corrupt the payment ledger.

### Inventory provenance gap introduced by migration 025

Migration 025 correctly aggregates `v_stock_lines` and decrements `product_variants.stock` inside `create_order_atomic`. For combo orders, those lines are derived from the combo's component variants. However, the aggregate exists only in a PL/pgSQL variable: it is not persisted on the order, order items, or audit record. `order_items` stores the combo identity but not the component-variant snapshot.

Consequently, reconstructing a historical combo reservation from today's `combo_items` can restore the wrong variants or quantities if the combo definition changed. The repository's older draft cancellation migration assumes combo creation did not deduct stock, which is incompatible with migration 025 and therefore cannot safely be reused.

### Root cause

Cancellation has no authoritative, immutable record of the inventory effect it must reverse and no database transaction that reverses all effects together. UI-side compensation further hides server failure.

### Required correction

- Add an immutable per-order inventory reservation ledger and a completion marker written by `create_order_atomic` in the creation transaction.
- Add one `cancel_order_atomic` transaction that locks the order, validates lifecycle/provenance, restores each recorded variant exactly once, releases the voucher exactly once, writes status history and audit, and preserves payment ledger state.
- Return an idempotent replay for an already-cancelled order.
- Fail closed before any write for legacy/unmarked orders or unsafe voucher state; do not infer combo components.
- Route cancellation only through the RPC and remove browser-side stock compensation.

This is an additive schema correction. No historical migration will be edited and no environment migration will be applied as part of this batch.

## 2. Implementation

**Status: PASS for local implementation and disposable-database verification. Not deployed.**

Changed artifacts:

- `supabase/migrations/026_atomic_order_cancellation.sql`: additive columns, immutable `order_inventory_reservations`, a provenance-recording wrapper around migration 025's writer, and `cancel_order_atomic(jsonb)`.
- `src/app/api/orders/route.ts`: admin cancellation calls only the atomic RPC; mixed cancellation/update payloads are rejected; paid cancellation returns `refundRequired` but never writes a refund.
- `src/lib/data/orderStore.ts`: cancellation is no longer published optimistically and browser inventory compensation was removed.
- `src/app/admin/orders/page.tsx` and `src/app/admin/orders/[id]/page.tsx`: await the server result and advance/close/show success only after commit; the detail page does not issue unrelated metadata writes after cancellation.
- `tests/cancelVoucherRelease.test.ts`: route contract now models one RPC and verifies rollback on RPC failure.
- `tests/cancelOrderAtomicPg.integration.test.ts`: real PostgreSQL replay, concurrency, rollback, combo provenance, voucher, audit, history, legacy fail-closed, and paid-order cases.

Migration 026 depends specifically on the migration-025 schema. It renames the 025 function to a private implementation, revokes direct service-role execution, and exposes a wrapper with the original signature. During a new create, the wrapper takes a `SHARE` lock on `combo_items`, calls the original atomic writer, persists the exact aggregated variant quantities, and marks provenance in the same transaction. A replay of an order created before 026 is not retroactively marked.

Cancellation locks the order first. Only `pending`, `confirmed`, and `processing` can transition. It validates provenance and voucher state before writes, locks inventory rows deterministically, restores the immutable quantities, decrements voucher usage, sets cancellation fields/reason, and inserts history/audit in one transaction. A second or concurrent call observes `already_cancelled` and produces no additional effect. Paid state and payment rows remain unchanged; `refund_required=true` is an operational signal, not proof of refund.

Pre-026 orders intentionally return `inventory_unverified`. This is a compatibility boundary, not a silent backfill: an operator must reconcile historical reservation evidence before cancellation.

## 3. Migration preflight (013–025)

Read-only draft: `supabase/013_025_read_only_preflight.sql`.

| Range | Git/file state in candidate | Disposable DB evidence | Confirmed migration history |
|---|---|---|---|
| 013–020 | Absent from candidate; standalone files exist untracked in the root worktree | RLS/freeship markers present; `inventory_adjustments` absent | No |
| 021–022 | Absent from candidate; untracked `.draft` proposals in root | Object names overlap later payment/RLS work and are not proof | No |
| 023–024 | Untracked in candidate | Payment objects/RPC present from explicit disposable test setup | No |
| 025 | Tracked at HEAD `dd64e658` | V025 UUID/scoped ledger and RPC present | File/application on disposable only; no migration ledger |
| 026 | New, untracked in this batch | Applied only to disposable PostgreSQL for tests | No environment history; not deployed |

The disposable database has no `supabase_migrations.schema_migrations` relation, so its objects cannot be presented as ledger-confirmed migration history. Staging and production remain `UNKNOWN`.

The detector recognizes:

- `V015`: text key on ledger/orders plus lease/fingerprint/expiry fields, without V025 fields;
- `V025`: UUID key plus scoped key/retention/request-hash fields, without V015 fields;
- `MIXED`: marker families coexist;
- `UNKNOWN`: missing, incomplete, or otherwise unrecognized shape.

It runs inside `BEGIN TRANSACTION READ ONLY`, reports catalog evidence, and raises an exception for `MIXED` or `UNKNOWN`. It does not delete data or select a target schema. On the disposable database it reported `IDEMPOTENCY_SCHEMA_STATE=V025` and rolled back. It was not run against staging or production.

## 4. Staging readiness

The existing checklist was updated instead of creating a duplicate: `docs/engineering/RELEASE_CANDIDATE_HANDOFF.md`, section **Current staging-readiness addendum**.

Remaining blockers include unknown target migration history/schema, unknown backup and execution/rollback owners, no verified staging credentials/window, login abuse protection, unknown provider/domain/preview configuration, staging smoke tests not run, and monitoring ownership not assigned. Local success does not change staging or production to ready.

## 5. Lint baseline and delta

No lint configuration or rule was changed and no auto-fix was run.

| Snapshot | Command | Exit | Errors | Warnings |
|---|---|---:|---:|---:|
| Exact committed HEAD | `eslint . --format json` | 1 | 272 | 192 |
| Pre-batch dirty candidate snapshot | same | 1 | 260 | 185 |
| Final dirty candidate snapshot | same | 1 | 258 | 185 |

The batch delta against the preserved dirty snapshot is **−2 errors, 0 warnings**. The removed errors were inside the deleted browser stock-compensation block. Both new test files/lint-scoped additions report zero new lint findings. The project still fails its lint gate because 258 pre-existing errors remain across other workstreams; this is recorded as failure, not normalized to pass.

## 6. `.tmp` recovery plan

No `.tmp` file or cluster state was changed.

Observed read-only facts:

- Data directory: `C:\Users\MT\Workspaces\gieomo-sales-management-system\.tmp\postgres-session4-data`
- PID file: `postmaster.pid`, recorded PID `15692`, port `55439`, state text `ready`
- PID `15692`: no current process
- Port `55439`: no listener
- `PG_VERSION`: `18`; installed binary: PostgreSQL `18.6`
- `pg_controldata`: control version `1800`, catalog `202506291`, checksums `1`, cluster state `in production` (unclean/stale)
- A separate disposable server is currently listening on `127.0.0.1:55434`, PID `16852`, data directory under `%LOCALAPPDATA%\Temp\codex-d3-pg-20261014-1430\data`.

Recovery must wait for explicit approval and a maintenance window. Safest sequence: stop and identify the disposable 55434 instance first; re-check PID/ports; copy the old directory byte-for-byte to a new explicit recovery directory; remove only the copied stale `postmaster.pid`; start the **copy** with PostgreSQL 18.6 bound to `127.0.0.1:55439`; allow crash recovery; run read-only validation/dumps; stop the copy with fast shutdown. Never start or modify the original directory.

Planned commands (not executed):

```powershell
netstat -ano -p tcp | findstr ":55434 :55439"
Get-Process -Id 15692 -ErrorAction SilentlyContinue
& 'C:\Users\MT\scoop\apps\postgresql\current\bin\pg_controldata.exe' 'C:\Users\MT\Workspaces\gieomo-sales-management-system\.tmp\postgres-session4-data'
robocopy 'C:\Users\MT\Workspaces\gieomo-sales-management-system\.tmp\postgres-session4-data' '<approved-recovery-copy>' /E /COPYALL /DCOPY:DAT
Remove-Item -LiteralPath '<approved-recovery-copy>\postmaster.pid'
& 'C:\Users\MT\scoop\apps\postgresql\current\bin\pg_ctl.exe' -D '<approved-recovery-copy>' -l '<approved-recovery-log>' -o '-h 127.0.0.1 -p 55439' start
& 'C:\Users\MT\scoop\apps\postgresql\current\bin\pg_isready.exe' -h 127.0.0.1 -p 55439
& 'C:\Users\MT\scoop\apps\postgresql\current\bin\pg_ctl.exe' -D '<approved-recovery-copy>' -m fast stop
```

The placeholders must be resolved to absolute paths and validated before any copy/removal/start. Data extraction should use `pg_dump`/`pg_dumpall` after recovery, not direct edits.

## 7. Verification evidence

Worktree: `C:\Users\MT\Workspaces\gieomo-sales-management-system-worktrees\integrated-candidate`
Branch: `integrated/r1-recon-p0a3-security`
HEAD before/after: `dd64e658c1ee816953e49f6e0cf0cb4815b5f15a`
Upstream and read-only remote SHA after work: the same SHA.

| Command / environment | Result |
|---|---|
| Apply migration 026 with `psql -X -v ON_ERROR_STOP=1 -f ...` on disposable PG 18.6 | exit 0 |
| Read-only 013–025 preflight on disposable PG | exit 0; `V025`; transaction rolled back |
| Focused cancellation PostgreSQL suite | 10/10 pass, 0 fail, 0 skipped, exit 0 |
| Full `node --test "tests/*.test.ts"` with `ATOMIC_PG_URL` | 277/277 pass, 0 fail, 0 skipped, exit 0 |
| `next typegen` then `tsc --noEmit` in isolated copy | exit 0 |
| Next.js 16.3.5 default Turbopack production build in isolated copy with physical dependencies | exit 0; 49/49 static pages |
| `eslint . --format json` | exit 1; 258 errors / 185 warnings (known baseline remains) |
| `git diff --check` | exit 0; line-ending warnings only |
| Careera / `PERSONAL USE ONLY` search | 0 matches |

The first isolated build attempt failed only because restricted network access prevented `next/font` from downloading Caveat, Montserrat, and Playfair Display. The approved network retry compiled successfully. Static generation logged missing Supabase environment variables but completed; no values were supplied or printed.

No staging/production tests, migration, smoke test, provider preview, or live refund was run.

## 8. Verdict

- **Atomic cancellation:** `PASS` locally with real PostgreSQL evidence.
- **Local preview/review:** `GO`, subject to reviewing the intentionally dirty multi-workstream candidate and non-zero inherited lint baseline.
- **Staging:** `NO-GO` — schema/migration history, owners, backup, environment/provider and smoke evidence are incomplete or `UNKNOWN`.
- **Production:** `NO-GO` — staging has not run; login abuse protection and operational refund/monitoring controls remain blocked.

No commit, push, merge, stage, reset, stash, deploy, real-database migration, `.tmp` mutation, or PostgreSQL start/stop was performed. The remote feature SHA remains unchanged.

Smallest next batch: review migration 026 and the read-only preflight, then have the staging database owner run only the preflight and export the actual migration ledger/schema evidence. Do not deploy or choose a reconciliation target until that evidence resolves `V015`/`V025` and all `UNKNOWN` ownership/backup items.
