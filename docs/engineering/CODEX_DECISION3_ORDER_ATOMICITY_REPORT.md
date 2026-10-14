# CODEX — DECISION 3 ORDER ATOMICITY REPORT (checkpoint + continuation)

**Date:** 2026-10-14
**Worktree:** `C:\Users\MT\Workspaces\gieomo-sales-management-system-worktrees\integrated-candidate`
**Branch:** `integrated/r1-recon-p0a3-security`
**Conclusion:** `READY FOR STAGING VALIDATION` (evidence in §11; earlier checkpoint verdicts in §10 and below are superseded)

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

---

## 11. Blocker-closure continuation — 2026-10-14 (OpenCode)

### 11.1 Git state

- Start of this session: local HEAD = remote = `83665d63eaead93cdeae50fa16c404b56d4fc629`; no stash; ~65 pre-existing dirty/untracked entries from other workstreams (payment, reconciliation, PII, security, docs). None of them were staged, edited, reverted, or deleted.

| Commit | Message | Files |
|---|---|---|
| `c18f193` | fix(tests): resolve @/ path alias in orderStore voucher loader | `tests/orderStore.voucher.test.ts` |
| `e2abe90` | refactor(orders): remove unused legacy order creation path | `src/lib/services/orderService.ts` (−616) |
| `d47862e` | test(orders): rewrite voucher reservation suite against atomic RPC contract | `tests/voucherReservation.test.ts` |
| `c5cf8ff` | fix(db): freeship vouchers waive shipping inside create_order_atomic | `supabase/migrations/025_atomic_idempotent_order_creation.sql`, `tests/atomicOrderPg.integration.test.ts` |
| `39fd344` | feat(orders): POS advances only after the atomic RPC commits the order | `src/app/admin/orders/pos/page.tsx` (D3-only), `tests/orderSubmitGuards.test.ts` (new), `tests/orderStoreOrderSync.test.ts` |

- `git ls-remote origin refs/heads/integrated/r1-recon-p0a3-security` after push = `39fd3440400bd5daf249cc9c034cd3158ef138df` = local HEAD. No force push; `main`/`master` untouched.
- `src/app/admin/orders/pos/page.tsx` and `tests/orderSubmitGuards.test.ts` were staged **index-only** from hand-built blobs (`git hash-object -w --path …` + `git update-index --cacheinfo`) because their working-tree versions contain unrelated payment work. The committed POS page was verified free of `paymentConfirm` / `confirmCashPayment`; the payment version remains uncommitted. The working tree was restored byte-identical (SHA-256 checked) after the temporary swap used for verification.

### 11.2 POS — P0 closed

Committed POS checkout handler now:

- is `async`, guards re-entry (`if (isSubmitting) return;`) and releases the guard in `finally`;
- calls `await saveNewOrder(newOrder, { idempotencyFlow: "admin-pos-order" })` — a stable, POS-specific attempt key, so a timeout retry reuses the same key;
- branches on `if (!result.ok)` and renders the server's own error text in a `role="alert"` banner instead of advancing;
- adopts `result.orderId` / `result.orderCode` / `result.finalAmount` (client placeholders are used only if the server omits them) and rewrites item `order_id`/`order_item_id` to match;
- advances `setLastCompletedOrder` / the VietQR modal only after the commit, using the committed code, id and amount;
- disables both submit buttons while in flight.

HEAD cash semantics (`payment_status: paid` for cash) were kept: cash=paid synchronisation belongs to Decision 6 and its uncommitted payment workstream.

Tests added:

- `tests/orderSubmitGuards.test.ts` (new, committed as a Decision-3-only subset via index-only staging; the working tree also holds an unrelated F6/`orderUi` block from another workstream that is deliberately not committed here) — POS source invariants (server identity adoption, no advance before the failure branch, server error text surfaced), admin/sale guard patterns, and the `saveNewOrder` response.ok contract.
- `tests/orderStoreOrderSync.test.ts` — new behavioural test: an HTTP 409 (hash/conflict) and an HTTP 500 both return `ok:false`, write nothing to the local order cache, keep the attempt key, reuse the same key on retry, and surface the server message.

### 11.3 Legacy path removed

`createOrderServerLegacy` (614 lines) and its now-unused imports were deleted in `e2abe90`. `npx tsc --noEmit` exit 0 immediately afterwards.

### 11.4 Loader and voucher suites

- `tests/orderStore.voucher.test.ts`: `@/` resolver added to the loader hooks → **8/8 pass**.
- `tests/voucherReservation.test.ts`: the eight legacy multi-write tests were converted to the atomic RPC contract (FakeWorld `rpcHandler` + `rpcCalls`, `createAdminClient` that throws `"database access must not occur"` when no fake world is installed, `atomicInput()` carrying `idempotency_key`) → **18/18 pass**. T1–T6 (CAS reserve/release primitives) are unchanged and still pass; `reserveVoucherSlot` has no remaining `src` caller and is kept only because it is exported and covered by T1–T6.

### 11.5 Freeship pricing contract

- Divergence confirmed: `src/lib/pricing.ts computePricing` implements `freeship` as shipping 0 / discount 0, while the RPC fell through to the `fixed_amount` branch (`discount_value` is stored as `1` for freeship) and still charged shipping.
- Fix in migration 025 (undeployed, branch-only): a dedicated `freeship` branch sets `v_discount := 0` and `v_shipping_fee := 0`. `discount_type` is compared as `::text`, so the statement stays valid on environments whose enum does not contain `freeship`.
- No enum value was added to 025 (that would contradict the dashboard-only 013–020 policy). The PostgreSQL test adds `ALTER TYPE public.discount_type ADD VALUE IF NOT EXISTS 'freeship'` as documented test-only setup, mirroring untracked migration 014.
- `max_discount_amount` is never written by the application (`buildVoucherPayload` excludes it; the voucher route test asserts that exclusion), so the RPC's lack of a cap is theoretical only — documented, not changed.

### 11.6 PostgreSQL evidence (disposable cluster only)

- Cluster: `C:\Users\MT\AppData\Local\Temp\codex-d3-pg-20261014-1430\data`, PostgreSQL 18.6 x86_64-windows, `127.0.0.1:55434`, trust auth. Identity verified with `show data_directory` and `SELECT version()`. Migrations 001–012 + 021 + 025 (+ 023/024 from the payment workstream) were already applied; migration 025 was re-applied from the edited file with exit 0, and the live `create_order_atomic` was verified to contain the new freeship branch. No staging or production database was contacted.

| Suite | Result |
|---|---|
| `tests/atomicOrderPg.integration.test.ts` | **16/16 pass, 0 skip** (includes the 2 new freeship tests) |
| `tests/paymentCashPg.integration.test.ts` | **11/11 pass, 0 skip** |
| `tests/cancelVoucherRelease.test.ts` | **9/9 pass, 0 skip** |

Freeship assertions: order row `90000|0|0|90000` (`subtotal|shipping_fee|voucher_discount|final_amount`) — no invented monetary discount, shipping waived; an idempotent replay returns the same `order_id` and `final_amount` with stock and `times_used` unchanged; a failed freeship order leaves `0|0|0|0|0` rows, stock and `times_used` untouched. Treating `freeship` as `fixed_amount` would have produced `114999` and fails the assertion.

### 11.7 Full verification

| Command | Result |
|---|---|
| Full suite `node --test "tests/*.test.ts"` with `ATOMIC_PG_URL` set | **266 tests, 266 pass, 0 fail, 0 skipped**, exit 0 (baseline before this session: 232 tests / 9 fail / 2 skipped) |
| Committed-tree suite (detached `git worktree` at `39fd344`, junction to the shared `node_modules`, `ATOMIC_PG_URL` set) | **111 tests, 111 pass, 0 fail, 0 skipped** |
| Focused application tests | 38/38 pass |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npx eslint` (whole project) | 447 problems (262 errors, 185 warnings) — all pre-existing, from other workstreams' dirty files |
| `npx eslint` on Decision-3 files | 2 errors + 2 warnings, all pre-existing at HEAD (`orderService.ts:442,489` `row: any` / `it: any`; `voucherReservation.test.ts:485` unused vars in untouched T5). The two `as any` casts inside the new guards test were replaced with `Parameters<typeof saveNewOrder>[0]` before commit. |
| `git diff --check` and `git diff --cached --check` | clean (exit 0) |

### 11.8 Isolated build

- In-worktree `npx next build` **fails** with `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the filesystem root`. The worktree's `node_modules` is a **junction** to `C:\Users\MT\Workspaces\gieomo-sales-management-system\node_modules`, i.e. outside the Turbopack project root. This is an environment/tooling limitation, not a source failure.
- Isolated run: the worktree was copied to `%TEMP%\opencode\d3build` with a real `node_modules` directory (copy, not a link; the shared `node_modules` was not modified) and `npx next build` was run there with the default Turbopack bundler: **exit 0** — "Compiled successfully in 23.0s", TypeScript phase finished, 49/49 static pages generated, all routes present including `/admin/orders/pos`. Two `Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL` messages appear during static generation because the repository contains no `.env*` files at all; they are a credentials artifact of the isolated copy, not a build failure. No dependency or lockfile change was made.

### 11.9 Still unverified

- Migration history on **staging and production** for 013–020 (dashboard-only by policy), 021–022 (drafts), 023, 024 and 025. This cannot be established from the repository and must be confirmed as the first step of staging validation.
- ~70 working-tree entries from other workstreams remain uncommitted, including the POS payment version, `src/lib/paymentConfirm.ts`, payment hunks in `src/lib/data/orderStore.ts` and `src/app/api/orders/route.ts`, `tests/cancelVoucherRelease.test.ts`, migrations 023/024 and the F6/`orderUi` block inside `tests/orderSubmitGuards.test.ts`. They belong to those workstreams and were left untouched.

### 11.10 Verdict

**`READY FOR STAGING VALIDATION`.**

All Decision-3 code blockers are closed: order creation goes through a single atomic RPC; the POS, admin, sale and public call sites only advance after the committed server result; the legacy multi-write path is gone; the voucher suites test the atomic contract; freeship pricing now matches the application; the full suite, an isolated production build and the TypeScript check are green; and PostgreSQL atomicity, concurrency, replay, rollback and freeship-pricing evidence is real rather than mocked. The remaining unknowns are deployment-side (migration history on staging/production) and belong to staging validation, not to this code blocker closure.
