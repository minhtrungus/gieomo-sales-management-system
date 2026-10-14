-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 019
-- inventory_adjustments + adjust_variant_stock — Batch 2G
-- Điều chỉnh tồn kho SERVER-AUTHORITATIVE, relative delta, idempotent
-- ========================================================
-- MỤC ĐÍCH
--   Batch 2G-IMPL (đã duyệt): đóng lỗ hổng admin ±/restock chỉ ghi
--   localStorage (post-2F stock bị server bỏ qua → drift). Điều chỉnh
--   kho của admin giờ chạy qua RPC nguyên tử trên PostgreSQL:
--     - RELATIVE delta (p_delta) — KHÔNG BAO GIỜ nhận absolute stock
--       từ client (không còn đường ghi đè lost-update như nhánh
--       stockAdjustment cũ của /api/inventory đã bị gỡ).
--     - Guard stock + delta >= 0 — không bao giờ cho stock âm.
--     - IDEMPOTENCY qua ledger inventory_adjustments + unique index:
--       key trùng + payload GIỐNG → outcome 'duplicate' (không áp
--       dụng lần hai); key trùng + payload KHÁC → RAISE fail-closed.
--     - Cập nhật stock + ghi ledger trong CÙNG MỘT transaction.
--
-- SCOPE
--   1. CREATE TABLE public.inventory_adjustments (ledger audit + idempotency).
--   2. Unique index uq_inventory_adjustments_idempotency_key.
--   3. public.adjust_variant_stock(uuid, int, text, text, uuid)
--      RETURNS jsonb — SECURITY DEFINER + search_path cố định.
--   KHÔNG đụng migration 001→018. KHÔNG ghi/đọc dữ liệu nghiệp vụ
--   có sẵn. KHÔNG tạo absolute-stock write path.
--
-- OUTCOME CONTRACT (src/lib/services/inventoryAdjustService.ts map → HTTP)
--   applied           → HTTP 200  (stockBefore/stockAfter từ server)
--   duplicate         → HTTP 200  + alreadyApplied:true (idempotent retry
--                       — values trả về từ ledger đã ghi, KHÔNG áp dụng lại)
--   not_found         → HTTP 404  (variant không tồn tại)
--   insufficient_stock→ HTTP 409  (stock + delta < 0 — KHÔNG mutate)
--   RAISE B2G:IDEMPOTENCY_PAYLOAD_MISMATCH / unique violation 23505 trên
--     uq_inventory_adjustments_idempotency_key (2 request đồng thời khác
--     variant dùng cùng key) → HTTP 409 fail-closed (tx rollback →
--     at-most-once; KHÔNG âm thầm dùng kết quả cũ)
--   RAISE B2G:INVALID_ARGUMENTS → HTTP 400
--   PGRST202 (thiếu function — chưa apply 019) → HTTP 503 retryable
--   Lỗi DB khác → HTTP 500 retryable (rollback toàn tx, không side effect)
--
-- THIẾT KẾ
--   - Khóa dòng variant bằng SELECT ... FOR UPDATE trước mọi kiểm tra
--     → serialize các adjust trên CÙNG variant. Request cùng key cùng
--     variant: request thứ hai chờ lock rồi thấy ledger → duplicate.
--   - Request cùng key khác variant (lock khác nhau): cả hai qua được
--     kiểm tra ledger tuần tự, một bên INSERT ledger thua 23505 →
--     RAISE lan ra → rollback toàn tx (stock update CHƯA commit) →
--     at-most-once vẫn giữ, route map 409.
--   - actor: chỉ ghi p_actor_member_id khi member còn tồn tại (FK
--     members) — session member đã xóa KHÔNG làm hỏng điều chỉnh.
--   - KHÔNG đụng products.stock (001 không có cột này; 017 đã kiểm
--     chứng pattern kiểm tra runtime — RPC này không cần products).
--
-- KHÔNG ÁP DỤNG TRONG BATCH NÀY — apply qua Supabase SQL Editor sau
-- khi review. Route /api/inventory action adjustStock trả 503
-- retryable cho tới khi migration này được apply.
-- ========================================================

-- =========================================================
-- 1) Ledger idempotency/audit — bảng MỚI, không data migration
-- =========================================================
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  adjustment_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id       uuid NOT NULL REFERENCES public.product_variants(variant_id) ON DELETE RESTRICT,
  delta            integer NOT NULL CHECK (delta <> 0),
  stock_before     integer NOT NULL CHECK (stock_before >= 0),
  stock_after      integer NOT NULL CHECK (stock_after >= 0),
  reason           text NOT NULL CHECK (btrim(reason) <> ''),
  idempotency_key  text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  actor_member_id  uuid REFERENCES public.members(member_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Unique index — khóa chống trùng lặp cấp DB (lớp cuối cùng).
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_adjustments_idempotency_key
  ON public.inventory_adjustments (idempotency_key);

-- Fail-closed: IF NOT EXISTS KHÔNG xác minh định nghĩa nếu object cùng
-- tên đã tồn tại sai shape → RAISE để dừng, không im lặng chấp nhận.
DO $$
DECLARE
  col_count integer;
BEGIN
  SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'inventory_adjustments'
     AND column_name IN ('adjustment_id','variant_id','delta','stock_before',
                         'stock_after','reason','idempotency_key','actor_member_id','created_at');
  IF col_count <> 9 THEN
    RAISE EXCEPTION
      'Table inventory_adjustments đã tồn tại với định nghĩa KHÔNG đúng mong đợi (%/9 cột khớp) — dừng fail-closed',
      col_count;
  END IF;
END $$;

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
      'Index uq_inventory_adjustments_idempotency_key không tồn tại sau CREATE — kiểm tra quyền/transaction';
  END IF;
  IF position('(idempotency_key)' IN def) = 0 OR position('UNIQUE' IN upper(def)) = 0 THEN
    RAISE EXCEPTION
      'Index uq_inventory_adjustments_idempotency_key có định nghĩa KHÔNG đúng mong đợi: %', def;
  END IF;
END $$;

-- =========================================================
-- 2) public.adjust_variant_stock(...)
--    SECURITY DEFINER + search_path cố định (pattern 016/017)
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
  -- (0) Validate đầu vào — fail-closed
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

  -- (1) Khóa variant — serialize các adjust cùng variant
  SELECT * INTO v_variant
    FROM public.product_variants
   WHERE variant_id = p_variant_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'variantId', p_variant_id);
  END IF;

  -- (2) Idempotency — key đã ghi: so sánh payload fail-closed
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
      'createdAt',       v_dup.created_at
    );
  END IF;

  -- (3) Guard không cho stock âm — TRƯỚC khi mutate
  IF v_variant.stock + p_delta < 0 THEN
    RETURN jsonb_build_object(
      'outcome',         'insufficient_stock',
      'variantId',       p_variant_id,
      'stockBefore',     v_variant.stock,
      'delta',           p_delta
    );
  END IF;

  -- (4) RELATIVE delta — cùng tx với ledger insert ở (5)
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
  IF p_actor_member_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.members WHERE member_id = p_actor_member_id) THEN
    v_actor := p_actor_member_id;
  END IF;

  INSERT INTO public.inventory_adjustments
    (variant_id, delta, stock_before, stock_after, reason, idempotency_key, actor_member_id)
  VALUES
    (p_variant_id, p_delta, v_variant.stock, v_new_stock, v_reason_clean, v_key_clean, v_actor);

  RETURN jsonb_build_object(
    'outcome',         'applied',
    'variantId',       p_variant_id,
    'delta',           p_delta,
    'stockBefore',     v_variant.stock,
    'stockAfter',      v_new_stock,
    'reason',          v_reason_clean,
    'idempotencyKey',  v_key_clean,
    'createdAt',       now()
  );
END;
$$;

-- Fail-closed: xác minh SECURITY DEFINER + search_path + arity sau CREATE
DO $$
DECLARE
  v_prosecdef boolean;
  v_proconfig text[];
  v_args      integer;
BEGIN
  SELECT p.prosecdef, p.proconfig, p.pronargs
    INTO v_prosecdef, v_proconfig, v_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'adjust_variant_stock';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Function adjust_variant_stock không tồn tại sau CREATE — kiểm tra quyền/transaction';
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
END $$;

-- =========================================================
-- 3) PERMISSIONS: chỉ service_role (createAdminClient) — pattern 016/017
-- =========================================================
REVOKE ALL ON FUNCTION public.adjust_variant_stock(uuid, integer, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_variant_stock(uuid, integer, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_variant_stock(uuid, integer, text, text, uuid) TO service_role;

-- ========================================================
-- VERIFICATION READ-ONLY (chạy tay sau khi apply):
-- 1) Function + SECURITY DEFINER + search_path:
--    SELECT p.proname, p.prosecdef, p.proconfig, p.pronargs
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'adjust_variant_stock';
-- 2) Grant chỉ service_role:
--    SELECT grantee, privilege_type FROM information_schema.routine_privileges
--     WHERE routine_schema = 'public' AND routine_name = 'adjust_variant_stock';
-- 3) Ledger + unique index:
--    SELECT indexname, indexdef FROM pg_indexes
--     WHERE tablename = 'inventory_adjustments';
-- 4) Hành vi + concurrency: tests/adjustStockPg.integration.test.ts
--    với ATOMIC_PG_URL (file tự SKIP khi thiếu env — trong batch 2G:
--    NOT RUN cho tới khi env được cấp).
--
-- ROLLBACK (khi chưa có điều chỉnh nào dùng nó):
--   DROP FUNCTION IF EXISTS public.adjust_variant_stock(uuid, integer, text, text, uuid);
--   DROP TABLE IF EXISTS public.inventory_adjustments;
-- ========================================================
