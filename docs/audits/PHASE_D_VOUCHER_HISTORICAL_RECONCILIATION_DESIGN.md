# Phase D — Voucher Historical Reconciliation Design

Generated: **2026-10-16**. Design-only; no Production writes authorized.

## 1. State of evidence (CONFIRMED, read-only survey)

Production vouchers (d07/e09):

| Voucher | Type | Value | Min order | Times_used | Status | Window |
|---|---|---|---|---|---|---|
| `CAMONBAN` (b5d6731c-…) | percentage | 5 | 89,000 | 1 | inactive | 2026-10-10 09:46 → 2026-12-09 |
| `GIEOMO200` (8b841858-…) | percentage | 10 | 200,000 | 2 | active | 2026-10-10 09:44 → 2026-12-09 |

Orders with `discount_amount > 0` and `voucher_id IS NULL` = **3** (d06 `orders_discount_no_voucher = 3`,
e01 lists them; created 2026-10-11 16:18, 2026-10-12 14:10, 2026-10-13 13:46 — all inside both vouchers' windows; `discount_sum = 47,200`).

## 2. Deterministic matching algorithm

For each discounted-but-unlinked order O with `subtotal S` and `discount D`:

1. **Ratio match**: `ratio = D / S × 100` must equal a voucher `value` exactly (e02: 5.0000, 10.0000, 10.0000).
2. **Window match**: `O.created_at ∈ [voucher.start, voucher.end)`.
3. **Minimum match**: `S ≥ voucher.min_order` (both orders with 10% pass ≥ 200,000; the 5% order passes ≥ 89,000 but fails GIEOMO200's 200,000).
4. **Uniqueness resolution**: if exactly one voucher satisfies (1)–(3) for O → assign. If >1 voucher qualifies, DO NOT guess: flag for owner.
5. **Counter concordance test** (post-match): per voucher, `times_used` must equal the count of assigned orders with `order_status ≠ cancelled` (d19 shows 1 and 2 → exact).

Result (deterministic, no ambiguity):

| Order (created_at) | Ratio | Unique voucher | assigned | Counter holds |
|---|---|---|---|---|
| 2026-10-11 16:18 | 5% | `CAMONBAN` | MATCH_PROBABLE | 1/1 ✓ |
| 2026-10-12 14:10 | 10% | `GIEOMO200` | MATCH_PROBABLE | 2/2 ✓ |
| 2026-10-13 13:46 | 10% | `GIEOMO200` | MATCH_PROBABLE | 2/2 ✓ |

Classification is **MATCH_PROBABLE** (not CONFIRMED) because no persisted authority ties the rows;
the match is however unique, rule-fitting, and counter-consistent — the strongest evidence available
without the original deployed writer (which never wrote `voucher_id`; Phase A).

## 3. Remediation transaction (design)

```sql
-- single transaction, idempotent
BEGIN;
UPDATE orders o
SET voucher_id = m.voucher_id
FROM (VALUES
  -- order UUID, voucher UUID, matched ratio
  ('ccf3d06e-a7e8-4860-b307-f92bf7d27af8', 'b5d6731c-2ea9-4cf5-a3b6-3d1dc7984bd6', 5),
  ('5d3db8f2-1066-4186-938b-2e32a26f6ba6', '8b841858-c713-4845-93b4-92be0b381813', 10),
  ('914e5e63-d197-49bc-8788-4111df9b962b', '8b841858-c713-4845-93b4-92be0b381813', 10)
) AS m(order_id, voucher_id, pct)
WHERE o.id = m.order_id::uuid
  AND o.voucher_id IS NULL          -- idempotent re-run guard
  AND o.discount_amount > 0;
-- audit row into audit_logs (after 022-era policy env) or the reconciliation report table
COMMIT;
```

Guard rails:

- The transaction aborts if counts change unexpectedly (denominator recheck: same 3 orders).
- `times_used` is **left unchanged** (it already matches; adjusting it would corrupt the audit trail).
- Reverse plan: set `voucher_id = NULL` again on the 3 orders (single line each) — fully reversible.
- No cancel/reissue needed (`d09` cancelled_orders = 0 ⇒ no voucher-slot release debt).

## 4. Verification

| Query | Expected after fix |
|---|---|
| d06 `orders_discount_no_voucher` | 0 |
| d06 `orders_voucher_id_dangling` | 0 (stays 0) |
| d19 | counter == orders_no_cancel: CAMONBAN 1/1, GIEOMO200 2/2 |
| d20 rule-fit join | 3/3 MATCH rows with `voucher_id` present, match_class `MATCH_PROBABLE` (needs owner ack to be treated as authoritative) |

## 5. Open items

- Owner ack that CAMONBAN (inactive) was historically available on 2026-10-11 (its window covers it, but semantics of deactivation date are a business decision).
- Whether to also backfill any *freeship* usage: none exist in data (0 orders with free-ship mechanic — `shipping_fee = 0` co-occurs with self_pickup, so no evidence of freeship voucher use).
- After backfill, future voucher redemption flows through the CAS writer (`27b1755`) and migration 021's `voucher_usage` audit — include in S1 deploy checklist of Phase C.
