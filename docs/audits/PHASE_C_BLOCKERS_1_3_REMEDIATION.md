# Phase C — Blockers 1-3 Remediation (Batch)

Date of work: 2026-10-17
Scope: review + code + tests only. No Production/Supabase remote connection, no Deployment, no migration file changes. Canonical migrations 020-030 untouched (canonical migration set byte-identical, replay-equivalent — see evidence below).
Precondition: this batch implements the three application-layer blockers assigned in
`docs/audits/PHASE_C_EXECUTION_SAFETY_REVIEW.md` (Addendum, BLOCKER-1/2/3) so no
reachable order-creation path can hit V015-only schema shape or fall back to
legacy multi-step PostgREST writes.

---

## 1. Blocks and root causes

| Blocker | Root cause (before this batch) |
|---|---|
| B1 — App reachable dependencies on the V015 idempotency ledger | `orderService.createOrderViaAtomicRpc` (new golden RPC = `create_order_atomic` from 025 contract) wrote/claimed/re-tested `order_idempotency` in the V015 keyshape (`scope_key, idempotency_key, request_hash, status ∈ {in_progress, completed}, order_id, response_json`). route.ts POST uses `createOrderServerAtomicV2` only, but reservation + 'existing' outcome rechecking logic was preserved in `orderService.ts` (exports created with `createOrderServer`/`resolveOrderWriterMode`/`GIEOMO_ORDER_WRITER=legacy|rpc` reachable through another path but idle/dead code). Every reconstruction would collide the phantom V015 ledger shape against V025 (migration 021 had archived + renamed legacy RPC, revoked EXECUTE). |
| B2 — Unit tests holding V015-impossible scoreboard shape | `tests/atomicOrderRpc.test.ts` mocked values the V025 CHECK constraint makes impossible (`status='failed_terminal'`, `status='reconciliation_required'`, `error_message`, `items_fingerprint` self-mocked rather than created by SQL — as the golden contract builds exactly those fields), `lease_owner` in V2 exists server-side. The contract's `outcome:'created'` (all writes by RPC; no returned `existing` outcome; idempotency key is server-trusted, replayed flag returned directly) was not represented. |
| B3 — keyless path still reached legacy direct-write fallback | `resolveOrderWriterMode()` (env switch, process-env) downgraded keyless admin/POS creation into the legacy multi-step body inside `createOrderServer` (deduct via `deduct_variant_stock_atomic` RPC + direct `orders` insert; usable on DBs with 022/023-027 not applied but dangerous on 022/027 applied DBs). |

## 2. Changes

### Created by deletion (canonical single-writer model)
- `src/lib/services/orderService.ts` reduced to the blocked-READ module that is actually exported & needed by routes/admin: mask helpers + `getOrdersServer` (unchanged behavior, bytes regenerated in UTF-8 no-BOM). Deleted from the module (all provably dead — src-level only consumer was the route which imports only `getOrdersServer`; grep-verified):
  - Entire `createOrderServer` body (legacy multi-step writer)
  - `createOrderViaAtomicRpc`, `handleAtomicRpcSuccess`, `mapAtomicRpcError`, `failLedgerCleanly`, `finalizeLedgerAfterCleanup`, `handleExistingIdempotency`, `replayVerifyOrder` + fingerprint helpers (V015 ledger claim/report/recon/verification machinery)
  - `resolveOrderWriterMode` + `GIEOMO_ORDER_WRITER` escape hatch (keyless fallback mechanism / BLOCKER-3)
  - `reserveVoucherSlot`, `releaseVoucherSlot`, `createVoucherCasOps`, `deductVariantStockAtomic`, `rollbackDeductedStock` and their types (only reachable from the deleted creation flows; DB-level equivalents are now owned by `create_order_atomic`/`cancel_order_atomic`/`apply_payment_event` SQL functions and covered by PG integration tests).
- `src/lib/services/idempotencyService.ts` DELETED (V015-only claim/lease/finalize service; zero remaining src references).

Single creation pipeline that remains:
`POST /api/orders` → `createOrderServerAtomicV2` (`src/lib/services/orderCreateAtomicV2.ts`)
→ `supabase.rpc("create_order_atomic", { p })` (migration 025; 021 revoked the V015-era variants).
Keyless/malformed key → `failed_terminal` with "Khóa gửi đơn không hợp lệ." BEFORE any RPC or table access (route maps to HTTP 400).

### Small canonical-writer improvement
- `orderCreateAtomicV2.rpcError` now distinguishes missing-function (`PGRST202` / `42883` / "could not find the function") and returns an explicit "cần migration 025" operator message instead of the generic D3-less mapping; no fallback, idempotency stays undefined (retryable).

### Test suites
- REWROTE `tests/atomicOrderRpc.test.ts` (13 tests, V2-C1..C13) against the only reachable writer:
  canonical payload contract (`idempotency_key`/`scope_key`/`request_hash`/`actor_member_id`,
  `guest:<sha256-64>` / `member:<uuid>` scope), created vs `replayed:true` mapping,
  malformed success strict-fail, D3 code mapping (HASH_MISMATCH→hash_mismatch,
  IN_PROGRESS→processing, business codes→failed_terminal), unknown-error fail-closed,
  PGRST202 migration message, transport-throw retryable, keyless/malformed key blocked
  pre-RPC, invalid-cart blocked, lost-response-after-commit replay convergence
  (single commit), canonical hash determinism, member scope/actor passthrough. No V015-impossible ledger mock exists in the suite; every test asserts `order_idempotency` stays empty and `protectedOps()==0` (TS never writes business tables).
- ADDED `tests/orderCanonicalWriterSource.test.ts` (5 tests): source-level regression locks
  (BLOCKER-1: no `idempotencyService`/`order_idempotency`/legacy-writer tokens remain in
  orderService; BLOCKER-3: route uses only `createOrderServerAtomicV2` and forwards header
  or body key verbatim; D3-code parity bidirectional V2-app ↔ migration 025 SQL;
  scope_key regex parity computed from 025 source against V2-generated real scope strings; fail-closed shape guard on `knownErrors` mapping).
- REPOINTED `tests/shippingFeeZero.test.ts` (2/4 tests changed): source contract moved from
  `orderService` (configService `??`-guard, gone with the writer) to the canonical SQL
  contract in 025 (`IF v_config ~ '^[0-9]+$'` preserves `flat_shipping_fee = 0`).
- FIXED `tests/paymentBypassFollowup.test.ts` CG1 to canonical surface: client
  cannot influence `order_status`/`payment_status` (canonical payload builder contains no
  such keys; SQL hardcodes `'pending', 'pending', 'not_ready'` and generates
  `GM-YYMMDD-######` from `order_code_seq`).
- EXTENDED `tests/orderRouteHttp.test.ts` (+3 BLOCKER-3 tests): keyless POST forwards
  empty key verbatim to V2; body-key without header forwards too; `failed_terminal`
  writer result maps to HTTP 400 with the writer's explicit message.
- DELETED (coverage removed with the dead code it exercised; DB-level behavior remains
  pinned by the PG integration suites, which are the actual contract witnesses):
  `tests/idempotencyService.test.ts`, `tests/orderServiceIdempotency.test.ts`,
  `tests/legacyStockAtomicDeduct.test.ts`, `tests/voucherReservation.test.ts`,
  `tests/migration016Source.test.ts`.
- `tests/helpers/fakeOrderDb.ts`: header comment updated (built-in duct emulation for the
  deleted 012-RPC legacy path left intact but unused; no test consumer depends on it).

## 3. Required-task test matrix coverage

| Required case (BLOCKER-1 addendum) | Where covered |
|---|---|
| fresh create | V2-C1 + PG suite tests (real 025 on local PG) |
| same-key same-payload replay returns identical order | V2-C2, V2-C11 + PG replay tests |
| same-key different-payload | hash parity + PG replay tests (D3:HASH_MISMATCH), source-parity test |
| concurrent same-key duplicate | returned as `D3:IN_PROGRESS`(processing) mapping (V2-C4); true concurrency via PG suite |
| RPC failure then retry | V2-C6/C7/C8 (fail-closed, key retained) + PG suite |
| lost response after commit then retry | V2-C11 (single commit + replay) |
| cleanup/invalid ledger writes ("cleanup without invalid ledger writes") | no longer applicable by construction — no TS-side ledger cleanup exists; suite asserts zero table writes from TS in every failure mode |
| keyless / malformed key blocked everywhere reachable | V2-C9 (writer), orderRouteHttp BLOCKER-3 tests (route), orderCanonicalWriterSource (no legacy fallback in source) |

## 4. Verification evidence (recorded this session)

- Node unit suite: `node --test tests/*.test.ts` → **533 tests, 478 pass, 0 fail, 55 skipped** (skips = PG suites requiring isolated PG env; unchanged policy).
- Mandatory PG suite (fresh local cluster via `scripts/postgres/replay-canonical-migrations.ps1`): **MANDATORY_PG_PASS files=9 → 49/49 pass, 0 fail, 0 skip**; **CANONICAL_REPLAY_PASS migrations=30 tip=030_atomic_combo_persistence.sql** (migrations 020-030 apply cleanly on vanilla local PG; `supabase db lint` still blocks on vanilla PG lacking `plpgsql_check` — known LOW friction, unchanged).
- `npx tsc --noEmit` → 0 errors.
- `npm run build` → SUCCESS (compiled, 48 static pages, exit 0).
- Lint: repo-wide eslint debt unchanged by this batch. Touched files measure 32 errors / 2 warnings — **all `@typescript-eslint/no-explicit-any`** (mock-rpc payload typing in test files + `getOrdersServer` row mapping), matching the pre-existing house style in the same files and repo-wide untracked test suites. `src/lib/services/orderService.ts` itself is lint-clean.

## 5. What is NOT covered / limitations

1. TS↔PG full-stack round trip (V2 mapping vs REAL `create_order_atomic` byte-response) is verified at the contract level (source parity tests pin every `D3:*` code both directions; PG integration suite pins SQL behavior), not by a live e2e call. Deployment rehearsal remains gated as before.
2. No staging/Production rehearsal, no go-live status change by itself: G1 (backup/restore capability, PITR) is still BLOCKED and the overall NO-GO decision is unchanged — this batch only removes the three application-side blockers (data-layer safety review verdicts stand).
3. The deleted 5 test files' history remains in this worktree's audit trail (`git diff`), but files were untracked worktree files, so VCS history only covers committed versions; the deleted suites exercised removed dead code exclusively.
4. `orderService.ts` was regenerated (not merely diff-trimmed): content equals the pre-batch `mask*` + `getOrdersServer` surface; no read-path behavior change intended or observed (admin orders list tests pass).

## 6. Files touched by this batch

```
src/lib/services/orderService.ts        (rewritten: read-only module)
src/lib/services/idempotencyService.ts  (deleted)
src/lib/services/orderCreateAtomicV2.ts (+migration-missing mapping in rpcError)
tests/atomicOrderRpc.test.ts            (rewritten: 13 V2 contract tests)
tests/orderCanonicalWriterSource.test.ts (new: 5 source-parity tests)
tests/orderRouteHttp.test.ts            (+3 BLOCKER-3 route tests)
tests/paymentBypassFollowup.test.ts     (CG1 → canonical 025 contract)
tests/shippingFeeZero.test.ts           (2 tests → 025 SQL contract)
tests/helpers/fakeOrderDb.ts            (stale header comment)
tests/idempotencyService.test.ts        (deleted)
tests/orderServiceIdempotency.test.ts   (deleted)
tests/legacyStockAtomicDeduct.test.ts   (deleted)
tests/voucherReservation.test.ts        (deleted)
tests/migration016Source.test.ts        (deleted)
docs/audits/PHASE_C_BLOCKERS_1_3_REMEDIATION.md  (this file)
```
