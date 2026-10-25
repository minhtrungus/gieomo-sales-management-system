# PHASE C EXECUTION SAFETY REVIEW — VALIDATION ADDENDUM

Generated: **2026-10-16**. REVIEW-ONLY. No Production writes, migrations, deploys, pushes,
merges, cancellations, refunds, backfills, or asset changes were executed. The dirty
worktree was not touched beyond these new `docs/audits/` files.

Scope: validate `PHASE_C_EXECUTION_SAFETY_REVIEW.md` (the "safety review") and its Phase
B/D/E/F/G/H references by inspecting the actual migration SQL (`supabase/migrations/020–030.sql`),
the canonical function bodies, the app writers (`src/lib/services/orderService.ts`,
`orderCreateAtomicV2.ts`, `idempotencyService.ts`, `src/app/api/orders/route.ts`,
`src/app/api/orders/payment/route.ts`, `src/app/api/webhook/sepay/route.ts`), and the
test harnesses (`tests/*.integration.test.ts`, `atomicOrderRpc.test.ts`).

---

## 1. Findings (BLOCKER / HIGH / MEDIUM / LOW)

### BLOCKER-1 — G2 app and migration ledger are shape-incompatible (mixed V015/V025 usage)

- `supabase/migrations/021_reconcile_v015_idempotency.sql` **archives** the V015 ledger
  (`order_idempotency` → `order_idempotency_v015_archive`) and installs the V025 shape
  (`scope_key`, `idempotency_key UUID`, `request_hash`, `status`, `response_json`; PK
  `(scope_key, idempotency_key)`).
- `supabase/migrations/025_atomic_idempotent_order_creation.sql:12-70` confirms the new table
  shape and rewires `create_order_atomic(jsonb)` to claim through it.
- THE APP still contains V015-shaped ledger writes: `src/lib/services/idempotencyService.ts`
  (claim inserts `items_fingerprint`, `expected_item_count`, `lease_owner`, `lease_until`,
  `needs_recon`) and its consumers inside `orderService.ts`
  (`createOrderViaAtomicRpc` → `handleAtomicRpcSuccess` → `getByIdempotencyKey`, and
  `mapAtomicRpcError` → `claimIdempotency`/`failLedgerCleanly`/
  `finalizeLedgerAfterCleanup`, orderService.ts:1417-1700).
- Practical impact on the intended G2 build: the **happy path is safe**
  (`src/app/api/orders/route.ts:3` imports `createOrderServerAtomicV2` → pure RPC call with
  `idempotency_key` in the payload; server-side ledger is fully handled by the 026-final RPC),
  **but the replay/failure paths are not**: on `outcome=existing` the app calls
  `getByIdempotencyKey(idempotencyService.ts:141)` and on `B1B:ORDER_KEY_CONFLICT`
  (orderService.ts:1623+) it re-claims rows with V015 columns — these fail with
  `column does not exist` once 021+025 are applied. Checkout retries and
  key-conflict recovery would break in exactly the situations they were built for.
- The path is partially masked today because `createOrderServer` itself has **no live callers**
  (`grep` confirms zero call sites); the V2 writer is the only route entrypoint. This makes
  BLOCKER-1 latent rather than active — but it is a real defect for any future use, and the
  tests still validate against a fictional shape.

### BLOCKER-2 — Unit-mock tests encode an `order_idempotency` shape that matches NO real schema

- `tests/atomicOrderRpc.test.ts:98-419` asserts ledger rows with
  `status='failed_terminal'`, `error_message`, `needs_recon=true`,
  `reconciliation_required` — combinations that violate BOTH the V015 CHECK
  (`status ∈ {in_progress, completed}`) and the 021's `status ∈ {in_progress, completed}` V025 CHECK.
- These mocks pass, giving green unit evidence for semantics that the canonical SQL would
  reject. Only the PG integration tests (`tests/atomicOrderPg.integration.test.ts`,
  `paymentIdempotencyPg`, etc.) — which passed 49/49 against a real 021+025 replay
  (PHASE_G) — are trustworthy as schema-conformance evidence.
- Owner-facing meaning: the "543 pass" unit gate (PHASE_G §2) overstates ledger-path
  coverage; it does NOT validate the V025 contract.

### BLOCKER-3 — Keyless admin/POS orders in the V2 app still bypass the atomic writer

- `src/lib/services/orderService.ts:439-446` (`resolveOrderWriterMode`,
  `GIEOMO_ORDER_WRITER=legacy|rpc`) plus comments at 439-442 ("Đơn admin/POS không key luôn
  đi legacy") and the branch at 719: when a keyless request reaches the legacy branch, the
  writer performs direct PostgREST INSERTs to `customers/orders/order_items/payments/…` —
  the exact privileges that migrations 022/028 revoke.
- Note `orderStore.ts:296` claim that stock deduction happens only on the server via
  `createOrderServer()` refers to this legacy branch; combined with BLOCKER-3 the «app flag»
  is not a complete RPC-only gate today.
- Consequence: applying 022/028 while *any* legacy-branch code path is reachable breaks
  order creation with `permission denied` (revoked) or silently policy-filtered writes.
  This is exactly the "old-writer incompatibility" window.

### HIGH-1 — 021 is a contract (destructive) migration, not "additive"; the safety review's Step-1 bundle is unsafe as written

- `021` renames live RPC functions (`create_order_atomic` → `create_order_atomic_v016_legacy`,
  `cancel_order_atomic(UUID,TEXT,TEXT,UUID)` → `_v017_legacy`) and REVOKEs ALL EXECUTE
  (including service_role — orderService.ts users included), archives the ledger table, and
  fails closed unless exact post-020/V015 prerequisites hold
  (021 lines 18-55: ledger key type, 6 V015 columns, pkey/indexes, `uq_orders_idempotency_key`,
  both legacy RPC signatures present; lines 57-60: fails if V025 objects already exist).
- Therefore the addendum's earlier claim "apply 020→023 early as additive" is **WRONG for
  021** and partially wrong for 022 (contract). The dependency-correct grouping is in §3.

### HIGH-2 — Fail-closed cross-migration prerequisites force a partial order (not the file-number order)

- `027` lines 44-56 REQUIRE, at apply time: `deduct_variant_stock_atomic(uuid,int)`,
  `adjust_variant_stock(...)`, `apply_payment_event(jsonb)` (**023/024**),
  `create_order_atomic(jsonb)` (**026's rewritten one**, not 016/025's),
  `cancel_order_atomic(jsonb)` (**026**) — so 027 must follow 023→024→026 and will ABORT
  otherwise.
- `024` requires `apply_payment_event(jsonb)` to exist (023) — 023→024 could otherwise be
  skipped per file name (`024_repair_payment_cash_contract.sql`, DO block lines 8-11).
- `026` RENAMES 025's `create_order_atomic` to `_v25` and recreates the name — so an app
  expecting 025's behavior alone is incoherent 025→026; they must ship together.
- `022`/`028` are a paired contract: 022 revokes DML + drops insert policies; 028 revokes
  every remaining order-domain privilege (incl. SELECT) + sequences; 028's fail-closed DO
  blocks verify the end state.
- Both fail-closed IF-blocks (022 DO block; 027/028 DO blocks) abort the whole migration on
  drift — good, and they double as post-apply invariants.

### HIGH-3 — The "baseline ledger row with delta=0" mechanism does not exist

- `020`'s `adjust_variant_stock` body explicitly raises `B2G:INVALID_ARGUMENTS` for
  `p_delta = 0` (020 §5, validation block (0)). The V015-era 019 function had the same rule.
- Therefore PHASE_C §5.2 option (a) "one baseline row per variant via
  `adjust_variant_stock`, delta = current stock" would **double every stock** if fed the
  stock value itself, or be rejected at delta 0. A ledger-only, stock-neutral baseline row
  requires either:
  1. a NEW migration inserting baseline rows directly into `inventory_adjustments`
     (`delta=0`, `stock_before=stock_after=current`, unique idempotency keys, reason
     `baseline_owner_declared`, actor = owner) — the TABLE has no `delta<>0` CHECK
     (019/020 constraints), so raw SQL CAN write it, but the canonical function cannot; or
  2. physical count adjustments (delta = count − current) which intentionally change stock.
- Until one of these is written and rehearsed as SQL, the baseline step is PLANNED/BLOCKED,
  not executable. (This finding also corrects the interpretation that the ledger opens
  "automatically" on first real adjustment.)

### HIGH-4 — Payment "insert is reversible" needs narrowing

- A future `payments` INSERT via `apply_payment_event` is same-tx atomic with
  `payment_events`, order `payment_status`, and `order_status_history` writes (023:187-539,
  024 rewrite; rejection path 029:1-87 similarly atomic). A compensating DELETE of just the
  `payments` row would orphan state the mitigating transaction had already changed
  (payment_status/'history' rows), and `uq_payments_one_paid_per_order` +
  (`order_id`,`transaction_code`) uniqueness make replay non-idempotent for a rolled-back
  mutation. So: within-batch compensating transactions ONLY where every side effect is
  enumerated and reverted together; otherwise **restore from backup is the recovery path**.
- The voucher backfill's "reversible" claim stands (single-column UPDATE on `orders.voucher_id`
  — `PHASE_D §3`; verified FK exists; no dependent state).

### MEDIUM-1 — Legacy-era direct-UPDATE stock deductions are definitively code-attributable but ledger-attributable NEVER

- `git show e2abe90` (removed legacy path) shows direct conditional UPDATEs on
  `product_variants.stock`/`products.stock` with `Math.max(0, stock-qty)` and parent
  synchronization. `deduct_variant_stock_atomic` only appears in the current
  `orderService.ts:252-265` (rpc path) and in 012/019-era grants.
- d10 pre-baseline meaning, made precise: with 0 adjustments rows,
  `stock_vs_last_adjustment_mismatch` is trivially 0 (no rows to compare), `stock_sum=175`,
  `stock_zero=80`, `stock_negative=0` tell us current values only. Nothing about which
  orders consumed, the pre-orders baseline, or reversals is knowable from DB state; that
  remains UNKNOWABLE without contemporaneous external records (bank/webhook logs are absent —
  f06 `payments_range: null`). This invariant framing must be stated in the baseline decision
  the owner signs.

### MEDIUM-2 — Payment-event classification set is rich; `amount >= final_amount` rule in PHASE_C S2 is not aligned with the canonical contract

- `023` `payment_events.classification` ∈ {unmatched_reference, unmatched_order, underpaid,
  matched, overpaid, paid_order_additional_transfer, cancelled_order_payment,
  completed_order_payment, duplicate_delivery, admin_confirm} (023:38-49).
- Canonical mapping identity for runtime events: exact `transaction_code`
  (idempotency identity), explicit `order_code` inside the event payload (mandatory, raises
  otherwise, 023:218-222), amount vs `orders.final_amount` → underpaid/overpaid branches,
  cash contract requires `source=admin AND payment_method=cod AND
  transaction_code='CASH-<order_code>'` (023:232-236), duplicate transaction →
  `duplicate` outcome with ZERO side effects (023:280-310).
- Consequences for the Phase C S2-class backfill design (not a charge, but a classification):
  1. `amount ≥ final_amount` alone would mark an order paid even when the provider event is
     for a different or duplicate transaction. The minimum evidence to map ONE provider
     transaction to ONE order remains: (i) unique provider transaction reference not already
     present in `payments/payment_events`; (ii) `order_code` explicitly present in the
     event's content (the canonical matching key — 023/024 resolve by `order_code`); (iii)
     amount equality with `final_amount` (under/over paid cases are separate classes, never
     auto-`paid`); (iv) direction/detype (in-coming) and provider identity, both persisted.
  2. Backfill rows should reuse the SAME contracts (transaction_code requirement,
     `uq_payments_order_transaction_code`, one-paid-per-order partial unique, `admin_confirm`
     classification in payment_events + `source=admin` + `admin_member_id` present) — not a free-form
     insert; misses here create duplicate/replay ambiguities that cannot be undone cleanly.
  3. Reruns idempotency: a replayed provider event returns `outcome=duplicate` with
     `needs_review` only in ambiguous cases and performs zero additional writes — reruns of
     the same event are safe at the SQL layer; the DRY-RUN script must assert the same before
     any backfill.

### MEDIUM-3 — 020's header mandates applying via SQL Editor, contradicting batch flow

- `020_ledger_delete_policy.sql` header states "KHÔNG áp dụng trong batch — apply qua Supabase
  SQL Editor sau khi user review" plus an explicit RESTRICT-rollback caveat that becomes
  impossible once `variant_id` rows are NULL-able. Process friction the owner must resolve
  (batch apply vs editor apply); not a technical blocker.
- Also `supabase/migrations/proposals/` exists but is NOT canon. Any "rehearsal must include
  proposals" is out of scope; keep proposals out of the apply set until formally adopted.

### LOW — misc

- 027's ALTER DEFAULT PRIVILEGES also revokes FUNCTIONS from anon/authenticated — future
  function grants must be explicit (fine for G2; note for owners around any new RPC).
- `payment_events` retains a read grant to `service_role` only (023:68-69); no anon access —
  good.
- `029` reject path validates admin membership and refuses already-failed transitions
  (idempotent-ish; returns explicit invalid_action error rather than silently no-op) —
  PHASE_G's paymentRejectionPg tests cover idempotency — OK.

## 2. Required checks: completed vs unverified

| Check | Status | Basis |
|---|---|---|
| Migration-by-migration classification of 020–030 | COMPLETED | Read every file 020–030 in full (020-027) / statement-level skim of 023,024,025,028,029,030 + targeted reads |
| Cross-migration fail-closed prerequisites | COMPLETED | 021:18-60, 024:8-11, 026 rename pattern, 027:36-56, 028 DO blocks |
| Ledger shape compatibility (app vs 021/025) | COMPLETED | `idempotencyService.ts` vs 021/025 SQL; call sites (`orders/route.ts` V2-only; `orderService` legacy paths have no live callers) |
| adjust/baseline feasibility | COMPLETED | 020 function body: `p_delta = 0` rejected; ledger table lacks delta CHECK |
| Payment contract/idempotency/atomicity | COMPLETED | 023/024 bodies + 029 body + webhook route and admin payment route PG-call sites |
| Cutover/flag mechanics for old writers | COMPLETED (code-level) | `GIEOMO_ORDER_WRITER` env is read per-request process-env (orderService.ts:445-446) — flag flip requires **redeploy**, not runtime toggle; in-flight requests complete old-style; drain requires old instances stopping |
| Inventory baseline correctness | COMPLETED (analysis) | see HIGH-3/MEDIUM-1 |
| **Staging rehearsal (or any rehearsal with a restored Production-shaped DB)** | **NOT-RUN / NOT-PRESENT** | No staging artifact, no restored backup, no rehearsal results. The Sept. kann Supabase preview environment existence is not evidence. |
| Production apply-state fingerprint | PARTIAL | catalog introspection only (f06/f05/policies); 013–019 confirmed-by-signatures, 020/021 confirmed by enum (`discount_type` incl `freeship`  ← that's 014) — **021/022/023/024/025/026/027/028/029/030 confirmed ABSENT by catalog** (missing functions/tables/revokes), but the exact boundary 019 vs 020 remains inferred (not decisive: no delta CHECK to discriminate) |
| Backup/restore | **BLOCKED** | unchanged — G1 still required before any window |

## 3. Corrected dependency-aware execution order (replaces the Step-1 bundle)

Expansion (app-independent, safe while the OLD app serves traffic — the old writer uses only
direct anon inserts + anon variant SELECT/UPDATE, unaffected by EXPAND):

```
EXPAND batch = apply in this exact order:
  020 (ledger snapshot; requires 019 shape)
  021 (archive V015 ledger + rename legacy RPCs; REQUIRES exact post-020/V015 state)
  023 (payment_events + apply_payment_event + payments uniqueness)
  024 (rewrite apply_payment_event cash contract; requires 023)
  025 (new ledger + create_order_atomic; requires 021; harmless no-op paths)
  026 (cancel_order_atomic(jsonb) + reservations + re-create create_order_atomic; supersedes 025)
  029 (reject_payment_atomic)
  030 (save_combo_atomic)
Contract phase — write-freeze + cutover, then:
  deploy G2 app (RPC writers only; requires the full EXPAND set present)
  canary-verify NEW writer (one test order end-to-end in staging/pre-prod)
  022 (revoke runtime DML + drop insert policies; fails closed if privileges remain)
  027 (revoke SELECT + RPC EXECUTE + defaults; REQUIRES 023/024/026 applied)
  028 (least-priv finalize; paired with 022)
```

Forbidden: applying 021 when V025 objects already exist (021 fails — good), applying 027
before 023/024/026 (fails — good), applying 022 before the new writer is live (breaks the
old writer with no replacement), mark-as-applied bypasses of any step (forbidden by policy).

## 4. Missing evidence / owner decisions

1. A real restorable backup + isolated restore rehearsal artifact (G1) — does NOT exist.
2. G2 app fix for BLOCKER-1/2/3 (V015 lease/claim machinery removal or conversion; mock
   shape correction; keyless admin/POS gap policy) — code changes required; tests must be
   re-run and PG-integration suite re-greened.
3. A PII-masked provider evidence pack for the 34 paid orders (bank/provider statements,
   webhook era logs) and per-order CAN/CLASS decisions — not collected.
4. Owner decisions: baseline-stock mechanism choice (HIGH-3 options 1 vs 2); window date;
   maintenance-window freeze duration; who the DB-approver is that signs the EXPAND batch.
5. A restored Production-shaped DB for rehearsal (restored backup or a row-faithful clone);
   the clean-chain replay alone must continue to be treated as code evidence only (F7).
6. Explicit decision on whether admin/POS keyless orders are (i) blocked upstream (UI forces
   a key) or (ii) given a new sub-flow writing keys — before 022/028 can run.

## 5. Verdict

**REVIEW ONLY — not ready for staging rehearsal.** The corrected dependency graph (§3) is
the first version of the plan whose every step can terminate in a defined state on a
Production-shaped clone, but three BLOCKERs (mixed ledger machinery in the app; mock-test
shape drift; keyless legacy order path) plus the absent G1 evidence stand between the
current state and a meaningful rehearsal. The prior audit's hard gates (G1–G6) remain
prerequisites; no Production operations were performed and none may start until G1 is
evidenced.
