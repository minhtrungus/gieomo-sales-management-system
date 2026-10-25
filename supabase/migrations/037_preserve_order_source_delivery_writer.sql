-- Use the enum values committed by migration 036 in the canonical writer.
-- The migration-035 atomic body remains private and unchanged.

CREATE OR REPLACE FUNCTION public.create_order_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result            JSONB;
  v_order_id          UUID;
  v_requested_source  TEXT := NULLIF(btrim(p->>'source_type'), '');
  v_created_by        UUID;
  v_seller_id         UUID;
BEGIN
  LOCK TABLE public.combo_items IN SHARE MODE;
  v_result := public.create_order_atomic_v25(p);

  IF COALESCE((v_result->>'replayed')::boolean, false) THEN
    RETURN v_result;
  END IF;

  v_order_id := (v_result->>'order_id')::uuid;
  IF NOT COALESCE(v_result ? 'stock_lines', false)
     OR jsonb_typeof(v_result->'stock_lines') <> 'array' THEN
    RAISE EXCEPTION '037:create_order_atomic_result_missing_stock_lines';
  END IF;

  SELECT created_by_member_id, seller_id
    INTO v_created_by, v_seller_id
    FROM public.orders
   WHERE order_id = v_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '037:created_order_missing';
  END IF;

  IF p->>'delivery_type' = 'member_delivery' THEN
    UPDATE public.orders
       SET delivery_type = 'member_delivery'::public.delivery_type
     WHERE order_id = v_order_id;
  END IF;

  IF v_requested_source IS NULL OR v_requested_source = 'landing_page' THEN
    NULL;
  ELSIF v_requested_source = 'member_referral' THEN
    IF v_seller_id IS NULL THEN
      RAISE EXCEPTION '037:member_referral_requires_seller';
    END IF;
    UPDATE public.orders SET source_type = v_requested_source::public.order_source
     WHERE order_id = v_order_id;
  ELSIF v_requested_source = 'social_media' THEN
    UPDATE public.orders SET source_type = v_requested_source::public.order_source
     WHERE order_id = v_order_id;
  ELSIF v_requested_source IN ('admin_manual', 'event_sale', 'other') THEN
    IF v_created_by IS NULL THEN
      RAISE EXCEPTION '037:privileged_source_requires_actor';
    END IF;
    UPDATE public.orders SET source_type = v_requested_source::public.order_source
     WHERE order_id = v_order_id;
  ELSE
    RAISE EXCEPTION '037:invalid_source_type';
  END IF;

  INSERT INTO public.order_inventory_reservations (order_id, variant_id, quantity)
  SELECT v_order_id,
         (stock_line.item->>'variant_id')::uuid,
         sum((stock_line.item->>'quantity')::int)::int
    FROM jsonb_array_elements(v_result->'stock_lines') AS stock_line(item)
   GROUP BY (stock_line.item->>'variant_id')::uuid
   ORDER BY (stock_line.item->>'variant_id')::uuid;

  UPDATE public.orders SET inventory_reservation_recorded_at = now()
   WHERE order_id = v_order_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.create_order_atomic(JSONB) IS
  'Migration 035 reservation wrapper plus migration 036/037 lossless delivery/source persistence.';

DO $$
BEGIN
  IF to_regprocedure('public.create_order_atomic(jsonb)') IS NULL THEN
    RAISE EXCEPTION '037: create_order_atomic missing';
  END IF;
  IF has_function_privilege('anon', 'public.create_order_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_order_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '037: create_order_atomic exposed to a runtime user role';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_order_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '037: service_role lacks create_order_atomic execute';
  END IF;
END
$$;
