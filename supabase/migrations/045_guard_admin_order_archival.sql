-- Administrative archival is a visibility operation, not cancellation,
-- restocking, return processing, or refunding. Only terminal orders may leave
-- active operational views; every ledger and stock fact remains untouched.

CREATE OR REPLACE FUNCTION public.archive_order_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_actor UUID;
  v_reason TEXT := NULLIF(btrim(p->>'reason'), '');
  v_order public.orders%ROWTYPE;
  v_reservation_rows INTEGER;
  v_reserved_units INTEGER;
BEGIN
  BEGIN
    v_order_id := NULLIF(p->>'order_id', '')::UUID;
    v_actor := NULLIF(p->>'actor_member_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END;
  IF v_order_id IS NULL OR v_actor IS NULL OR v_reason IS NULL OR char_length(v_reason) > 500 THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members
     WHERE member_id = v_actor AND role = 'admin' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE order_id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF EXISTS (SELECT 1 FROM public.admin_order_archives WHERE order_id = v_order_id) THEN
    RETURN jsonb_build_object('outcome', 'already_archived', 'order_id', v_order_id, 'order_code', v_order.order_code);
  END IF;

  -- Non-terminal orders must remain in operational views. Cancellation is the
  -- separate, audited flow that releases reservations; returns/restocks and
  -- refunds likewise require their own explicit business processes.
  IF v_order.order_status::text NOT IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'outcome', 'not_terminal',
      'order_id', v_order_id,
      'order_code', v_order.order_code,
      'order_status', v_order.order_status,
      'payment_status', v_order.payment_status,
      'delivery_status', v_order.delivery_status
    );
  END IF;

  SELECT count(*)::integer, COALESCE(sum(quantity), 0)::integer
    INTO v_reservation_rows, v_reserved_units
    FROM public.order_inventory_reservations
   WHERE order_id = v_order_id;

  INSERT INTO public.admin_order_archives(order_id, reason, snapshot, archived_by_member_id)
  VALUES (
    v_order_id,
    v_reason,
    jsonb_build_object(
      'order_code', v_order.order_code,
      'order_status', v_order.order_status,
      'payment_status', v_order.payment_status,
      'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount,
      'updated_at', v_order.updated_at,
      'payment_rows', (SELECT count(*) FROM public.payments WHERE order_id = v_order_id),
      'payment_events', (SELECT count(*) FROM public.payment_events WHERE matched_order_id = v_order_id),
      'reservation_rows', v_reservation_rows,
      'reserved_units', v_reserved_units
    ),
    v_actor
  );
  INSERT INTO public.audit_logs(actor_member_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (
    v_actor, 'order.archive', 'order', v_order_id,
    jsonb_build_object('order_code', v_order.order_code, 'order_status', v_order.order_status,
      'payment_status', v_order.payment_status, 'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount, 'reservation_rows', v_reservation_rows,
      'reserved_units', v_reserved_units),
    jsonb_build_object('reason', v_reason, 'removed_from_active_views', true,
      'order_deleted', false, 'financial_ledger_preserved', true,
      'inventory_unchanged', true, 'refund_created', false, 'restock_created', false)
  );
  RETURN jsonb_build_object(
    'outcome', 'archived', 'order_id', v_order_id, 'order_code', v_order.order_code,
    'financial_ledger_preserved', true, 'inventory_unchanged', true,
    'refund_created', false, 'restock_created', false
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('outcome', 'already_archived', 'order_id', v_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_order_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_order_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.archive_order_atomic(JSONB) IS
  'Admin-only logical archival for terminal orders. Never changes inventory, reservations, payments, provider events, shipments, or order status.';

DO $$
BEGIN
  IF to_regprocedure('public.archive_order_atomic(jsonb)') IS NULL
     OR has_function_privilege('anon', 'public.archive_order_atomic(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.archive_order_atomic(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.archive_order_atomic(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '045: invalid archive function or runtime ACL';
  END IF;
END $$;
