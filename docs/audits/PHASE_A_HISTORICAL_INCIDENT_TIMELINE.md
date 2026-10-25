# Phase A — Historical Incident Timeline

Generated: **2026-10-16**. Read-only audit: no Production writes, migrations, or deploys.
Sources: Git log of `main@1c51af6` / `origin/main@0b7825e`, prior sessions' repo audit
(`docs/audits/PRODUCTION_READ_ONLY_FORENSIC_AUDIT.md`, `PRODUCTION_REMEDIATION_PLAN.md`,
`PRODUCTION_GO_LIVE_STATUS.md`), and fresh read-only Production survey outputs in
`.tmp/prod-fp/out/` (d01–d20, e01–e09, f01–f10). All data citations below are aggregate
counts only; no PII (names, phones, emails), no order codes, no keys or tokens.

Verdict codes: CONFIRMED = directly observed. PROBABLE = strong multi-source chain.
LIKELY = consistent but not directly proven. UNKNOWN = open.

## 1. Code-era timeline (Git, CONFIRMED unless noted)

| When (UTC+7) | Commit / ref | What changed | Why it matters |
|---|---|---|---|
| 2026-10-07 20:53 | `518c39a` | "Phase 1–5 security remediation". Order writer inserts `voucher_discount` but does NOT persist `voucher_id`. Checkout performs two POST passes (create order, then payment record via separate transaction). | Root behavior for deployed era: discount applied without voucher link; multi-transaction payments. Matches Production fingerprint (d06: 3 discount-no-voucher orders; d05: 34 paid orders, 0 payment rows). |
| 2026-10-08 | `6198076` | Payment route schema fix (`payment_proof` error); INP optimization. | Payment flow already fragile in this era. |
| 2026-10-08 | `db2c36f` | Checkout item deletion, quick-add, referral integrity fixes. | Checkout flow still pre-idempotency. |
| 2026-10-09 02:08 | `9fdfc70` | Admin CRUD + payment controls. | — |
| 2026-10-09 21:45–21:53 | `2e20f73`, `2701d20`, `05faf37`, `27b1755`, `1c51af6` | Shared pricing helper; server-first voucher mutations; **CAS voucher reservation in createOrder**; **release voucher slot on cancel**. `main` tip = `1c51af6`. | Correct voucher slotting implemented locally but the deployed build evidently never included it (no `voucher_id` on any order rows, voucher counters only via legacy path). |
| (merge window; local main is 15 behind) | `origin/main@0b7825e` | 15 commits validated ahead (incl. `e2abe90` 2026-10-14 20:59 "remove unused legacy order creation path", payments `apply_payment_event` writer, migration 029 reject RPC, combo persistence, migrations 013–026 committed). | origin/main carries the fixes; Production never picked them up (see §2). |

## 2. Production-era timeline (read-only survey, dates UTC)

| When | Evidence | Finding | Verdict |
|---|---|---|---|
| 2026-10-06 14:26 → 2026-10-16 16:51 | d18 | 63 orders created; steady daily traffic incl. paid/pending flows. All order codes `GM-######` (f10). | CONFIRMED |
| 2026-10-06 → 2026-10-07 | e05 / e03 | Test-flavored orders: item name "ABC", total 1,111 (7 rows); 4 receiver-name test signals (d15); duplicate pairs within seconds on 10-07 18:22–18:23 (3 pairs, amounts 1,111). | CONFIRMED (test data) |
| From 2026-10-10 09:44/09:46 | e09 / d07 | First two vouchers created: `GIEOMO200` (10%, min 200,000, active) and `CAMONBAN` (5%, min 89,000, inactive). | CONFIRMED |
| 2026-10-11 16:18 / 2026-10-12 14:10 / 2026-10-13 13:46 | e01/e02 | 3 orders with discount>0 and `voucher_id=NULL`: ratios exactly 5.00% (subtotal ≥ CAMONBAN min) and 10.00% ×2 (subtotal ≥ GIEOMO200 min). Counter `times_used` = 1 and 2 → exact match with order counts. | CONFIRMED mechanics; deployed writer is `518c39a`-era (discount persisted, `voucher_id` not). |
| 2026-10-11 → 2026-10-13 | e04/d02 | Paid-but-still-pending pattern present all days: 34 paid orders, of which 29 remain `pending`, 4 reached `completed`, 1 `confirmed` — payment confirmation never drives status forward (no payments rows at all). | CONFIRMED |
| 2026-10-14 → 2026-10-16 | d04 | Duplicate-pair creation continues (pairs 2–8s apart on 10-14 ×5, 10-15 ×3, 10-16 ×1 — e03). No idempotency keys/ledger rows (d11: ledger 0, all 63 orders keyless). | CONFIRMED — deployed writer never gained the idempotency/CAS code. |
| ongoing (all days) | d03 | All 130 order_items have NULL `product_id`/`variant_id`/`combo_id` (snapshot-only writer), every single day — no day with non-null IDs. | CONFIRMED |
| ongoing (all days) | d05/d12/d13 | 0 payments rows; 34 paid orders without payment rows; history only has `null→pending` (63 rows) and 34 paid orders lack a payment history event. | CONFIRMED |
| ongoing | d15 | `orders_by_source`: member_referral 51, landing_page 12; 18 receivers placed multiple orders; 7 tiny-amount orders. | CONFIRMED (contamination/de-dup needs review) |
| 2026-10-16 16:51 | d18 | Last order before this audit. | CONFIRMED |

## 3. Schema-era neutrality (UNKNOWN)

- Migration ledger empty (f06 `schema_migrations_rows: 0`).
- Functions present: `create_order_atomic(p jsonb)`, `pricing_preview`, `cancel_order_atomic`, `deduct_variant_stock_atomic`, `adjust_variant_stock`, `_gieomo_pricing` (f05). Missing: `apply_payment_event`, `reject_payment_atomic`, combo persistence (`persist_combo_atomic` family), `_gieomo_read_pricing` — so migrations 023–030 have NOT been applied to Production.
- Grant evidence: `deduct_variant_stock_atomic` EXECUTE granted to `anon` and `authenticated` — a 012-era/R22-not-applied state. `Public insert` policy families (orders/order-items/payments/customers/status-history) exist — consistent with 013 applied and 022/028 NOT applied.
- `discount_type` enum includes `freeship` → migration 014 applied.
- `order_idempotency` table exists (d11 query succeeds) → migration 015 applied.
- Therefore deployed schema window ≈ migrations 013–019 applied; 022+ and 023+ absent.

## 4. Key incident chain (synthesis)

1. Production runs a preorder-`518c39a`-to-pre-`27b1755`-era build: writes orders without catalog AND without voucher_id ties, payments silently skipped or manual (0 rows), no idempotency protection.
2. The 3 discounted orders (10-11→10-13) are the only voucher usage; both counters match exactly, but the voucher→order link was never stored and can only be reconstructed by deterministic matching (see Phase D).
3. 34 paid orders are effectively un-tracked payments: no payment row, no payment history event, 33 of them no `confirmed_at`.
4. The writer gap means: any fix deployed (022+ / 023+ RPCs, admin reject, combo persistence) is INVISIBLE to the current deployed build — code/infra and data drift while traffic continues.
5. No `cancelled` orders exist in Production (d09 all-zero) — cancel/restore paths have never run there; nothing exercised `stock_supply` ledgers either.
6. Combos: all 22 `combo_items` rows are missing variant mapping; all 8 active combos lack a full mapping (f07) — they are publishable only via snapshot today, and migration 030's fail-closed contract would reject them all at deploy time unless mapping is completed first.

## 5. Unknowns (owners needed)

- Actual deployed SHA / branch on Vercel (marker mismatch between `origin/main` and Production).
- Exact timing between any two days with no data (d18 gaps at 10-08[daily `0`], 10-09 `1`).
- Identity of duplicate-pair creators (intentional retries vs artifacts) — needs owner business review with receiver context (data owner read-only screen e03).
- Whether `GIEOMO200`/`CAMONBAN` business intent is to keep min-order thresholds as in data (affects Phase D matcher determinism: `CAMONBAN` is inactive but the matching window only matters historically).
