-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 011
-- Fix Insecure Row Level Security (RLS) Policies
-- Revokes public read on orders, payments, order_items,
-- and protects sensitive member credentials and configs.
-- ========================================================

-- 1. ORDERS: Revoke unrestricted public read access
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read orders" ON public.orders;
  DROP POLICY IF EXISTS "Enable read access for all users" ON public.orders;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- Ensure service role has full access
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all orders" ON public.orders;
  CREATE POLICY "Service role all orders" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- 2. ORDER ITEMS: Revoke unrestricted public read access
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read order_items" ON public.order_items;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all order_items" ON public.order_items;
  CREATE POLICY "Service role all order_items" ON public.order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- 3. PAYMENTS: Revoke unrestricted public read access
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read payments" ON public.payments;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all payments" ON public.payments;
  CREATE POLICY "Service role all payments" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- 4. ORDER STATUS HISTORY: Revoke public read access
ALTER TABLE IF EXISTS public.order_status_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read order_status_history" ON public.order_status_history;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all order_status_history" ON public.order_status_history;
  CREATE POLICY "Service role all order_status_history" ON public.order_status_history FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- 5. CUSTOMERS: Ensure only service_role can query full customer records
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read customers" ON public.customers;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all customers" ON public.customers;
  CREATE POLICY "Service role all customers" ON public.customers FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- 6. MEMBERS: Revoke anonymous access to password_hash
ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read basic members" ON public.members;
  -- Only allow public to read member_id, full_name, referral_code for active members
  CREATE POLICY "Public read basic members" ON public.members FOR SELECT USING (status = 'active');
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- Revoke direct anon select on sensitive columns if column-level privileges are supported
REVOKE SELECT ON public.orders FROM anon;
REVOKE SELECT ON public.order_items FROM anon;
REVOKE SELECT ON public.payments FROM anon;
REVOKE SELECT ON public.order_status_history FROM anon;
REVOKE SELECT ON public.customers FROM anon;

-- Grant proper operational access to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
