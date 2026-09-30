-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 006 (BULLETPROOF & SELF-HEALING)
-- Thêm cột password_hash cho bảng members & xóa bỏ event trigger lỗi cú pháp
-- ========================================================

-- 1. Xóa bỏ event trigger lỗi cú pháp "auto_enable_rls_on_new_table" trong database (nếu có)
-- Trigger cũ này có lỗi: format('ALTER TABLE %I.%I', obj.schema_name, obj.object_identity)
-- dẫn đến PostgreSQL tự sinh câu lệnh sai: ALTER TABLE public."public.members"
DO $$ BEGIN
  EXECUTE 'DROP EVENT TRIGGER IF EXISTS auto_enable_rls_on_new_table CASCADE';
  EXECUTE 'DROP EVENT TRIGGER IF EXISTS trg_auto_enable_rls CASCADE';
  EXECUTE 'DROP EVENT TRIGGER IF EXISTS auto_enable_rls CASCADE';
  EXECUTE 'DROP FUNCTION IF EXISTS auto_enable_rls_on_new_table() CASCADE';
EXCEPTION
  WHEN OTHERS THEN null;
END $$;

-- 2. Đảm bảo Enums đã được tạo
DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('admin', 'btc_sale', 'delivery_staff');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Thêm cột password_hash vào bảng members (bảng đã được tạo từ migration 001)
ALTER TABLE IF EXISTS public.members ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 4. Tạo chỉ mục tìm kiếm siêu tốc theo email và số điện thoại
CREATE INDEX IF NOT EXISTS idx_members_email_lower ON public.members (lower(email));
CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members (phone);

-- 5. Kích hoạt RLS & Cấp quyền
ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role all members" ON public.members;
  CREATE POLICY "Service role all members" ON public.members FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read basic members" ON public.members;
  CREATE POLICY "Public read basic members" ON public.members FOR SELECT USING (status = 'active');
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

GRANT ALL ON TABLE public.members TO service_role;
GRANT SELECT ON TABLE public.members TO anon, authenticated;

-- 6. Nạp / cập nhật tài khoản BTC Sale (Mầm Mơ Sale)
INSERT INTO public.members (member_id, full_name, email, phone, role, status, referral_code, password_hash)
VALUES (
  'e2b4c5d6-789a-4bc1-9def-0123456789ab',
  'Mầm Mơ (BTC Sale)',
  'sale@gieomo.store',
  '0888670637',
  'btc_sale',
  'active',
  'MAMO',
  'MamMo@123'
)
ON CONFLICT (member_id) DO UPDATE SET
  role = 'btc_sale',
  status = 'active',
  phone = '0888670637',
  email = 'sale@gieomo.store',
  password_hash = 'MamMo@123';
