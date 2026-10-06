-- Migration 010: Add image_url to product_variants and ensure indexing
-- Allows variants (e.g. handmade bracelets, numbered charms) to reference specific photo board URLs

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_variants' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
