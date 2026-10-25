-- Controlled physical deletion for unpaid orders whose delivery has not begun.
-- Preview and delete share one eligibility function; delete rechecks under a
-- row lock, reverses recorded inventory/voucher effects, and writes an audit.

CREATE OR REPLACE FUNCTION public.manage_order_deletion_atomic(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := lower(COALESCE(NULLIF(btrim(p->>'mode'), ''), 'preview'));
  v_reason text := NULLIF(btrim(p->>'reason'), '');
  v_confirmation text := upper(COALESCE(NULLIF(btrim(p->>'confirmation'), ''), ''));
  v_order_id uuid;
  v_actor_id uuid;
  v_order public.orders%ROWTYPE;
  v_payment_count integer := 0;
  v_event_count integer := 0;
  v_shipment_count integer := 0;
  v_reservation_count integer := 0;
  v_risky_history_count integer := 0;
  v_restored_lines jsonb := '[]'::jsonb;
  v_voucher_released boolean := false;
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  IF v_mode NOT IN ('preview', 'delete') THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'error', 'invalid_mode');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'error', 'reason_required');
  END IF;

  BEGIN
    v_order_id := NULLIF(p->>'order_id', '')::uuid;
    v_actor_id := NULLIF(p->>'actor_member_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'error', 'invalid_identifier');
  END;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'error', 'order_id_required');
  END IF;
  IF v_mode = 'delete' THEN
    SELECT * INTO v_order FROM public.orders WHERE order_id = v_order_id FOR UPDATE;
  ELSE
    SELECT * INTO v_order FROM public.orders WHERE order_id = v_order_id;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'order_id', v_order_id);
  END IF;

  SELECT count(*) INTO v_payment_count
    FROM public.payments
   WHERE order_id = v_order_id AND payment_status = 'paid';
  SELECT count(*) INTO v_event_count FROM public.payment_events WHERE matched_order_id = v_order_id;
  SELECT count(*) INTO v_shipment_count FROM public.shipments WHERE order_id = v_order_id;
  SELECT count(*) INTO v_reservation_count FROM public.order_inventory_reservations WHERE order_id = v_order_id;
  SELECT count(*) INTO v_risky_history_count
    FROM public.order_status_history
   WHERE order_id = v_order_id
     AND NOT (
       status_type = 'order'
       AND from_status IS NULL
       AND to_status = 'pending'
     );

  IF v_order.payment_status::text NOT IN ('pending', 'failed') OR v_payment_count > 0 THEN
    v_blockers := v_blockers || jsonb_build_array('order_already_paid');
  END IF;
  IF COALESCE(v_order.delivery_status::text, 'not_ready') <> 'not_ready' THEN
    v_blockers := v_blockers || jsonb_build_array('delivery_started');
  END IF;

  IF jsonb_array_length(v_blockers) > 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'blocked',
      'eligible', false,
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'order_status', v_order.order_status,
      'payment_status', v_order.payment_status,
      'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount,
      'blockers', v_blockers,
      'relations', jsonb_build_object(
        'payments', v_payment_count,
        'payment_events', v_event_count,
        'shipments', v_shipment_count,
        'reservations', v_reservation_count,
        'business_history', v_risky_history_count
      )
    );
  END IF;

  IF v_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'outcome', 'eligible',
      'eligible', true,
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'order_status', v_order.order_status,
      'payment_status', v_order.payment_status,
      'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount,
      'updated_at', v_order.updated_at,
      'relations', jsonb_build_object(
        'order_items', (SELECT count(*) FROM public.order_items WHERE order_id = v_order_id),
        'initial_history', (SELECT count(*) FROM public.order_status_history WHERE order_id = v_order_id),
        'idempotency_claims', (SELECT count(*) FROM public.order_idempotency WHERE order_id = v_order_id)
      )
    );
  END IF;

  IF v_confirmation <> 'XOA' THEN
    RETURN jsonb_build_object('outcome', 'invalid_request', 'error', 'confirmation_required');
  END IF;
  IF NULLIF(p->>'expected_updated_at', '') IS NULL
     OR v_order.updated_at IS DISTINCT FROM (p->>'expected_updated_at')::timestamptz THEN
    RETURN jsonb_build_object('outcome', 'stale_preview', 'eligible', false, 'order_id', v_order_id);
  END IF;

  -- A confirmed/processing unpaid order may already have reservations. Restore
  -- them under deterministic row locks before removing the RESTRICT rows.
  PERFORM pv.variant_id
    FROM public.product_variants pv
    JOIN public.order_inventory_reservations r ON r.variant_id = pv.variant_id
   WHERE r.order_id = v_order_id
   ORDER BY pv.variant_id
   FOR UPDATE OF pv;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('variant_id', variant_id, 'quantity', quantity) ORDER BY variant_id),
    '[]'::jsonb
  ) INTO v_restored_lines
    FROM public.order_inventory_reservations
   WHERE order_id = v_order_id;

  UPDATE public.product_variants pv
     SET stock = pv.stock + r.quantity,
         updated_at = now()
    FROM public.order_inventory_reservations r
   WHERE r.order_id = v_order_id
     AND pv.variant_id = r.variant_id;

  DELETE FROM public.order_inventory_reservations WHERE order_id = v_order_id;

  IF v_order.voucher_id IS NOT NULL
     AND v_order.inventory_reservation_recorded_at IS NOT NULL
     AND v_order.voucher_released_at IS NULL THEN
    PERFORM 1 FROM public.vouchers WHERE voucher_id = v_order.voucher_id FOR UPDATE;
    UPDATE public.vouchers
       SET times_used = times_used - 1
     WHERE voucher_id = v_order.voucher_id
       AND times_used > 0;
    v_voucher_released := FOUND;
  END IF;

  DELETE FROM public.order_idempotency WHERE order_id = v_order_id;
  DELETE FROM public.orders WHERE order_id = v_order_id;

  INSERT INTO public.audit_logs (
    actor_member_id, action, entity_type, entity_id, before_data, after_data, ip_address
  ) VALUES (
    v_actor_id,
    'order.physical_delete',
    'order',
    v_order_id,
    jsonb_build_object(
      'order_code', v_order.order_code,
      'order_status', v_order.order_status,
      'payment_status', v_order.payment_status,
      'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount,
      'inventory_restored', v_restored_lines,
      'voucher_released', v_voucher_released
    ),
    jsonb_build_object('result', 'deleted', 'reason', v_reason),
    NULL
  );

  RETURN jsonb_build_object(
    'outcome', 'deleted',
    'eligible', true,
    'order_id', v_order_id,
    'order_code', v_order.order_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_order_deletion_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_order_deletion_atomic(jsonb) TO service_role;

COMMENT ON FUNCTION public.manage_order_deletion_atomic(jsonb) IS
  'Preview/recheck/delete unpaid, not-started-delivery orders with atomic inventory reversal and minimal audit.';
