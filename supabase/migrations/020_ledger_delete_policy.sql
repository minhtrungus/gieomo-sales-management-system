-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 020
-- Ledger delete-policy hotfix — Batch 2G.2 (từ audit 2G.1)
-- inventory_adjustments: snapshot + FK ON DELETE SET NULL
-- ========================================================
-- MỤC ĐÍCH
--   Audit 2G.1 xác nhận trên source (post-apply 019):
--     - FK variant_id ON DELETE RESTRICT chặn deleteProductServer:
--       variant delete fail 23503 (lỗi bị nuốt), products delete fail
--       CASCADE撞 RESTRICT → sản phẩm HALF-DELETED (combo/media đã
--       commit, variant+product còn). Admin thấy message PostgREST thô.
--     - Ledger 019 không snapshot tên/SKU variant → sau khi variant mất
--       (khi chuyển SET NULL) dòng ledger chỉ còn UUID, không đủ dữ
--       liệu kiểm toán.
--   Hotfix (KHÔNG sửa 019 — 019 đã apply theo xác nhận người dùng):
--     1. Snapshot variant_name + sku ngay lúc ghi ledger — theo pattern
--        order_items (001: item_name_snapshot/variant_name_snapshot/sku_snapshot).
--     2. Đổi FK variant_id: RESTRICT → ON DELETE SET NULL (KHÔNG CASCADE,
--        KHÔNG xóa ledger rows) — xóa variant/product được, lịch sử
--        điều chỉnh kho giữ nguyên (variant_id → NULL, snapshot vẫn còn).
--     3. Backfill snapshot từ product_variants cho dòng còn liên kết;
--        variant đã mất → giữ NULL (KHÔNG suy đoán dữ liệu).
--     4. CREATE OR REPLACE adjust_variant_stock — CÙNG signature
--        (uuid, integer, text, text, uuid), thêm snapshot vào INSERT +
--        RETURN; toàn bộ semantics 019 giữ nguyên: relative delta,
--        guard stock âm, idempotency (lock FOR UPDATE → duplicate-so-sánh
--        payload fail-closed → unique index 23505), stock+ledger cùng tx,
--        SECURITY DEFINER + search_path pinned, chỉ service_role.
--
-- RÀNG BUỘC
--   - CHẠY SAU 019 (đã apply — user xác nhận). KHÔNG sửa 019.
--   - KHÔNG đụng 001→018. KHÔNG xóa ledger rows. KHÔNG CASCADE.
--   - KHÔNG ÁP DỤNG TRONG BATCH — apply qua Supabase SQL Editor sau khi
--     user review. Test PG (A8) tự SKIP khi thiếu ATOMIC_PG_URL.
--
-- GHI CHÚ HÀNH VI IDEMPOTENCY SAU SET NULL
--   - Key đã ghi + variant còn tồn tại: duplicate như cũ (so sánh
--     variant_id/delta/reason — fail-closed nếu payload khác).
--   - Key đã ghi + variant ĐÃ BỊ XÓA (variant_id đã NULL) + retry cùng
--     key: bước (1) lock miss → outcome not_found (variant gone, stock
--     moot — biến thể không còn để điều chỉnh).
--   - Key đã ghi (variant_id NULL) + dùng lại key cho VARIANT KHÁC:
--     NULL IS DISTINCT FROM p_variant_id → RAISE
--     B2G:IDEMPOTENCY_PAYLOAD_MISMATCH → key vẫn bị khóa vĩnh viễn.
-- ========================================================

-- =========================================================
-- 1) Snapshot columns — nullable text, không default
-- =========================================================
ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS variant_name text;

ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS sku text;

-- =========================================================
-- 2) variant_id: NOT NULL → NULL-able (cho phép SET NULL)
-- =========================================================
ALTER TABLE public.inventory_adjustments
  ALTER COLUMN variant_id DROP NOT NULL;

-- =========================================================
-- 3) Thay FK: DROP RESTRICT (tên PG mặc định từ 019) → ADD SET NULL
--    cùng tên để không sót constraint cũ. KHÔNG CASCADE.
-- =========================================================
ALTER TABLE public.inventory_adjustments
  DROP CONSTRAINT IF EXISTS inventory_adjustments_variant_id_fkey;

ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT inventory_adjustments_variant_id_fkey
  FOREIGN KEY (variant_id)
  REFERENCES public.product_variants(variant_id)
  ON DELETE SET NULL;

-- =========================================================
-- 4) Backfill snapshot cho dòng còn liên kết variant.
--    Variant đã mất (variant_id NULL hoặc không còn trong
--    product_variants) → giữ nguyên NULL, KHÔNG suy đoán.
--    Giới hạn lịch sử: snapshot lấy variant.name/sku HIỆN TẠI
--    tại thời điểm backfill — 019 không lưu tên lúc điều chỉnh,
--    nên nếu admin đổi tên variant trước khi apply 020 thì snapshot
--    là tên mới nhất đã biết, không phải tên tại thời điểm adjust.
-- =========================================================
UPDATE public.inventory_adjustments ia
   SET variant_name = v.name,
       sku          = v.sku
  FROM public.product_variants v
 WHERE ia.variant_id IS NOT NULL
   AND ia.variant_id = v.variant_id
   AND ia.variant_name IS NULL
   AND ia.sku IS NULL;

-- =========================================================
-- 5) CREATE OR REPLACE adjust_variant_stock — cùng signature 019.
--    Khác 019 duy nhất: INSERT + RETURN có variant_name/sku.
--    (duplicate RETURN thêm variantName/sku — additive, không đổi
--     outcome contract; service map y như cũ.)
-- =========================================================
CREATE OR REPLACE FUNCTION public.adjust_variant_stock(
  p_variant_id       uuid,
  p_delta            integer,
  p_reason           text,
  p_idempotency_key  text,
  p_actor_member_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_variant        public.product_variants%ROWTYPE;
  v_dup            public.inventory_adjustments%ROWTYPE;
  v_new_stock      integer;
  v_reason_clean   text;
  v_key_clean      text;
  v_actor          uuid := NULL;
BEGIN
  -- (0) Validate đầu vào — fail-closed (GIỐNG 019)
  IF p_variant_id IS NULL
     OR p_delta IS NULL
     OR p_delta = 0
     OR btrim(coalesce(p_reason, '')) = ''
     OR btrim(coalesce(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'Thiếu/không hợp lệ: variant_id, delta != 0, reason, idempotency_key'
      USING ERRCODE = 'P0001', DETAIL = 'B2G:INVALID_ARGUMENTS';
  END IF;

  v_reason_clean := btrim(p_reason);
  v_key_clean    := btrim(p_idempotency_key);

  -- (1) Khóa variant — serialize các adjust cùng variant (GIỐNG 019)
  SELECT * INTO v_variant
    FROM public.product_variants
   WHERE variant_id = p_variant_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'variantId', p_variant_id);
  END IF;

  -- (2) Idempotency — key đã ghi: so sánh payload fail-closed (GIỐNG 019).
  --     Sau SET NULL: dòng đã ghi có thể variant_id NULL (variant bị xóa)
  --     → NULL IS DISTINCT FROM p_variant_id (non-null) → mismatch raise.
  SELECT * INTO v_dup
    FROM public.inventory_adjustments
   WHERE idempotency_key = v_key_clean;

  IF FOUND THEN
    IF v_dup.variant_id IS DISTINCT FROM p_variant_id
       OR v_dup.delta IS DISTINCT FROM p_delta
       OR btrim(v_dup.reason) IS DISTINCT FROM v_reason_clean THEN
      RAISE EXCEPTION 'Idempotency key "%" đã dùng cho điều chỉnh KHÁC — không tái sử dụng', v_key_clean
        USING ERRCODE = 'P0001', DETAIL = 'B2G:IDEMPOTENCY_PAYLOAD_MISMATCH';
    END IF;
    RETURN jsonb_build_object(
      'outcome',         'duplicate',
      'variantId',       v_dup.variant_id,
      'delta',           v_dup.delta,
      'stockBefore',     v_dup.stock_before,
      'stockAfter',      v_dup.stock_after,
      'reason',          v_dup.reason,
      'idempotencyKey',  v_dup.idempotency_key,
      'variantName',     v_dup.variant_name,
      'sku',             v_dup.sku,
      'createdAt',       v_dup.created_at
    );
  END IF;

  -- (3) Guard không cho stock âm — TRƯỚC khi mutate (GIỐNG 019)
  IF v_variant.stock + p_delta < 0 THEN
    RETURN jsonb_build_object(
      'outcome',         'insufficient_stock',
      'variantId',       p_variant_id,
      'stockBefore',     v_variant.stock,
      'delta',           p_delta
    );
  END IF;

  -- (4) RELATIVE delta — cùng tx với ledger insert ở (5) (GIỐNG 019)
  v_new_stock := v_variant.stock + p_delta;
  UPDATE public.product_variants
     SET stock = v_new_stock,
         updated_at = now()
   WHERE variant_id = p_variant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Điều chỉnh: biến thể % biến mất giữa chừng', p_variant_id
      USING ERRCODE = 'P0001', DETAIL = 'B2G:STOCK_ADJUST_FAILED';
  END IF;

  -- (5) Ledger — CÙNG tx. 23505 tại đây (đồng thời khác variant cùng
  --     key) → RAISE lan ra → rollback cả stock update → at-most-once.
  --     THÊM snapshot variant_name/sku (020) — lấy từ variant VỪA KHÓA.
  IF p_actor_member_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.members WHERE member_id = p_actor_member_id) THEN
    v_actor := p_actor_member_id;
  END IF;

  INSERT INTO public.inventory_adjustments
    (variant_id, delta, stock_before, stock_after, reason, idempotency_key,
     actor_member_id, variant_name, sku)
  VALUES
    (p_variant_id, p_delta, v_variant.stock, v_new_stock, v_reason_clean, v_key_clean,
     v_actor, v_variant.name, v_variant.sku);

  RETURN jsonb_build_object(
    'outcome',         'applied',
    'variantId',       p_variant_id,
    'delta',           p_delta,
    'stockBefore',     v_variant.stock,
    'stockAfter',      v_new_stock,
    'reason',          v_reason_clean,
    'idempotencyKey',  v_key_clean,
    'variantName',     v_variant.name,
    'sku',             v_variant.sku,
    'createdAt',       now()
  );
END;
$$;

-- =========================================================
-- 6) PERMISSIONS — re-apply idempotent (OR REPLACE giữ grant cũ,
--    nhưng explicit cho tự-document + fail-closed) — GIỐNG 019
-- =========================================================
REVOKE ALL ON FUNCTION public.adjust_variant_stock(uuid, integer, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_variant_stock(uuid, integer, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_variant_stock(uuid, integer, text, text, uuid) TO service_role;

-- =========================================================
-- 7) FAIL-CLOSED VERIFICATION — kiểm tra theo TÊN cột/constraint
--    cụ thể (KHÔNG đếm tổng số cột — schema có thể mở rộng hợp lệ)
-- =========================================================

-- 7a) Hai cột snapshot tồn tại, kiểu text
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'inventory_adjustments'
     AND column_name IN ('variant_name', 'sku')
     AND data_type = 'text';
  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'Cần đúng 2 cột snapshot variant_name/sku (data_type=text) trên inventory_adjustments — đang khớp %/2', v_count;
  END IF;
END $$;

-- 7b) variant_id NULL-able
DO $$
DECLARE
  v_nullable text;
BEGIN
  SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'inventory_adjustments'
     AND column_name = 'variant_id';
  IF v_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION
      'inventory_adjustments.variant_id phải NULL-able sau 020 (đang is_nullable=%)', v_nullable;
  END IF;
END $$;

-- 7c) Đúng 1 FK variant_id → product_variants, chính sách SET NULL (n), KHÔNG CASCADE (c)
DO $$
DECLARE
  v_fk_count integer;
  v_deltype  "char";
BEGIN
  SELECT COUNT(*), MIN(c.confdeltype)
    INTO v_fk_count, v_deltype
    FROM pg_constraint c
   WHERE c.conrelid   = 'public.inventory_adjustments'::regclass
     AND c.contype    = 'f'
     AND c.confrelid  = 'public.product_variants'::regclass
     AND c.conkey     = ARRAY[
          (SELECT a.attnum FROM pg_attribute a
            WHERE a.attrelid = 'public.inventory_adjustments'::regclass
              AND a.attname  = 'variant_id')
        ]::smallint[];
  IF v_fk_count <> 1 THEN
    RAISE EXCEPTION
      'Cần đúng 1 FK từ inventory_adjustments.variant_id → product_variants — đang %', v_fk_count;
  END IF;
  IF v_deltype IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION
      'FK variant_id phải ON DELETE SET NULL (confdeltype=n) — đang % (n=SET NULL, r=RESTRICT, c=CASCADE, a=NO ACTION)', v_deltype;
  END IF;
END $$;

-- 7d) Unique idempotency index vẫn tồn tại + đúng định nghĩa (GIỐNG 019)
DO $$
DECLARE
  def TEXT;
BEGIN
  SELECT indexdef INTO def
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'uq_inventory_adjustments_idempotency_key';
  IF def IS NULL THEN
    RAISE EXCEPTION
      'Index uq_inventory_adjustments_idempotency_key không tồn tại sau 020 — kiểm tra quyền/transaction';
  END IF;
  IF position('(idempotency_key)' IN def) = 0 OR position('UNIQUE' IN upper(def)) = 0 THEN
    RAISE EXCEPTION
      'Index uq_inventory_adjustments_idempotency_key có định nghĩa KHÔNG đúng mong đợi: %', def;
  END IF;
END $$;

-- 7e) Function đúng signature + SECURITY DEFINER + search_path (GIỐNG 019
--     + kiểm tra identity arguments đầy đủ)
DO $$
DECLARE
  v_prosecdef boolean;
  v_proconfig text[];
  v_args      integer;
  v_args_sig  text;
BEGIN
  SELECT p.prosecdef, p.proconfig, p.pronargs,
         pg_get_function_identity_arguments(p.oid)
    INTO v_prosecdef, v_proconfig, v_args, v_args_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'adjust_variant_stock';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Function adjust_variant_stock không tồn tại sau CREATE OR REPLACE — kiểm tra quyền/transaction';
  END IF;
  IF v_prosecdef IS NOT true THEN
    RAISE EXCEPTION 'adjust_variant_stock phải là SECURITY DEFINER';
  END IF;
  IF v_proconfig IS NULL OR NOT (v_proconfig @> ARRAY['search_path=public, pg_temp']::text[]) THEN
    RAISE EXCEPTION 'adjust_variant_stock phải SET search_path = public, pg_temp (đang: %)', v_proconfig;
  END IF;
  IF v_args <> 5 THEN
    RAISE EXCEPTION 'adjust_variant_stock phải có đúng 5 tham số (đang: %)', v_args;
  END IF;
  IF v_args_sig IS DISTINCT FROM
     'p_variant_id uuid, p_delta integer, p_reason text, p_idempotency_key text, p_actor_member_id uuid' THEN
    RAISE EXCEPTION
      'adjust_variant_stock identity arguments KHÔNG đúng signature kỳ vọng (đang: %)', v_args_sig;
  END IF;
END $$;

-- 7f) Grants: service_role EXECUTE; anon/authenticated KHÔNG có
DO $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public'
       AND routine_name  = 'adjust_variant_stock'
       AND grantee       = 'service_role'
       AND privilege_type = 'EXECUTE'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'service_role phải có EXECUTE trên adjust_variant_stock';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public'
       AND routine_name = 'adjust_variant_stock'
       AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'anon/authenticated KHÔNG được có EXECUTE trên adjust_variant_stock';
  END IF;
END $$;

-- ========================================================
-- VERIFICATION READ-ONLY (chạy tay sau khi apply):
-- 1) Snapshot columns + nullable:
--    SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='inventory_adjustments'
--       AND column_name IN ('variant_id','variant_name','sku');
-- 2) FK policy (phải là SET NULL = 'n'):
--    SELECT conname, confdeltype FROM pg_constraint
--     WHERE conrelid='public.inventory_adjustments'::regclass AND contype='f';
-- 3) Function + grants: như mục VERIFICATION của 019.
-- 4) Hành vi DELETE variant + idempotency: tests/adjustStockPg.integration.test.ts
--    (A8) với ATOMIC_PG_URL trỏ DB đã apply 019+020 — tự SKIP khi thiếu env.
--
-- ROLLBACK (chỉ khi CHƯA có dòng ledger nào bị variant xóa → variant_id chưa NULL):
--   -- CẢNH BÁO: khôi phục RESTRICT thất bại nếu tồn tại dòng variant_id NULL.
--   ALTER TABLE public.inventory_adjustments
--     DROP CONSTRAINT IF EXISTS inventory_adjustments_variant_id_fkey;
--   ALTER TABLE public.inventory_adjustments
--     ADD CONSTRAINT inventory_adjustments_variant_id_fkey
--     FOREIGN KEY (variant_id) REFERENCES public.product_variants(variant_id)
--     ON DELETE RESTRICT;
--   ALTER TABLE public.inventory_adjustments ALTER COLUMN variant_id SET NOT NULL;
--   -- Cột snapshot variant_name/sku có thể GIỮ LẠI (additive, vô hại).
-- ========================================================
