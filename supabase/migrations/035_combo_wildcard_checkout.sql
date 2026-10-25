-- ========================================================
-- GIEO MO - DATABASE MIGRATION 035
-- Wildcard combo checkout allocation (owner-approved semantics)
-- ========================================================
-- Owner-approved meaning: combo_items.variant_id IS NULL = every ACTIVE
-- variant of that product, not an unconfigured component. Migration 031
-- made that definition persistable; migration 025's checkout still raised
-- D3:COMBO_COMPONENTS_UNMAPPED for such components and migration 026's
-- provenance wrapper could not persist a NULL variant_id reservation row.
--
-- This migration replaces both functions:
--   create_order_atomic_v25 - expands wildcard requirements in one sorted
--     allocation pass that reuses the owner-approved availability math
--     (per-variant explicit caps plus a pooled remainder) and returns the
--     exact deducted stock lines in its result, so no variant mapping is
--     ever re-inferred from mutable catalog state.
--   create_order_atomic - now derives order_inventory_reservations from
--     those exact stock lines instead of re-deriving them from the
--     volatile request/combo_items join, keeping cancellation restores
--     per-variant and exact for allocated combos.
--
-- Fail-closed invariants kept: stock stays INT NOT NULL, deduction is
-- re-checked per variant, explicit-plus-wildcard demand for one product
-- aggregates only once, allocation order is stable (variant_id ASC), and
-- replayed idempotent creations keep their original provenance untouched.
-- ========================================================
CREATE OR REPLACE FUNCTION public.create_order_atomic_v25(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope             TEXT := COALESCE(p->>'scope_key', '');
  v_key               UUID;
  v_hash              TEXT := lower(COALESCE(p->>'request_hash', ''));
  v_existing          public.order_idempotency%ROWTYPE;
  v_existing_order    public.orders%ROWTYPE;
  v_items             JSONB := p->'items';
  v_item              JSONB;
  v_qty               INT;
  v_identity_count    INT;
  v_product           public.products%ROWTYPE;
  v_variant           public.product_variants%ROWTYPE;
  v_combo             public.combos%ROWTYPE;
  v_component         RECORD;
  v_stock             RECORD;
  v_order_items       JSONB := '[]'::jsonb;
  v_stock_lines       JSONB := '[]'::jsonb;
  -- Wildcard combos: components saved with variant_id NULL (migration 031)
  -- collect here as 031 product aggregates and are expanded exactly once
  -- during the deterministic allocation pass below.
  v_wildcards         JSONB := '[]'::jsonb;
  v_wild              RECORD;
  v_component_qty     INT;
  v_allocated         INT;
  v_avail             BIGINT;
  v_explicit_total    BIGINT;
  v_pool_stock        BIGINT;
  v_remaining         BIGINT;
  v_candidates        INT;
  v_subtotal          NUMERIC(12,0) := 0;
  v_shipping_fee      NUMERIC(12,0) := 0;
  v_discount          NUMERIC(12,0) := 0;
  v_final             NUMERIC(12,0) := 0;
  v_base_shipping     NUMERIC(12,0) := 25000;
  v_free_threshold    NUMERIC(12,0) := 0;
  v_delivery_input    TEXT := COALESCE(NULLIF(btrim(p->>'delivery_type'), ''), 'home_delivery');
  v_delivery_db       public.delivery_type := 'home_delivery';
  v_payment_method    public.payment_method := 'banking';
  v_voucher_code      TEXT := upper(NULLIF(btrim(p->>'voucher_code'), ''));
  v_voucher           public.vouchers%ROWTYPE;
  v_voucher_id        UUID;
  v_customer_id       UUID;
  v_buyer_phone       TEXT := regexp_replace(COALESCE(p->>'buyer_phone', p->>'recipient_phone', ''), '\D', '', 'g');
  v_recipient_phone   TEXT := regexp_replace(COALESCE(p->>'recipient_phone', p->>'buyer_phone', ''), '\D', '', 'g');
  v_buyer_name        TEXT := COALESCE(NULLIF(btrim(p->>'buyer_name'), ''), NULLIF(btrim(p->>'recipient_name'), ''), 'Khach hang Gieo Mo');
  v_recipient_name    TEXT := COALESCE(NULLIF(btrim(p->>'recipient_name'), ''), NULLIF(btrim(p->>'buyer_name'), ''), 'Khach hang Gieo Mo');
  v_address           TEXT;
  v_seller_id         UUID;
  v_actor_id          UUID;
  v_referral          TEXT := upper(NULLIF(btrim(p->>'referral_code'), ''));
  v_introducer        TEXT := COALESCE(NULLIF(btrim(p->>'introducer_info'), ''), 'Truc tiep (Website)');
  v_source            public.order_source := 'landing_page';
  v_assigned_shipper  UUID;
  v_order_id          UUID;
  v_order_code        TEXT;
  v_response          JSONB;
  v_config            TEXT;
BEGIN
  -- Serialize create operations. This intentionally favors correctness over
  -- throughput for the current low-volume system and gives every transaction
  -- the same lock order before voucher/catalog row locks.
  PERFORM pg_advisory_xact_lock(71420261014);

  IF v_scope !~ '^guest:[0-9a-f]{64}$'
     AND v_scope !~ '^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'D3:INVALID_SCOPE';
  END IF;
  BEGIN
    v_key := (p->>'idempotency_key')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'D3:INVALID_IDEMPOTENCY_KEY';
  END;
  IF v_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'D3:INVALID_REQUEST_HASH';
  END IF;
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'D3:INVALID_ITEMS';
  END IF;
  IF length(v_buyer_phone) < 9 OR length(v_buyer_phone) > 11
     OR length(v_recipient_phone) < 9 OR length(v_recipient_phone) > 11 THEN
    RAISE EXCEPTION 'D3:INVALID_PHONE';
  END IF;

  SELECT * INTO v_existing
    FROM public.order_idempotency
   WHERE scope_key = v_scope AND idempotency_key = v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'D3:HASH_MISMATCH';
    END IF;
    IF v_existing.status = 'completed' THEN
      RETURN v_existing.response_json || jsonb_build_object('replayed', true);
    END IF;
    RAISE EXCEPTION 'D3:IN_PROGRESS';
  END IF;

  -- If a ledger row was intentionally archived but the order is retained,
  -- reconstruct replay safely from the order-level identity and hash.
  SELECT * INTO v_existing_order
    FROM public.orders
   WHERE idempotency_scope = v_scope AND idempotency_key = v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing_order.idempotency_request_hash <> v_hash THEN
      RAISE EXCEPTION 'D3:HASH_MISMATCH';
    END IF;
    v_response := jsonb_build_object(
      'outcome', 'created',
      'order_id', v_existing_order.order_id,
      'order_code', v_existing_order.order_code,
      'final_amount', v_existing_order.final_amount,
      'replayed', true
    );
    INSERT INTO public.order_idempotency (
      scope_key, idempotency_key, request_hash, status, order_id, response_json, completed_at
    ) VALUES (
      v_scope, v_key, v_hash, 'completed', v_existing_order.order_id, v_response - 'replayed', now()
    );
    RETURN v_response;
  END IF;

  INSERT INTO public.order_idempotency (scope_key, idempotency_key, request_hash, status)
  VALUES (v_scope, v_key, v_hash, 'in_progress');

  IF v_delivery_input = 'pickup_point' THEN
    v_delivery_db := 'pickup_point';
  ELSIF v_delivery_input IN ('self_pickup', 'member_delivery') THEN
    v_delivery_db := 'self_pickup';
  ELSIF v_delivery_input <> 'home_delivery' THEN
    RAISE EXCEPTION 'D3:INVALID_DELIVERY_TYPE';
  END IF;

  IF COALESCE(NULLIF(btrim(p->>'payment_method'), ''), 'banking') IN ('cod', 'banking', 'momo') THEN
    v_payment_method := COALESCE(NULLIF(btrim(p->>'payment_method'), ''), 'banking')::public.payment_method;
  ELSE
    RAISE EXCEPTION 'D3:INVALID_PAYMENT_METHOD';
  END IF;

  -- Input is sorted by identity so catalog locks are deterministic.
  FOR v_item IN
    SELECT value
      FROM jsonb_array_elements(v_items)
     ORDER BY COALESCE(value->>'combo_id', value->>'variant_id', value->>'product_id')
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR jsonb_typeof(v_item->'quantity') <> 'number'
       OR (v_item->>'quantity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'D3:INVALID_QUANTITY';
    END IF;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty < 1 THEN
      RAISE EXCEPTION 'D3:INVALID_QUANTITY';
    END IF;
    v_identity_count :=
      (CASE WHEN NULLIF(btrim(v_item->>'product_id'), '') IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN NULLIF(btrim(v_item->>'variant_id'), '') IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN NULLIF(btrim(v_item->>'combo_id'), '') IS NULL THEN 0 ELSE 1 END);

    IF NULLIF(btrim(v_item->>'combo_id'), '') IS NOT NULL THEN
      IF v_identity_count <> 1 THEN RAISE EXCEPTION 'D3:INVALID_LINE_IDENTITY'; END IF;
      SELECT * INTO v_combo FROM public.combos
       WHERE (combo_id::text = v_item->>'combo_id' OR slug = v_item->>'combo_id')
       FOR UPDATE;
      IF NOT FOUND OR v_combo.status <> 'active' THEN RAISE EXCEPTION 'D3:INVALID_COMBO'; END IF;

      v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
        'product_id', null, 'variant_id', null, 'combo_id', v_combo.combo_id,
        'item_name_snapshot', v_combo.name, 'variant_name_snapshot', 'Set Combo Qua Tang',
        'sku_snapshot', 'COMBO-' || upper(left(v_combo.combo_id::text, 6)),
        'quantity', v_qty, 'unit_price', v_combo.price, 'subtotal', v_combo.price * v_qty
      ));
      v_subtotal := v_subtotal + (v_combo.price * v_qty);

      IF NOT EXISTS (SELECT 1 FROM public.combo_items WHERE combo_id = v_combo.combo_id) THEN
        RAISE EXCEPTION 'D3:COMBO_COMPONENTS_UNMAPPED';
      END IF;
      FOR v_component IN
        SELECT ci.variant_id, ci.product_id, ci.quantity
          FROM public.combo_items ci
         WHERE ci.combo_id = v_combo.combo_id
         ORDER BY ci.variant_id NULLS FIRST, ci.product_id
      LOOP
        IF v_component.variant_id IS NULL THEN
          -- Owner-approved semantics: NULL variant = all ACTIVE variants of
          -- this product. Demand is aggregated per product so duplicate
          -- products and quantity > 1 combine; nothing is deducted here.
          v_wildcards := v_wildcards || jsonb_build_array(jsonb_build_object(
            'product_id', v_component.product_id,
            'quantity', v_component.quantity * v_qty
          ));
        ELSE
          SELECT * INTO v_variant FROM public.product_variants
           WHERE variant_id = v_component.variant_id AND product_id = v_component.product_id
           FOR UPDATE;
          IF NOT FOUND OR v_variant.status <> 'active' THEN RAISE EXCEPTION 'D3:INVALID_COMBO_COMPONENT'; END IF;
          v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
            'variant_id', v_variant.variant_id,
            'quantity', v_component.quantity * v_qty
          ));
        END IF;
      END LOOP;

    ELSIF NULLIF(btrim(v_item->>'variant_id'), '') IS NOT NULL THEN
      IF v_identity_count > 2 OR NULLIF(btrim(v_item->>'combo_id'), '') IS NOT NULL THEN
        RAISE EXCEPTION 'D3:INVALID_LINE_IDENTITY';
      END IF;
      BEGIN
        SELECT * INTO v_variant FROM public.product_variants
         WHERE variant_id = (v_item->>'variant_id')::uuid
         FOR UPDATE;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'D3:INVALID_VARIANT';
      END;
      IF NOT FOUND OR v_variant.status <> 'active' THEN RAISE EXCEPTION 'D3:INVALID_VARIANT'; END IF;
      IF NULLIF(btrim(v_item->>'product_id'), '') IS NOT NULL
         AND v_item->>'product_id' <> v_variant.product_id::text THEN
        RAISE EXCEPTION 'D3:VARIANT_PRODUCT_MISMATCH';
      END IF;
      SELECT * INTO v_product FROM public.products
       WHERE product_id = v_variant.product_id FOR UPDATE;
      IF NOT FOUND OR v_product.status <> 'active' THEN RAISE EXCEPTION 'D3:INVALID_PRODUCT'; END IF;

      v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
        'product_id', v_product.product_id, 'variant_id', v_variant.variant_id, 'combo_id', null,
        'item_name_snapshot', v_product.name, 'variant_name_snapshot', v_variant.name,
        'sku_snapshot', v_variant.sku, 'quantity', v_qty,
        'unit_price', COALESCE(v_variant.price, v_product.price),
        'subtotal', COALESCE(v_variant.price, v_product.price) * v_qty
      ));
      v_subtotal := v_subtotal + (COALESCE(v_variant.price, v_product.price) * v_qty);
      v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant.variant_id, 'quantity', v_qty
      ));

    ELSIF NULLIF(btrim(v_item->>'product_id'), '') IS NOT NULL THEN
      IF v_identity_count <> 1 THEN RAISE EXCEPTION 'D3:INVALID_LINE_IDENTITY'; END IF;
      SELECT * INTO v_product FROM public.products
       WHERE (product_id::text = v_item->>'product_id' OR slug = v_item->>'product_id')
       FOR UPDATE;
      IF NOT FOUND OR v_product.status <> 'active' THEN RAISE EXCEPTION 'D3:INVALID_PRODUCT'; END IF;
      v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
        'product_id', v_product.product_id, 'variant_id', null, 'combo_id', null,
        'item_name_snapshot', v_product.name, 'variant_name_snapshot', null,
        'sku_snapshot', null, 'quantity', v_qty, 'unit_price', v_product.price,
        'subtotal', v_product.price * v_qty
      ));
      v_subtotal := v_subtotal + (v_product.price * v_qty);
    ELSE
      RAISE EXCEPTION 'D3:INVALID_LINE_IDENTITY';
    END IF;
  END LOOP;

  SELECT config_value INTO v_config FROM public.system_configs WHERE config_key = 'flat_shipping_fee';
  IF v_config ~ '^[0-9]+$' THEN v_base_shipping := v_config::numeric; END IF;
  SELECT config_value INTO v_config FROM public.system_configs WHERE config_key = 'free_shipping_threshold';
  IF v_config ~ '^[0-9]+$' THEN v_free_threshold := v_config::numeric; END IF;
  IF v_delivery_input IN ('pickup_point', 'self_pickup', 'member_delivery') THEN
    v_shipping_fee := 0;
  ELSE
    v_shipping_fee := v_base_shipping;
  END IF;
  IF v_free_threshold > 0 AND v_subtotal >= v_free_threshold THEN v_shipping_fee := 0; END IF;

  IF v_voucher_code IS NOT NULL THEN
    SELECT * INTO v_voucher FROM public.vouchers
     WHERE upper(code) = v_voucher_code FOR UPDATE;
    IF NOT FOUND OR v_voucher.status <> 'active'
       OR (v_voucher.start_date IS NOT NULL AND v_voucher.start_date > now())
       OR (v_voucher.end_date IS NOT NULL AND v_voucher.end_date < now())
       OR (v_voucher.usage_limit IS NOT NULL AND v_voucher.times_used >= v_voucher.usage_limit)
       OR v_subtotal < v_voucher.min_order_value THEN
      RAISE EXCEPTION 'D3:VOUCHER_UNAVAILABLE';
    END IF;
    -- Voucher semantics must stay identical to src/lib/pricing.ts computePricing:
    --   freeship     -> shipping waived, no amount discount
    --   percentage   -> share of the subtotal
    --   fixed_amount -> amount off the subtotal (never more than the subtotal)
    -- discount_type is compared as text so the statement stays valid on
    -- environments whose discount_type enum does not (yet) contain 'freeship'
    -- (value added by dashboard-only migration 014).
    IF v_voucher.discount_type::text = 'freeship' THEN
      v_discount := 0;
      v_shipping_fee := 0;
    ELSIF v_voucher.discount_type::text = 'percentage' THEN
      v_discount := round(v_subtotal * least(100, greatest(0, v_voucher.discount_value)) / 100);
    ELSE
      v_discount := least(v_subtotal, greatest(0, v_voucher.discount_value));
    END IF;
    UPDATE public.vouchers SET times_used = times_used + 1 WHERE voucher_id = v_voucher.voucher_id;
    v_voucher_id := v_voucher.voucher_id;
  END IF;
  v_final := greatest(0, v_subtotal - v_discount + v_shipping_fee);

  -- Expand wildcard combo requirements across their products' ACTIVE variants,
  -- one product at a time in product_id order, with the same owner-approved
  -- feasibility math as src/lib/comboInventory.ts: N sets are buildable iff
  -- every active variant's stock >= N * explicit demand and the pooled
  -- remainder >= N * wildcard demand. Nothing is modified here; this pass is
  -- a fail-closed feasibility check feeding the deduction loop below.
  IF jsonb_array_length(v_wildcards) > 0 THEN
    FOR v_wild IN
      SELECT w.value->>'product_id' AS product_key,
             sum((w.value->>'quantity')::numeric)::bigint AS quantity
        FROM jsonb_array_elements(v_wildcards) AS w(value)
       GROUP BY w.value->>'product_id'
       ORDER BY w.value->>'product_id'
    LOOP
      IF v_wild.quantity < 1 OR v_wild.quantity > 2147483647 THEN
        RAISE EXCEPTION 'D3:INVALID_QUANTITY';
      END IF;

      SELECT * INTO v_product FROM public.products
       WHERE product_id::text = v_wild.product_key
       FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'D3:INVALID_COMBO_COMPONENT'; END IF;

      -- Lock every active candidate variant in stable variant_id order: the
      -- same ordering the deduction loop and cancellation reversal use.
      v_candidates := 0;
      v_pool_stock := 0;
      FOR v_variant IN
        SELECT pv.* FROM public.product_variants pv
         WHERE pv.product_id = v_product.product_id AND pv.status = 'active'
         ORDER BY pv.variant_id
         FOR UPDATE
      LOOP
        v_candidates := v_candidates + 1;
        v_pool_stock := v_pool_stock + v_variant.stock;
        SELECT COALESCE(sum((s.item->>'quantity')::numeric), 0)::int INTO v_allocated
          FROM jsonb_array_elements(v_stock_lines) AS s(item)
         WHERE s.item->>'variant_id' = v_variant.variant_id::text;
        IF v_variant.stock < v_allocated THEN
          RAISE EXCEPTION 'D3:STOCK_INSUFFICIENT';
        END IF;
      END LOOP;

      -- A wildcard product with no active variant cannot be built. Migration
      -- 031 prevented this at save time; catalog state may have changed since.
      IF v_candidates = 0 THEN RAISE EXCEPTION 'D3:INVALID_COMBO_COMPONENT'; END IF;

      -- Explicit demand across all variants of this wildcard product.
      SELECT COALESCE(sum((s.item->>'quantity')::numeric), 0)::bigint INTO v_explicit_total
        FROM jsonb_array_elements(v_stock_lines) AS s(item)
        JOIN public.product_variants pv2
          ON pv2.variant_id::text = s.item->>'variant_id'
         AND pv2.product_id = v_product.product_id;

      -- Pooled remainder must cover the wildcard demand after the explicit
      -- variant caps above are reserved.
      IF v_pool_stock - v_explicit_total < v_wild.quantity THEN
        RAISE EXCEPTION 'D3:STOCK_INSUFFICIENT';
      END IF;

      -- Deterministic greedy allocation, variant_id ASC, reusing the same
      -- deduction loop: append per-variant wildcard lines beside the explicit
      -- lines. The deduction UPDATE re-verifies stock per variant, so only
      -- the provenance-critical mapping happens here.
      v_remaining := v_wild.quantity;
      FOR v_variant IN
        SELECT pv.* FROM public.product_variants pv
         WHERE pv.product_id = v_product.product_id AND pv.status = 'active'
         ORDER BY pv.variant_id
         FOR UPDATE
      LOOP
        IF v_remaining = 0 THEN EXIT; END IF;
        SELECT COALESCE(sum((s.item->>'quantity')::numeric), 0)::int INTO v_allocated
          FROM jsonb_array_elements(v_stock_lines) AS s(item)
         WHERE s.item->>'variant_id' = v_variant.variant_id::text;
        v_avail := v_variant.stock - v_allocated;
        IF v_avail > 0 THEN
          IF v_avail > v_remaining THEN v_avail := v_remaining; END IF;
          v_remaining := v_remaining - v_avail;
          v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
            'variant_id', v_variant.variant_id,
            'quantity', v_avail::int
          ));
        END IF;
      END LOOP;
      IF v_remaining > 0 THEN RAISE EXCEPTION 'D3:STOCK_INSUFFICIENT'; END IF;
    END LOOP;
  END IF;

  -- Aggregate repeated direct/combo component requirements before deduction.
  FOR v_stock IN
    SELECT (x->>'variant_id')::uuid AS variant_id, sum((x->>'quantity')::int)::int AS quantity
      FROM jsonb_array_elements(v_stock_lines) x
     GROUP BY (x->>'variant_id')::uuid
     ORDER BY (x->>'variant_id')::uuid
  LOOP
    UPDATE public.product_variants
       SET stock = stock - v_stock.quantity, updated_at = now()
     WHERE variant_id = v_stock.variant_id AND stock >= v_stock.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'D3:STOCK_INSUFFICIENT'; END IF;
  END LOOP;

  v_address := CASE
    WHEN NULLIF(btrim(p->>'address_detail'), '') IS NULL THEN NULL
    ELSE concat_ws(', ', NULLIF(btrim(p->>'address_detail'), ''), NULLIF(btrim(p->>'district'), ''), NULLIF(btrim(p->>'province'), ''))
  END;

  INSERT INTO public.customers (full_name, phone, email, default_address)
  VALUES (v_buyer_name, v_buyer_phone, NULLIF(lower(btrim(p->>'buyer_email')), ''), v_address)
  ON CONFLICT (phone) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = COALESCE(EXCLUDED.email, public.customers.email),
    default_address = COALESCE(EXCLUDED.default_address, public.customers.default_address),
    updated_at = now()
  RETURNING customer_id INTO v_customer_id;

  BEGIN v_actor_id := NULLIF(p->>'actor_member_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'D3:INVALID_ACTOR'; END;
  IF v_actor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.members WHERE member_id = v_actor_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'D3:INVALID_ACTOR'; END IF;

  BEGIN v_seller_id := NULLIF(p->>'seller_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN v_seller_id := NULL; END;
  IF v_seller_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.members WHERE member_id = v_seller_id AND status = 'active'
  ) THEN v_seller_id := NULL; END IF;
  IF v_seller_id IS NULL AND v_referral IS NOT NULL THEN
    SELECT member_id INTO v_seller_id FROM public.members
     WHERE upper(referral_code) = v_referral AND status = 'active';
  END IF;
  IF v_seller_id IS NOT NULL THEN
    v_source := 'member_referral';
    IF v_delivery_input = 'member_delivery' THEN v_assigned_shipper := v_seller_id; END IF;
  ELSIF v_actor_id IS NOT NULL AND COALESCE(p->>'source_type', '') IN ('admin_manual', 'other') THEN
    v_source := (p->>'source_type')::public.order_source;
  END IF;

  v_order_id := gen_random_uuid();
  v_order_code := 'GM-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_code_seq')::text, 6, '0');

  INSERT INTO public.orders (
    order_id, order_code, customer_id, seller_id, source_type, introducer_info,
    receiver_name, receiver_phone, delivery_type, shipping_address_snapshot,
    subtotal, shipping_fee, voucher_id, voucher_discount, final_amount,
    order_status, payment_status, delivery_status, payment_method,
    created_by_member_id, assigned_shipper_id, customer_note,
    idempotency_scope, idempotency_key, idempotency_request_hash
  ) VALUES (
    v_order_id, v_order_code, v_customer_id, v_seller_id, v_source, v_introducer,
    v_recipient_name, v_recipient_phone, v_delivery_db, v_address,
    v_subtotal, v_shipping_fee, v_voucher_id, v_discount, v_final,
    'pending', 'pending', 'not_ready', v_payment_method,
    v_actor_id, v_assigned_shipper, NULLIF(p->>'customer_note', ''),
    v_scope, v_key, v_hash
  );

  INSERT INTO public.order_items (
    order_id, product_id, variant_id, combo_id, item_name_snapshot,
    variant_name_snapshot, sku_snapshot, quantity, unit_price, subtotal
  )
  SELECT
    v_order_id,
    NULLIF(x->>'product_id', '')::uuid,
    NULLIF(x->>'variant_id', '')::uuid,
    NULLIF(x->>'combo_id', '')::uuid,
    x->>'item_name_snapshot', NULLIF(x->>'variant_name_snapshot', ''),
    NULLIF(x->>'sku_snapshot', ''), (x->>'quantity')::int,
    (x->>'unit_price')::numeric, (x->>'subtotal')::numeric
  FROM jsonb_array_elements(v_order_items) x;

  INSERT INTO public.order_status_history (
    order_id, status_type, from_status, to_status, note, changed_by_member_id
  ) VALUES (
    v_order_id, 'order', NULL, 'pending', 'Order created atomically', v_actor_id
  );

  INSERT INTO public.audit_logs (
    actor_member_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_actor_id, 'order.create', 'order', v_order_id, NULL,
    jsonb_build_object(
      'order_code', v_order_code,
      'idempotency_scope', v_scope,
      'idempotency_key', v_key,
      'request_hash', v_hash,
      'subtotal', v_subtotal,
      'shipping_fee', v_shipping_fee,
      'voucher_discount', v_discount,
      'final_amount', v_final
    )
  );

  v_response := jsonb_build_object(
    'outcome', 'created',
    'order_id', v_order_id,
    'order_code', v_order_code,
    'final_amount', v_final,
    -- Exact deducted stock lines, aggregated by variant only during the
    -- deduction loop. Migration 035's provenance wrapper persists these
    -- verbatim as per-variant reservations; the customer-facing result
    -- intentionally stays compatible with earlier consumers.
    'stock_lines', v_stock_lines,
    'replayed', false
  );
  UPDATE public.order_idempotency SET
    status = 'completed', order_id = v_order_id,
    response_json = v_response - 'replayed', completed_at = now()
  WHERE scope_key = v_scope AND idempotency_key = v_key;

  RETURN v_response;
END;
$$;

-- Keep the private migration-025 implementation non-executable by every
-- runtime role; CREATE OR REPLACE preserves the ACLs migration 026 revoked,
-- but re-assert them explicitly so migration ancestry cannot drift.
REVOKE ALL ON FUNCTION public.create_order_atomic_v25(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_order_atomic_v25(JSONB) IS
  'Migration 025 order-creation body; migration 035 adds wildcard combo allocation and returns the exact deducted stock lines.';

CREATE OR REPLACE FUNCTION public.create_order_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result    JSONB;
  v_order_id  UUID;
BEGIN
  -- SHARE conflicts with combo_items writers but permits concurrent readers.
  -- This guarantees the snapshot below is the same composition used by v25.
  LOCK TABLE public.combo_items IN SHARE MODE;

  v_result := public.create_order_atomic_v25(p);

  -- Never claim provenance for an order created before this migration.
  IF COALESCE((v_result->>'replayed')::boolean, false) THEN
    RETURN v_result;
  END IF;

  v_order_id := (v_result->>'order_id')::uuid;

  -- Fail-closed provenance: the inner implementation must report the exact
  -- stock lines it deducted. An unexpected response shape must abort the
  -- checkout instead of committing an order whose reservation evidence
  -- claims fewer variants than were actually deducted.
  IF NOT COALESCE(v_result ? 'stock_lines', false)
     OR jsonb_typeof(v_result->'stock_lines') <> 'array' THEN
    RAISE EXCEPTION '035:create_order_atomic_result_missing_stock_lines';
  END IF;

  INSERT INTO public.order_inventory_reservations (order_id, variant_id, quantity)
  SELECT v_order_id,
         (stock_line.item->>'variant_id')::uuid AS variant_id,
         sum((stock_line.item->>'quantity')::int)::int AS quantity
    FROM jsonb_array_elements(v_result->'stock_lines') AS stock_line(item)
   GROUP BY (stock_line.item->>'variant_id')::uuid
   ORDER BY (stock_line.item->>'variant_id')::uuid;

  UPDATE public.orders
     SET inventory_reservation_recorded_at = now()
   WHERE order_id = v_order_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.create_order_atomic(JSONB) IS
  'Decision 3 writer wrapped by migration 026; migration 035 derives reservations from the exact stock lines the creation body deducted.';

DO $$
BEGIN
  IF to_regprocedure('public.create_order_atomic_v25(jsonb)') IS NULL
     OR to_regprocedure('public.create_order_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.cancel_order_atomic(jsonb)') IS NULL THEN
    RAISE EXCEPTION '035: order functions missing after migration 035';
  END IF;
  IF has_function_privilege('anon', 'public.create_order_atomic_v25(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_order_atomic_v25(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.create_order_atomic_v25(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '035: create_order_atomic_v25 must stay non-executable';
  END IF;
  IF has_function_privilege('anon', 'public.create_order_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_order_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '035: create_order_atomic must not be executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_order_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '035: service_role lacks create_order_atomic execute';
  END IF;
END
$$;