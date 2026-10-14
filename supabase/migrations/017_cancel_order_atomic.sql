-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 017
-- cancel_order_atomic — Batch 2A-1: hủy đơn trong 1 transaction
-- ========================================================
-- MỤC ĐÍCH
--   Triển khai Phương án 1 (đã duyệt ở Batch 2A-PRE): toàn bộ
--   hủy đơn → flip trạng thái → hoàn kho (relative) → giải phóng
--   voucher → cờ audit → order_status_history nằm trong CÙNG một
--   transaction của PostgreSQL. Khóa đơn bằng SELECT ... FOR UPDATE
--   → idempotency: chỉ request chuyển trạng thái LẦN ĐẦU mới có
--   side effect; request lặp trả already_cancelled (không side effect).
--
-- SCOPE
--   1. ALTER public.orders: thêm stock_restored_at, voucher_released_at
--      (TIMESTAMPTZ NULL — chỉ ghi khi bước tương ứng hoàn tất an toàn).
--   2. public.cancel_order_atomic(p_order_id uuid, p_order_code text,
--      p_reason text, p_changed_by uuid) RETURNS jsonb
--   KHÔNG đụng migration 001/015/016. KHÔNG ghi dữ liệu nghiệp vụ.
--   KHÔNG thêm fault injection (GUC) — test rollback dùng chính nhánh
--   RAISE tự nhiên B2A1:VOUCHER_RELEASE_UNSAFE (xem
--   tests/cancelOrderPg.integration.test.ts).
--
-- OUTCOME CONTRACT (src/app/api/orders/route.ts map → HTTP)
--   cancelled         → 200 (kèm effects: stock/voucher/unrestoredLines/
--                        notes/needsRecon — JSON từ function)
--   already_cancelled → 200 + alreadyCancelled:true (idempotent)
--   not_found         → 404 (KHÔNG giả lập thành công)
--   not_cancellable   → 409 + currentStatus + allowedFrom
--                       (chỉ cho phép từ pending/confirmed/processing
--                       — khớp ORDER_STATUS_TRANSITIONS constants)
--   RAISE P0001 B2A1:VOUCHER_RELEASE_UNSAFE → rollback toàn tx
--                       → route 500 retryable:false + needsRecon:true
--   Lỗi DB khác (PGRST202 thiếu function, mạng...) → rollback toàn tx
--                       → route 500 retryable:true
--
-- THIẾT KẾ (chi tiết trong báo cáo Batch 2A-PRE)
--   - Hoàn kho: SUM(quantity) GROUP BY (variant_id, product_id, combo_id)
--     (tránh cộng sai khi cùng variant nhiều dòng), RELATIVE
--     stock = stock + qty — KHÔNG read-modify-write snapshot.
--   - COMBO: lúc tạo đơn KHÔNG trừ kho combo (legacy orderService +
--     016) → hủy KHÔNG hoàn combo, chỉ ghi note 'combo_not_tracked:*'.
--   - products.stock: KHÔNG giả định tồn tại (001 không có cột này).
--     Chạy lúc runtime kiểm tra information_schema; thiếu cột → KHÔNG
--     đụng products, trả unrestored_lines
--     reason='products_stock_unverified' + needsRecon=true và KHÔNG
--     đặt stock_restored_at (hàng đợi đối soát).
--   - Dòng cả 3 id (variant/product/combo) đều NULL →
--     reason='line_unresolvable' + needsRecon=true (KHÔNG bịa nguồn).
--   - Voucher: RELATIVE times_used = times_used - 1 WHERE times_used > 0
--     (CHECK >= 0 chặn âm). voucher_id NULL (kể cả voucher đã bị xóa —
--     FK ON DELETE SET NULL) → outcome no_voucher. UPDATE khớp 0 dòng
--     (times_used = 0 — không chứng minh được còn slot để trả) →
--     RAISE B2A1:VOUCHER_RELEASE_UNSAFE: rollback, KHÔNG âm thầm bỏ qua,
--     KHÔNG tự sửa voucher lịch sử → đối soát thủ công.
--   - History: changed_by chỉ ghi khi p_changed_by là member còn tồn
--     tại (FK members) — session của member đã xóa KHÔNG làm hỏng
--     cancel; khi bị bỏ trống thì thêm note 'changed_by_member_missing'.
--   - Cờ audit ghi CÙNG tx: stock_restored_at chỉ set khi
--     unrestoredLines rỗng (bước hoàn kho hoàn tất sạch);
--     voucher_released_at chỉ set khi thực sự release được 1 slot.
--
-- DEPLOY
--   Apply qua Supabase SQL Editor (standalone), KHÔNG commit code trước
--   khi user tự review + apply file này. CHƯA chạy trên môi trường nào
--   trong batch 2A-1. Sau khi apply, route cancel mới hoạt động đầy đủ
--   (thiếu function → PostgREST lỗi → route 500 retryable:true).
--
-- LOCK ORDER
--   orders (FOR UPDATE) -> order_items -> product_variants -> products
--   -> vouchers -> order_status_history.
--   Create path (016) khóa variants/vouchers TRƯỚC khi INSERT đơn mới
--   (row mới — không phải đơn hiện hữu) → không tạo cycle deadlock.
-- ========================================================

-- =========================================================
-- 1) Cờ audit trên public.orders (nullable, chỉ ghi trong tx hủy)
-- =========================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS voucher_released_at TIMESTAMPTZ NULL;

-- =========================================================
-- 2) public.cancel_order_atomic(...)
--    SECURITY DEFINER + search_path cố định (pattern 016)
-- =========================================================
CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
  p_order_id    uuid,
  p_order_code  text,
  p_reason      text,
  p_changed_by  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order              public.orders%ROWTYPE;
  v_has_products_stock boolean;
  v_actor              uuid := NULL;
  v_cancelled_at       timestamptz;
  v_restored_lines     integer := 0;
  v_restored_variants  jsonb := '[]'::jsonb;
  v_unrestored         jsonb := '[]'::jsonb;
  v_notes              text[] := ARRAY[]::text[];
  v_parent_products    uuid[] := ARRAY[]::uuid[];
  v_voucher_outcome    text := 'no_voucher';
  v_needs_recon        boolean := false;
  v_line               record;
  v_pid                uuid;
  v_total              numeric;
BEGIN
  -- (0) Tham số đầu vào
  IF p_order_id IS NULL AND (p_order_code IS NULL OR btrim(p_order_code) = '') THEN
    RAISE EXCEPTION 'Thiếu order id hoặc order code'
      USING ERRCODE = 'P0001', DETAIL = 'B2A1:INVALID_ARGUMENTS';
  END IF;

  -- (1) Khóa đơn (FOR UPDATE) — serialize các request hủy đồng thời
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE order_id = p_order_id FOR UPDATE;
  ELSE
    SELECT * INTO v_order FROM public.orders
     WHERE order_code = upper(btrim(p_order_code)) FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  -- (2) Idempotency — đơn đã hủy: không side effect lần hai
  IF v_order.order_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'outcome',          'already_cancelled',
      'orderId',          v_order.order_id,
      'orderCode',        v_order.order_code,
      'cancelledAt',      v_order.cancelled_at,
      'stockRestoredAt',  v_order.stock_restored_at,
      'voucherReleasedAt', v_order.voucher_released_at
    );
  END IF;

  -- (3) State machine — chỉ hủy được từ pending/confirmed/processing
  IF v_order.order_status NOT IN ('pending', 'confirmed', 'processing') THEN
    RETURN jsonb_build_object(
      'outcome',       'not_cancellable',
      'currentStatus', v_order.order_status::text,
      'allowedFrom',   jsonb_build_array('pending', 'confirmed', 'processing')
    );
  END IF;

  v_cancelled_at := now();

  -- (4) Flip trạng thái (updated_at: trigger trg_orders_updated)
  UPDATE public.orders
     SET order_status = 'cancelled',
         cancelled_at = v_cancelled_at,
         cancel_reason = COALESCE(nullif(btrim(coalesce(p_reason, '')), ''), cancel_reason)
   WHERE order_id = v_order.order_id;

  -- (5) Hoàn kho RELATIVE — tổng hợp theo dòng order_items
  --     Không giả định products.stock: kiểm tra cột lúc runtime.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock'
  ) INTO v_has_products_stock;

  FOR v_line IN
    SELECT variant_id, product_id, combo_id,
           SUM(quantity)::int AS qty,
           MIN(item_name_snapshot) AS item_name
      FROM public.order_items
     WHERE order_id = v_order.order_id
     GROUP BY variant_id, product_id, combo_id
     ORDER BY variant_id NULLS LAST, combo_id NULLS LAST, product_id NULLS LAST
  LOOP
    IF v_line.combo_id IS NOT NULL THEN
      -- Combo chưa từng trừ kho (legacy + 016) → không hoàn, ghi rõ
      v_notes := v_notes || ('combo_not_tracked: ' || COALESCE(v_line.item_name, v_line.combo_id::text));

    ELSIF v_line.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
         SET stock = stock + v_line.qty
       WHERE variant_id = v_line.variant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Hoàn kho: không tìm thấy biến thể %', v_line.variant_id
          USING ERRCODE = 'P0001', DETAIL = 'B2A1:STOCK_RESTORE_FAILED';
      END IF;
      v_restored_lines := v_restored_lines + 1;
      v_restored_variants := v_restored_variants || jsonb_build_array(jsonb_build_object(
        'variantId', v_line.variant_id, 'quantity', v_line.qty));
      IF v_line.product_id IS NOT NULL THEN
        v_parent_products := array_append(v_parent_products, v_line.product_id);
      END IF;

    ELSIF v_line.product_id IS NOT NULL THEN
      IF v_has_products_stock THEN
        UPDATE public.products
           SET stock = stock + v_line.qty
         WHERE product_id = v_line.product_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Hoàn kho: không tìm thấy sản phẩm %', v_line.product_id
            USING ERRCODE = 'P0001', DETAIL = 'B2A1:STOCK_RESTORE_FAILED';
        END IF;
        v_restored_lines := v_restored_lines + 1;
      ELSE
        -- Cột KHÔNG tồn tại → không đụng products, báo đối soát
        v_unrestored := v_unrestored || jsonb_build_array(jsonb_build_object(
          'reason',   'products_stock_unverified',
          'productId', v_line.product_id,
          'item',     v_line.item_name,
          'quantity', v_line.qty));
        v_needs_recon := true;
      END IF;

    ELSE
      -- Cả 3 id đều NULL → không xác định được nguồn tồn kho — KHÔNG bịa
      v_unrestored := v_unrestored || jsonb_build_array(jsonb_build_object(
        'reason',   'line_unresolvable',
        'item',     v_line.item_name,
        'quantity', v_line.qty));
      v_needs_recon := true;
    END IF;
  END LOOP;

  -- Đồng bộ products.stock = TỔNG biến thể (mirror legacy orderService:968-977)
  -- — chỉ khi cột tồn tại. FK biến thể→sản phẩm đảm bảo dòng này tìm thấy;
  -- không thấy = hỏng toàn vẹn → RAISE (rollback toàn tx).
  IF v_has_products_stock THEN
    FOR v_pid IN SELECT DISTINCT t.p FROM unnest(v_parent_products) AS t(p) LOOP
      SELECT COALESCE(SUM(stock), 0) INTO v_total
        FROM public.product_variants
       WHERE product_id = v_pid;
      UPDATE public.products
         SET stock = v_total
       WHERE product_id = v_pid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Hoàn kho: không tìm thấy sản phẩm cha %', v_pid
          USING ERRCODE = 'P0001', DETAIL = 'B2A1:STOCK_RESTORE_FAILED';
      END IF;
    END LOOP;
  END IF;

  -- (6) Giải phóng voucher — CÙNG tx, RELATIVE, không âm
  IF v_order.voucher_id IS NOT NULL THEN
    UPDATE public.vouchers
       SET times_used = times_used - 1
     WHERE voucher_id = v_order.voucher_id
       AND times_used > 0;
    IF FOUND THEN
      v_voucher_outcome := 'released';
    ELSE
      -- times_used = 0: không chứng minh được còn slot để trả
      -- → KHÔNG âm thầm bỏ qua, KHÔNG tự sửa voucher lịch sử:
      -- RAISE để rollback toàn bộ → đối soát thủ công.
      RAISE EXCEPTION 'Không thể giải phóng voucher slot an toàn (times_used đã = 0) cho đơn %',
        v_order.order_code
        USING ERRCODE = 'P0001', DETAIL = 'B2A1:VOUCHER_RELEASE_UNSAFE',
        HINT = 'Đối soát vouchers.times_used với đơn hàng rồi hủy lại';
    END IF;
  END IF;

  -- (7) order_status_history — FK members: chỉ ghi actor còn tồn tại
  IF p_changed_by IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.members WHERE member_id = p_changed_by) THEN
    v_actor := p_changed_by;
  ELSIF p_changed_by IS NOT NULL THEN
    v_notes := v_notes || 'changed_by_member_missing';
  END IF;

  INSERT INTO public.order_status_history
    (order_id, status_type, from_status, to_status, note, changed_by_member_id)
  VALUES (
    v_order.order_id,
    'order',
    v_order.order_status::text,
    'cancelled',
    'Hủy đơn' || CASE WHEN p_reason IS NULL OR btrim(p_reason) = '' THEN '' ELSE ': ' || btrim(p_reason) END,
    v_actor
  );

  -- (8) Cờ audit — ghi CÙNG tx (không phải cơ chế chống trùng lặp;
  --     chống trùng lặp = FOR UPDATE + nhánh already_cancelled)
  UPDATE public.orders
     SET stock_restored_at = CASE WHEN jsonb_array_length(v_unrestored) = 0 THEN v_cancelled_at ELSE NULL END,
         voucher_released_at = CASE WHEN v_voucher_outcome = 'released' THEN v_cancelled_at ELSE NULL END
   WHERE order_id = v_order.order_id;

  RETURN jsonb_build_object(
    'outcome',    'cancelled',
    'orderId',    v_order.order_id,
    'orderCode',  v_order.order_code,
    'cancelledAt', v_cancelled_at,
    'stock', jsonb_build_object(
      'restoredLines', v_restored_lines,
      'variants',      v_restored_variants),
    'voucher', jsonb_build_object(
      'outcome',   v_voucher_outcome,
      'voucherId', v_order.voucher_id),
    'unrestoredLines', v_unrestored,
    'notes',     to_jsonb(v_notes),
    'needsRecon', v_needs_recon
  );
END;
$$;

-- =========================================================
-- PERMISSIONS: chỉ service_role (createAdminClient) — pattern 016
-- =========================================================
REVOKE ALL ON FUNCTION public.cancel_order_atomic(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order_atomic(uuid, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(uuid, text, text, uuid) TO service_role;

-- ========================================================
-- VERIFICATION (READ-ONLY) — chạy SAU khi apply
-- ========================================================
-- 1) Function tồn tại + SECURITY DEFINER + search_path cố định:
-- SELECT p.proname, p.prosecdef, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'cancel_order_atomic';
--
-- 2) Grant chỉ service_role (không có anon/authenticated/public):
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--  WHERE routine_schema = 'public' AND routine_name = 'cancel_order_atomic';
--
-- 3) Cột audit mới:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'orders'
--    AND column_name IN ('stock_restored_at', 'voucher_released_at');
--
-- 4) Function behavior + concurrency: chạy bằng
--    tests/cancelOrderPg.integration.test.ts với ATOMIC_PG_URL
--    (file tự SKIP khi thiếu env — trong batch 2A-1: NOT RUN).
--
-- ROLLBACK nếu cần (trước khi có đơn nào dùng nó):
--   DROP FUNCTION IF EXISTS public.cancel_order_atomic(uuid, text, text, uuid);
--   ALTER TABLE public.orders
--     DROP COLUMN IF EXISTS stock_restored_at,
--     DROP COLUMN IF EXISTS voucher_released_at;
-- ========================================================
