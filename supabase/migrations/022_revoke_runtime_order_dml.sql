-- ========================================================
-- GIEO MO - DATABASE MIGRATION 022
-- Close direct runtime-role writes to order-domain tables
-- ========================================================
-- Migration 013 temporarily retained permissive public INSERT policies.
-- All order-domain writes must now pass through service-role API routes and
-- the atomic RPCs installed by later migrations. This migration intentionally
-- does not require create_order_atomic(jsonb): migration 021 disables the
-- legacy writer and migration 025 installs its replacement.

REVOKE INSERT, UPDATE, DELETE ON public.customers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_history FROM anon, authenticated;

DROP POLICY IF EXISTS "Public insert customers" ON public.customers;
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Public insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Public insert payments" ON public.payments;
DROP POLICY IF EXISTS "Public insert order_status_history" ON public.order_status_history;

DO $$
DECLARE
  v_table text;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'customers', 'orders', 'order_items', 'payments', 'order_status_history'
  ]
  LOOP
    IF has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', v_table), 'DELETE') THEN
      v_failures := array_append(v_failures, 'anon:' || v_table);
    END IF;

    IF has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') THEN
      v_failures := array_append(v_failures, 'authenticated:' || v_table);
    END IF;
  END LOOP;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION '022: runtime DML privileges remain: %',
      array_to_string(v_failures, ', ');
  END IF;
END $$;
