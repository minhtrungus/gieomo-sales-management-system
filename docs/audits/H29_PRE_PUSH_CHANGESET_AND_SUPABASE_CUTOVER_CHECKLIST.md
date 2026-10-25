# H29 — Pre-push changeset and Supabase cutover checklist

Date: 2026-10-23 (Asia/Saigon)  
Repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`  
Baseline/final branch and HEAD: `main` @ `1c51af625a575a41733d59b29cc9be9ae0892c60`  
Verdict: **NO-GO FOR PUSH/CUTOVER; SCOPED PATCH READY FOR OWNER REVIEW**

## 1. Workspace forensics

- Initial status for this continuation: 172 entries; final before these two reports: 182 entries; staged files: 0.
- The repository was already heavily dirty, including tracked edits, deleted files and a large untracked release body. Whole-file diffs must not be attributed to this continuation.
- No reset, clean, stash, revert, destructive checkout, stage, commit, push, merge, deploy, remote Supabase command, migration of the restored snapshot, or business-data write was performed.
- Existing worktrees and all prior WIP were preserved.

Change ownership for this continuation:

| Class | Files / purpose |
|---|---|
| Combo semantics | `src/lib/comboInventory.ts`, Combo API/Admin hunks, migration 031, focused tests |
| Controlled deletion | delete API, `ControlledOrderDeletePanel`, order-detail integration, migration 032, focused tests |
| Navigation performance | in-flight guards in `src/lib/data/orderStore.ts`, benchmark and source regression |
| Release harness | migration tip 032 in replay script; deletion PG test added to mandatory runner |
| Documentation | this checklist and the scoped H29 feature/performance report |

Temporary probes/build copies under `.tmp/` are evidence only and must not be included in a product commit. Backup/restore artifacts and any PII-bearing recon output must never be pushed.

## 2. Existing H29 findings retained

The earlier fixes remain supported by current evidence: AUTH-05 redirect is bounded, Orders reads 73 restored rows instead of masking schema errors, catalog failures are explicit, Admin Payments reads recorded rows instead of synthesizing transactions, and local/dev analytics is disabled. The restored snapshot remains a real Production copy with PII, 0 payment rows for 39 paid-status orders, and a pre-022 schema.

The new Combo business definition supersedes only the earlier conclusion that NULL components were “unconfigured”. It does not erase the historical payment gap or writer-schema cutover blockers.

## 3. Canonical migration dependency inventory

| Migration | Purpose | Depends on / risk | Rollback posture |
|---|---|---|---|
| 022 | revoke runtime order-domain DML/policies | must precede service-role-only writers | restore grants/policies only with security approval |
| 023 | payment events, uniqueness, atomic apply | data preflight for duplicate transaction/paid rows | forward repair preferred; destructive rollback unsafe after events |
| 024 | repair COD/cash payment contract | replaces 023 function | restore prior function only before new traffic |
| 025 | idempotent atomic order creation | order ledger, stock/voucher locks | high-risk function rollback; preserve idempotency rows |
| 026 | reservations and atomic cancellation | wraps 025 creator; adds restore/release semantics | coordinated function/table rollback only |
| 027 | close read/RPC bypasses | assumes server-mediated reads/writes | security rollback requires explicit owner approval |
| 028 | full least privilege on order/payment tables | reinforces 022/027 | do not loosen for convenience |
| 029 | atomic payment rejection | payment/history/audit contract | forward-fix preferred |
| 030 | atomic Combo persistence | service-role writer and row locking | superseded by 031 function body |
| 031 | allow/persist NULL Combo variant | requires active product and active-variant pool | restore 030 only if no NULL component is saved |
| 032 | controlled order deletion | requires tables/functions from 023–026 and admin server route | revoke function immediately to disable; data deletion itself is irreversible |

The chain validator reports 32 contiguous migrations and tip 032. A fresh disposable PostgreSQL 18.6 cluster applied 001–032 and passed 57/57 mandatory PG tests. Supabase DB lint remains blocked on missing `plpgsql_check` in vanilla PostgreSQL.

Critical dependency gap: migration 025 still rejects Combo NULL components. Migration 031 makes persistence valid but does not make checkout valid. A new, reviewed migration is required for deterministic wildcard allocation, locking, reservations, cancellation restoration and oversell concurrency proof.

## 4. Pre-push file policy

Suggested inclusion groups after owner review (stage explicitly, never `git add .`):

1. Combo read/admin/API logic, migration 031 and its regressions.
2. Controlled deletion API/UI, migration 032 and its regressions.
3. Navigation in-flight guards and regression.
4. Migration validation/replay runner updates.
5. The two H29 reports.

Explicit exclusions:

- `.tmp/**`, `backups/**`, restored databases, logs, browser profiles, cookies/tokens and PII extracts;
- generated build output and lock files created by running servers;
- unrelated images/fonts/docs/source WIP unless separately reviewed;
- proposal SQL as canonical migration;
- any secret or `.env*` file.

Because migrations 013–032 and many tests are currently untracked together with unrelated WIP, a reviewer must inspect the complete proposed index before commit. No safe one-command staging set is asserted here.

## 5. Mandatory pre-push gate

- [ ] Owner confirms exact commit scope and reviews every staged path.
- [ ] `git diff --cached --check` is clean and `git diff --cached --stat` matches the approved inventory.
- [ ] No `.tmp`, backup, PII, credential, `.env*`, generated build, or browser artifact is staged.
- [ ] All 507 non-PG tests, type-check and targeted lint rerun from the staged tree.
- [ ] Disposable canonical replay applies migrations 001–032 with all mandatory PG tests and no skips.
- [ ] A configured production build is run; the current secretless isolated build is only partial configuration evidence.
- [ ] Wildcard Combo checkout is either completed with atomic PG concurrency evidence or feature-gated so NULL-component Combos cannot be sold.
- [ ] Whole-file lint debt is triaged; current result is not green.
- [ ] Payment ledger discrepancy (39 paid-status orders, 0 payment rows) has an owner-approved evidence/backfill decision.

## 6. Supabase cutover checklist

### Before a maintenance window

- [ ] Owner approves target project identity, deployment window, operators and rollback authority.
- [ ] Take and verify a fresh backup; compare live delta against the audited snapshot.
- [ ] Export and verify the remote migration ledger without printing secrets.
- [ ] Run read-only duplicate/precondition queries for migrations 022–032.
- [ ] Resolve or explicitly gate wildcard Combo checkout.
- [ ] Reconcile historical paid orders against bank evidence; never synthesize payment rows.
- [ ] Prepare a versioned application artifact matching the exact migration tip.
- [ ] Record stop conditions for lock waits, constraint failures, ledger mismatch and smoke failure.

### During cutover

- [ ] Put affected writers into maintenance mode before schema/RPC changes.
- [ ] Reconfirm project/database identity and backup timestamp.
- [ ] Apply migrations strictly in order; do not skip from the pre-022 snapshot directly to a later function.
- [ ] Verify objects, grants, RLS and function ownership after each security-sensitive stage.
- [ ] Deploy the matching application only after database verification.
- [ ] Run read-only auth/catalog/order/payment smoke before enabling writers.
- [ ] Enable one write domain at a time with audit and idempotency observation.

### After cutover

- [ ] Verify no runtime role has direct order/payment DML or protected RPC execution.
- [ ] Verify login/logout/AUTH-05, Orders, catalog, reconciliation and Combo display.
- [ ] Test order/payment/inventory/Combo writers only with approved synthetic records and cleanup policy.
- [ ] Verify webhook retries and duplicate events converge idempotently.
- [ ] Keep deletion RPC disabled from routine use until owner accepts its retention policy; test only on approved synthetic orders.
- [ ] Capture migration ledger, route version, test evidence and rollback decision.

## 7. Current evidence and blockers

- PASS: focused 52/52, all non-PG 507/507, type-check, migration-chain validation, replay 001–032, mandatory PG 57/57, new-file lint, `git diff --check`, isolated build 49/49 pages.
- PASS: read-only browser smoke against the restored snapshot; no sensitive-key leak or browser/network error.
- PARTIAL: production build lacks runtime secrets by design and logs handled static data/config failures.
- FAIL: broad lint remains 45 errors/28 warnings in surrounding pre-existing files.
- BLOCKED: optional-variant Combo checkout atomicity.
- BLOCKED: payment-ledger reconciliation and Production migration-ledger/cutover approval.
- BLOCKED: current restored runtime does not contain migration 032, so deletion UI cannot be acceptance-tested there.

The local stack that supplied browser evidence stopped listening later in the audit without an agent-issued kill. It was not restarted because the current task does not authorize risky recovery of the restored PostgreSQL stack. No claim is made that `http://127.0.0.1:3790` is currently available.

## 8. Decision

**NO-GO FOR PUSH/CUTOVER.** The scoped patch is ready for owner review, and the new migrations are proven on a disposable database. A push should wait for explicit changeset selection and the pre-push gate. A Production cutover additionally requires wildcard Combo checkout closure, payment reconciliation, remote-ledger verification, a fresh backup, and an approved maintenance/rollback plan.
