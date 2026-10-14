-- ========================================================
-- GIEO MO — DATABASE MIGRATION 026
-- Provenance-safe, atomic and idempotent order cancellation
-- ========================================================
-- Additive only. Historical orders are deliberately NOT backfilled: migration
-- 025 did not persist combo component reservations, so reconstructing them from
-- a mutable combo definition could restore the wrong inventory.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_reservation_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voucher_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_effects_completed_at TIMESTAMPTZ;

CREATE TABLE public.order_inventory_reservations (
  order_id    UUID NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  variant_id  UUID NOT NULL REFERENCES public.product_variants(variant_id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, variant_id)
);

CREATE INDEX idx_order_inventory_reservations_variant
  ON public.order_inventory_reservations (variant_id);

ALTER TABLE public.order_inventory_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role all order inventory reservations"
  ON public.order_inventory_reservations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.order_inventory_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_inventory_reservations TO service_role;

-- Keep the audited migration-025 implementation intact behind a private name.
-- The wrapper locks combo composition for the duration of creation, calls the
-- original transaction body, then persists the exact aggregate reservation.
ALTER FUNCTION public.create_order_atomic(JSONB) RENAME TO create_order_atomic_v25;
REVOKE ALL ON FUNCTION public.create_order_atomic_v25(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.create_order_atomic(p JSONB)
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

  INSERT INTO public.order_inventory_reservations (order_id, variant_id, quantity)
  SELECT v_order_id, stock_line.variant_id, sum(stock_line.quantity)::int
  FROM (
    SELECT
      (item->>'variant_id')::uuid AS variant_id,
      (item->>'quantity')::int AS quantity
    FROM jsonb_array_elements(p->'items') item
    WHERE NULLIF(btrim(item->>'variant_id'), '') IS NOT NULL

    UNION ALL

    SELECT
      ci.variant_id,
      ci.quantity * (item->>'quantity')::int AS quantity
    FROM jsonb_array_elements(p->'items') item
    JOIN public.combos c
      ON c.combo_id::text = item->>'combo_id' OR c.slug = item->>'combo_id'
    JOIN public.combo_items ci ON ci.combo_id = c.combo_id
    WHERE NULLIF(btrim(item->>'combo_id'), '') IS NOT NULL
  ) stock_line
  GROUP BY stock_line.variant_id
  ORDER BY stock_line.variant_id;

  UPDATE public.orders
     SET inventory_reservation_recorded_at = now()
   WHERE order_id = v_order_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.create_order_atomic(JSONB) IS
  'Decision 3 writer wrapped by migration 026 to persist exact inventory reversal provenance.';

CREATE FUNCTION public.cancel_order_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order          public.orders%ROWTYPE;
  v_actor_id       UUID;
  v_order_id       UUID;
  v_order_code     TEXT := upper(NULLIF(btrim(p->>'order_code'), ''));
  v_reason         TEXT := COALESCE(NULLIF(btrim(p->>'reason'), ''), 'Admin cancellation');
  v_from_status    TEXT;
  v_restored_lines JSONB;
  v_refund_required BOOLEAN;
BEGIN
  IF (NULLIF(btrim(p->>'order_id'), '') IS NULL) = (v_order_code IS NULL) THEN
    RETURN jsonb_build_object('outcome', 'invalid_identity');
  END IF;

  BEGIN
    v_actor_id := NULLIF(btrim(p->>'actor_member_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END;
  IF v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members WHERE member_id = v_actor_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END IF;

  IF v_order_code IS NOT NULL THEN
    SELECT * INTO v_order
      FROM public.orders
     WHERE order_code = v_order_code
     FOR UPDATE;
  ELSE
    BEGIN
      v_order_id := (p->>'order_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('outcome', 'invalid_identity');
    END;
    SELECT * INTO v_order
      FROM public.orders
     WHERE order_id = v_order_id
     FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  v_refund_required := v_order.payment_status = 'paid';

  IF v_order.order_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'outcome', 'already_cancelled',
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'refund_required', v_refund_required
    );
  END IF;

  IF v_order.order_status::text NOT IN ('pending', 'confirmed', 'processing') THEN
    RETURN jsonb_build_object(
      'outcome', 'not_cancellable',
      'order_id', v_order.order_id,
      'current_status', v_order.order_status
    );
  END IF;

  -- No historical inference: only orders whose reservation capture committed
  -- with creation may enter the reversing transaction.
  IF v_order.inventory_reservation_recorded_at IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'inventory_unverified',
      'order_id', v_order.order_id
    );
  END IF;

  -- Validate and lock the voucher before any mutation.
  IF v_order.voucher_id IS NOT NULL THEN
    PERFORM 1 FROM public.vouchers
     WHERE voucher_id = v_order.voucher_id AND times_used > 0
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'outcome', 'voucher_release_unsafe',
        'order_id', v_order.order_id
      );
    END IF;
  END IF;

  -- Deterministic lock order makes concurrent cancellation/replay safe.
  PERFORM pv.variant_id
    FROM public.product_variants pv
    JOIN public.order_inventory_reservations r ON r.variant_id = pv.variant_id
   WHERE r.order_id = v_order.order_id
   ORDER BY pv.variant_id
   FOR UPDATE OF pv;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('variant_id', variant_id, 'quantity', quantity)
      ORDER BY variant_id
    ),
    '[]'::jsonb
  ) INTO v_restored_lines
  FROM public.order_inventory_reservations
  WHERE order_id = v_order.order_id;

  UPDATE public.product_variants pv
     SET stock = pv.stock + r.quantity,
         updated_at = now()
    FROM public.order_inventory_reservations r
   WHERE r.order_id = v_order.order_id
     AND pv.variant_id = r.variant_id;

  IF v_order.voucher_id IS NOT NULL THEN
    UPDATE public.vouchers
       SET times_used = times_used - 1
     WHERE voucher_id = v_order.voucher_id;
  END IF;

  v_from_status := v_order.order_status::text;
  UPDATE public.orders
     SET order_status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = v_reason,
         stock_restored_at = now(),
         voucher_released_at = CASE WHEN voucher_id IS NULL THEN NULL ELSE now() END,
         cancellation_effects_completed_at = now(),
         updated_at = now()
   WHERE order_id = v_order.order_id;

  INSERT INTO public.order_status_history (
    order_id, status_type, from_status, to_status, note, changed_by_member_id
  ) VALUES (
    v_order.order_id, 'order', v_from_status, 'cancelled', v_reason, v_actor_id
  );

  INSERT INTO public.audit_logs (
    actor_member_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_actor_id,
    'order.cancel',
    'order',
    v_order.order_id,
    jsonb_build_object(
      'order_status', v_from_status,
      'payment_status', v_order.payment_status,
      'voucher_id', v_order.voucher_id
    ),
    jsonb_build_object(
      'order_status', 'cancelled',
      'payment_status', v_order.payment_status,
      'refund_required', v_refund_required,
      'voucher_released', v_order.voucher_id IS NOT NULL,
      'inventory_restored', v_restored_lines,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'cancelled',
    'order_id', v_order.order_id,
    'order_code', v_order.order_code,
    'refund_required', v_refund_required,
    'inventory_restored', v_restored_lines,
    'voucher_released', v_order.voucher_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.cancel_order_atomic(JSONB) IS
  'Atomically cancels a provenance-marked order and reverses stock/voucher effects exactly once; payment state is preserved.';

DO $$
BEGIN
  IF to_regprocedure('public.create_order_atomic_v25(jsonb)') IS NULL
     OR to_regprocedure('public.create_order_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.cancel_order_atomic(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'migration 026 functions missing';
  END IF;
  IF has_function_privilege('anon', 'public.cancel_order_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cancel_order_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.create_order_atomic_v25(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration 026 function privilege invariant failed';
  END IF;
END $$;
