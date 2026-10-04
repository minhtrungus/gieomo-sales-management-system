-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 008
-- Create product_reviews table with RLS and public policies
-- ========================================================

CREATE TABLE IF NOT EXISTS product_reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  product_slug TEXT,
  author_name TEXT NOT NULL,
  phone_masked TEXT,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  is_verified_buyer BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'hidden', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_slug ON product_reviews(product_slug);
CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created ON product_reviews(created_at DESC);

-- Enable RLS
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

-- 1. Public can read approved reviews
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_reviews' AND policyname = 'Public select approved product_reviews'
  ) THEN
    CREATE POLICY "Public select approved product_reviews" ON product_reviews
      FOR SELECT USING (status = 'approved');
  END IF;
END $$;

-- 2. Public can submit new reviews
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_reviews' AND policyname = 'Public insert product_reviews'
  ) THEN
    CREATE POLICY "Public insert product_reviews" ON product_reviews
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 3. Service role can perform all operations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_reviews' AND policyname = 'Service role all product_reviews'
  ) THEN
    CREATE POLICY "Service role all product_reviews" ON product_reviews
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Authenticated admin can perform all operations
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_reviews' AND policyname = 'Authenticated all product_reviews'
  ) THEN
    CREATE POLICY "Authenticated all product_reviews" ON product_reviews
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
