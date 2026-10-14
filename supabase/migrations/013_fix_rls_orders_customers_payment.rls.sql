-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 013
-- Tighten RLS for orders, payments, order_items, order_status_history, customers
-- Remove public read access to sensitive tables; keep insert for checkout
-- ========================================================

-- 1. CUSTOMERS
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public insert customers" ON public.customers;
  DROP POLICY IF EXISTS "Service role all customers" ON public.customers;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- Allow public to insert customers (checkout) – keep existing policy
CREATE POLICY "Public insert customers" ON public.customers FOR INSERT WITH CHECK (true);
-- Allow authenticated (admin) to read customers
CREATE POLICY "Authenticated read customers" ON public.customers FOR SELECT TO authenticated, service_role USING (true);
-- Service role all access
CREATE POLICY "Service role all customers" ON public.customers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. ORDERS
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
  DROP POLICY IF EXISTS "Public read orders" ON public.orders;
  DROP POLICY IF EXISTS "Service role all orders" ON public.orders;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- Keep public insert for checkout (customers can insert orders)
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
-- Authenticated (admin) can read
CREATE POLICY "Authenticated read orders" ON public.orders FOR SELECT TO authenticated, service_role USING (true);
-- Service role all access
CREATE POLICY "Service role all orders" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. ORDER_ITEMS
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public insert order_items" ON public.order_items;
  DROP POLICY IF EXISTS "Public read order_items" ON public.order_items;
  DROP POLICY IF EXISTS "Service role all order_items" ON public.order_items;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

CREATE POLICY "Public insert order_items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated read order_items" ON public.order_items FOR SELECT TO authenticated, service_role USING (true);
CREATE POLICY "Service role all order_items" ON public.order_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. PAYMENTS
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public insert payments" ON public.payments;
  DROP POLICY IF EXISTS "Public read payments" ON public.payments;
  DROP POLICY IF EXISTS "Service role all payments" ON public.payments;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

CREATE POLICY "Public insert payments" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated read payments" ON public.payments FOR SELECT TO authenticated, service_role USING (true);
CREATE POLICY "Service role all payments" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. ORDER_STATUS_HISTORY
ALTER TABLE IF EXISTS public.order_status_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public insert order_status_history" ON public.order_status_history;
  DROP POLICY IF EXISTS "Public read order_status_history" ON public.order_status_history;
  DROP POLICY IF EXISTS "Service role all order_status_history" ON public.order_status_history;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

CREATE POLICY "Public insert order_status_history" ON public.order_status_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated read order_status_history" ON public.order_status_history FOR SELECT TO authenticated, service_role USING (true);
CREATE POLICY "Service role all order_status_history" ON public.order_status_history FOR ALL TO service_role USING (true) WITH CHECK (true);
