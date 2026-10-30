-- Controlled compensation for an erroneous ADMIN CASH confirmation.
-- This never deletes or rewrites payments/payment_events. Bank transfers and
-- fulfilled orders remain reconciliation/refund cases and cannot be reversed.

CREATE TABLE IF NOT EXISTS public.payment_confirmation_adjustments (
  adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES public.payments(payment_id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL DEFAULT 'manual_unconfirm'
    CHECK (adjustment_type = 'manual_unconfirm'),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  actor_member_id UUID NOT NULL REFERENCES public.members(member_id),
  before_data JSONB NOT NULL,
  after_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_confirmation_adjustments_order
  ON public.payment_confirmation_adjustments(order_id, created_at DESC);

ALTER TABLE public.payment_confirmation_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role all payment confirmation adjustments"
  ON public.payment_confirmation_adjustments;
CREATE POLICY "Service role all payment confirmation adjustments"
  ON public.payment_confirmation_adjustments FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.payment_confirmation_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.payment_confirmation_adjustments TO service_role;

CREATE OR REPLACE FUNCTION public.adjust_payment_confirmation_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_reason TEXT := btrim(COALESCE(p->>'reason', ''));
  v_expected_updated_at TIMESTAMPTZ;
  v_paid_count INTEGER;
  v_provider TEXT;
  v_adjustment_id UUID;
  v_note TEXT;
BEGIN
  BEGIN
    v_actor := NULLIF(p->>'actor_member_id', '')::UUID;
    v_expected_updated_at := NULLIF(p->>'expected_updated_at', '')::TIMESTAMPTZ;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_input');
  END;

  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members
     WHERE member_id = v_actor AND role = 'admin' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;
  IF char_length(v_reason) < 8 OR char_length(v_reason) > 500 THEN
    RETURN jsonb_build_object('outcome', 'invalid_reason');
  END IF;
  IF v_expected_updated_at IS NULL THEN
    RETURN jsonb_build_object('outcome', 'missing_version');
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE order_id::TEXT = NULLIF(p->>'order_id', '')
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;

  IF v_order.updated_at IS DISTINCT FROM v_expected_updated_at THEN
    RETURN jsonb_build_object('outcome', 'version_conflict');
  END IF;
  IF v_order.payment_status <> 'paid'::public.payment_status THEN
    RETURN jsonb_build_object('outcome', 'invalid_payment_state');
  END IF;
  IF v_order.order_status NOT IN ('pending'::public.order_status, 'confirmed'::public.order_status)
     OR v_order.delivery_status <> 'not_ready'::public.delivery_status THEN
    RETURN jsonb_build_object('outcome', 'fulfillment_started');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_status_history
     WHERE order_id = v_order.order_id
       AND ((status_type = 'order' AND to_status IN ('shipping', 'completed'))
         OR (status_type = 'delivery' AND to_status NOT IN ('not_ready')))
  ) THEN
    RETURN jsonb_build_object('outcome', 'irreversible_history');
  END IF;

  SELECT count(*) INTO v_paid_count
    FROM public.payments
   WHERE order_id = v_order.order_id AND payment_status = 'paid';
  IF v_paid_count <> 1 THEN
    RETURN jsonb_build_object('outcome', 'ambiguous_ledger', 'needs_review', TRUE);
  END IF;

  SELECT * INTO v_payment
    FROM public.payments
   WHERE order_id = v_order.order_id AND payment_status = 'paid'
   FOR UPDATE;

  SELECT provider INTO v_provider
    FROM public.payment_events
   WHERE matched_order_id = v_order.order_id
     AND provider_transaction_id = v_payment.transaction_code
     AND outcome = 'applied'
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_payment.payment_method <> 'cod'::public.payment_method OR v_provider IS DISTINCT FROM 'cash' THEN
    RETURN jsonb_build_object(
      'outcome', 'external_money_requires_reconciliation',
      'needs_review', TRUE,
      'message', 'Giao dịch ngân hàng/ngoài hệ thống không thể hủy xác nhận trong ứng dụng'
    );
  END IF;

  v_note := CASE WHEN NULLIF(v_order.internal_note, '') IS NULL THEN '' ELSE v_order.internal_note || ' | ' END
    || '[ĐIỀU CHỈNH THANH TOÁN] Hủy xác nhận tiền mặt; sổ giao dịch được giữ nguyên. Lý do: ' || v_reason;

  INSERT INTO public.payment_confirmation_adjustments (
    order_id, payment_id, reason, actor_member_id, before_data, after_data
  ) VALUES (
    v_order.order_id, v_payment.payment_id, v_reason, v_actor,
    jsonb_build_object('payment_status', v_order.payment_status, 'order_status', v_order.order_status,
      'updated_at', v_order.updated_at, 'payment_id', v_payment.payment_id),
    jsonb_build_object('payment_status', 'pending', 'order_status', v_order.order_status,
      'payment_ledger_preserved', TRUE)
  ) RETURNING adjustment_id INTO v_adjustment_id;

  UPDATE public.orders
     SET payment_status = 'pending', internal_note = v_note, updated_at = now()
   WHERE order_id = v_order.order_id;

  INSERT INTO public.order_status_history (
    order_id, status_type, from_status, to_status, note, changed_by_member_id
  ) VALUES (
    v_order.order_id, 'payment', 'paid', 'pending',
    'Điều chỉnh xác nhận tiền mặt; không hoàn tiền và không xóa ledger. Lý do: ' || v_reason,
    v_actor
  );

  INSERT INTO public.audit_logs (
    actor_member_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_actor, 'payment.manual_unconfirm', 'order', v_order.order_id,
    jsonb_build_object('payment_status', v_order.payment_status, 'order_status', v_order.order_status,
      'payment_id', v_payment.payment_id),
    jsonb_build_object('payment_status', 'pending', 'order_status', v_order.order_status,
      'adjustment_id', v_adjustment_id, 'reason', v_reason, 'payment_ledger_preserved', TRUE)
  );

  RETURN jsonb_build_object(
    'outcome', 'adjusted', 'order_id', v_order.order_id, 'order_code', v_order.order_code,
    'payment_status', 'pending', 'order_status', v_order.order_status,
    'adjustment_id', v_adjustment_id, 'payment_ledger_preserved', TRUE,
    'message', 'Đã điều chỉnh xác nhận tiền mặt trong ứng dụng; không có thao tác hoàn tiền'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_payment_confirmation_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_payment_confirmation_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.adjust_payment_confirmation_atomic(JSONB) IS
  'Admin-only, locked compensating adjustment for one reversible cash confirmation; preserves immutable payment/event evidence.';
