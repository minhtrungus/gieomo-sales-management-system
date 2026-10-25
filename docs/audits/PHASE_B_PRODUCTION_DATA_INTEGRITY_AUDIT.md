# Phase B — Production Data Integrity Audit (Read-Only)

Generated: **2026-10-16**. Supersedes the issue register in `PRODUCTION_READ_ONLY_FORENSIC_AUDIT.md` where numbers changed.
Evidence: fresh read-only survey via `supabase db query --linked -f` per statement;
outputs persisted in `.tmp/prod-fp/out/` (d01–d20, e01–e09, f01–f10). No PII, no secrets.

## 1. Population snapshot (d01/d03/d10/f04/f06/f09)

| Metric | Value | Note |
|---|---|---|
| orders / order_items / payments | 63 / 130 / **0** | payments table fully empty |
| order_status_history rows | 63 | all transitions `null → pending` |
| customers / members | 41 / 5 | members: 3 admin, 2 btc_sale; all hashed; none linked to auth user |
| products / variants / combos / combo_items | 4 / 103 / 8 / 22 | |
| vouchers | 2 | GIEOMO200 active, CAMONBAN inactive |
| inventory_adjustments / audit_logs / order_idempotency | 0 / 0 / 0 | ledger thin |
| schema_migrations ledger rows | **0** | no migration tracking |
| enums | all canonical (order_status/payment_status/discount_type incl. freeship) | no stray values |

## 2. Issue register

| ID | Severity | Status | Evidence | Finding | Recommended resolution path |
|---|---|---|---|---|---|
| P0-01 | P0 | OPEN | d05, d07, d13, e04, e07 | **Order/payment split state**: 34 orders `payment_status=paid`, 0 payments rows, no payment `confirmed_at` in 33/34, no payment history event. Both `payments` and pipelines can never be reconciled from data alone. | Phase C design R1 — backfill payment records from orders (require approval; treat `final_amount` as authoritative or review per-order); then deploy 023 `apply_payment_event` and re-point writers. |
| P0-02 | P0 | OPEN | d03, d04 | **All 130 order_items have NULL product/variant/combo IDs** (all days, incl. 2026-10-16). Currently orders are only buyable if a human re-derives the product via SKU/name; anything that keys off item catalog references (real-time stock deduction, inventory retry flows) silently degrades. | Two-step: (a) Phase C design — map items to catalog via name+sku deterministic matcher (name unique per item family; 15 distinct names, but 3 missing sku). (b) Deployed writer must include IDs (dirty-tree orderService already does — needs shipping). |
| P0-03 | P0 | OPEN | d01, d18 | **No idempotency ledger use at all**: all 63 orders keyless, ledger empty, but duplicate-pair production exists (P1-01). | Deploy migration 021+25 order idempotency + `create_order_atomic` RPC path; cannot repair the ledger retroactively except for flagged candidate pairs. |
| P1-01 | P1 | OPEN | e03, d16 | **16 duplicate-candidate pairs** (same receiver + same amount, gaps 2–8s; one cohort on 10-07 test-day; four pairs in 10-14 14:17–15:22 window). No duplicate order codes (f10); no key to disambiguate automatically. | Owner business review with receiver data (private screen), then cancel one of each via `cancel_order_atomic` after 026 deploy. |
| P1-02 | P1 | OPEN | d15 | **Test data in Production**: 4 receiver-name "test" signals; 7 tiny-amount (1,111) orders; 11 items named "ABC". | Quarantine/cancel those orders after owner confirmation; block test receivers at API level. |
| P1-03 | P1 | OPEN | e01/e02/d07/d19 | **Voucher usage without voucher_id** on 3 discounted orders (unique ratio match: 1×5% CAMONBAN, 2×10% GIEOMO200; counters times_used 1/2 == orders). | Phase D — deterministic backfill of `voucher_id` (reversible; owner-approved), then rely on 27b1755 code for future orders. |
| P1-04 | P1 | OPEN | f05 | **Legacy EXECUTE grants on stock RPCs**: `deduct_variant_stock_atomic` callable by `anon`+`authenticated` (012-era grants; 022/028 not applied). Direct oversell exposure. | Deploy migrations 022 (revoke runtime DML/RPC) and 028 (least privilege) — both already reviewed. |
| P1-05 | P1 | OPEN | f07 | **All 8 active combos have zero variant mapping** (22/22 combo_items missing variant); migration 030 would reject/fail them at deploy. | Catalog task: map variants for all combos; otherwise combos cannot be safely deployed with 030 semantics. |
| P1-06 | P1 | OPEN | d09, d10, d17 | **Inventory ledger empty**, stock baseline only implicit: 103 variants, 80 at zero, sum 175. No ledger rows even though the deployed deduct RPC writes verified rows — indicates no in-app stock deductions have ever happened (or writer not exercised). | Seed baseline adjustments via `adjust_variant_stock` (019) once catalog mapping P0-02 lands; verify sum-consistency via d10/d17. |
| P2-01 | P2 | OPEN | e04, d02 | **Paid-but-stuck-pending**: 29 paid orders still `order_status=pending`; only 1 confirmed, 4 completed. Status pipeline is stalled by the missing payment layer. | After P0-01, run a status-reconciliation pass (order_status → confirmed/completed per payment state) — requires new RPC or curated manual run. |
| P2-02 | P2 | OPEN | f08 | **Delivery mix**: 9 home_delivery, 54 self_pickup, no pickup_point usage despite pickup point configured. | Business review (not blocking). |
| P2-03 | P2 | OPEN | e08 | **Seller distribution skew**: 5 admin sellers hold 4/6/12/12/16 of 63 orders. | Operational review. |
| P2-04 | P2 | OPEN | d06 | Money checks clean: 0 subtotal mismatches, 0 final mismatches, 0 dangling voucher_id, 0 voucher without discount. | Monitoring only. |
| P3-01 | P3 | OPEN | f09 | All 5 members have password hashes, none are auth users (standalone account system). | Migration plan eventually needed; not blocking. |

## 3. Duplicates: quantitative breakdown (e03)

- 3 pairs on 2026-10-07 (test-day cohort, amounts 1,111).
- 1 pair 2026-10-10, 5 pairs 2026-10-12, 2 pairs 2026-10-13, 5 pairs 2026-10-14, 3 pairs 2026-10-15, 1 pair 2026-10-16.
- Gap range 2.0–7.3s for most; two wider pairs at 43.7s and 34.9s.
- Amounts cluster at 18,000 / 85,000 / 95,000 / 100,000 / 129,000 / 190,000 — real-priced items, not test values.

## 4. Verification suite (must run after the fix batch)

Re-run and expect (target values):

| Query | Expected after remediation |
|---|---|
| d05 | paid_orders_no_payment = 0 |
| d03 | any_id_present_rowcount = total items |
| d11 | orders_without_key + ledger coverage = new-order count; old orders remain legitimately keyless (historical) |
| d19 | counter == orders_no_cancel for every voucher |
| d09 | cancelled orders all have stock_restored_at when non-zero d10 rows exist |
| d17 | non-empty and consistent vs stock |

## 5. Constraints

- Population small (63 orders) → single-pass remediation is feasible in one maintenance window.
- Important historical rows should never be DELETED; prefer cancel/backfill/annotate.
- No `order_idempotency` rows exist → unique-key collision risk at deploy time is nil.
- For the 63 historical orders, idempotency remains `orders_without_key=63` (d11): they must be excluded from key-based matching iff they pre-date the idempotency looking glass.

Severity ladder: P0 data integrity gap that blocks any future arbiter (payments/stock/ledger) reconciliation;
P1 real business-flow defect needing a bounded fix batch; P2 operational anomaly; P3 advisory.
