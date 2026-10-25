-- ========================================================
-- GIEO MO - DATABASE MIGRATION 027
-- Close authenticated PII reads and legacy stock-RPC bypasses
-- ========================================================
-- Migrations 002/013 left authenticated SELECT policies with USING (true) on
-- order-domain tables. Migration 002 also granted default routine EXECUTE to
-- runtime roles, which left deduct_variant_stock_atomic callable outside the
-- server-side API. The application uses service-role API routes for these
-- operations; no browser/server-session client reads these tables directly.

REVOKE SELECT ON public.customers FROM anon, authenticated;
REVOKE SELECT ON public.orders FROM anon, authenticated;
REVOKE SELECT ON public.order_items FROM anon, authenticated;
REVOKE SELECT ON public.payments FROM anon, authenticated;
REVOKE SELECT ON public.order_status_history FROM anon, authenticated;

DROP POLICY IF EXISTS "Authenticated read customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated read orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated read payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated read order_status_history" ON public.order_status_history;

REVOKE ALL ON FUNCTION public.deduct_variant_stock_atomic(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_variant_stock_atomic(UUID, INTEGER)
  TO service_role;

-- Replace migration-002's permissive defaults for objects created by the
-- migration owner. Existing intentionally public catalog grants are unchanged.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table text;
  v_function regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'customers', 'orders', 'order_items', 'payments', 'order_status_history'
  ]
  LOOP
    IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION '027: runtime role retains order-domain access on %', v_table;
    END IF;
    IF NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION '027: service_role lacks required access on %', v_table;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.deduct_variant_stock_atomic(uuid,integer)'::regprocedure,
    'public.adjust_variant_stock(uuid,integer,text,text,uuid)'::regprocedure,
    'public.apply_payment_event(jsonb)'::regprocedure,
    'public.create_order_atomic(jsonb)'::regprocedure,
    'public.cancel_order_atomic(jsonb)'::regprocedure
  ]
  LOOP
    IF has_function_privilege(0::oid, v_function, 'EXECUTE')
       OR has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION '027: runtime role can execute sensitive function %', v_function;
    END IF;
    IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION '027: service_role cannot execute required function %', v_function;
    END IF;
  END LOOP;
END $$;
