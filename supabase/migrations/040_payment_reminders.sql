-- Durable, rate-limited claims for admin-triggered unpaid-order reminders.
CREATE TABLE IF NOT EXISTS public.payment_reminders (
  reminder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel = 'email'),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'simulated', 'failed')),
  actor_member_id UUID NOT NULL REFERENCES public.members(member_id),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_order_created
  ON public.payment_reminders(order_id, created_at DESC);
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role all payment reminders" ON public.payment_reminders;
CREATE POLICY "Service role all payment reminders" ON public.payment_reminders
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.payment_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_reminders TO service_role;

CREATE OR REPLACE FUNCTION public.claim_payment_reminder(p JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor UUID; v_order public.orders%ROWTYPE; v_email TEXT;
  v_reminder_id UUID; v_last_at TIMESTAMPTZ;
BEGIN
  BEGIN v_actor := NULLIF(p->>'actor_member_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('outcome', 'invalid_actor'); END;
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members WHERE member_id = v_actor AND role = 'admin' AND status = 'active'
  ) THEN RETURN jsonb_build_object('outcome', 'forbidden'); END IF;

  SELECT * INTO v_order FROM public.orders
   WHERE order_id::TEXT = NULLIF(p->>'order_id', '') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_order.payment_status <> 'pending'::public.payment_status
     OR v_order.order_status NOT IN ('pending'::public.order_status, 'confirmed'::public.order_status)
     OR v_order.payment_method <> 'banking'::public.payment_method THEN
    RETURN jsonb_build_object('outcome', 'ineligible_state');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payments WHERE order_id = v_order.order_id AND payment_status IN ('paid', 'pending')
  ) OR EXISTS (
    SELECT 1 FROM public.payment_events WHERE matched_order_id = v_order.order_id AND outcome IS DISTINCT FROM 'duplicate'
  ) THEN RETURN jsonb_build_object('outcome', 'payment_requires_review', 'needs_review', TRUE); END IF;

  SELECT email INTO v_email FROM public.customers WHERE customer_id = v_order.customer_id;
  IF NULLIF(btrim(v_email), '') IS NULL THEN RETURN jsonb_build_object('outcome', 'missing_email'); END IF;
  SELECT max(created_at) INTO v_last_at FROM public.payment_reminders
   WHERE order_id = v_order.order_id AND status IN ('queued', 'sent', 'simulated');
  IF v_last_at IS NOT NULL AND v_last_at > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('outcome', 'cooldown', 'retry_after', v_last_at + interval '24 hours');
  END IF;

  INSERT INTO public.payment_reminders(order_id, channel, status, actor_member_id)
  VALUES (v_order.order_id, 'email', 'queued', v_actor) RETURNING reminder_id INTO v_reminder_id;
  INSERT INTO public.audit_logs(actor_member_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_actor, 'payment.reminder_claim', 'order', v_order.order_id,
    jsonb_build_object('payment_status', v_order.payment_status, 'order_status', v_order.order_status),
    jsonb_build_object('reminder_id', v_reminder_id, 'channel', 'email', 'status', 'queued'));
  RETURN jsonb_build_object('outcome', 'claimed', 'reminder_id', v_reminder_id,
    'order_id', v_order.order_id, 'order_code', v_order.order_code,
    'recipient_email', lower(btrim(v_email)));
END; $$;
REVOKE ALL ON FUNCTION public.claim_payment_reminder(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_reminder(JSONB) TO service_role;
