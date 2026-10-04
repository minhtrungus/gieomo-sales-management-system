-- ==========================================
-- GIEO MƠ — STORAGE BUCKETS & POLICIES MIGRATION
-- Migration 007: Setup product-media and content-media buckets
-- ==========================================

-- 1. Ensure buckets exist with public access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('product-media', 'product-media', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]),
  ('content-media', 'content-media', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[])
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[];

-- 2. Public Read Access on storage.objects
DROP POLICY IF EXISTS "Public can view product-media" ON storage.objects;
CREATE POLICY "Public can view product-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-media');

DROP POLICY IF EXISTS "Public can view content-media" ON storage.objects;
CREATE POLICY "Public can view content-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'content-media');

-- 3. Service role & Authenticated Write Access
DROP POLICY IF EXISTS "Service role has full access to product-media" ON storage.objects;
CREATE POLICY "Service role has full access to product-media"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'product-media')
WITH CHECK (bucket_id = 'product-media');

DROP POLICY IF EXISTS "Service role has full access to content-media" ON storage.objects;
CREATE POLICY "Service role has full access to content-media"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'content-media')
WITH CHECK (bucket_id = 'content-media');

-- 4. Add freeship to discount_type enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'freeship' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'discount_type')
  ) THEN
    ALTER TYPE discount_type ADD VALUE 'freeship';
  END IF;
END $$;
