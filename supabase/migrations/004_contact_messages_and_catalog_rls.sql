-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 004
-- Create contact_messages table and grant comprehensive RLS
-- for products, variants, vouchers, pickup points, categories
-- ========================================================

-- 1. BẢNG TIN NHẮN LIÊN HỆ (CONTACT MESSAGES)
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
  reply_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);

-- Trigger auto updated_at cho contact_messages
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contact_messages_updated'
  ) THEN
    CREATE TRIGGER trg_contact_messages_updated
      BEFORE UPDATE ON contact_messages
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- RLS cho contact_messages
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'Public insert contact_messages'
  ) THEN
    CREATE POLICY "Public insert contact_messages" ON contact_messages FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'Service role all contact_messages'
  ) THEN
    CREATE POLICY "Service role all contact_messages" ON contact_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'Authenticated select contact_messages'
  ) THEN
    CREATE POLICY "Authenticated select contact_messages" ON contact_messages FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'Authenticated update contact_messages'
  ) THEN
    CREATE POLICY "Authenticated update contact_messages" ON contact_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. ĐẢM BẢO QUYỀN VÀ RLS CHO PRODUCTS & VARIANTS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Authenticated all products'
  ) THEN
    CREATE POLICY "Authenticated all products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_variants' AND policyname = 'Authenticated all variants'
  ) THEN
    CREATE POLICY "Authenticated all variants" ON product_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_categories' AND policyname = 'Authenticated all categories'
  ) THEN
    CREATE POLICY "Authenticated all categories" ON product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. ĐẢM BẢO QUYỀN VÀ RLS CHO VOUCHERS & PICKUP POINTS
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vouchers' AND policyname = 'Authenticated all vouchers'
  ) THEN
    CREATE POLICY "Authenticated all vouchers" ON vouchers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pickup_points' AND policyname = 'Authenticated all pickup_points'
  ) THEN
    CREATE POLICY "Authenticated all pickup_points" ON pickup_points FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. CẤP QUYỀN GRANTS TRÊN SCHEMA PUBLIC
GRANT ALL ON TABLE contact_messages TO service_role;
GRANT SELECT, UPDATE, INSERT, DELETE ON TABLE contact_messages TO authenticated;
GRANT INSERT ON TABLE contact_messages TO anon;
