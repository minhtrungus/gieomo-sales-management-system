# Phase C — Recovery Action Plan (Design-Only)

Generated: **2026-10-16**. This document is a design; it authorizes no execution against Production.
Deterministic, minimal-risk remediation for the Phase B register, in dependency order. Each step is
code-first, testable locally against a disposable PostgreSQL fixture, and reversible.

## 0. Constraints

- Production stays read-only until the owner approves a maintenance window.
- All fixes require passing the Gate ladder (FIXED IN CODE → TESTED LOCALLY → verified in
  disposable DB → optionally staging). Evidence classes are defined in `PRODUCTION_REMEDIATION_PLAN.md`.
- Order data (rows) is never deleted. Backfills are INSERT-only or targeted UPDATEs with an audit trail.

## 1. Step plan

### S1 — Ship the runtime contract first (code, no data changes)

| Item | Detail |
|---|---|
| Goal | Make all future writes atomic, identified, and consistent before touching history. |
| Code base | Dirty workspace orderService/checkout/idempotency writer already adds catalog IDs, idempotency keys, voucher_id, `create_order_atomic` RPC use. Merge-ready behind PR. |
| Schema | Apply migrations 021, 022, 023, 024, 025, 026, 027, 028, 029, 030 in canonical order. |
| Guards | 022+028 revoke runtime DML/grants; 023 introduces `apply_payment_event`; 029 `reject_payment_atomic`; 030 combo persistence. |
| Verification | Route contract tests + disposable-DB replay of 013→030 + behavior tests (Phase G harness). |
| Rollback | Migrations are additive and revoke-based; rollback plan = redeploy previous frontend + re-grant via inverse SQL bundle (documented in 028 policy notes). |

### S2 — Payment backfill (P0-01)

1. Freeze the payments contract: choose authoritative source = `orders.final_amount` (34 paid orders; `payments` empty).
2. Generate a backfill fixture locally (export minimal columns only: order_id, amount, method, status, timestamps; PII-free at contract level).
3. Implement `scripts/db/payment-backfill.sql` as an INSERT-only transaction guarded by
   `WHERE NOT EXISTS (SELECT 1 FROM payments WHERE order_id = ...)` and wrapped by the
   018 unique-index check (one payment row per order).
4. Verify with d05/d07/d13 target values (Phase B §4). Record a `reconciliation_report` row (existing pattern in repo) inside the same transaction.
5. Approval gate: owner reviews a preview report per order before the batch runs.

### S3 — Order item catalog backfill (P0-02)

1. Build deterministic matcher: item `name` (+ optional `sku`) → unique product/variant/combo. Name inventory is stable (f02 shows 15 name strings; ambiguous collisions get flagged, not guessed).
2. Ship fixes as a single transaction ON Production acceptance; UPDATE `order_items.product_id/variant_id/combo_id` only where match confidence is UNIQUE.
3. After-match: re-run d03 → `any_id_present_rowcount == total` except the flagged·unmatched set, which must be ≤ the "ABC"/test cohort.

### S4 — Idempotency + duplicate handling (P0-03, P1-01)

1. Historical orders stay keyless (legitimate). The pool of 16 candidate pairs is reviewed by the owner in Phase B's private screen; cancellation (not deletion) goes through `cancel_order_atomic` per S1 for confirmed duplicates.
2. Going forward the S1 writer writes the ledger; the 015/021 schema is already present in Production (d11 empty) so keys will not conflict with existing rows.

### S5 — Inventory baseline seed (P1-06)

1. After S3 succeeds, seed one adjustment row per variant whose stock is integer-consistent with `products/variants` snapshot (`adjust_variant_stock`, reason `baseline_seed`, unique key per variant).
2. Verify d10 `stock_vs_last_adjustment_mismatch = 0` and d17 pairs reconcile.

### S6 — Status reconciliation (P2-01)

1. Only after S2: for each paid order still `pending`, move to `confirmed` (or `completed` if the owner confirms fulfillment), with an `order_status_history` row, through a reconciliation SQL written for the same maintenance window as S2.
2. Never auto-`completed`; the 4 rows already `completed` and 1 `confirmed` remain as-is.

### S7 — Test/contamination cleanup (P1-02)

- Cancel (not delete) the 7 tiny/1,111 orders and the 4 test-receiver orders once the owner confirms; this creates the first real `cancel_order_atomic` flow and restores stock only where a non-test buyer would matter — for these rows, stock restore off (test cohort), flagged in the batch report.

### S8 — Combos (P1-05)

- Catalog task outside DB migration scope: map all 22 `combo_items` rows to real variant IDs before 030 deploy; a failing active combo will block the atomic combo RPC only when writing that specific combo, not the order flow.

## 2. Dependency graph

```
S1 (code+schema) → S2 (payment backfill) → S6 (status reconcile)
                 → S3 (item catalog map)  → S5 (inventory seed)
                 → S4 (duplicates/cancel) → S7 (test cohort cleanup)
                 → S8 (combo mapping) → enable 030 semantics
```

## 3. Maintenance-window script skeleton (owner-approved only)

```text
[0] Frontend: deploy S1 app build FIRST, then immediately freeze writes via 028 + app-level feature flag.
[1] S2 payment backfill (single transaction; reconciliation row).
[2] S3 item catalog backfill (single transaction;-match report).
[3] S5 inventory baseline seed.
[4] S6 status reconcile + S7/S4 cancellations (separate transactions; separate cancel_order_atomic RPC per order).
[5] Unfreeze; verify Phase B §4 target suite; record evidence JSON to docs/audits/PRODUCTION_POST_REMEDIATION_EVIDENCE.md.
```

## 4. Approval checklist (must be GREEN before execution)

- [ ] Owner sign-off on payment backfill source-of-truth and pre-run preview.
- [ ] Owner sign-off on the 16 duplicate pairs + 11 test-cohort cancellations.
- [ ] Backup point taken (see Phase E — currently BLOCKED for DB-level restore; use app-export JSON as weak fallback or get Supabase PITR enabled first).
- [ ] Phase F rehearsal re-run on the exact migration set to be applied in the window.
- [ ] Rollback SQL bundle prepared and peer-reviewed.
