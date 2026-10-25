# PHASE C EXECUTION SAFETY REVIEW — Production Recovery Plan

Generated: **2026-10-16**. REVIEW-ONLY. No Production writes, migrations, deploys, refunds,
cancellations, voucher repairs, payment backfills, or inventory adjustments were executed.
This review supersedes `PHASE_C_RECOVERY_ACTION_PLAN.md` where the two disagree, and it
corrects two evidence interpretations in Phase B/F (§3.1, §5.4).

**Verdict: NO-GO / BLOCKED for any data-repair execution.** The recovery plan is now
executable-as-design only after the hard gates in §6; the next safest action is §9.

---

## 1. Findings (with references)

| # | Finding | Reference | Severity |
|---|---|---|---|
| F1 | S2's premise "final_amount is the source of truth for a payment backfill" is unsafe: `payment_status=paid` on 34 orders proves only that *someone set the flag* (manual admin UI, a lost writer, or a partially committed transaction), not that money moved. | PHASE_B register P0-01; PHASE_C S2 | BLOCKER for S2 as designed |
| F2 | The legacy Production order-creation path (removed at `e2abe90`, deployed-era `518c39a`+) deducted stock via **direct conditional PostgREST UPDATEs** (`stock >= qty` guard, `Math.max(0, stock - qty)`) on `product_variants.stock` and `products.stock` — NOT via the ledger-writing RPC. Therefore **empty `inventory_adjustments` does not mean empty stock movements** (correction to PHASE_B P1-06 / PHASE_F §2 inference). | `git show e2abe90 -- src/lib/services/orderService.ts`; d10 (80/103 variants at zero, sum 175, none negative) | HIGH — Phase C S5 as designed is UNSAFE |
| F3 | Stock movement attribution is unrecoverable: order_items carry no variant IDs (d03), no adjustments ledger exists, and no pre-orders stock baseline is recorded. Historical consumption is **plausible but unverifiable from DB evidence alone**. | d03/d10/d17; F2 | BLOCKER for S3/S5 auto-execution |
| F4 | Voucher "`times_used` currently equals candidate order count" is coincidental concordance, not proof; classification must stay MATCH_PROBABLE. Counter semantics (verified in code): CAS-increment on create, CAS-decrement on cancel — i.e., net allocated slots. | d19; commit `27b1755` + `1c51af6` (releaseVoucherSlot) | Confirms Phase D stance; forbids counter edits |
| F5 | Deployed writers write DIRECTLY to `orders/order_items/payments/customers/order_status_history` via anon PostgREST (public insert policies present). Migrations 022/027/028 revoke exactly those paths and grants. Applying them before the new app is live **breaks live checkout mid-day**. | f05; 07_policies.json; PHASE_F §3 | CRITICAL for migration ordering |
| F6 | Migration ledger is empty (f06); Production applied-state window ≈ 013–019 (+possibly 020/021) by catalog introspection only (PHASE_F §3). Any "mark-as-applied" bypass is forbidden; per-object reconciliation must drive the real apply-state map. | PHASE_F §3 | HIGH |
| F7 | No restorable backup artifact exists (earliest=0/latest=0, PITR off; no pg_dump path; 7-order JSON export is not a DB backup; clean-chain replay is not a backup). All destructive windows are therefore forbidden, including "small" ones. | PHASE_E | BLOCKER (whole program) |
| F8 | 16 duplicate pairs and 11 test-like rows are *candidates* only; timer/amount proximity has false positives by construction (e.g., 10-14 14:17/15:01/15:22 clusters could be legitimate bulk sessions). | e03/e05/d15 | Limits S4/S7 to adjudication, not cancellation |
| F9 | Dirty worktree (167 entries) is the only carrier of the fixed writers (catalog IDs, RPC, idempotency). "Deploy something" prematurely would drift the app from the tested tree. | PHASE_G/worktree state | Guards release engineering |
| F10 | `orders.final_amount` mismatches: 0 (d06). Money-sum surfaces are internally consistent — useful for classification cross-checks, but not proof of bank receipts. | d06/f01 | Supports classification, not backfill |

## 2. Unsafe assumptions removed or required to be proven

1. ~~"paid status ⇒ money received"~~ → must be proven per-order by bank/provider evidence (§4).
2. ~~"orders exist ⇒ stock was consumed"~~ → unprovable pre-baseline; handled via admin-adjudicated baseline (§5).
3. ~~"adjustments ledger empty ⇒ no deductions"~~ → refuted by F2.
4. ~~"counter matches candidates ⇒ mapping confirmed"~~ → F4; keep MATCH_PROBABLE.
5. ~~"apply migrations in canonical order top-down will succeed on Production"~~ → only guaranteed on a Production-shaped clone (§7).
6. ~~"roll back with a compensating UPDATE"~~ → for irreversible writes (backfill inserts are reversible; status-transition overwrites and mis-cancelled orders are NOT — recovery then requires a database restore; say this plainly in the batch plan).
7. "Duplicate pairs in seconds are double-POST artifacts" → plausible for the legacy path (two-POST era), but requires receiver-side confirmation.

## 3. Corrections to earlier documents

- PHASE_B P1-06 and PHASE_F §2's inference about ledger emptiness are revised by F2 (direct-UPDATE deduction). The stock_picture narrative is restated in §5.
- PHASE_F §4's upgrade order ("apply 020→030 already revokes… deployed first") is superseded by the expand/contract window in §8 — revocations must run AFTER the RPC-based app is live, not before.
- PHASE_C S2/S3/S5 are replaced by the classification/gate-based versions in §4/§5.

## 4. Payment reconciliation (replaces S2)

### 4.1 Per-order evidence classes for the 34 paid orders

| Class | Requirement (any one provider-grade source) |
|---|---|
| VERIFIED_PAID | SePay webhook event log row or provider transaction record whose amount ≥ `final_amount`, payload direction in, and reference resolves to this order; OR bank-statement row (screenshot/CSV from the payment account holder) matched for date+amount, cross-checked; OR owner-signed statement per order (explicitly approved alternative) |
| VERIFIED_UNPAID | Any of the above shows no matching transaction after a bounded lookback, OR receiver/owner attests no receipt for a specific identified order |
| CONFLICTING_EVIDENCE | Multiple references exist and disagree (amount/timeMismatch), or a webhook matches a different order's final_amount |
| NEEDS_MANUAL_REVIEW | No reference found and no attestation yet |

Rules:
- **`orders.final_amount` alone is NEVER sufficient** for VERIFIED_PAID.
- For anything not VERIFIED_PAID: **no automatic payment mutation**. Manual repair only, one
  order at a time, under owner approval.
- Dry-run first: a read-only script classifying all 34 orders, producing a PII-masked worksheet
  (order_code, date, amount, source, initials; phones/names hashed with a per-batch salt; no full PII).
- Idempotency: any future insert into `payments` must use the 018 unique index `(order_id, transaction_code)`
  and a per-batch `reconciliation_batch_id`; re-running must be a no-op (guard `WHERE NOT EXISTS`).
- Audit: every mutation writes `audit_logs` (actor, action batch, order_id, before/after JSON, rationale)
  and one `order_status_history` row when status also changes.
- Post-repair invariants (must re-run): d05 (`paid_orders_no_payment` == count still NEEDS_MANUAL_REVIEW/VERIFIED_UNPAID
  — i.e., decreases only via approved mutations); d07 (`confirm_at_present == VERIFIED_PAID count`);
  d13 (`paid_no_history_event` shrink); f01 sum-invariants hold; no order's `final_amount` changed.

### 4.2 Status reconcile (was S6)

- Only VERIFIED_PAID orders may flip `pending → confirmed` (auto after payment insert) — never auto-`completed`.
- Overwrites of `order_status` are irreversible → pre-restore of DB (Phase E gate) is mandatory before ANY batch;
  compensating transactions for status flips are NOT a valid rollback path.

## 5. Inventory and cancellation (replaces S3/S5 attributes)

### 5.1 What we can and cannot claim
- Current catalog stock values are the ONLY stock state that exists as data (103 variants, 80 zero, sum 175).
- Historical movement ledger: none. Reservations: none (product had none). Order-item snapshots: qty + name/sku only.
- Deduction mechanics per era (evidence basis): (a) ≥518c39a-era orders: plausible direct-UPDATE deduction (F2);
  (b) orders via the new RPC path (not yet deployed): ledger-recorded. (c) Test cohort ("ABC"/1,111): same mechanics,
  same ambiguity — test orders DO NOT get special stock treatment.

### 5.2 Stock baseline (replaces "seed baseline")
1. Owner-approved method required BEFORE any write. Options to present (with trade-offs):
   (a) Declare current stock canonical and open a fresh ledger by inserting one baseline row per variant via
   `adjust_variant_stock` delta = current stock with reason `baseline_owner_declared` (this does NOT change stock, only opens the book);
   (b) Owner provides physical-count adjustments; deltas applied per variant, each with an audit row.
   Option (a) is the least destructive and does not alter item availability; choose with owner.
2. Catalog mapping backfill for order_items (was S3) proceeds as PLANNED (name+sku unique matcher, transactional,
   no stock changes at all). It enables *future* verification only.
3. Stock restores attached to future cancellations: allowed ONLY when (i) the cancel path is the 026-era
   `cancel_order_atomic` and (ii) a verified prior deduction exists in the ledger (post-baseline: every post-baseline
   order deduction is ledger-recorded via the RPC path; pre-baseline orders restore stock ONLY if the owner accepts
   the baseline declares them already excluded, or orders explicit per-order deltas).

### 5.3 Test/duplicate handling
- A cancelled duplicate/test order must NOT trigger a stock restore unless a specific,
  individual deduction is demonstrated (pre-baseline: not demonstrable ⇒ no restore for these rows;
  if baseline option (a) is chosen, stock already includes their consumption and no double-restore).

## 6. Hard gates before ANY Production write

| Gate | Contents | Status |
|---|---|---|
| G1 Backup | Real restorable artifact + rehearsed restore into an isolated environment with post-restore validation (schema, data counts, functions, RLS/grants, invariants) and recorded RPO/RTO | BLOCKED (PHASE_E) |
| G2 App contract | The RPC/idempotency/least-privilege app build reviewed, built, typechecked (PHASE_G green), and deployable — dirty worktree consolidated into a clean release | BLOCKED (dirty state, owner packaging) |
| G3 Schema reconciliation map | Per-object Production-vs-canonical catalog reconciliation completed (§7) vetting partial state | NOT-RUN |
| G4 Owner approvals | Sign-offs in §8 for payment classes, voucher backfill, duplicate/test adjudication, stock baseline method | PENDING |
| G5 Write-freeze | Controlled window: app-level write freeze + verification query suite green before, during, after | PLANNED |
| G6 Dry-runs | Read-only dry-run artifacts for every planned batch (payments, item mapping, voucher, cancels, stock) reviewed by owner | PLANNED |

**No destructive window may open while G1 is BLOCKED. This includes batches of one row.**

## 7. Migration rehearsal (supersedes PHASE_F §4 ordering)

1. Build the true apply-state: reconcile Production catalog per feature (tables, columns, functions, policies, grants,
   enums, indexes) against each migration's target — inventory of "applied / partially applied / missing / incompatible".
   Forbidden: `supabase migration repair`-style marking. Empty ledger means the first real migration run must be
   bootstrap-safe (idempotent guards already present in 013+; the 001 block must tolerate existing objects — verify in rehearsal).
2. Clean-chain replay = PLANNED evidence only relative to a fresh environment; a Production upgrade result requires a
   **Production-shaped database** (restored backup). Until G1/G3, no upgrade order is recommended as final.
3. Expand/contract hazards to encode into the runbook:
   - 023/025/026/029/030 ADD functions/tables — safe to apply early (expand).
   - 022/027/028 REMOVE grants/policies/particular writes — apply ONLY after the RPC-based app is live and verified (contract).
   - 024/026 alter behavior of existing RPC signatures used by new app — apply BEFORE app deploy if the app expects them,
     and validate signatures match (`create_order_atomic(p jsonb)` unchanged is a precondition to check in rehearsal).
   - Compatibility window rule: between app deploy and revocation, both writers may run (old anon-ish, new RPC) —
     measure this window length (target minutes) and hold old writers disabled behind the app flag right at deploy,
     so no old-written rows fall outside the new contract.
4. Stop conditions: any migration error; any invariant query failing; any validator mismatch (§9 suite); checksum mismatch
   between rehearsed artifact and applied files; freeze window overrun.

## 8. Execution matrix (revised ordering)

Order and preconditions — the freeze covers ALL steps in a single window; ad hoc writes are banned.

| Step | Permitted action | Prerequisites | Evidence | Validation (must be green to continue) | Rollback / Recovery | Approval |
|---|---|---|---|---|---|---|
| 0 | Freeze writes (app flag + read-only window); snapshot counts | G1–G6 | freeze confirmation + count snapshot queries | d01/d02/d03/d05/d11 stable | unfreeze flag | Owner |
| 1 | EXPAND: apply safe-additive migrations (020→023 tables/functions; 024 signature-affecting; 025/026/029/030 RPCs) | §7 map; rehearsal on restored clone; G1 pass | per-file apply log; catalog diff | f05/f07 re-query shows new RPCs; suites pass | restore from backup is the ONLY path for schema damage (no compensating rollback) | Owner + DB-approver |
| 2 | Deploy new app (RPC writers, idempotency, catalog-ID writes) behind flag; flip traffic | Step 1; staging smoke (NOT-RUN) | deploy SHA; smoke results | new order e2e in staging; then 1–2 canary orders in Production verified (created via RPC, catalog IDs, ledger rows) | flag back to old app requires restoring revoked grants → only after old app exists; prefer forward-fix | Owner |
| 3 | CONTRACT: 022/027/028 revokes/ACL | Step 2 verified; freeze continues | grants/policy diff | f05 target-grants match; old writer paths disabled; checkout works via RPC | restore ONLY | Owner |
| 4 | Payment classification dry-run (read-only) | Step 0 | dry-run worksheet (PII-masked) | 34 orders classified; no mutations ran | n/a | Owner reviews classes |
| 5 | Payment backfill VERIFIED_PAID only, per-order audited | Step 4 + owner per-class sign-off; G1 pass | audit rows; batch id; dry-run diff | invariants in §4.1; d05 delta == approved count; payments unique index hit 0 collisions | INSERTs are reversible via reviewed compensating DELETE transaction (single batch id); anything beyond → restore | Owner |
| 6 | Catalog mapping of order_items (no stock writes) | Step 0; matcher fixture tests | per-item match table; fraud-flagged unmatched | d03 target: `any_id_present_rowcount == total − unmatched`; unmatched = flagged only | reviewed compensating UPDATE bundle (restore NULLs for the batch) | Owner |
| 7 | Owner adjudication: duplicates + test cohort (worksheet: order_code, timestamp, amount, status, item name/qty, receiver initials, phone-last3-salt-hash) | Step 0 | adjudication log (minimal PII) | cancellations executed ONLY via `cancel_order_atomic` per order | cancel is largely irreversible (stock release debatable) — pre-approved list only; wrong-cancel recovery = restore | Owner |
| 8 | Voucher backfill 3 orders (transaction, guarded `voucher_id IS NULL`, reversible by design) | §10 owner approval; dry-run | batch audit row | d06 zeroes; d19 counter equality holds | re-set NULL (reversible by design) | Owner |
| 9 | Status reconcile (VERIFIED_PAID paid-pending → confirmed only) | Step 5 | history rows + audit rows | d02/d13 targets | irreversible → restore is ONLY recovery | Owner |
| 10 | Unfreeze; re-run full verification suite; capture evidence file | all above | evidence JSON + report | all Phase B §4 targets met | n/a | Owner + approver |

## 9. Validation query suite (must run before/during/after every window)

Reuse the `.tmp/prod-fp` queries (d01–d20, e01–e09, f01–f10). Hard pass/fail set at each step:

- Before: baseline equal to published survey (drift >= any new order row ⇒ re-check freeze).
- After each mutating step: deltas must equal exactly the approved row counts; no collateral changes.
- Final: `d05 paid-no-payment == non-VERIFIED_PAID count`; `d03 all-ID'd ⇒ unmatched=flagged`;
  `d19 counter==orders_no_cancel per voucher`; `d10 stock_vs_last_adjustment_mismatch=0`;
  `audit_logs` each batch; `order_idempotency` ledger non-zero for new orders only.

## 10. Voucher reconciliation (confirming PHASE D, with review notes)

- Keep MATCH_PROBABLE for all 3 orders. Upgrade evidence would be: provider record showing the order was placed with a
  voucher code applied (checkout log/tracking event), admin note, or a contemporaneous export; none exists today.
- Do not change `times_used` (counter = net allocated slots; matches utility today; F4).
- Repair transaction stays guarded/idempotent/auditable/reversible as designed in PHASE_D §3.
- Owner must confirm business semantics at order-time from vouchers' windows (both active `CAMONBAN`/`GIEOMO200`
  overlapping the discounted orders' created_at) — otherwise classification remains MATCH_PROBABLE and the batch waits.

## 11. Duplicate & test-order adjudication (adds to §8 step 7)

Minimum-information worksheet (PII-masked): order_code pair, created_at pair (delta seconds), amount each, status pair,
payment pair, item name+qty per order, seller ID, `orders_by_source`, receiver initials, phone last-3 + batch salt hash.
Required decision per pair: canonical order (which one stays) + reason code; the other is cancelled via RPC in the same
step-7 batch. No blanket cancels for the 11 test-like rows or 16 pairs: each row is individually signed.

## 12. Backup & restore gate (restating PHASE_E requirements precisely)

Required artifact/evidence (G1): a restore-capable backup (Supabase PITR with earliest>0, OR `pg_dump` custom-format
with recorded SHA-256) + a rehearsed restore INTO an isolated environment (not the original instance), post-restore validation
covering: schema fingerprint (05_triggers/02_columns/06_functions/07_policies/08_grants parity), row counts, function behavior
smoke (create_order_atomic/cancel/adjust), RLS behavior probes, invariant queries. RPO/RTO: owner-approved numbers, else UNRESOLVED.
The 7-order JSON export and any migration replay do NOT satisfy G1.

## 13. Owner approvals required (explicit list)

1. Payment classification outputs + per-class fate decisions (accept VERIFIED_PAID backfill scope).
2. Stock baseline method choice (§5.2 option a/b), including acknowledgment that pre-baseline consumption is not attributable.
3. Duplicate-pair canonical-order decisions + test-cohort fates (row-by-row).
4. Voucher backfill going ahead at MATCH_PROBABLE, and validation that window semantics were active at order-time.
5. Maintenance window date/time, freeze, and approvals for steps 1/2/3/9 (irreversible recovery = restore).
6. Release packaging of the dirty worktree into the G2 release artifact.

---

## 14. Verdict and next safest action

**Verdict: NO-GO / BLOCKED for data-repair execution.** The Phase C plan as previously
written contained two assumptions that evidence now refutes (payments-prove-money; empty-ledger-proves-no-deduction)
and one ordering hazard (revocation migrations before app cutover). This document's matrix is the
safe execution plan, gated on G1–G6.

**Next safest action:** owner enables a restorable backup point and runs the restore rehearsal (G1),
and in parallel consolidates the dirty worktree into the G2 release artifact — both read-only from
Production, both required before anything mutates.
