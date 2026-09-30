-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 006 (HOÀN CHỈNH & TỰ SỬA LỖI)
-- Tạo hoặc cập nhật bảng members & mật khẩu tài khoản
-- ========================================================

-- 1. Xóa hàm trigger lỗi cú pháp (CASCADE sẽ tự động xóa luôn event trigger gọi nó)
-- Tránh lỗi "ALTER TABLE public."public.members" ENABLE ROW LEVEL SECURITY"
DROP FUNCTION IF EXISTS auto_enable_rls_on_new_table() CASCADE;
DROP EVENT TRIGGER IF EXISTS auto_enable_rls_on_new_table CASCADE;
DROP EVENT TRIGGER IF EXISTS trg_auto_enable_rls CASCADE;
DROP EVENT TRIGGER IF EXISTS auto_enable_rls CASCADE;

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

-- 3. Tạo bảng members nếu chưa có (khi trigger lỗi đã bị xóa ở bước 1, CREATE TABLE sẽ chạy an toàn 100%)
CREATE TABLE IF NOT EXISTS public.members (
  member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role member_role NOT NULL DEFAULT 'btc_sale',
  status member_status NOT NULL DEFAULT 'active',
  referral_code TEXT UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Bổ sung cột password_hash nếu bảng đã tồn tại từ trước mà chưa có cột này
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 5. Tạo chỉ mục tìm kiếm siêu tốc
CREATE INDEX IF NOT EXISTS idx_members_email_lower ON public.members (lower(email));
CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members (phone);

-- 6. Kích hoạt RLS & Cấp quyền truy cập
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

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

-- 7. Khởi tạo / Cập nhật tài khoản BTC Sale (Mầm Mơ Sale)
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
