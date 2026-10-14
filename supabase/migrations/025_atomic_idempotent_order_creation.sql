-- ========================================================
-- GIEO MO — DATABASE MIGRATION 025
-- Atomic and idempotent order creation (Decision 3 / Option A)
-- ========================================================
-- Additive migration. It does not depend on payment migrations 023/024.
-- The RPC preserves current creation-time inventory deduction. Product-only
-- rows have no stock column in schema 001 and therefore have no stock effect.
-- Combo inventory is deducted only through explicitly mapped variant rows;
-- a combo component without variant_id fails closed.
-- ========================================================

CREATE TABLE IF NOT EXISTS public.order_idempotency (
  scope_key        TEXT NOT NULL,
  idempotency_key  UUID NOT NULL,
  request_hash     TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status           TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  order_id         UUID REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  response_json    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  retain_until     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '180 days'),
  PRIMARY KEY (scope_key, idempotency_key),
  UNIQUE (order_id),
  CHECK (
    scope_key ~ '^guest:[0-9a-f]{64}$'
    OR scope_key ~ '^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CHECK (
    (status = 'in_progress' AND order_id IS NULL AND response_json IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND order_id IS NOT NULL AND response_json IS NOT NULL AND completed_at IS NOT NULL)
  )
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_scope TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS idempotency_request_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_idempotency_fields_consistent'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_idempotency_fields_consistent CHECK (
      (idempotency_scope IS NULL AND idempotency_key IS NULL AND idempotency_request_hash IS NULL)
      OR (
        idempotency_scope IS NOT NULL
        AND idempotency_key IS NOT NULL
        AND idempotency_request_hash ~ '^[0-9a-f]{64}$'
      )
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_scope_key
  ON public.orders (idempotency_scope, idempotency_key)
  WHERE idempotency_scope IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_idempotency_retain_until
  ON public.order_idempotency (retain_until);

ALTER TABLE public.order_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role all order_idempotency" ON public.order_idempotency;
CREATE POLICY "Service role all order_idempotency"
  ON public.order_idempotency FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.order_idempotency FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_idempotency TO service_role;

CREATE OR REPLACE FUNCTION public.create_order_atomic(p JSONB)
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
        IF v_component.variant_id IS NULL THEN RAISE EXCEPTION 'D3:COMBO_COMPONENTS_UNMAPPED'; END IF;
        SELECT * INTO v_variant FROM public.product_variants
         WHERE variant_id = v_component.variant_id AND product_id = v_component.product_id
         FOR UPDATE;
        IF NOT FOUND OR v_variant.status <> 'active' THEN RAISE EXCEPTION 'D3:INVALID_COMBO_COMPONENT'; END IF;
        v_stock_lines := v_stock_lines || jsonb_build_array(jsonb_build_object(
          'variant_id', v_variant.variant_id,
          'quantity', v_component.quantity * v_qty
        ));
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
    IF v_voucher.discount_type = 'percentage' THEN
      v_discount := round(v_subtotal * least(100, greatest(0, v_voucher.discount_value)) / 100);
    ELSE
      v_discount := least(v_subtotal, greatest(0, v_voucher.discount_value));
    END IF;
    UPDATE public.vouchers SET times_used = times_used + 1 WHERE voucher_id = v_voucher.voucher_id;
    v_voucher_id := v_voucher.voucher_id;
  END IF;
  v_final := greatest(0, v_subtotal - v_discount + v_shipping_fee);

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
    'replayed', false
  );
  UPDATE public.order_idempotency SET
    status = 'completed', order_id = v_order_id,
    response_json = v_response - 'replayed', completed_at = now()
  WHERE scope_key = v_scope AND idempotency_key = v_key;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.create_order_atomic(JSONB) IS
  'Decision 3 atomic order writer with scoped UUID idempotency and canonical request hash replay.';

DO $$
DECLARE
  v_index TEXT;
BEGIN
  IF to_regprocedure('public.create_order_atomic(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'create_order_atomic(jsonb) missing after migration 025';
  END IF;
  SELECT indexdef INTO v_index FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'uq_orders_idempotency_scope_key';
  IF v_index IS NULL OR position('UNIQUE' IN upper(v_index)) = 0 THEN
    RAISE EXCEPTION 'uq_orders_idempotency_scope_key missing or not unique';
  END IF;
  IF has_function_privilege('anon', 'public.create_order_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_order_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_order_atomic must not be executable by anon/authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_order_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lacks create_order_atomic execute';
  END IF;
END $$;
