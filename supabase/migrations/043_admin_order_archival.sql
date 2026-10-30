-- Administrative order removal is a logical archive. The order row and all
-- payment/provider, inventory, shipment, history and audit evidence remain.

CREATE TABLE public.admin_order_archives (
  order_id UUID PRIMARY KEY REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  snapshot JSONB NOT NULL,
  archived_by_member_id UUID NOT NULL REFERENCES public.members(member_id) ON DELETE RESTRICT,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_order_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_order_archives FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_order_archives TO service_role;
CREATE POLICY "Service role admin order archives" ON public.admin_order_archives
  FOR ALL TO service_role USING (true) WITH CHECK (true);

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
      'payment_events', (SELECT count(*) FROM public.payment_events WHERE matched_order_id = v_order_id)
    ),
    v_actor
  );
  INSERT INTO public.audit_logs(actor_member_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (
    v_actor, 'order.archive', 'order', v_order_id,
    jsonb_build_object('order_code', v_order.order_code, 'order_status', v_order.order_status,
      'payment_status', v_order.payment_status, 'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount),
    jsonb_build_object('reason', v_reason, 'removed_from_active_views', true,
      'order_deleted', false, 'financial_ledger_preserved', true)
  );
  RETURN jsonb_build_object(
    'outcome', 'archived', 'order_id', v_order_id, 'order_code', v_order.order_code,
    'financial_ledger_preserved', true
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('outcome', 'already_archived', 'order_id', v_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_order_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_order_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.archive_order_atomic(JSONB) IS
  'Admin-only logical order removal. Preserves order, payment, provider, inventory, shipment and audit evidence.';
