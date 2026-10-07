-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 012
-- Complete RLS Hardening & Atomic Inventory RPC
-- 
-- 1. Revokes direct public access to sensitive columns (members.password_hash)
-- 2. Restricts system_configs mutations strictly to service_role
-- 3. Locks contact_messages, vouchers, and product mutations to service_role
-- 4. Creates atomic stock deduction function to eliminate overselling
-- ========================================================

-- 1. MEMBERS: Completely prevent anonymous PostgREST access to password_hash
ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read basic members" ON public.members;
  DROP POLICY IF EXISTS "Enable read access for all users" ON public.members;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- Only service_role has access to raw members table
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all members" ON public.members;
  CREATE POLICY "Service role all members" ON public.members FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

REVOKE SELECT ON public.members FROM anon, authenticated;
GRANT ALL ON public.members TO service_role;

-- 2. SYSTEM_CONFIGS: Revoke authenticated role mutation privilege
ALTER TABLE IF EXISTS public.system_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated update system_configs" ON public.system_configs;
  DROP POLICY IF EXISTS "Authenticated insert system_configs" ON public.system_configs;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.system_configs FROM anon, authenticated;
GRANT ALL ON public.system_configs TO service_role;

-- 3. CONTACT_MESSAGES: Ensure authenticated user cannot read all contact messages
ALTER TABLE IF EXISTS public.contact_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated select contact_messages" ON public.contact_messages;
  DROP POLICY IF EXISTS "Authenticated update contact_messages" ON public.contact_messages;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

REVOKE SELECT, UPDATE, DELETE ON public.contact_messages FROM anon, authenticated;
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;

-- 4. CATALOG & PROMOTIONS: Revoke authenticated mutation permissions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated all products" ON public.products;
  DROP POLICY IF EXISTS "Authenticated all variants" ON public.product_variants;
  DROP POLICY IF EXISTS "Authenticated all categories" ON public.product_categories;
  DROP POLICY IF EXISTS "Authenticated all vouchers" ON public.vouchers;
  DROP POLICY IF EXISTS "Authenticated all pickup_points" ON public.pickup_points;
  DROP POLICY IF EXISTS "Authenticated all combos" ON public.combos;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.products FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_variants FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_categories FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.vouchers FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.pickup_points FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.combos FROM authenticated, anon;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 5. ATOMIC INVENTORY DEDUCTION RPC
-- Atomically decrements variant or product stock only if stock >= quantity
CREATE OR REPLACE FUNCTION public.deduct_variant_stock_atomic(
  p_variant_id UUID,
  p_quantity INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.product_variants
  SET stock = stock - p_quantity,
      updated_at = NOW()
  WHERE variant_id = p_variant_id
    AND stock >= p_quantity;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_variant_stock_atomic(UUID, INT) TO service_role;
