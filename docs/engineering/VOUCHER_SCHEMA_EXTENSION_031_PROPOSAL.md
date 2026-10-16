# Voucher Schema Extension — Migration Proposal (031) — DRAFT, NOT APPLIED

Status: **PROPOSAL ONLY** — not a canonical migration, not applied to any database.
Author batch: integration verification (post-`815b8c0`).
Risk class: P1 (business-rule persistence gap). Current behaviour since `815b8c0`:
non-default values of the 5 fields fail closed with HTTP 409
(`src/app/api/vouchers/route.ts:50-58,142-150`); defaults are accepted and
harmlessly stripped (`src/lib/voucherPayload.ts:3-9,56-84`).

## 1. Gap inventory (schema 001-030 vs admin model)

Canonical `vouchers` table (001:168-180) has:
`voucher_id, code, discount_type, discount_value, min_order_value, usage_limit,
times_used, start_date, end_date, status, created_at`.

Admin model additionally carries (see `src/app/admin/vouchers/page.tsx:76-135`):

| Field | Admin intent | Schema today | Fail-closed today |
|---|---|---|---|
| `min_items_count` | voucher applies only when cart has ≥ N items (checkout already enforces when value present: `src/app/checkout/page.tsx:187,220-222`) | missing | 409 if ≠0 |
| `is_gift_voucher` | gift voucher flag | missing | 409 if true |
| `gift_min_order_value` | gift voucher requires order ≥ value | missing | 409 if ≠0 |
| `visibility` | `public` \| `private` — checkout filter (`page.tsx:952`) | missing | 409 if ≠"public" |
| `max_discount_amount` | cap for percentage vouchers | missing | 409 if ≠0 |

Note: checkout already implements `min_items_count` and `visibility` semantics
against the `Voucher` object; those checks are dead code until the columns exist
(falsy defaults from missing fields).

## 2. Proposed migration `031_voucher_schema_extension.sql` (draft)

```sql
-- 031 — Voucher schema extension (backward compatible).
-- New columns carry NOT NULL defaults that exactly preserve current behaviour
-- (no min item count, not a gift voucher, no gift min order, public visibility,
-- no max discount cap). Existing rows need no rewrite. Existing API fail-closed
-- gate (409 for non-default values) remains correct and continues to protect
-- against silent drops until the application ships support for the new columns.
BEGIN;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS min_items_count INT NOT NULL DEFAULT 0
    CONSTRAINT chk_vouchers_min_items_count CHECK (min_items_count >= 0),
  ADD COLUMN IF NOT EXISTS is_gift_voucher BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_min_order_value DECIMAL(12,0) NOT NULL DEFAULT 0
    CONSTRAINT chk_vouchers_gift_min CHECK (gift_min_order_value >= 0),
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CONSTRAINT chk_vouchers_visibility CHECK (visibility IN ('public','private')),
  ADD COLUMN IF NOT EXISTS max_discount_amount DECIMAL(12,0) NULL
    CONSTRAINT chk_vouchers_max_discount CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0);

COMMENT ON COLUMN public.vouchers.min_items_count IS 'Minimum cart item count for voucher to apply; 0 = no minimum.';
COMMENT ON COLUMN public.vouchers.is_gift_voucher IS 'Gift voucher flag; gift vouchers require gift_min_order_value.';
COMMENT ON COLUMN public.vouchers.gift_min_order_value IS 'Minimum order value when is_gift_voucher; 0 = none.';
COMMENT ON COLUMN public.vouchers.visibility IS 'public: shown/appliable in public checkout; private: admin/internal only.';
COMMENT ON COLUMN public.vouchers.max_discount_amount IS 'Cap on absolute discount for percentage vouchers; NULL = uncapped.';

COMMIT;
```

Rollback (manual, reviewed): drop the five columns — they hold no derived data
and defaults are re-derivable. No RPC reads these columns yet (grep-verified:
only checkout/admin UI + `voucherPayload.ts`), so no RPC/RLS changes are needed
in 031. `SELECT *` consumers (e.g. `vouchers/route.ts:22` list, orderStore sync)
pick the columns up automatically once applied.

## 3. Follow-up application changes (separate batch, after 031 lands)

1. `buildVoucherPayload` (`src/lib/voucherPayload.ts:56-84`): include the 5
   columns; keep numeric coercion + CHECK-aligned validation.
2. `findUnsupportedVoucherFields` (`voucherPayload.ts:18-29`): retire once the
   API persists the fields; replace with semantic validation (e.g.
   `gift_min_order_value > 0` requires `is_gift_voucher`; `max_discount_amount`
   only meaningful for `percentage`).
3. Checkout voucher validation (`checkout/page.tsx:184-222,952`): already
   implements `min_items_count` and `visibility` — verify against seeded data in
   staging; add `max_discount_amount` clamping for percentage vouchers.
4. RPC path: order creation validates vouchers via stored Voucher object read
   from `vouchers` table (server-side). Confirm the server-side validator
   enforces `min_items_count` / `visibility` / `max_discount_amount` — currently
   enforced only client-side (tracked as residual P1 until verified).

## 4. Strategy summary

- **Backward compatible**: NOT NULL defaults = current behaviour; existing rows
  unchanged; `IF NOT EXISTS` guards; no data rewrite; app continues to fail
  closed for non-default values until code ships.
- **Ordering**: apply 031 to a staging database first; run the existing voucher
  suite + new seeding tests; only then consider Production via the gated
  `deploy-production-migrations.yml` workflow (requires change ticket + backup
  evidence — not part of this batch).
- **Not applied anywhere in this batch** (safety rule: no Production writes; no
  staging access claimed).
