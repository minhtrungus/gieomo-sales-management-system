# DATABASE MIGRATION RUNBOOK

## Authoritative 001-027 reconciliation - 2026-10-15

This section supersedes every older sequence or Git-state statement below it.
The feature branch now carries exactly one executable `.sql` migration for each
number from 001 through 027. Migrations 001-020 are the immutable historical
baseline. The operator reports that 001-020 were applied and that 020 is the
latest applied migration; this is operator evidence, not a verified database
ledger. Staging and production remain `UNKNOWN` until their owners export both
the migration ledger and the catalog checks required by the preflight.

The pending order for an exact post-020/V015 target is:

`021_reconcile_v015_idempotency.sql -> 022_revoke_runtime_order_dml.sql -> 023_payment_integrity.sql -> 024_repair_payment_cash_contract.sql -> 025_atomic_idempotent_order_creation.sql -> 026_atomic_order_cancellation.sql -> 027_close_runtime_read_and_rpc_bypasses.sql`

| Range | Classification | Dependency / purpose |
|---|---|---|
| 001-012 | required, historical | base schema and original RLS |
| 013-020 | required, historical; operator-reported applied | RLS, freeship, V015 order flow, payment uniqueness and inventory ledger |
| 021 | required, pending | requires exact V015 after 020; archives legacy evidence and disables unsafe legacy writers |
| 022 | required, pending | requires 013 tables/policies; removes runtime-role direct DML and intentionally does not require a writer RPC |
| 023 | required, pending | requires `orders`, `payments`, history and audit tables; adds payment ledger/uniqueness/RPC |
| 024 | required, pending | requires 023 `apply_payment_event(jsonb)`; repairs its cash/replay contract |
| 025 | required, pending | requires the exact V025 prerequisite emitted by 021; installs atomic creation |
| 026 | required, pending | requires 025 writer/schema; adds reservation provenance and atomic cancellation |
| 027 | required, pending | requires 021-026; removes authenticated PII reads, legacy stock-RPC execution and permissive future-object defaults |
| `proposals/021_*.draft` | superseded draft; never run | numbering collided with 021; its security intent is implemented by 022 |
| `proposals/022_*.draft` | superseded draft; never run | inbound-event design is reconciled into 023/024 |

### Mandatory target preflight

1. Name the database execution owner and rollback/restore owner.
2. Record the target identifier, maintenance window and approved commit SHA.
3. Produce a restorable backup and record a successful restore drill.
4. Export `supabase_migrations.schema_migrations` (or platform-equivalent
   ledger) and verify 001-020 with 020 latest. A missing ledger is a stop
   condition, not permission to infer state from table names.
5. Run `supabase/013_025_read_only_preflight.sql` with `psql -X -v
   ON_ERROR_STOP=1 -f ...`. It must report the expected V015/post-020 shape.
   Stop on `MIXED`, `UNKNOWN`, missing 019/020 objects, or unexpected objects.
6. On disposable PostgreSQL, replay 001-027 from the clean approved commit and
   run the real-PG create, payment and cancellation suites without skips.

Example disposable validation (never point this block at staging/production):

```powershell
$env:ATOMIC_PG_URL = '<disposable-postgres-url>'
Get-ChildItem supabase/migrations -File -Filter '*.sql' |
  Sort-Object Name |
  ForEach-Object { & psql.exe -X -v ON_ERROR_STOP=1 -d $env:ATOMIC_PG_URL -f $_.FullName }
node --test tests/migrationChain.test.ts tests/migrationSecurityPg.integration.test.ts tests/atomicOrderPg.integration.test.ts tests/paymentCashPg.integration.test.ts tests/cancelOrderAtomicPg.integration.test.ts tests/sepayWebhookAuth.test.ts
```

After apply, verify the ledger contains 021-027 once and in order; rerun the
preflight and verify V025; inspect runtime grants/policies; then run COD,
banking, duplicate-delivery, create replay, concurrent create/cancel, voucher,
combo-reservation, paid-cancel/refund-required and rollback smoke tests.

Rollback is restore/forward-fix only. Do not reverse/delete historical ledger
rows, coerce legacy keys, infer combo components, or invoke legacy 017 cancel.
Stop on a ledger gap/duplicate, preflight mismatch, failed statement, skipped PG
test, partial effect, unexpected runtime DML grant, missing monitoring owner, or
inability to restore the backup. Staging must pass before production; this batch
authorizes neither environment.

## Authoritative sequencing update — 2026-10-14

The operator reports 001–020 applied, with 020 latest, but target migration-ledger
and catalog evidence have not been supplied. Do not infer real database state
from repository files. Run `supabase/013_025_read_only_preflight.sql` read-only
on the intended target and stop on `MIXED` or `UNKNOWN`.

Migration 025 does not upgrade migration 015's incompatible text-key schema.
For an exact V015/post-020 target, the reviewed pending order is:

`021_reconcile_v015_idempotency.sql → 023_payment_integrity.sql → 024_repair_payment_cash_contract.sql → 025_atomic_idempotent_order_creation.sql → 026_atomic_order_cancellation.sql`

The root-worktree 021/022 `.sql.draft` proposals are excluded. The 021 proposal
has a numbering collision and must be renumbered before promotion; the 022
proposal must be reconciled with 023. Before staging, verify a restorable backup,
name execution and rollback owners, review the legacy V015 archive boundary, and
approve a maintenance window. No migration in this pending sequence was applied
to staging or production during this batch.

**Primary Migration:** `023_payment_integrity.sql`
**Date:** 2026-10-14
**Status:** NOT APPLIED
**Risk:** MEDIUM-HIGH — creates RPC + ledger table + unique indexes + REVOKE privileges. All statements are additive/defensive with `IF NOT EXISTS` / `DROP POLICY IF EXISTS`.
**Blocking:** Webhook `/api/webhook/sepay` and admin `POST /api/orders/payment` require the `apply_payment_event` RPC. Deploy without migration → all payment writes fail 500.

> **Doc correction (2026-10-14):** Earlier versions of this runbook and `OVERNIGHT_PRODUCTION_READINESS.md` described 023 as a 4-step migration (REVOKE + drop policy + add `confirmed_at` + add index). That was **incorrect**. The actual file is 477 lines and creates a full payment-event ledger + atomic RPC. This runbook now reflects the real file.

---

## Full Migration Inventory

| # | Filename | In Candidate? | Tracked in Git? | Applied to DB? | Status |
|---|----------|--------------|-----------------|----------------|--------|
| 001 | `001_initial_schema.sql` | Yes | Yes (committed) | Unknown | `CODE REVIEWED` |
| 002 | `002_grant_permissions_and_rls.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 003 | `003_system_configs_and_crud_rls.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 004 | `004_contact_messages_and_catalog_rls.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 005 | `005_social_media_system_configs.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 006 | `006_add_password_hash_to_members.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 007 | `007_storage_buckets_and_rls.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 008 | `008_product_reviews.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 009 | `009_ensure_product_relationships.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 010 | `010_add_image_url_to_product_variants.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 011 | `011_fix_rls_security_policies.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 012 | `012_atomic_stock_and_rls_hardening.sql` | Yes | Yes | Unknown | `CODE REVIEWED` |
| 013 | `013_fix_rls_orders_customers_payment.rls.sql` | **No** | **No** (untracked in root; never committed to any branch) | Unknown (`DATABASE STATE UNVERIFIED`) | `DRAFT — BY DESIGN NOT COMMITTED (Dashboard-standalone)` |
| 014 | `014_add_freeship_discount_type.sql` | **No** | **No** (untracked; never committed) | Unknown | `DRAFT — BY DESIGN NOT COMMITTED` |
| 015 | `015_order_idempotency.sql` | **No** | **No** (untracked; header: "Dashboard SQL Editor standalone, KHÔNG commit code") | Unknown | `DRAFT — BY DESIGN NOT COMMITTED` |
| 016 | `016_create_order_atomic.sql` | **No** | **No** (untracked; header: "SQL Editor standalone, KHÔNG commit code") | Unknown | `DRAFT — BY DESIGN NOT COMMITTED` |
| 017 | `017_cancel_order_atomic.sql` | **No** | **No** (untracked; header: "SQL Editor standalone, KHÔNG commit code") | Unknown | `DRAFT — BY DESIGN NOT COMMITTED` |
| 018 | `018_payments_unique_transaction.sql` | **No** | **No** (untracked; header: "Dashboard SQL Editor standalone, KHÔNG commit code") | Unknown | `DRAFT — BY DESIGN NOT COMMITTED` (023 recreates with IF NOT EXISTS) |
| 019 | `019_inventory_adjustments.sql` | **No** | **No** (untracked; never committed) | Unknown | `DRAFT — BY DESIGN NOT COMMITTED` |
| 020 | `020_ledger_delete_policy.sql` | **No** | **No** (untracked; never committed) | Unknown | `DRAFT — BY DESIGN NOT COMMITTED` |
| 021 | `proposals/021_revoke_anon_insert_order_tables.sql.draft` | No | No (.draft) | No | `DRAFT` |
| 022 | `proposals/022_inbound_payment_events.sql.draft` | No | No (.draft) | No | `DRAFT` |
| 023 | `023_payment_integrity.sql` | **Yes** | **No** (untracked) | **NO** | `CODE REVIEWED — NOT APPLIED` |

### Gap Analysis: 013–020 (FORENSICS 2026-10-14 — DETAILED)

**Conclusion: The 013–020 "gap" is NOT a candidate bug.** These migrations were **intentionally never committed to git** as part of the Supabase migration chain.

Evidence:
- **Git forensics:** `git log --all -- migrations/013*` returned zero commits across all branches. `git ls-tree main|HEAD -- supabase/migrations/` shows only 001–012 tracked. 013–020 exist solely as **untracked files in root worktree**, created 09–12/10/2026.
- **Design intent:** Headers of 015–018 explicitly state: "Áp dụng qua Supabase Dashboard SQL Editor (standalone), KHÔNG commit code" — they were designed to be applied **manually via Supabase Dashboard SQL Editor**, not committed as part of the `supabase db push` migration chain. 021–022 are `.draft` files in `proposals/` (extension ensures migration runners ignore them).
- **No `supabase/config.toml` exists** in the repo — the Supabase CLI project-linking workflow is not configured. This confirms migrations were applied via Dashboard, not CLI.
- **Code dependency:** Candidate code does NOT reference any object created by 013–020 (`create_order_atomic`, `cancel_order_atomic`, `order_idempotency`, `inventory_adjustments`, `adjust_variant_stock` — grep across `src/` and `tests/` = 0 hits). Candidate uses direct PostgREST inserts in `orderService.ts` instead of 016's RPC.
- **023 dependency:** Migration 023 only references `payments`, `orders`, `order_status_history`, `audit_logs` — all created by migration **001**. 023 does NOT depend on 013–020. `payments.transaction_code` exists in 001:275. 023 uses `IF NOT EXISTS` for unique indexes (equivalent to 018, compatible whether or not 018 was applied).
- **Database state:** Whether the production/staging DB has 013–020 applied is **`DATABASE STATE UNVERIFIED`** (no DB access in this environment). Do NOT infer DB state from the migrations directory alone.

### Impact Classification: 013–020 (per-file static analysis 2026-10-14)

| File | Type | Affects | Impact if NOT applied | Operator action |
|------|------|---------|----------------------|-----------------|
| **013** `fix_rls_orders_customers_payment.rls.sql` | RLS policies | customers, orders, order_items, payments, order_status_history | 011 already ENABLEs RLS + REVOKEs anon SELECT + creates "Service role all" on all 5. 013 ADDS "Public insert" (WITH CHECK true) + "Authenticated read" policies. **Current checkout uses API routes (service_role), NOT anon INSERT** — verified: `orderStore.ts:255` → `fetch("/api/orders")` → API route. So 013's "Public insert" is NOT needed by current code and actually weakens security (allows anon INSERT). 023 drops "Public insert payments" but NOT "Public insert orders". | **VERIFY:** Is 013 applied? If YES: 023 will drop payments public-insert but orders/order_items/customers remain publicly insertable — confirm this is intended. If NO: current state (011) is SAFER (service_role only). **Do NOT apply 013 without security review.** |
| **014** `add_freeship_discount_type.sql` | Enum value | `discount_type` enum | App writes `vouchers.discount_type = 'freeship'` (`admin/vouchers/page.tsx:69,127`; `pricing.ts:60`). Without the enum value, INSERT fails with 22P02. **Freeship vouchers will not work.** | **VERIFY:** Is 014 applied? If NO: freeship voucher creation is broken. Apply before enabling freeship feature. Additive + safe. |
| **015** `order_idempotency.sql` | Table + column | `order_idempotency` table, `orders.idempotency_key` | Not used by candidate code. Server idempotency (Decision #3 Option A) would use this pattern but is not yet implemented. | **REVIEW before use.** May be superseded by Decision #3 implementation. |
| **016** `create_order_atomic.sql` | RPC | `create_order_atomic`, helper functions | Not used by candidate code (uses direct PostgREST inserts). | **REVIEW before use.** May be superseded by Decision #3 implementation. |
| **017** `cancel_order_atomic.sql` | RPC | `cancel_order_atomic` | Not used by candidate code. | **REVIEW before use.** |
| **018** `payments_unique_transaction.sql` | Unique index | `uq_payments_order_transaction_code` | **023 recreates this with `IF NOT EXISTS` + fail-closed verification.** If 018 applied: 023 skips creation, verifies definition. If definition differs: 023 RAISEs. If not applied: 023 creates it. | **OVERLAPPED by 023.** Safe either way. Verify definition match post-apply. |
| **019** `inventory_adjustments.sql` | Table + RPC | `inventory_adjustments`, `adjust_variant_stock` | Not used by candidate code. | **REVIEW before use.** |
| **020** `ledger_delete_policy.sql` | Policy + snapshot | Modifies 019's objects | Depends on 019. Not used by candidate code. | **REVIEW before use.** Depends on 019. |

### Operator Confirmation Required

| # | Migration | Must confirm applied? | Why |
|---|-----------|----------------------|-----|
| 1 | **013** | **YES — security review** | If applied: anon can INSERT orders/order_items/customers (public-insert policies). Confirm this is intended. If not applied: current state is safer. |
| 2 | **014** | **YES — feature check** | If not applied: freeship voucher creation fails with 22P02. |
| 3 | **018** | Optional (023 handles) | 023 recreates with IF NOT EXISTS. Verify definition match post-apply. |
| 4 | 015, 016, 017, 019, 020 | Optional (not used by code) | May be superseded by future implementations. Review before enabling. |

### Commit Strategy Recommendation

**Do NOT commit 013–020 into the candidate migration chain.** They were designed as Dashboard-standalone. Committing them would:
1. Cause `supabase db push` to re-apply them (idempotent for most, but 013's RLS changes could conflict with 011's state).
2. Break the intentional design (headers explicitly say "KHÔNG commit code").

**Recommended:** Keep 013–020 as root-untracked files. Document their status (applied via Dashboard) in the runbook. If the team wants CLI-managed migrations in the future, create a separate effort to audit + renumber + test them as a batch.

### Numbering Gap: 021–022

No `.sql` files exist for 021–022 — only `.draft` proposals under `supabase/migrations/proposals/`. The `.sql.draft` extension is intentional: migration runners (`supabase db push`, etc.) only pick up `*.sql`, so these are ignored. They are design drafts, not applied migrations.

---

## Prerequisites (023)

1. PostgreSQL server accessible (Supabase or local)
2. Database backup completed
3. Maintenance window scheduled (migration takes < 5s)
4. Operator approval received (`OPERATOR_DECISIONS_REQUIRED.md` Decision #1)
5. **Deploy order:** Apply migration BEFORE deploying code that calls `apply_payment_event` (or accept temporary 500s with SePay retry)

---

## Operator Staging Checklist (before applying 023)

Run these READ-ONLY checks on the target staging database FIRST. Do NOT apply 023 until all preconditions pass.

### Pre-apply verification (read-only)

```sql
-- 1. Verify 001's core tables exist (023's dependencies)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('payments','orders','order_status_history','audit_logs');
-- Expected: 4 rows

-- 2. Verify payments.transaction_code column exists (001:275)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'transaction_code';
-- Expected: 1 row

-- 3. Verify payments.payment_status column exists (001:12)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'payment_status';
-- Expected: 1 row

-- 4. Check if 018's index already exists (023 uses IF NOT EXISTS — compatible)
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND indexname = 'uq_payments_order_transaction_code';
-- Expected: 0 or 1 row (both OK). If 1 row: verify definition matches 023's expected:
--   (order_id, transaction_code) WHERE (transaction_code IS NOT NULL)

-- 5. CRITICAL: Check for duplicate (order_id, transaction_code) that would block index creation
SELECT order_id, transaction_code, COUNT(*) AS n
  FROM public.payments
 WHERE transaction_code IS NOT NULL
 GROUP BY order_id, transaction_code
 HAVING COUNT(*) > 1;
-- Expected: 0 rows. If >0: MUST reconcile duplicates BEFORE applying 023 (index creation will fail).

-- 6. Verify anon INSERT status on payments (013 may have granted it)
SELECT has_table_privilege('anon', 'public.payments', 'INSERT');
-- Expected: t or f (both OK). 023 will REVOKE it.

-- 7. Check if payment_events already exists (from a previous partial apply)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'payment_events';
-- Expected: 0 rows (first apply). If 1 row: 023's CREATE TABLE IF NOT EXISTS will skip.
```

### Environment verification

```sql
-- Verify you are on the CORRECT database (not production!)
SELECT current_database(), current_user, inet_server_addr();
-- Confirm: database name matches staging, user is not production superuser
```

### Backup verification

```sql
-- Take a backup BEFORE applying. Verify backup completed:
-- (Supabase: Dashboard → Database → Backups)
-- (psql: pg_dump already completed and file exists)
```

### Apply

Only after all preconditions pass:
```bash
psql $STAGING_DATABASE_URL -f supabase/migrations/023_payment_integrity.sql
```

### Post-apply verification (read-only)

```sql
-- 1. payment_events table + RLS
SELECT relrowsecurity FROM pg_class WHERE relname = 'payment_events';
-- Expected: t

-- 2. Unique indexes
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename = 'payments' ORDER BY indexname;
-- Expected: payments_pkey, idx_payments_order,
--   uq_payments_order_transaction_code, uq_payments_one_paid_per_order

-- 3. anon INSERT revoked
SELECT has_table_privilege('anon', 'public.payments', 'INSERT');
-- Expected: f

-- 4. Legacy policy dropped
SELECT policyname FROM pg_policies
 WHERE tablename = 'payments' AND policyname = 'Public insert payments';
-- Expected: 0 rows

-- 5. RPC exists + service_role only
SELECT has_function_privilege('service_role', 'public.apply_payment_event(jsonb)', 'EXECUTE');
-- Expected: t
SELECT has_function_privilege('anon', 'public.apply_payment_event(jsonb)', 'EXECUTE');
-- Expected: f
SELECT has_function_privilege('authenticated', 'public.apply_payment_event(jsonb)', 'EXECUTE');
-- Expected: f

-- 6. Test single-payment invariant (on staging)
-- INSERT INTO payments (order_id, payment_method, amount, payment_status, transaction_code)
-- VALUES ('<existing-paid-order-id>', 'banking', 1000, 'paid', 'TEST-DUP');
-- Expected: unique_violation on uq_payments_one_paid_per_order
-- ROLLBACK after test.
```

### If migration fails

023 is fail-closed: any `RAISE EXCEPTION` causes full rollback (no partial state). Check:
- Error message indicates which invariant failed.
- `payment_events` should NOT exist after failed apply (rolled back).
- Re-run pre-apply checks to diagnose.

### History mismatch

If Supabase Dashboard shows migration history mismatch (e.g., 023 not in `supabase_migrations.schema_migrations` table):
- 023 was applied via raw SQL (psql/Dashboard), not via `supabase db push`.
- This is expected for Dashboard-standalone workflow.
- To record it: `INSERT INTO supabase_migrations.schema_migrations (version, statements) VALUES ('023', '<hash>');` — only if operator wants CLI tracking.

---

## What 023 Actually Does (accurate summary of 477-line file)

### Part 1 — Payment event ledger (lines 30–69)
```sql
CREATE TABLE IF NOT EXISTS public.payment_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'sepay',
  provider_transaction_id TEXT,
  order_code TEXT,
  matched_order_id UUID REFERENCES public.orders(order_id) ON DELETE SET NULL,
  received_amount DECIMAL(12,0) CHECK (received_amount IS NULL OR received_amount > 0),
  expected_amount DECIMAL(12,0),
  classification TEXT NOT NULL CHECK (classification IN (
    'unmatched_reference','unmatched_order','underpaid','matched','overpaid',
    'paid_order_additional_transfer','cancelled_order_payment','completed_order_payment',
    'duplicate_delivery','admin_confirm'
  )),
  outcome TEXT,
  payload_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Plus 3 indexes, RLS enable, service_role-only policy, REVOKE ALL from PUBLIC/anon/authenticated.

**Purpose:** Durable ledger of EVERY payment event, including unmatched/underpaid. Allows tracing money without attaching to an order.

### Part 2 — Unique indexes (lines 77–85)
```sql
-- 2a. Transaction identity unique (idempotency — same as 018, IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_order_transaction_code
  ON public.payments (order_id, transaction_code)
  WHERE transaction_code IS NOT NULL;

-- 2b. Single-payment invariant: max one 'paid' payment per order
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_paid_per_order
  ON public.payments (order_id)
  WHERE payment_status = 'paid';
```

### Part 3 — Fail-closed verification (lines 91–129)
`DO $$ ... RAISE EXCEPTION` blocks verify both indexes exist with correct definitions and `payment_events` table exists. **Migration fails hard if any invariant is violated.**

### Part 4 — Revoke anon INSERT on payments (lines 138–153)
```sql
DROP POLICY IF EXISTS "Public insert payments" ON public.payments;
REVOKE INSERT ON public.payments FROM anon;
-- verify: has_table_privilege('anon','public.payments','INSERT') must be false
```

### Part 5 — Atomic RPC (lines 187–440)
`apply_payment_event(p JSONB) RETURNS JSONB` — SECURITY DEFINER, `search_path=public,pg_temp`.

Handles 5 cases under `SELECT ... FOR UPDATE` order lock:
| Case | Condition | Outcome | Action |
|------|-----------|---------|--------|
| Unmatched | order_code not found | `unmatched_order` | Log to `payment_events`, `needs_review=true` |
| Duplicate | same `transaction_code` exists | `duplicate` | Log to `payment_events`, no state change |
| Already paid | `order.payment_status='paid'` | `paid_order_additional_transfer` | Insert `pending` payment, `needs_review=true` |
| Cancelled | `order.order_status='cancelled'` | `cancelled_order_payment` | Insert `pending` payment, `needs_review=true` |
| Underpaid | `amount < final_amount` | `underpaid` | Insert `pending` payment, `needs_review=true` |
| Matched | amount ≥ final, active order | `applied` | Insert `paid` payment, update order → paid + confirmed |

Always writes `order_status_history`, `audit_logs`, `payment_events`. Returns JSONB with `outcome`, `needs_review`, `message`, amounts.

Unique violation handling: `uq_payments_one_paid_per_order` → raise "single-payment invariant violated"; `uq_payments_order_transaction_code` → raise "duplicate".

### Part 6 — Final verification (lines 446–458)
Verify `apply_payment_event` EXECUTE granted to service_role only, revoked from PUBLIC/anon/authenticated.

---

## Apply Migration

### Option A: Supabase CLI (Recommended)
```bash
supabase db push
```

### Option B: Manual SQL
```bash
psql $DATABASE_URL -f supabase/migrations/023_payment_integrity.sql
```

### Option C: Supabase Dashboard
1. Navigate to SQL Editor
2. Paste contents of `023_payment_integrity.sql`
3. Click "Run"

---

## Verify Migration (read-only checks)

```sql
-- 1. payment_events table exists with RLS
SELECT relrowsecurity FROM pg_class WHERE relname = 'payment_events';
-- Expected: t (true)

-- 2. Unique indexes exist with correct definitions
SELECT indexname, indexdef FROM pg_indexes
 WHERE tablename = 'payments' ORDER BY indexname;
-- Expected: payments_pkey, idx_payments_order_id_payment_status,
--   uq_payments_order_transaction_code, uq_payments_one_paid_per_order

-- 3. anon INSERT on payments is revoked
SELECT has_table_privilege('anon', 'public.payments', 'INSERT');
-- Expected: f (false)

-- 4. Legacy policy dropped
SELECT policyname FROM pg_policies
 WHERE tablename = 'payments' AND policyname = 'Public insert payments';
-- Expected: 0 rows

-- 5. RPC exists and is service_role only
SELECT has_function_privilege('service_role', 'public.apply_payment_event(jsonb)', 'EXECUTE');
-- Expected: t
SELECT has_function_privilege('anon', 'public.apply_payment_event(jsonb)', 'EXECUTE');
-- Expected: f
SELECT has_function_privilege('authenticated', 'public.apply_payment_event(jsonb)', 'EXECUTE');
-- Expected: f

-- 6. Test single-payment invariant (on rehearsal DB)
-- INSERT INTO payments (order_id, payment_method, amount, payment_status, transaction_code)
-- VALUES ('<existing-paid-order-id>', 'banking', 1000, 'paid', 'TEST-DUP');
-- Expected: unique_violation on uq_payments_one_paid_per_order
```

---

## Rollback

**WARNING:** Rollback removes `payment_events` data (durable ledger of payment events — data loss for audit trail). Unique index drops remove enforcement but do not delete existing rows. RPC drop removes atomic write path — webhook/admin-confirm will break.

```sql
-- 1. Drop RPC
DROP FUNCTION IF EXISTS public.apply_payment_event(JSONB);

-- 2. Drop unique indexes
DROP INDEX IF EXISTS uq_payments_order_transaction_code;
DROP INDEX IF EXISTS uq_payments_one_paid_per_order;

-- 3. Drop payment_events (DATA LOSS)
DROP TABLE IF EXISTS public.payment_events;

-- 4. Restore anon INSERT (EMERGENCY ONLY — security risk)
GRANT INSERT ON public.payments TO anon;

-- 5. Recreate legacy policy (EMERGENCY ONLY — security risk)
CREATE POLICY "Public insert payments" ON public.payments
  FOR INSERT TO anon WITH CHECK (true);
```

**Rollback does NOT revert:**
- `payments` rows already inserted by RPC (paid/pending) — those remain
- `orders.payment_status` / `order_status` / `confirmed_at` already updated by RPC — those remain
- `order_status_history` / `audit_logs` rows — those remain

---

## Post-Migration Testing (requires live DB — NOT RUN in this environment)

1. **Payment flow:** Create order → pay via banking → verify payment status updates to `paid`, `payment_events` row with `classification='matched'`
2. **Webhook idempotency:** Re-send same SePay event → verify `outcome='duplicate'`, no second paid row
3. **Admin confirm:** `POST /api/orders/payment` with real bank reference → verify RPC path
4. **Underpayment:** Send amount < `final_amount` → verify `outcome='underpaid'`, order stays pending, `needs_review=true`
5. **Cancelled order payment:** Send payment for cancelled order → verify `cancelled_order_payment`, order NOT reopened
6. **Reconciliation:** Open dashboard → verify no false `PAYMENT_MISMATCH`
7. **Security:** Try anonymous payment insert → verify rejected

---

## Monitoring (24h post-migration)

- Payment insert failures from legit code paths (should be 0)
- Webhook processing errors / 500s
- `payment_events` rows with `classification='unmatched_*'` (should be low; investigate spikes)
- Reconciliation query performance
- SePay retry rate (should drop after RPC exists)

---

## Expand-and-Contract Note

023 is **additive-only** and **backward-compatible**:
- New table `payment_events` — no existing code references it until webhook/payment route is deployed
- New indexes — `IF NOT EXISTS` ensures idempotent apply
- REVOKE anon INSERT — no existing code path uses anon client for payments (verified)
- New RPC — no existing code calls it until webhook/payment route is deployed

**Safe deploy order:**
1. Apply 023 (backward-compatible — old code unaffected)
2. Deploy new code (now RPC exists)
3. Verify webhook + payment confirm

If reverse order is forced: new code returns 500 on webhook/payment until 023 applied. SePay retries make this acceptable for a short window.

---

*Generated: 2026-10-14 | Migration: 023_payment_integrity.sql | Status: NOT APPLIED*
