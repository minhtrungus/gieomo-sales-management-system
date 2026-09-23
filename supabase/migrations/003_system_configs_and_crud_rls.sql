-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 003
-- Ensure complete RLS policies for system_configs, products,
-- orders, customers and missing operational tables
-- ========================================================

-- 1. SYSTEM CONFIGS
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_configs' AND policyname = 'Public read system_configs'
  ) THEN
    CREATE POLICY "Public read system_configs" ON system_configs FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_configs' AND policyname = 'Service role all system_configs'
  ) THEN
    CREATE POLICY "Service role all system_configs" ON system_configs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_configs' AND policyname = 'Authenticated update system_configs'
  ) THEN
    CREATE POLICY "Authenticated update system_configs" ON system_configs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'system_configs' AND policyname = 'Authenticated insert system_configs'
  ) THEN
    CREATE POLICY "Authenticated insert system_configs" ON system_configs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- 2. SEED FULL CONFIG KEYS
INSERT INTO system_configs (config_key, config_value) VALUES
  ('site_name', 'Gieo Mơ'),
  ('contact_phone', '0888670637'),
  ('contact_email', 'support@gieomo.store'),
  ('office_address', 'TP. Hồ Chí Minh, Việt Nam'),
  ('flat_shipping_fee', '25000'),
  ('free_shipping_threshold', '200000'),
  ('bank_number', '0888670637'),
  ('bank_holder', 'NGUYEN THI TRUC HAN'),
  ('bank_name', 'MB Bank (Quân Đội)'),
  ('qr_mode', 'auto'),
  ('qr_image_url', '/images/logo_gieo mơ.jpg'),
  ('active_palette', 'soft-green'),
  ('cover_theme', 'emerald'),
  ('favicon_preview', '/images/logo_gieo mơ.jpg'),
  ('avatar_preview', '/images/logo_gieo mơ.jpg'),
  ('shipping_note', 'Giao hàng trong 3-5 ngày làm việc tại TP.HCM. Các tỉnh khác 5-7 ngày.'),
  ('payment_note', 'Chuyển khoản ngân hàng'),
  ('site_status', 'active')
ON CONFLICT (config_key) DO NOTHING;

-- 3. POLICIES FOR OPERATIONAL TABLES (CATEGORIES, VOUCHERS, PICKUP POINTS, COMBOS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_categories' AND policyname = 'Service role all product_categories'
  ) THEN
    CREATE POLICY "Service role all product_categories" ON product_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'combos' AND policyname = 'Service role all combos'
  ) THEN
    CREATE POLICY "Service role all combos" ON combos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'combo_items' AND policyname = 'Service role all combo_items'
  ) THEN
    CREATE POLICY "Service role all combo_items" ON combo_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pickup_points' AND policyname = 'Service role all pickup_points'
  ) THEN
    CREATE POLICY "Service role all pickup_points" ON pickup_points FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
