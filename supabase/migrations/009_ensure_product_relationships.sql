-- Migration 009: Ensure Product Foreign Keys and PostgREST Schema Relationships
-- Run this in Supabase SQL Editor to guarantee all relations are fully recognized by PostgREST schema cache

-- 1. Ensure foreign key from products to product_categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'products_category_id_fkey' AND table_name = 'products'
  ) THEN
    ALTER TABLE products 
    ADD CONSTRAINT products_category_id_fkey 
    FOREIGN KEY (category_id) REFERENCES product_categories(category_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Ensure foreign key from product_variants to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'product_variants_product_id_fkey' AND table_name = 'product_variants'
  ) THEN
    ALTER TABLE product_variants 
    ADD CONSTRAINT product_variants_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Ensure foreign key from product_media to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'product_media_product_id_fkey' AND table_name = 'product_media'
  ) THEN
    ALTER TABLE product_media 
    ADD CONSTRAINT product_media_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
