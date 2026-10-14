-- READ-ONLY OPERATOR PREFLIGHT — migrations 013 through 026
-- Safe to run before any migration decision. Object presence is schema-shape
-- evidence, not proof that a numbered migration exists in a migration ledger.

BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name, current_user AS database_user,
       version() AS postgres_version, now() AS observed_at;

SELECT * FROM (VALUES
  ('013', 'orders RLS enabled', COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid='public.orders'::regclass), false)::text),
  ('014', 'discount_type has freeship', EXISTS(
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typnamespace='public'::regnamespace AND t.typname='discount_type' AND e.enumlabel='freeship'
  )::text),
  ('015/025', 'order_idempotency exists', (to_regclass('public.order_idempotency') IS NOT NULL)::text),
  ('016/025', 'create_order_atomic(jsonb) exists', (to_regprocedure('public.create_order_atomic(jsonb)') IS NOT NULL)::text),
  ('017/026', 'cancel_order_atomic present (any signature)', EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='cancel_order_atomic'
  )::text),
  ('018/023', 'payment transaction uniqueness marker', EXISTS(
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='payments'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%transaction_code%'
  )::text),
  ('019/020', 'inventory_adjustments exists', (to_regclass('public.inventory_adjustments') IS NOT NULL)::text),
  ('021', 'order/order-item policies require policy review', EXISTS(
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('orders','order_items')
  )::text),
  ('022/023', 'payment_events exists', (to_regclass('public.payment_events') IS NOT NULL)::text),
  ('024', 'apply_payment_event(jsonb) exists', (to_regprocedure('public.apply_payment_event(jsonb)') IS NOT NULL)::text),
  ('025', 'orders.idempotency_scope exists', EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='idempotency_scope'
  )::text)
) AS evidence(migration_or_family, marker, present_or_state)
ORDER BY migration_or_family;

SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('order_idempotency','orders')
  AND column_name IN (
    'scope_key','idempotency_key','request_hash','items_fingerprint',
    'expected_item_count','lease_owner','lease_until','expires_at','retain_until',
    'idempotency_scope','idempotency_request_hash'
  )
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('order_idempotency','orders')
  AND indexdef ILIKE '%idempotency%'
ORDER BY tablename, indexname;

-- Exactly one of V015 or V025 is acceptable. MIXED and UNKNOWN abort so an
-- operator cannot silently choose a target schema.
DO $$
DECLARE
  has_table             BOOLEAN := to_regclass('public.order_idempotency') IS NOT NULL;
  ledger_key_type       TEXT;
  orders_key_type       TEXT;
  v015_column_count     INTEGER := 0;
  v025_ledger_count     INTEGER := 0;
  v025_orders_count     INTEGER := 0;
  has_v015_markers      BOOLEAN;
  has_v025_markers      BOOLEAN;
  has_v015_primary_key  BOOLEAN := false;
  has_v025_primary_key  BOOLEAN := false;
  has_v025_order_unique BOOLEAN := false;
  has_v025_orders_check BOOLEAN := false;
  has_v025_orders_index BOOLEAN := false;
  detected_state        TEXT;
BEGIN
  SELECT data_type INTO ledger_key_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='order_idempotency' AND column_name='idempotency_key';
  SELECT data_type INTO orders_key_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='orders' AND column_name='idempotency_key';

  SELECT count(*) INTO v015_column_count
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_idempotency'
      AND column_name IN (
        'items_fingerprint','expected_item_count','lease_owner',
        'lease_until','needs_recon','expires_at'
      );
  SELECT count(*) INTO v025_ledger_count
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_idempotency'
      AND column_name IN (
        'scope_key','idempotency_key','request_hash','status','order_id',
        'response_json','created_at','completed_at','retain_until'
      );
  SELECT count(*) INTO v025_orders_count
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders'
      AND column_name IN ('idempotency_scope','idempotency_key','idempotency_request_hash');

  IF has_table THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid='public.order_idempotency'::regclass AND contype='p'
         AND pg_get_constraintdef(oid)='PRIMARY KEY (idempotency_key)'
    ) INTO has_v015_primary_key;
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid='public.order_idempotency'::regclass AND contype='p'
         AND pg_get_constraintdef(oid)='PRIMARY KEY (scope_key, idempotency_key)'
    ) INTO has_v025_primary_key;
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid='public.order_idempotency'::regclass AND contype='u'
         AND pg_get_constraintdef(oid)='UNIQUE (order_id)'
    ) INTO has_v025_order_unique;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.orders'::regclass
       AND conname='orders_idempotency_fields_consistent' AND contype='c'
  ) INTO has_v025_orders_check;
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='orders'
       AND indexname='uq_orders_idempotency_scope_key'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%idempotency_scope%idempotency_key%'
  ) INTO has_v025_orders_index;

  has_v015_markers := ledger_key_type='text' OR orders_key_type='text'
    OR v015_column_count > 0;
  has_v025_markers := ledger_key_type='uuid' OR orders_key_type='uuid'
    OR EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public'
         AND (
           (table_name='order_idempotency' AND column_name IN ('scope_key','retain_until'))
           OR
           (table_name='orders' AND column_name IN ('idempotency_scope','idempotency_request_hash'))
         )
    );

  detected_state := CASE
    WHEN has_v015_markers AND has_v025_markers THEN 'MIXED'
    WHEN has_table AND ledger_key_type='text' AND orders_key_type='text'
      AND v015_column_count=6 AND has_v015_primary_key
      AND NOT has_v025_markers THEN 'V015'
    WHEN has_table AND ledger_key_type='uuid' AND orders_key_type='uuid'
      AND v025_ledger_count=9 AND v025_orders_count=3
      AND has_v025_primary_key AND has_v025_order_unique
      AND has_v025_orders_check AND has_v025_orders_index
      AND NOT has_v015_markers THEN 'V025'
    ELSE 'UNKNOWN'
  END;

  RAISE NOTICE
    'IDEMPOTENCY_SCHEMA_EVIDENCE ledger_key=%, order_key=%, v015_columns=%, v025_ledger_columns=%, v025_order_columns=%',
    ledger_key_type, orders_key_type, v015_column_count, v025_ledger_count, v025_orders_count;

  RAISE NOTICE 'IDEMPOTENCY_SCHEMA_STATE=%', detected_state;
  IF detected_state IN ('MIXED','UNKNOWN') THEN
    RAISE EXCEPTION 'STOP: idempotency schema state is %. Do not apply reconciliation or writer migrations until investigated.', detected_state;
  END IF;
END $$;

ROLLBACK;
