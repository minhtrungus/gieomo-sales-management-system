-- ========================================================
-- GIEO MO - DATABASE MIGRATION 021
-- Reconcile the applied V015 idempotency schema for migration 025
-- ========================================================
-- This migration is intentionally narrow. It preserves the V015 ledger and
-- order keys as read-only legacy evidence, then installs the exact empty V025
-- idempotency shape. Migration 025 remains responsible for the new writer.
--
-- Fail closed on partial, mixed, or already-upgraded schemas. Never infer a
-- scope or UUID key for historical V015 rows.

DO $$
DECLARE
  v_v015_columns integer;
  v_v025_columns integer;
  v_ledger_key_type text;
  v_order_key_type text;
BEGIN
  IF to_regclass('public.order_idempotency') IS NULL THEN
    RAISE EXCEPTION '021: expected the migration-015 order_idempotency table';
  END IF;

  SELECT data_type INTO v_ledger_key_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'order_idempotency'
     AND column_name = 'idempotency_key';
  SELECT data_type INTO v_order_key_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orders'
     AND column_name = 'idempotency_key';

  SELECT count(*) INTO v_v015_columns
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'order_idempotency'
     AND column_name IN (
       'items_fingerprint', 'expected_item_count', 'lease_owner',
       'lease_until', 'needs_recon', 'expires_at'
     );
  SELECT count(*) INTO v_v025_columns
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (
       (table_name = 'order_idempotency' AND column_name IN ('scope_key', 'retain_until'))
       OR
       (table_name = 'orders' AND column_name IN ('idempotency_scope', 'idempotency_request_hash'))
     );

  IF v_ledger_key_type IS DISTINCT FROM 'text'
     OR v_order_key_type IS DISTINCT FROM 'text'
     OR v_v015_columns <> 6
     OR v_v025_columns <> 0
     OR to_regclass('public.order_idempotency_pkey') IS NULL
     OR to_regclass('public.idx_order_idempotency_expires') IS NULL
     OR to_regclass('public.idx_order_idempotency_recon') IS NULL
     OR to_regclass('public.uq_orders_idempotency_key') IS NULL
     OR to_regprocedure('public.create_order_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.cancel_order_atomic(uuid,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION
      '021: expected exact post-020/V015 prerequisites; got ledger_key=%, order_key=%, v015_columns=%, v025_columns=%',
      v_ledger_key_type, v_order_key_type, v_v015_columns, v_v025_columns;
  END IF;
  IF to_regclass('public.order_idempotency_v015_archive') IS NOT NULL
     OR to_regprocedure('public.create_order_atomic_v016_legacy(jsonb)') IS NOT NULL
     OR to_regprocedure('public.cancel_order_atomic_v017_legacy(uuid,text,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION '021: legacy target names already exist; investigate partial or prior reconciliation';
  END IF;
END $$;

-- Preserve rather than coerce the incompatible V015 identity records.
ALTER TABLE public.order_idempotency RENAME TO order_idempotency_v015_archive;
ALTER TABLE public.order_idempotency_v015_archive
  RENAME CONSTRAINT order_idempotency_pkey TO order_idempotency_v015_archive_pkey;
ALTER INDEX public.idx_order_idempotency_expires
  RENAME TO idx_order_idempotency_v015_archive_expires;
ALTER INDEX public.idx_order_idempotency_recon
  RENAME TO idx_order_idempotency_v015_archive_recon;

ALTER TABLE public.orders
  RENAME COLUMN idempotency_key TO idempotency_key_v015;
ALTER INDEX public.uq_orders_idempotency_key
  RENAME TO uq_orders_idempotency_key_v015;

ALTER FUNCTION public.create_order_atomic(JSONB)
  RENAME TO create_order_atomic_v016_legacy;
ALTER FUNCTION public.cancel_order_atomic(UUID, TEXT, TEXT, UUID)
  RENAME TO cancel_order_atomic_v017_legacy;

REVOKE ALL ON public.order_idempotency_v015_archive FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.order_idempotency_v015_archive TO service_role;
REVOKE ALL ON FUNCTION public.create_order_atomic_v016_legacy(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_order_atomic_v017_legacy(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.order_idempotency (
  scope_key        TEXT NOT NULL,
  idempotency_key  UUID NOT NULL,
  request_hash     TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status           TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  order_id         UUID REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  response_json    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  retain_until     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '180 days'),
  PRIMARY KEY (scope_key, idempotency_key),
  UNIQUE (order_id),
  CHECK (
    scope_key ~ '^guest:[0-9a-f]{64}$'
    OR scope_key ~ '^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CHECK (
    (status = 'in_progress' AND order_id IS NULL AND response_json IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND order_id IS NOT NULL AND response_json IS NOT NULL AND completed_at IS NOT NULL)
  )
);

ALTER TABLE public.orders
  ADD COLUMN idempotency_scope TEXT,
  ADD COLUMN idempotency_key UUID,
  ADD COLUMN idempotency_request_hash TEXT,
  ADD CONSTRAINT orders_idempotency_fields_consistent CHECK (
    (idempotency_scope IS NULL AND idempotency_key IS NULL AND idempotency_request_hash IS NULL)
    OR (
      idempotency_scope IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND idempotency_request_hash ~ '^[0-9a-f]{64}$'
    )
  );

CREATE UNIQUE INDEX uq_orders_idempotency_scope_key
  ON public.orders (idempotency_scope, idempotency_key)
  WHERE idempotency_scope IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX idx_order_idempotency_retain_until
  ON public.order_idempotency (retain_until);

ALTER TABLE public.order_idempotency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role all order_idempotency"
  ON public.order_idempotency FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.order_idempotency FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_idempotency TO service_role;

DO $$
BEGIN
  IF to_regclass('public.order_idempotency_v015_archive') IS NULL
     OR to_regprocedure('public.create_order_atomic_v016_legacy(jsonb)') IS NULL
     OR to_regprocedure('public.cancel_order_atomic_v017_legacy(uuid,text,text,uuid)') IS NULL
     OR to_regclass('public.order_idempotency') IS NULL THEN
    RAISE EXCEPTION '021: reconciliation objects missing';
  END IF;
  IF has_function_privilege('service_role', 'public.create_order_atomic_v016_legacy(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.cancel_order_atomic_v017_legacy(uuid,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '021: legacy writers must remain non-executable';
  END IF;
END $$;
