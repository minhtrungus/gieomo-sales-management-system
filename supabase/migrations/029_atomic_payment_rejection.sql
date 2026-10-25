-- Atomic admin rejection: order lock + state transition + history + audit.

CREATE OR REPLACE FUNCTION public.reject_payment_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_actor UUID;
  v_reason TEXT := btrim(COALESCE(p->>'reason', ''));
  v_note TEXT;
BEGIN
  BEGIN
    v_actor := NULLIF(p->>'actor_member_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END;

  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members
     WHERE member_id = v_actor AND role = 'admin' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END IF;
  IF v_reason = '' OR length(v_reason) > 500 THEN
    RETURN jsonb_build_object('outcome', 'invalid_reason');
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE (NULLIF(p->>'order_id', '') IS NOT NULL AND order_id::text = p->>'order_id')
      OR (NULLIF(p->>'order_code', '') IS NOT NULL AND order_code = upper(btrim(p->>'order_code')))
   ORDER BY CASE WHEN order_id::text = p->>'order_id' THEN 0 ELSE 1 END
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_order.payment_status = 'failed' THEN
    RETURN jsonb_build_object(
      'outcome', 'already_rejected', 'order_id', v_order.order_id,
      'order_code', v_order.order_code, 'payment_status', v_order.payment_status
    );
  END IF;
  IF v_order.payment_status <> 'pending' THEN
    RETURN jsonb_build_object(
      'outcome', 'invalid_state', 'order_id', v_order.order_id,
      'order_code', v_order.order_code, 'payment_status', v_order.payment_status
    );
  END IF;

  v_note := CASE WHEN NULLIF(v_order.internal_note, '') IS NULL
    THEN '[HỦY THANH TOÁN] Lý do: ' || v_reason
    ELSE v_order.internal_note || ' | [HỦY THANH TOÁN] Lý do: ' || v_reason END;

  UPDATE public.orders
     SET payment_status = 'failed', internal_note = v_note, updated_at = now()
   WHERE order_id = v_order.order_id;

  INSERT INTO public.order_status_history (
    order_id, status_type, from_status, to_status, changed_by_member_id, note
  ) VALUES (
    v_order.order_id, 'payment', 'pending', 'failed', v_actor,
    'Từ chối thanh toán bởi admin: ' || v_reason
  );

  INSERT INTO public.audit_logs (
    actor_member_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_actor, 'payment.reject', 'order', v_order.order_id,
    jsonb_build_object('payment_status', v_order.payment_status, 'internal_note', v_order.internal_note),
    jsonb_build_object('payment_status', 'failed', 'internal_note', v_note, 'reason', v_reason)
  );

  RETURN jsonb_build_object(
    'outcome', 'rejected', 'order_id', v_order.order_id,
    'order_code', v_order.order_code, 'payment_status', 'failed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.reject_payment_atomic(JSONB) IS
  'Atomic, row-locked pending-to-failed admin payment rejection with history and audit.';
