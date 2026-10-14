-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 015
-- Checkout idempotency ledger + orders.idempotency_key
-- Batch 1: double-POST / server-side idempotency
-- ========================================================
-- KHÔNG đụng migrations 013 / 014.
-- Áp dụng qua Supabase Dashboard SQL Editor (standalone).
-- Verification read-only nằm trong comment cuối file.
-- ========================================================

-- 1) LEDGER
CREATE TABLE IF NOT EXISTS public.order_idempotency (
  idempotency_key     TEXT PRIMARY KEY,
  request_hash        TEXT NOT NULL,
  items_fingerprint   JSONB NOT NULL,
  expected_item_count INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN (
                        'in_progress',
                        'completed',
                        'failed_terminal',
                        'reconciliation_required'
                      )),
  lease_owner         TEXT NULL,
  lease_until         TIMESTAMPTZ NULL,
  needs_recon         BOOLEAN NOT NULL DEFAULT false,
  order_id            UUID NULL REFERENCES public.orders(order_id) ON DELETE SET NULL,
  response_json       JSONB NULL,
  error_message       TEXT NULL,
  closed_by           TEXT NULL,
  closed_at           TIMESTAMPTZ NULL,
  close_note          TEXT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ NULL,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_order_idempotency_expires
  ON public.order_idempotency (expires_at)
  WHERE status IN ('completed', 'failed_terminal');

CREATE INDEX IF NOT EXISTS idx_order_idempotency_recon
  ON public.order_idempotency (updated_at)
  WHERE needs_recon = true OR status = 'reconciliation_required';

-- 2) ORDERS: nullable idempotency_key (admin/sale/POS = NULL)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

-- Partial unique: nhiều NULL OK; 1 key non-NULL tối đa 1 order
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_key
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3) RLS: service_role ONLY (createAdminClient)
ALTER TABLE public.order_idempotency ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all order_idempotency" ON public.order_idempotency;
EXCEPTION
  WHEN undefined_table THEN null;
  WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Service role all order_idempotency"
  ON public.order_idempotency
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Không policy cho anon / authenticated.

-- ========================================================
-- VERIFICATION (READ-ONLY) — chạy SAU khi apply
-- ========================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'order_idempotency';
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'orders'
--   AND column_name = 'idempotency_key';
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename IN ('order_idempotency', 'orders')
--   AND indexname LIKE '%idempotency%';
--
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'order_idempotency';
-- SELECT * FROM pg_policies WHERE tablename = 'order_idempotency';
