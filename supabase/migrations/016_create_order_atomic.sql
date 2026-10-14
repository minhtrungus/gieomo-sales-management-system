-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 016
-- create_order_atomic — Batch 1B: tạo đơn trong 1 transaction
-- ========================================================
-- MỤC ĐÍCH
--   Batch 1 thay vì multi-step PostgREST (mỗi call = 1 tx riêng)
--   → crash giữa chừng làm stock/voucher rò. Toàn bộ
--   claim → verify → stock → voucher → order → items → ledger
--   chạy trong MỘT transaction của PostgreSQL.
--
-- SCOPE
--   1. public.create_order_atomic(p jsonb) RETURNS jsonb
--   2. Q3: public.pricing_preview(p jsonb) + helpers — pricing math
--      dùng chung với src/lib/pricing.ts (parity test).
--   INVENTORY = CHỈ product_variants.stock (schema xác minh: public.products
--   KHÔNG có cột stock). Dòng product không biến thể (line lẻ) KHÔNG kiểm
--   tra/KHÔNG khấu trừ tồn kho (không có cột để đọc/ghi — tự tạo cột mới
--   nằm ngoài scope). THÀNH PHẦN COMBO BẮT BUỘC có variant_id: thiếu →
--   RAISE B1B:INVALID_REQUEST (KHÔNG tự chọn variant, KHÔNG bỏ qua im
--   lặng — 22 combo_items đang chờ Admin mapping sẽ bị từ chối cho tới
--   khi map xong). Kết hợp thành phần biến thể: gộp qty theo variant_id,
--   trừ điều kiện stock >= qty, RAISE nếu thiếu.
--   KHÔNG đụng migration khác. KHÔNG ghi dữ liệu. KHÔNG tạo 017.
--   KHÔNG thêm cột.
--
-- DEPLOY
--   Apply TRƯỚC khi deploy code: writer mặc định = rpc,
--   code trả lỗi rõ nếu thiếu function (KHÔNG fallback sang legacy).
--   Áp dụng qua Supabase SQL Editor (standalone), KHÔNG commit code
--   trước khi user tự review + apply file này (Q7).
--
-- LOCK ORDER (deadlock-free — mọi tx đi cùng thứ tự)
--   ledger claim -> combos -> (đọc combo_items) -> products
--   -> product_variants -> vouchers
--   mỗi bảng: ORDER BY id FOR UPDATE.
--   products được khóa để snapshot status/price/name (section 6) —
--   KHÔNG vì tồn kho (schema không có products.stock).
--   Deduct VARIANT là RELATIVE (stock = stock - qty WHERE stock >= qty)
--   với qty đã gộp theo variant_id — sửa lỗi P0-2 (absolute decrement
--   từ snapshot cũ gây lost update/oversell).
--
-- ROLLBACK / ERROR CONTRACT
--   Lỗi nghiệp vụ = RAISE ERRCODE 'P0001' + DETAIL 'B1B:*'
--   → PostgREST abort → ROLLBACK TOÀN tx (claim + mọi side effect).
--   KHÔNG có nhánh "catch rồi return jsonb" (tránh commit dở).
--   Detail codes:
--     B1B:INVALID_REQUEST    — dữ liệu không hợp lệ (client giữ key, retry)
--     B1B:STOCK_INSUFFICIENT — hết hàng (client stop + clear key)
--     B1B:VOUCHER_UNAVAILABLE— voucher không áp dụng được (Q2:
--                              KHÔNG im lặng bỏ voucher — rollback)
--     B1B:ORDER_CODE_CONFLICT— order_code trùng → TS sinh code mới (≤5)
--     B1B:ORDER_KEY_CONFLICT — order đã có idempotency_key này → TS
--                              dựng lại ledger + flag recon (read-back)
--   Lỗi DB khác (PGRST202 = thiếu function, 23505 còn lại, mạng...)
--   cũng rollback toàn tx → TS trả retryable generic.
--
-- OUTCOME
--   {outcome:'existing'}              — key đã có claim (TS replay handler)
--   {outcome:'created', order_id, order_code, final_amount}
-- ========================================================

-- --------------------------------------------------------
-- Helpers an toàn (mirror Number(x) || 0 của JS)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gieomo_num(p_text text, p_default numeric DEFAULT 0)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN p_default;
  END IF;
  RETURN btrim(p_text)::numeric;
EXCEPTION
  WHEN OTHERS THEN
    RETURN p_default;
END;
$$;

-- new Date(x) bất hợp lệ → JS coi như "không có ràng buộc" → NULL
CREATE OR REPLACE FUNCTION public._gieomo_ts(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN nullif(btrim(p_text), '')::timestamptz;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- --------------------------------------------------------
-- Q3: pricing math — port 1:1 của src/lib/pricing.ts
--   computePricing() + isVoucherApplicable()
-- Dùng bởi create_order_atomic (authoritative) và
-- pricing_preview (parity test) → test luôn chạy code production.
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gieomo_pricing(
  p_subtotal                numeric,
  p_base_shipping_fee       numeric,
  p_delivery_type           text,
  p_free_shipping_threshold numeric,
  p_voucher                 jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subtotal    numeric := COALESCE(p_subtotal, 0);
  v_threshold   numeric := COALESCE(p_free_shipping_threshold, 0);
  v_fee         numeric;
  v_discount    numeric := 0;
  v_applicable  boolean := false;
  v_dtype       text;
  v_value       numeric;
  v_cap         numeric;
  v_usage_limit numeric;
  v_times_used  numeric;
  v_min_order   numeric;
  v_start       timestamptz;
  v_end         timestamptz;
  v_final       numeric;
BEGIN
  -- ZERO_FEE_DELIVERY_TYPES = pickup_point | self_pickup | member_delivery
  IF COALESCE(p_delivery_type, 'home_delivery') IN ('pickup_point', 'self_pickup', 'member_delivery') THEN
    v_fee := 0;
  ELSE
    v_fee := COALESCE(p_base_shipping_fee, 0);
  END IF;

  IF v_threshold > 0 AND v_subtotal >= v_threshold THEN
    v_fee := 0;
  END IF;

  -- isVoucherApplicable()
  IF p_voucher IS NOT NULL AND jsonb_typeof(p_voucher) = 'object' THEN
    IF COALESCE(p_voucher->>'status', '') = 'active' THEN
      v_applicable := true;

      v_start := public._gieomo_ts(p_voucher->>'start_date');
      IF v_applicable AND v_start IS NOT NULL AND v_start > now() THEN
        v_applicable := false;
      END IF;

      v_end := public._gieomo_ts(p_voucher->>'end_date');
      IF v_applicable AND v_end IS NOT NULL AND v_end < now() THEN
        v_applicable := false;
      END IF;

      v_usage_limit := public._gieomo_num(p_voucher->>'usage_limit');
      v_times_used  := public._gieomo_num(p_voucher->>'times_used');
      IF v_applicable AND v_usage_limit > 0 AND v_times_used >= v_usage_limit THEN
        v_applicable := false;
      END IF;

      v_min_order := public._gieomo_num(p_voucher->>'min_order_value');
      IF v_applicable AND v_min_order > 0 AND v_subtotal < v_min_order THEN
        v_applicable := false;
      END IF;
    END IF;
  END IF;

  -- computePricing() voucher branch
  IF v_applicable THEN
    v_dtype := p_voucher->>'discount_type';
    IF v_dtype = 'freeship' THEN
      v_fee := 0;
    ELSIF v_dtype = 'percentage' THEN
      v_value := public._gieomo_num(p_voucher->>'discount_value');
      v_cap   := public._gieomo_num(p_voucher->>'max_discount_amount');
      -- Math.round(subtotal * clamp(percent,0,100) / 100)
      v_discount := ROUND(v_subtotal * LEAST(100, GREATEST(0, v_value)) / 100);
      IF v_cap > 0 THEN
        v_discount := LEAST(v_discount, v_cap);
      END IF;
    ELSE
      -- fixed_amount (và mọi giá trị khác — mirror nhánh else của JS)
      v_value := public._gieomo_num(p_voucher->>'discount_value');
      v_discount := LEAST(v_subtotal, GREATEST(0, v_value));
    END IF;
  END IF;

  v_final := GREATEST(0, v_subtotal - v_discount + v_fee);

  RETURN jsonb_build_object(
    'shipping_fee', v_fee,
    'voucher_discount', v_discount,
    'final_amount', v_final
  );
END;
$$;

-- --------------------------------------------------------
-- pricing_preview: wrapper đọc input jsonb (parity test / smoke)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pricing_preview(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._gieomo_pricing(
    public._gieomo_num(p->>'subtotal'),
    public._gieomo_num(p->>'base_shipping_fee'),
    p->>'delivery_type',
    public._gieomo_num(p->>'free_shipping_threshold'),
    p->'voucher'
  );
END;
$$;

-- --------------------------------------------------------
-- create_order_atomic
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uuid_re CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  -- input do TS pre-gen (xem orderService.ts createOrderViaAtomicRpc)
  v_key            text := nullif(coalesce(p->>'idempotency_key', ''), '');
  v_hash           text := nullif(coalesce(p->>'request_hash', ''), '');
  v_owner          text := nullif(coalesce(p->>'lease_owner', ''), '');
  v_proof_token    text := nullif(coalesce(p->>'proof_token', ''), '');
  v_order_id       uuid := nullif(coalesce(p->>'order_id', ''), '');
  v_order_code     text := nullif(coalesce(p->>'order_code', ''), '');
  v_customer_id    uuid := nullif(coalesce(p->>'customer_id', ''), '');
  v_seller_id      uuid := nullif(coalesce(p->>'seller_id', ''), '');
  v_shipper_id     uuid := nullif(coalesce(p->>'assigned_shipper_id', ''), '');
  v_source_type    text := coalesce(p->>'source_type', 'landing_page');
  v_introducer     text := coalesce(p->>'introducer_info', 'Trực tiếp (Website)');
  v_receiver_name  text := nullif(coalesce(p->>'receiver_name', ''), '');
  v_receiver_phone text := nullif(coalesce(p->>'receiver_phone', ''), '');
  v_delivery_raw   text := coalesce(p->>'delivery_type', 'home_delivery');
  v_address        text := p->>'shipping_address_snapshot';
  v_customer_note  text := p->>'customer_note';
  v_voucher_code   text := nullif(btrim(coalesce(p->>'voucher_code', '')), '');
  v_base_fee       numeric := public._gieomo_num(p->>'base_shipping_fee');
  v_threshold      numeric := public._gieomo_num(p->>'free_shipping_threshold');

  -- items parse
  v_items      jsonb := coalesce(p->'items', '[]'::jsonb);
  v_elem       record;
  v_ref        text;
  v_id         uuid;
  v_qty        int;
  v_num        numeric;
  v_lines      jsonb := '[]'::jsonb;
  v_line       jsonb;
  v_i          int;
  v_resolved   int := 0;
  v_combo_ids      uuid[] := ARRAY[]::uuid[];
  v_variant_ids    uuid[] := ARRAY[]::uuid[];
  v_product_ids    uuid[] := ARRAY[]::uuid[];
  v_parent_ids     uuid[] := ARRAY[]::uuid[];
  v_lock_variants  uuid[] := ARRAY[]::uuid[];
  v_lock_products  uuid[] := ARRAY[]::uuid[];

  -- locked rows (jsonb map key = uuid::text)
  v_combo_rows     jsonb := '{}'::jsonb;
  v_product_rows   jsonb := '{}'::jsonb;
  v_variant_rows   jsonb := '{}'::jsonb;
  v_combo_components jsonb := '[]'::jsonb;
  v_rec            record;
  v_obj            jsonb;
  v_map_key        text;
  v_txt            text;

  -- stock aggregation (CHỈ variant — products không có cột stock)
  v_variant_qty jsonb := '{}'::jsonb;
  v_cur         numeric;

  -- money
  v_subtotal      numeric := 0;
  v_unit          numeric;
  v_price_variant numeric;
  v_price_parent  numeric;
  v_pricing       jsonb;
  v_shipping_fee  numeric;
  v_discount      numeric := 0;
  v_final         numeric;
  v_item_rows     jsonb := '[]'::jsonb;
  v_fingerprint   jsonb := '[]'::jsonb;

  -- voucher
  v_voucher   public.vouchers%ROWTYPE;
  v_voucher_id uuid;

  -- order
  v_db_delivery  text;
  v_pid          uuid;
BEGIN
  -- ===== 0. Input bắt buộc (TS luôn gửi) =====
  IF v_order_id IS NULL OR v_order_code IS NULL OR v_customer_id IS NULL
     OR v_receiver_name IS NULL OR v_receiver_phone IS NULL THEN
    RAISE EXCEPTION 'Thiếu dữ liệu bắt buộc để tạo đơn hàng.'
      USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
  END IF;
  IF v_hash IS NULL AND v_key IS NOT NULL THEN
    RAISE EXCEPTION 'Thiếu request_hash cho đơn hàng idempotent.'
      USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
  END IF;
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Không xác thực được sản phẩm trong đơn hàng.'
      USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
  END IF;

  -- ===== 1. Ledger claim (ON CONFLICT → existing) =====
  -- lease_until: phải khớp LEASE_SECONDS = 90 trong idempotencyService.ts
  IF v_key IS NOT NULL THEN
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Thiếu lease_owner cho đơn hàng idempotent.'
        USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
    END IF;
    INSERT INTO public.order_idempotency (
      idempotency_key, request_hash, items_fingerprint, expected_item_count,
      status, lease_owner, lease_until, needs_recon
    ) VALUES (
      v_key,
      v_hash,
      coalesce(p->'items_fingerprint', '[]'::jsonb),
      public._gieomo_num(p->>'expected_item_count')::int,
      'in_progress',
      v_owner,
      now() + interval '90 seconds',
      false
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    IF NOT FOUND THEN
      -- key đã có attempt khác (kể cả tx chưa commit — PG chờ rồi trả conflict)
      RETURN jsonb_build_object('outcome', 'existing');
    END IF;
  END IF;

  -- ===== 2. Parse items (resolve ref → uuid, clamp qty 1..99) =====
  -- Mirror: JS truthiness (combo_id || variant_id || product_id),
  -- Math.max(1, Math.min(99, Math.floor(Number(qty) || 1))).
  FOR v_elem IN SELECT x.value AS elem FROM jsonb_array_elements(v_items) AS x LOOP
    v_qty := 1;
    IF v_elem.elem->>'quantity' IS NOT NULL AND btrim(v_elem.elem->>'quantity') <> '' THEN
      BEGIN
        v_num := btrim(v_elem.elem->>'quantity')::numeric;
        v_qty := LEAST(99, GREATEST(1, floor(v_num)))::int;
      EXCEPTION
        WHEN OTHERS THEN
          v_qty := 1;
      END;
    END IF;

    v_ref := v_elem.elem->>'combo_id';
    IF coalesce(v_ref, '') <> '' THEN
      SELECT c.combo_id INTO v_id
        FROM public.combos c
       WHERE c.slug = v_ref
          OR (v_ref ~ v_uuid_re AND c.combo_id::text = v_ref)
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Combo không tồn tại hoặc đã dừng kinh doanh.'
          USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
      END IF;
      v_lines := v_lines || jsonb_build_object('kind', 'combo', 'id', v_id::text, 'qty', v_qty);
      IF NOT (v_id = ANY(v_combo_ids)) THEN v_combo_ids := array_append(v_combo_ids, v_id); END IF;
      v_resolved := v_resolved + 1;

    ELSE
      v_ref := v_elem.elem->>'variant_id';
      IF coalesce(v_ref, '') <> '' THEN
        IF v_ref ~ v_uuid_re THEN
          -- UUID hợp lệ: truy vấn NGAY, kiểm tra FOUND NGAY sau câu SQL
          -- (không để lệnh trung gian làm thay đổi FOUND trước khi đọc).
          -- So sánh lowercase: uuid::text luôn lowercase, legacy PostgREST
          -- eq() cast sang kiểu uuid (không phân biệt hoa/thường) — chuỗi
          -- HOA hợp lệ cũng PHẢI khớp, không được từ chối oan.
          SELECT v.variant_id, v.product_id INTO v_id, v_pid
            FROM public.product_variants v
           WHERE v.variant_id::text = lower(v_ref);
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Một trong các phân loại sản phẩm không còn kinh doanh.'
              USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
          END IF;
        ELSE
          -- Chuỗi KHÔNG phải UUID: không ép kiểu, không truy vấn — hợp đồng
          -- hiện tại (legacy: PostgREST eq trên cột uuid lỗi → maybeSingle
          -- trả null → cùng thông báo lỗi nghiệp vụ).
          RAISE EXCEPTION 'Một trong các phân loại sản phẩm không còn kinh doanh.'
            USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
        END IF;
        v_lines := v_lines || jsonb_build_object('kind', 'variant', 'id', v_id::text, 'qty', v_qty);
        IF NOT (v_id = ANY(v_variant_ids)) THEN v_variant_ids := array_append(v_variant_ids, v_id); END IF;
        IF NOT (v_pid = ANY(v_parent_ids)) THEN v_parent_ids := array_append(v_parent_ids, v_pid); END IF;
        v_resolved := v_resolved + 1;

      ELSE
        v_ref := v_elem.elem->>'product_id';
        IF coalesce(v_ref, '') <> '' THEN
          SELECT pr.product_id INTO v_id
            FROM public.products pr
           WHERE pr.slug = v_ref
              OR (v_ref ~ v_uuid_re AND pr.product_id::text = v_ref)
           LIMIT 1;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Một trong các sản phẩm đã chọn không còn kinh doanh.'
              USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
          END IF;
          v_lines := v_lines || jsonb_build_object('kind', 'product', 'id', v_id::text, 'qty', v_qty);
          IF NOT (v_id = ANY(v_product_ids)) THEN v_product_ids := array_append(v_product_ids, v_id); END IF;
          v_resolved := v_resolved + 1;
        END IF;
        -- không có id nào → legacy bỏ qua dòng này
      END IF;
    END IF;
  END LOOP;

  IF v_resolved = 0 THEN
    RAISE EXCEPTION 'Không xác thực được sản phẩm trong đơn hàng.'
      USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
  END IF;

  -- ===== 3. LOCK combos (ORDER BY id) =====
  IF array_length(v_combo_ids, 1) IS NOT NULL THEN
    FOR v_rec IN
      SELECT c.combo_id, c.name, c.price, c.status
        FROM public.combos c
       WHERE c.combo_id = ANY(v_combo_ids)
       ORDER BY c.combo_id
       FOR UPDATE
    LOOP
      v_combo_rows := v_combo_rows || jsonb_build_object(v_rec.combo_id::text, to_jsonb(v_rec));
    END LOOP;
    IF (SELECT count(*) FROM jsonb_object_keys(v_combo_rows)) <> array_length(v_combo_ids, 1) THEN
      RAISE EXCEPTION 'Combo không tồn tại hoặc đã dừng kinh doanh.'
        USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
    END IF;

    -- Q1: đọc thành phần combo (khóa combo giữ composition không đổi)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'combo_id', ci.combo_id,
             'product_id', ci.product_id,
             'variant_id', ci.variant_id,
             'quantity', ci.quantity)), '[]'::jsonb)
      INTO v_combo_components
      FROM public.combo_items ci
     WHERE ci.combo_id = ANY(v_combo_ids);

    -- components → bộ id khóa tiếp theo.
    -- Thành phần CHƯA gán variant_id (22 combo chờ Admin mapping):
    -- KHÔNG tự chọn variant, KHÔNG bỏ qua im lặng → từ chối ngay tại đây
    -- (sau khi khóa combo, trước khi khóa variant) với lỗi nghiệp vụ rõ
    -- ràng — tx rollback toàn bộ (claim + mọi side effect).
    FOR v_rec IN SELECT c.value AS comp FROM jsonb_array_elements(v_combo_components) AS c LOOP
      IF v_rec.comp->>'variant_id' IS NULL THEN
        v_obj := v_combo_rows->(v_rec.comp->>'combo_id');
        RAISE EXCEPTION 'Combo "%s" có thành phần chưa được gán phân loại sản phẩm. Vui lòng chọn sản phẩm khác.',
          coalesce(v_obj->>'name', v_rec.comp->>'combo_id')
          USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
      END IF;
      v_id := (v_rec.comp->>'variant_id')::uuid;
      IF NOT (v_id = ANY(v_lock_variants)) THEN v_lock_variants := array_append(v_lock_variants, v_id); END IF;
    END LOOP;
  END IF;

  -- ===== 4. LOCK products (ORDER BY id): snapshot status/price/name =====
  -- (KHÔNG tồn kho — products không có cột stock)
  v_lock_products := (
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
      FROM (
        SELECT unnest(v_product_ids) AS x
        UNION
        SELECT unnest(v_parent_ids)
        UNION
        SELECT unnest(v_lock_products)
      ) u
  );
  IF array_length(v_lock_products, 1) IS NOT NULL THEN
    FOR v_rec IN
      SELECT pr.product_id, pr.name, pr.price, pr.status
        FROM public.products pr
       WHERE pr.product_id = ANY(v_lock_products)
       ORDER BY pr.product_id
       FOR UPDATE
    LOOP
      v_product_rows := v_product_rows || jsonb_build_object(v_rec.product_id::text, to_jsonb(v_rec));
    END LOOP;
  END IF;

  -- ===== 5. LOCK product_variants (ORDER BY id): direct + component =====
  v_lock_variants := (
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
      FROM (
        SELECT unnest(v_variant_ids) AS x
        UNION
        SELECT unnest(v_lock_variants)
      ) u
  );
  IF array_length(v_lock_variants, 1) IS NOT NULL THEN
    FOR v_rec IN
      SELECT v.variant_id, v.product_id, v.name, v.sku, v.price, v.stock
        FROM public.product_variants v
       WHERE v.variant_id = ANY(v_lock_variants)
       ORDER BY v.variant_id
       FOR UPDATE
    LOOP
      v_variant_rows := v_variant_rows || jsonb_build_object(v_rec.variant_id::text, to_jsonb(v_rec));
    END LOOP;
    -- variant bị xóa giữa chừng (ON DELETE SET NULL combo) → khóa thiếu
    IF (SELECT count(*) FROM jsonb_object_keys(v_variant_rows)) <> array_length(v_lock_variants, 1) THEN
      RAISE EXCEPTION 'Một trong các phân loại sản phẩm không còn kinh doanh.'
        USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
    END IF;
  END IF;

  -- ===== 6. Tính subtotal + snapshot order_items (giá từ dòng đã khóa) =====
  FOR v_i IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    v_line := v_lines->v_i;
    v_qty  := (v_line->>'qty')::int;

    IF v_line->>'kind' = 'combo' THEN
      v_obj := v_combo_rows->(v_line->>'id');
      IF v_obj IS NULL OR (v_obj->>'status') <> 'active' THEN
        RAISE EXCEPTION 'Combo không tồn tại hoặc đã dừng kinh doanh.'
          USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
      END IF;
      v_unit := public._gieomo_num(v_obj->>'price');
      v_subtotal := v_subtotal + v_unit * v_qty;
      v_item_rows := v_item_rows || jsonb_build_object(
        'product_id', null,
        'variant_id', null,
        'combo_id', v_line->>'id',
        'item_name_snapshot', v_obj->>'name',
        'variant_name_snapshot', 'Set Combo Quà Tặng',
        'sku_snapshot', 'COMBO-' || upper(left((v_line->>'id'), 6)),
        'quantity', v_qty,
        'unit_price', v_unit,
        'subtotal', v_unit * v_qty
      );

    ELSIF v_line->>'kind' = 'variant' THEN
      v_obj := v_variant_rows->(v_line->>'id');
      IF v_obj IS NULL THEN
        RAISE EXCEPTION 'Một trong các phân loại sản phẩm không còn kinh doanh.'
          USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
      END IF;
      -- legacy kiểm tra variant.products.status = 'active'
      IF v_product_rows->(v_obj->>'product_id') IS NULL
         OR (v_product_rows->(v_obj->>'product_id')->>'status') <> 'active' THEN
        RAISE EXCEPTION 'Một trong các phân loại sản phẩm không còn kinh doanh.'
          USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
      END IF;
      -- Number(variant.price) || Number(parent.price) || 0
      v_price_variant := public._gieomo_num(v_obj->>'price');
      v_price_parent  := public._gieomo_num(v_product_rows->(v_obj->>'product_id')->>'price');
      IF v_price_variant > 0 THEN
        v_unit := v_price_variant;
      ELSIF v_price_parent > 0 THEN
        v_unit := v_price_parent;
      ELSE
        v_unit := 0;
      END IF;
      v_subtotal := v_subtotal + v_unit * v_qty;
      v_item_rows := v_item_rows || jsonb_build_object(
        'product_id', v_obj->>'product_id',
        'variant_id', v_line->>'id',
        'combo_id', null,
        'item_name_snapshot', v_product_rows->(v_obj->>'product_id')->>'name',
        'variant_name_snapshot', v_obj->>'name',
        'sku_snapshot', v_obj->>'sku',
        'quantity', v_qty,
        'unit_price', v_unit,
        'subtotal', v_unit * v_qty
      );

    ELSE -- product
      v_obj := v_product_rows->(v_line->>'id');
      IF v_obj IS NULL OR (v_obj->>'status') <> 'active' THEN
        RAISE EXCEPTION 'Một trong các sản phẩm đã chọn không còn kinh doanh.'
          USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
      END IF;
      v_unit := public._gieomo_num(v_obj->>'price');
      v_subtotal := v_subtotal + v_unit * v_qty;
      v_item_rows := v_item_rows || jsonb_build_object(
        'product_id', v_line->>'id',
        'variant_id', null,
        'combo_id', null,
        'item_name_snapshot', v_obj->>'name',
        'variant_name_snapshot', null,
        'sku_snapshot', null, -- products không có sku; dòng product-only để NULL (001 nullable)
        'quantity', v_qty,
        'unit_price', v_unit,
        'subtotal', v_unit * v_qty
      );
    END IF;
  END LOOP;

  -- ===== 7. Gộp qty VARIANT theo id + validate stock variant dưới lock =====
  -- (dòng product không biến thể: không có tồn kho để validate)
  FOR v_i IN 0 .. jsonb_array_length(v_lines) - 1 LOOP
    v_line := v_lines->v_i;
    v_qty  := (v_line->>'qty')::int;

    IF v_line->>'kind' = 'variant' THEN
      v_map_key := v_line->>'id';
      v_cur := coalesce((v_variant_qty->>v_map_key)::numeric, 0) + v_qty;
      v_variant_qty := v_variant_qty || jsonb_build_object(v_map_key, v_cur);

    ELSIF v_line->>'kind' = 'product' THEN
      NULL; -- products không có cột stock — không gộp/khấu trừ

    ELSE -- combo: Q1 — gộp qty variant thành phần (combo_items × qty combo)
      FOR v_rec IN SELECT c.value AS comp FROM jsonb_array_elements(v_combo_components) AS c LOOP
        IF v_rec.comp->>'combo_id' <> (v_line->>'id') THEN CONTINUE; END IF;
        IF v_rec.comp->>'variant_id' IS NULL THEN
          -- Phòng hờ: section 3 đã RAISE trước đó — KHÔNG bỏ qua im lặng.
          v_obj := v_combo_rows->(v_line->>'id');
          RAISE EXCEPTION 'Combo "%s" có thành phần chưa được gán phân loại sản phẩm. Vui lòng chọn sản phẩm khác.',
            coalesce(v_obj->>'name', v_line->>'id')
            USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
        END IF;
        v_num := public._gieomo_num(v_rec.comp->>'quantity') * v_qty;
        v_map_key := v_rec.comp->>'variant_id';
        v_cur := coalesce((v_variant_qty->>v_map_key)::numeric, 0) + v_num;
        v_variant_qty := v_variant_qty || jsonb_build_object(v_map_key, v_cur);
      END LOOP;
    END IF;
  END LOOP;

  FOR v_map_key, v_txt IN SELECT key, value FROM jsonb_each_text(v_variant_qty) LOOP
    v_qty := v_txt::int;
    v_obj := v_variant_rows->v_map_key;
    IF v_obj IS NULL THEN
      RAISE EXCEPTION 'Một trong các phân loại sản phẩm không còn kinh doanh.'
        USING ERRCODE = 'P0001', DETAIL = 'B1B:INVALID_REQUEST';
    END IF;
    IF coalesce((v_obj->>'stock')::numeric, 0) < v_qty THEN
      RAISE EXCEPTION 'Phân loại "%s" chỉ còn %s sản phẩm trong kho (bạn đặt %s).',
        v_obj->>'name', coalesce(v_obj->>'stock', '0'), v_qty
        USING ERRCODE = 'P0001', DETAIL = 'B1B:STOCK_INSUFFICIENT';
    END IF;
  END LOOP;

  -- ===== 8. Voucher: lock + validate + reserve (Q2: lỗi → rollback toàn tx) =====
  IF v_voucher_code IS NOT NULL THEN
    SELECT * INTO v_voucher
      FROM public.vouchers
     WHERE code = upper(v_voucher_code)
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mã giảm giá "%s" không tồn tại hoặc đã ngừng áp dụng.', upper(v_voucher_code)
        USING ERRCODE = 'P0001', DETAIL = 'B1B:VOUCHER_UNAVAILABLE';
    END IF;
    IF v_voucher.status <> 'active' THEN
      RAISE EXCEPTION 'Mã giảm giá "%s" không tồn tại hoặc đã ngừng áp dụng.', upper(v_voucher_code)
        USING ERRCODE = 'P0001', DETAIL = 'B1B:VOUCHER_UNAVAILABLE';
    END IF;
    IF v_voucher.start_date IS NOT NULL AND v_voucher.start_date > now() THEN
      RAISE EXCEPTION 'Mã giảm giá "%s" chưa đến hạn áp dụng.', upper(v_voucher_code)
        USING ERRCODE = 'P0001', DETAIL = 'B1B:VOUCHER_UNAVAILABLE';
    END IF;
    IF v_voucher.end_date IS NOT NULL AND v_voucher.end_date < now() THEN
      RAISE EXCEPTION 'Mã giảm giá "%s" đã hết hạn áp dụng.', upper(v_voucher_code)
        USING ERRCODE = 'P0001', DETAIL = 'B1B:VOUCHER_UNAVAILABLE';
    END IF;
    -- usage_limit: schema 001 CHECK (usage_limit IS NULL OR usage_limit > 0)
    -- → 0 không tồn tại; NULL = không giới hạn. Khớp isVoucherApplicable
    -- (pricing.ts: usageLimit > 0 && times_used >= limit) trên mọi giá trị
    -- reachable được — parity §3 đã xác minh, không cần nhánh riêng cho 0.
    IF v_voucher.usage_limit IS NOT NULL AND v_voucher.times_used >= v_voucher.usage_limit THEN
      RAISE EXCEPTION 'Mã giảm giá "%s" đã hết lượt sử dụng.', upper(v_voucher_code)
        USING ERRCODE = 'P0001', DETAIL = 'B1B:VOUCHER_UNAVAILABLE';
    END IF;
    IF v_voucher.min_order_value > 0 AND v_subtotal < v_voucher.min_order_value THEN
      RAISE EXCEPTION 'Đơn hàng chưa đủ điều kiện áp dụng mã giảm giá "%s".', upper(v_voucher_code)
        USING ERRCODE = 'P0001', DETAIL = 'B1B:VOUCHER_UNAVAILABLE';
    END IF;

    -- reserve (đã giữ row lock + đã validate → không thể fail giới hạn)
    UPDATE public.vouchers
       SET times_used = times_used + 1
     WHERE voucher_id = v_voucher.voucher_id
       AND (usage_limit IS NULL OR times_used < usage_limit);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mã giảm giá "%s" đã hết lượt sử dụng.', upper(v_voucher_code)
        USING ERRCODE = 'P0001', DETAIL = 'B1B:VOUCHER_UNAVAILABLE';
    END IF;
    v_voucher_id := v_voucher.voucher_id;
  END IF;

  -- ===== 9. Pricing (server authoritative — Q3) =====
  v_pricing := public._gieomo_pricing(
    v_subtotal,
    v_base_fee,
    v_delivery_raw,
    v_threshold,
    CASE WHEN v_voucher_id IS NULL THEN NULL ELSE to_jsonb(v_voucher) END
  );
  v_shipping_fee := (v_pricing->>'shipping_fee')::numeric;
  v_discount     := (v_pricing->>'voucher_discount')::numeric;
  v_final        := (v_pricing->>'final_amount')::numeric;

  -- ===== 10. Deduct VARIANT RELATIVE (đã khóa → không lost update) =====
  -- Conditional + atomic: UPDATE ... WHERE stock >= qty; thiếu → RAISE
  -- → rollback toàn tx. Không có khấu trừ/khôi phục products.stock
  -- và KHÔNG có parent resync (schema không có cột đó).
  FOR v_map_key, v_txt IN SELECT key, value FROM jsonb_each_text(v_variant_qty) LOOP
    v_qty := v_txt::int;
    UPDATE public.product_variants
       SET stock = stock - v_qty, updated_at = now()
     WHERE variant_id = v_map_key::uuid
       AND stock >= v_qty;
    IF NOT FOUND THEN
      v_obj := v_variant_rows->v_map_key;
      RAISE EXCEPTION 'Phân loại "%s" vừa hết hàng do có khách đặt trước. Vui lòng chọn sản phẩm khác!',
        v_obj->>'name'
        USING ERRCODE = 'P0001', DETAIL = 'B1B:STOCK_INSUFFICIENT';
    END IF;
  END LOOP;

  -- ===== 11. Insert order (23505 → DETAIL B1B:*) =====
  IF v_delivery_raw = 'pickup_point' THEN
    v_db_delivery := 'pickup_point';
  ELSIF v_delivery_raw IN ('self_pickup', 'member_delivery') THEN
    v_db_delivery := 'self_pickup';
  ELSE
    v_db_delivery := 'home_delivery';
  END IF;

  BEGIN
    INSERT INTO public.orders (
      order_id, order_code, customer_id, seller_id, source_type, introducer_info,
      assigned_shipper_id, receiver_name, receiver_phone, delivery_type,
      shipping_address_snapshot, subtotal, shipping_fee, voucher_id, voucher_discount,
      final_amount, order_status, payment_status, delivery_status, payment_method,
      customer_note, idempotency_key
    ) VALUES (
      v_order_id, v_order_code, v_customer_id, v_seller_id,
      v_source_type::order_source, v_introducer,
      v_shipper_id, v_receiver_name, v_receiver_phone, v_db_delivery::delivery_type,
      v_address, v_subtotal, v_shipping_fee, v_voucher_id, v_discount,
      v_final, 'pending', 'pending', 'not_ready', 'banking',
      v_customer_note, v_key
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Re-RAISE → toàn tx rollback (gồm claim) — KHÔNG commit dở.
      -- Phân biệt deterministic (KHÔNG dựa SQLERRM — tên constraint có thể
      -- đổi giữa môi trường): row orders đã commit cùng key của ta →
      -- ORDER_KEY_CONFLICT (mirror legacy: check idempotency_key TRƯỚC
      -- order_code); ngược lại (order_code / order_id) → ORDER_CODE_CONFLICT
      -- (TS sinh id + code mới khi retry → tự phục hồi).
      IF v_key IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.orders o WHERE o.idempotency_key = v_key) THEN
        RAISE EXCEPTION 'Đơn hàng đã tồn tại với idempotency key này.'
          USING ERRCODE = 'P0001', DETAIL = 'B1B:ORDER_KEY_CONFLICT';
      END IF;
      RAISE EXCEPTION 'Mã đơn hàng đã tồn tại.'
        USING ERRCODE = 'P0001', DETAIL = 'B1B:ORDER_CODE_CONFLICT';
  END;

  -- ===== 12. Insert order_items (1 dòng/line như legacy, combo = 1 dòng) =====
  INSERT INTO public.order_items (
    order_id, product_id, variant_id, combo_id, item_name_snapshot,
    variant_name_snapshot, sku_snapshot, quantity, unit_price, subtotal
  )
  SELECT v_order_id,
         nullif(e.value->>'product_id', '')::uuid,
         nullif(e.value->>'variant_id', '')::uuid,
         nullif(e.value->>'combo_id', '')::uuid,
         e.value->>'item_name_snapshot',
         nullif(e.value->>'variant_name_snapshot', ''),
         nullif(e.value->>'sku_snapshot', ''),
         (e.value->>'quantity')::int,
         (e.value->>'unit_price')::numeric,
         (e.value->>'subtotal')::numeric
    FROM jsonb_array_elements(v_item_rows) AS e(value);

  -- ===== 13. Status history (legacy: lỗi bị nuốt — không phá đơn) =====
  BEGIN
    INSERT INTO public.order_status_history (order_id, status_type, from_status, to_status, note)
    VALUES (v_order_id, 'order', NULL, 'pending', 'Đơn hàng được khởi tạo từ website');
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  -- ===== 14. Ledger completed + response_json (proofToken pre-gen) =====
  -- Fingerprint F0: build từ dòng đã resolve (uuid + giá đã khóa) — TS chỉ
  -- truyền ref thô (slug được) nên expected/fingerprint phải ghi tại đây,
  -- khớp order_items để replayVerifyOrder không recon oan.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'kind', CASE WHEN e.v->>'combo_id' IS NOT NULL THEN 'combo'
                        WHEN e.v->>'variant_id' IS NOT NULL THEN 'variant'
                        ELSE 'product' END,
           'id', coalesce(e.v->>'combo_id', e.v->>'variant_id', e.v->>'product_id'),
           'quantity', (e.v->>'quantity')::int,
           'sku_snapshot', e.v->>'sku_snapshot',
           'unit_price', (e.v->>'unit_price')::numeric
         )), '[]'::jsonb)
    INTO v_fingerprint
    FROM jsonb_array_elements(v_item_rows) AS e(v);

  IF v_key IS NOT NULL THEN
    UPDATE public.order_idempotency
       SET status = 'completed',
           order_id = v_order_id,
           items_fingerprint = v_fingerprint,
           expected_item_count = jsonb_array_length(v_item_rows),
           response_json = jsonb_build_object(
             'success', true,
             'orderId', v_order_id,
             'orderCode', v_order_code,
             'finalAmount', v_final,
             'proofToken', v_proof_token
           ),
           lease_owner = NULL,
           lease_until = NULL,
           completed_at = now(),
           updated_at = now()
     WHERE idempotency_key = v_key
       AND status = 'in_progress'
       AND lease_owner = v_owner;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không hoàn tất được ledger idempotency.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'created',
    'order_id', v_order_id,
    'order_code', v_order_code,
    'final_amount', v_final
  );
END;
$$;

-- --------------------------------------------------------
-- PERMISSIONS: chỉ service_role (createAdminClient)
-- --------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_preview(jsonb)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._gieomo_pricing(numeric, numeric, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._gieomo_num(text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._gieomo_ts(text)           FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pricing_preview(jsonb)    TO service_role;
GRANT EXECUTE ON FUNCTION public._gieomo_pricing(numeric, numeric, text, numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._gieomo_num(text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public._gieomo_ts(text)           TO service_role;

-- ========================================================
-- VERIFICATION (READ-ONLY) — chạy SAU khi apply
-- ========================================================
-- 1) Function đã tồn tại + SECURITY DEFINER:
-- SELECT p.proname, p.prosecdef, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('create_order_atomic', 'pricing_preview', '_gieomo_pricing');
--
-- 2) Grant chỉ service_role:
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--  WHERE routine_schema = 'public' AND routine_name = 'create_order_atomic';
--
-- 3) Smoke pricing (không đụng dữ liệu nghiệp vụ):
-- SELECT public.pricing_preview(
--   '{"subtotal":600000,"base_shipping_fee":25000,
--     "delivery_type":"home_delivery","free_shipping_threshold":500000}'::jsonb);
-- Kỳ vọng: shipping_fee=0 (subtotal 600000 >= threshold 500000),
--          voucher_discount=0, final_amount=600000
--
-- 4) Q1 (combo component deduct) + concurrency: chạy bằng
--    tests/atomicOrderPg.integration.test.ts với ATOMIC_PG_URL
--    (file tự SKIP khi thiếu env — hiện NOT RUN).
--
-- ROLLBACK nếu cần (trước khi có đơn nào dùng nó):
--   DROP FUNCTION IF EXISTS public.create_order_atomic(jsonb);
--   DROP FUNCTION IF EXISTS public.pricing_preview(jsonb);
--   DROP FUNCTION IF EXISTS public._gieomo_pricing(numeric, numeric, text, numeric, jsonb);
--   DROP FUNCTION IF EXISTS public._gieomo_num(text, numeric);
--   DROP FUNCTION IF EXISTS public._gieomo_ts(text);
-- ========================================================
