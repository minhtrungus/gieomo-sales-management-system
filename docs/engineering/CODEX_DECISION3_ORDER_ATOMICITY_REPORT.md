# CODEX — DECISION 3 ORDER ATOMICITY REPORT (checkpoint + continuation)

**Date:** 2026-10-14
**Worktree:** `C:\Users\MT\Workspaces\gieomo-sales-management-system-worktrees\integrated-candidate`
**Branch:** `integrated/r1-recon-p0a3-security`
**Conclusion:** `NO-GO — CODE BLOCKERS` (PostgreSQL evidence also not yet produced; see §7–§9)

---

## 1. Preflight (verified before any write)

| Item | Value |
|---|---|
| `git rev-parse --show-toplevel` | candidate worktree (as expected) |
| `git branch --show-current` | `integrated/r1-recon-p0a3-security` (as expected) |
| `git rev-parse HEAD` (start) | `1c51af625a575a41733d59b29cc9be9ae0892c60` = recorded base |
| Staged at start | none |
| `git stash list` | empty |
| Remote | `origin` = https://github.com/minhtrungus/gieomo-sales-management-system.git |
| Remote branch before push | did not exist; origin/main = `9fdfc70` |

The worktree contained ~55 pre-existing changed/untracked files from other workstreams (security hardening, reconciliation, payment, PII, docs). None of these were staged, edited, or discarded except the files explicitly listed in §3.

## 2. Reviewed artifacts

- `src/lib/orderIdempotency.ts` (41 lines, untracked): client-side attempt key. Stable key reused for identical payload fingerprint per flow (`sessionStorage`), `crypto.randomUUID()` keys, stored-key format validated, corrupt storage recovers with fresh key. Server-side uniqueness remains authoritative. Not wired to any call site yet.
- `src/lib/services/orderRequestHash.ts` (73 lines, untracked): `stableStringify` (sorted keys), canonical payload covering name/phone/email/address/voucher/referral/seller/delivery/payment + items (identity+quantity only — client price/discount/shipping/stock fields are NOT part of the canonical payload), SHA-256 request hash, `buildOrderIdempotencyScope` → `member:<uuid>` or `guest:<sha256(phone)>`, matching migration 025 CHECK patterns. Observation (not a blocker): empty-string vs absent optional fields hash differently although the RPC would treat them identically; client fingerprint-key reuse mitigates this in practice.
- `src/lib/services/orderService.ts` (diff): `validateOrderCreateLines` runs at `createOrderServer` entry before any DB access; quantity clamp (`Math.max/min/floor`) replaced by strict rejection; `canExposeOrderPaymentProof(isAdmin, hasPhoneVerification)` replaces `isAdmin || options?.code` for `payment_proof`. Provenance of the receipt change: `CODEX_C7_RELEASE_GATE_REPORT.md` lines 15/93 (P1 receipt exposure fix). Two dead hash imports (present but unused) were removed before commit.
- `supabase/migrations/025_atomic_idempotent_order_creation.sql` (488 lines, untracked): static review only. Creates `order_idempotency` (PK scope+key, UNIQUE order_id, scope/hash/status CHECKs, RLS + REVOKE from PUBLIC/anon/authenticated, GRANT to service_role), `orders.idempotency_*` columns + partial unique index, `create_order_atomic(jsonb)` SECURITY DEFINER with `pg_advisory_xact_lock(71420261014)` serialization, `FOR UPDATE` replay, `D3:HASH_MISMATCH` / `D3:IN_PROGRESS` rejection, in-transaction stock deduction (`WHERE stock >= qty`, fail-closed), voucher row lock + `times_used` increment in-transaction, combo component without `variant_id` → `D3:COMBO_COMPONENTS_UNMAPPED`, post-migration DO-block asserting anon/authenticated cannot EXECUTE. All referenced tables/enums/sequences verified present in migration 001 (tracked chain 001–012).

## 3. Checkpoint commits (created and verified)

**Commit `1443318` — `feat: add order idempotency primitives`**
- `src/lib/orderCreateInput.ts` (+93)
- `src/lib/orderIdempotency.ts` (+40)
- `src/lib/services/orderRequestHash.ts` (+72)
- `tests/orderIdempotencyPrimitives.test.ts` (+193) — new test file written in this session (14 cases: key stability/reuse/corruption recovery, canonicalization, hash sensitivity, client price-field exclusion, scope contract)

**Commit `e2be339` — `feat(orders): validate order lines and gate receipt exposure`**
- `src/lib/services/orderService.ts` (+13/−7)
- `tests/orderCreateInputIntegrity.test.ts` (+157)

Safety checks per commit: staged file-by-file only; `git diff --cached --check` clean (two EOF blank lines fixed); full cached diff reviewed; secrets scan of staged diff → no matches; committed-tree export via `git checkout-index` → subset tests 14/14 pass (commit 1) and 80/80 pass (commit 2). No unrelated file was staged. No force operations.

## 4. Push (verified)

`git push -u origin integrated/r1-recon-p0a3-security` → **success, new branch** (no force, origin/main untouched at `9fdfc70`).
Verified via `git ls-remote`: `origin/integrated/r1-recon-p0a3-security = e2be33966b7b8a33791d44c476f4a9ba875b665e` = local HEAD; upstream tracking set.

## 5. Still uncommitted (and why)

55 working-tree entries remain (54 pre-existing + this report). Decision-3-relevant:

- `supabase/migrations/025_atomic_idempotent_order_creation.sql` — NOT committed: no PostgreSQL integration evidence yet; 023/024 exist only untracked and their applied state is unknown; freeship `discount_type` (added only by dashboard-only migration 014, applied-state unknown) would be handled as `fixed_amount` by the RPC — pricing divergence risk; RPC not wired into the app.
- `supabase/migrations/023_payment_integrity.sql`, `024_repair_payment_cash_contract.sql` — untracked from earlier workstream; not evaluated for commit in this task.
- All other modified/untracked files belong to other workstreams (security, reconciliation, payment, PII, docs) and were deliberately left untouched.

Migration history fact: the git-tracked chain is **001–012 only**; 013–020 were intentionally never committed (dashboard-standalone, per `DATABASE_MIGRATION_RUNBOOK.md`); 021–022 are drafts in `proposals/`. **Staging/production DB migration state remains DATABASE STATE UNVERIFIED** (no production/staging access used, none attempted).

## 6. Test evidence (exactly what ran)

| Run | Result |
|---|---|
| `node --test tests/orderCreateInputIntegrity.test.ts` | PASS 8/8 |
| `node --test tests/orderIdempotencyPrimitives.test.ts` | PASS 14/14 |
| Focused combined | PASS 22/22 |
| Full suite `node --test "tests/*.test.ts"` (before adding new test file) | 220 tests: 219 pass, **1 skipped**, 0 fail, exit 0 (skipped test identity not verified this session) |
| Committed-tree export (commit 1) | PASS 14/14 |
| Committed-tree export (commit 2 = full committed test set) | PASS 80/80 |
| `npx tsc --noEmit` | PASS (exit 0, run twice) |
| `npx eslint` on candidate files | 8 errors, all `no-explicit-any` in `orderService.ts` lines OUTSIDE the diff (pre-existing baseline); 0 problems in new files; the 2 new unused-import warnings found mid-session were fixed before commit 2 |
| `git diff --check` | clean |

Not run: full suite after adding the new test file (only focused + committed-tree runs covered it); production `next build`.

## 7. PostgreSQL evidence — status: NOT OBTAINED (work interrupted mid-setup)

Checked environment:
- `psql`/`initdb`/`pg_ctl`/`postgres` 18.6 available (scoop); Supabase CLI 2.98.2 present but **Docker not installed** → supabase local stack impossible; no PG on port 5432; `ATOMIC_PG_URL` not set; no `.env` files. Pattern for env-gated PG tests exists: `tests/paymentCashPg.integration.test.ts`.
- Created **disposable local cluster** `C:\Users\MT\AppData\Local\Temp\opencode\pgd3` (initdb success, port 55432, trust auth, local only — no production/staging contact at any point).

Findings with evidence:
- Postmasters started via `pg_ctl` were unusable: every backend child logged `could not reserve shared memory region ... error code 487`; autovacuum died with `0xC0000142` (see `pgd3\postgres.log`).
- **Last experiment succeeded:** launching `postgres.exe` directly via `Start-Process` → crash recovery completed, `SELECT 1` returned `1` (exit 0). A working disposable PG path therefore exists.
- The server was then **stopped cleanly and confirmed**: `pg_ctl -m fast stop` → "server stopped", RC=0, `PG_PROC_COUNT=0`, follow-up connection refused. Cluster data directory remains in temp for reuse.

Zero migrations were applied to this cluster (001–012, 023, 024, 025 all unapplied; no auth/storage stubs; no seeds). Therefore **none** of the required integration scenarios (create/retry/concurrent/hash-mismatch/rollback/stock/voucher-race/combo-fail-closed/payment-regression/fresh-install/upgrade) were executed. No mock test is claimed as atomicity proof.

## 8. Call-site integration status

- Integrated and committed: input validation + receipt gating inside `createOrderServer` (entry point used by `POST /api/orders`).
- **Not integrated (core Decision 3 gap):** `create_order_atomic` RPC is not called anywhere; `createOrderServer` still performs legacy sequential PostgREST writes; no server-side scope/hash computation in the request path; client attempt key (`getOrCreateOrderAttemptKey`) not yet used by `orderStore.ts`/checkout/POS/sale call sites. An earlier large `orderService.ts` rewrite (+0/−1016) had been auto-review-rejected upstream; it was not bypassed or re-split in this session.

## 9. Remaining blockers / undecided business points

1. Wire RPC + server-derived scope/hash + stable client attempt key into the real create path (auto-retry must reuse key; new intent = new key; client must not choose scope).
2. Produce real PostgreSQL evidence (all 13 scenario groups), incl. concurrency and rollback row-count checks.
3. Decide/verify: freeship voucher handling in RPC vs `computePricing`; whether 013–020 were applied on staging/prod (dashboard-only, unverifiable from git); migration 025/023/024 deployment ordering.
4. Full suite re-run + `next build` after integration; staging validation of migration chain.

**Safest next step:** restart the disposable cluster with the proven direct-`postgres.exe` launch, apply stubs + migrations 001–012 (+025; 023/024 only if payment regression needed), seed fixtures, write env-gated PG integration tests (`node --test`, skip when URL unset), and only then wire the RPC into `createOrderServer`. No production access is required for any of this.

---

## 10. Codex takeover continuation — 2026-10-14

### Git and remote verification

- Starting local and remote SHA both matched `e2be33966b7b8a33791d44c476f4a9ba875b665e`; no stash or staged files existed, and the pre-existing dirty tree was preserved.
- Pushed `ac9f31ee3d0c60c796b27fb98ec3fcdcde9c9269` (`feat(db): add atomic idempotent order RPC`): migration 025 and `tests/atomicOrderPg.integration.test.ts`.
- Pushed `f418f466ada2ccdd8c1a7ef084e8bf38e8dac105` (`feat(orders): route creation through atomic RPC`): API/service integration, public/admin/sale call sites, and focused tests.
- Remote SHA was verified equal to local HEAD after each push. No force-push, reset, checkout, deployment, or live-database mutation occurred.

### Disposable PostgreSQL evidence

- PostgreSQL 18.6 x86_64-windows, new local-only cluster on `127.0.0.1:55434`; no real data or production/staging credentials.
- Supabase compatibility stubs and migrations 001–012 were applied in repository order. Migration 025 applied successfully. Migrations 023/024 were then applied only for payment regression coverage.
- Migration 025 is **VERIFIED IN AN ISOLATED DATABASE**, not staging or production.
- Atomic-order PostgreSQL suite: **14/14 pass, 0 skip**. It verifies valid creation, sequential/concurrent replay, hash conflict, lost-response recovery across processes, stock/voucher contention, rollback on item/history/audit failures, server pricing, and fail-closed combos with persisted row/counter assertions.
- Payment PostgreSQL suite: **11/11 pass, 0 skip**. Cancellation/voucher-release application regression: **9/9 pass** (mock evidence only).

### Integrated request path

- The API derives member/guest scope on the server, computes the canonical hash, requires a UUID attempt key, invokes `create_order_atomic`, maps hash conflicts to HTTP 409, and returns the committed database identity.
- Attempt keys survive ambiguous network failures and are cleared only after a committed response. Local cache/inventory effects now occur after server creation and adopt the server ID/code/amount.
- Committed call sites: public checkout, admin create, and sale create.

### Verification and blockers

- Focused application tests: **38/38 pass**. TypeScript: **PASS**.
- Full suite with the real PostgreSQL URL: **246/255 pass, 9 fail, 0 skip**. One older loader cannot resolve the new alias; eight voucher tests still target the retired multi-write flow without a UUID key. They were not deleted or skipped.
- Production build: **BLOCKED**. The first run could not write `.next/trace`; the approved retry reached Next.js 16.3.5/Turbopack but rejected the worktree's out-of-root `node_modules` symlink. An isolated build has not yet been rerun.
- POS is still a pushed-branch blocker. Its dirty working-tree version awaits the server result, but those hunks depend on pre-existing uncommitted payment work and were not mixed into the Decision 3 checkpoint. The pushed POS page can advance UI using a temporary client identity before the server result is known.
- `createOrderServerLegacy` is unreachable from the API but remains in source for the old mock-test baseline. It and the obsolete compensation tests must be removed/converted.
- Staging/production migration history for 023/024/025 remains unknown. No staging or production database was queried or changed.

**Conclusion: `NO-GO — CODE BLOCKERS`.** Database atomicity, concurrency, rollback, and replay are proven locally, but POS integration, legacy code/tests, full-suite failures, and the isolated build rerun remain open. This is not production-ready or `READY FOR STAGING VALIDATION`.
