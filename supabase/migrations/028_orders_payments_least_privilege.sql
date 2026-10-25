-- Close the complete runtime-role privilege surface on order-domain data.
-- This migration changes ACL/policies only; it does not mutate business rows.

REVOKE ALL ON public.customers FROM anon, authenticated;
REVOKE ALL ON public.orders FROM anon, authenticated;
REVOKE ALL ON public.order_items FROM anon, authenticated;
REVOKE ALL ON public.payments FROM anon, authenticated;
REVOKE ALL ON public.order_status_history FROM anon, authenticated;

DO $$
DECLARE
  v_column record;
BEGIN
  FOR v_column IN
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('orders', 'payments')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON public.%I FROM anon, authenticated',
      v_column.column_name,
      v_column.table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

DROP POLICY IF EXISTS "Public insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated read customers" ON public.customers;
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated read orders" ON public.orders;
DROP POLICY IF EXISTS "Public insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Public insert payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated read payments" ON public.payments;
DROP POLICY IF EXISTS "Public insert order_status_history" ON public.order_status_history;
DROP POLICY IF EXISTS "Authenticated read order_status_history" ON public.order_status_history;

DO $$
DECLARE
  v_table text;
  v_privilege text;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'customers', 'orders', 'order_items', 'payments', 'order_status_history'
  ] LOOP
    FOREACH v_privilege IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] LOOP
      IF has_table_privilege('anon', format('public.%I', v_table), v_privilege) THEN
        v_failures := array_append(v_failures, 'anon:' || v_table || ':' || v_privilege);
      END IF;
      IF has_table_privilege('authenticated', format('public.%I', v_table), v_privilege) THEN
        v_failures := array_append(v_failures, 'authenticated:' || v_table || ':' || v_privilege);
      END IF;
    END LOOP;
  END LOOP;
  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION '028: runtime table privileges remain: %', array_to_string(v_failures, ', ');
  END IF;
END $$;

DO $$
DECLARE
  v_column record;
  v_role text;
  v_privilege text;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  FOR v_column IN
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('orders', 'payments')
  LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
        IF has_column_privilege(
          v_role,
          format('public.%I', v_column.table_name),
          v_column.column_name,
          v_privilege
        ) THEN
          v_failures := array_append(
            v_failures,
            v_role || ':' || v_column.table_name || '.' || v_column.column_name || ':' || v_privilege
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION '028: runtime column privileges remain: %', array_to_string(v_failures, ', ');
  END IF;
END $$;

DO $$
DECLARE
  v_role text;
  v_privilege text;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
      IF has_sequence_privilege(v_role, 'public.order_code_seq', v_privilege) THEN
        v_failures := array_append(v_failures, v_role || ':order_code_seq:' || v_privilege);
      END IF;
    END LOOP;
  END LOOP;
  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION '028: runtime sequence privileges remain: %', array_to_string(v_failures, ', ');
  END IF;
END $$;

DO $$
DECLARE
  v_table text;
  v_privilege text;
  v_failures text[] := ARRAY[]::text[];
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('customers', 'orders', 'order_items', 'payments', 'order_status_history')
       AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  ) THEN
    RAISE EXCEPTION '028: permissive runtime policy remains on an order-domain table';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('customers', 'orders', 'order_items', 'payments', 'order_status_history')
       AND NOT c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '028: RLS is disabled on an order-domain table';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['orders', 'payments'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', v_table), v_privilege) THEN
        v_failures := array_append(v_failures, 'service_role:' || v_table || ':' || v_privilege);
      END IF;
    END LOOP;
  END LOOP;
  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION '028: service_role lost order-domain access: %', array_to_string(v_failures, ', ');
  END IF;
END $$;
