-- H51: allow completed idempotency claims to be cleaned up during a
-- fail-closed physical order deletion.
--
-- Why: since migration 025 every order created through
-- create_order_atomic leaves a completed row in order_idempotency whose
-- order_id points at the order (UNIQUE(order_id), ON DELETE RESTRICT).
-- Migration 034 treats any such row as hard evidence and blocks physical
-- deletion with "idempotency_claim_present", which makes EVERY
-- atomic-created order — including draft test orders — permanently
-- undeletable. The claim is idempotency infrastructure bound to the
-- order's identity, not business evidence: once the order itself is
-- physically deleted, keeping the claim only leaks a stale ledger row
-- and permanently burns the idempotency key.
--
-- This migration keeps every 034 protection unchanged (active admin,
-- preview + reason + XOA + fresh preview token, pending payment state,
-- not-ready delivery, zero payments/payment events/shipments, zero
-- non-initial business history, zero inventory effects, no voucher or
-- lifecycle timestamps). The ONLY behavior change: the order's own
-- completed idempotency claim(s) are removed as part of the atomic
-- deletion instead of blocking it, and preview reports the claim count
-- as removable relations evidence instead of a blocker.

CREATE OR REPLACE FUNCTION public.manage_order_deletion_atomic(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := lower(COALESCE(NULLIF(btrim(p->>'mode'), ''), ''));
  v_reason text := NULLIF(btrim(p->>'reason'), '');
  v_confirmation text := upper(COALESCE(NULLIF(btrim(p->>'confirmation'), ''), ''));
  v_order_id uuid;
  v_actor_id uuid;
  v_order public.orders%ROWTYPE;
  v_payments integer;
  v_events integer;
  v_shipments integer;
  v_reservations integer;
  v_history integer;
  v_claims integer;
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  IF v_mode NOT IN ('preview', 'delete') OR v_reason IS NULL THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END IF;
  BEGIN
    v_order_id := NULLIF(p->>'order_id', '')::uuid;
    v_actor_id := NULLIF(p->>'actor_member_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END;
  IF v_order_id IS NULL OR v_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members WHERE member_id = v_actor_id AND role = 'admin' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor');
  END IF;

  IF v_mode = 'delete' THEN
    SELECT * INTO v_order FROM public.orders WHERE order_id = v_order_id FOR UPDATE;
  ELSE
    SELECT * INTO v_order FROM public.orders WHERE order_id = v_order_id;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;

  SELECT count(*) INTO v_payments FROM public.payments WHERE order_id = v_order_id;
  SELECT count(*) INTO v_events FROM public.payment_events WHERE matched_order_id = v_order_id;
  SELECT count(*) INTO v_shipments FROM public.shipments WHERE order_id = v_order_id;
  SELECT count(*) INTO v_reservations FROM public.order_inventory_reservations WHERE order_id = v_order_id;
  SELECT count(*) INTO v_claims FROM public.order_idempotency WHERE order_id = v_order_id;
  SELECT count(*) INTO v_history FROM public.order_status_history
    WHERE order_id = v_order_id
      AND NOT (status_type = 'order' AND from_status IS NULL AND to_status = 'pending');

  IF v_order.order_status::text <> 'pending' THEN v_blockers := v_blockers || '"order_not_draft"'::jsonb; END IF;
  IF v_order.payment_status::text <> 'pending' THEN v_blockers := v_blockers || '"payment_state_not_pending"'::jsonb; END IF;
  IF COALESCE(v_order.delivery_status::text, 'not_ready') <> 'not_ready' THEN v_blockers := v_blockers || '"delivery_started"'::jsonb; END IF;
  IF v_payments > 0 THEN v_blockers := v_blockers || '"payment_evidence_present"'::jsonb; END IF;
  IF v_events > 0 THEN v_blockers := v_blockers || '"payment_event_present"'::jsonb; END IF;
  IF v_shipments > 0 THEN v_blockers := v_blockers || '"shipment_present"'::jsonb; END IF;
  IF v_history > 0 THEN v_blockers := v_blockers || '"business_history_present"'::jsonb; END IF;
  IF v_reservations > 0 OR v_order.inventory_reservation_recorded_at IS NOT NULL THEN v_blockers := v_blockers || '"inventory_effect_present"'::jsonb; END IF;
  -- H51: a completed idempotency claim is no longer a deletion blocker.
  -- It is removed atomically with the order below (the ledger row holds an
  -- ON DELETE RESTRICT foreign key, so it must be cleared before the order).
  IF v_order.voucher_id IS NOT NULL OR v_order.confirmed_at IS NOT NULL OR v_order.completed_at IS NOT NULL OR v_order.cancelled_at IS NOT NULL THEN
    v_blockers := v_blockers || '"lifecycle_effect_present"'::jsonb;
  END IF;

  IF jsonb_array_length(v_blockers) > 0 THEN
    RETURN jsonb_build_object(
      'outcome', 'blocked', 'eligible', false, 'order_id', v_order_id,
      'order_code', v_order.order_code, 'order_status', v_order.order_status,
      'payment_status', v_order.payment_status, 'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount, 'blockers', v_blockers,
      'relations', jsonb_build_object('payments', v_payments, 'payment_events', v_events,
        'shipments', v_shipments, 'reservations', v_reservations,
        'business_history', v_history, 'idempotency_claims', v_claims)
    );
  END IF;

  IF v_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'outcome', 'eligible', 'eligible', true, 'order_id', v_order_id,
      'order_code', v_order.order_code, 'order_status', v_order.order_status,
      'payment_status', v_order.payment_status, 'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount, 'updated_at', v_order.updated_at,
      'relations', jsonb_build_object(
        'order_items', (SELECT count(*) FROM public.order_items WHERE order_id = v_order_id),
        'initial_history', (SELECT count(*) FROM public.order_status_history WHERE order_id = v_order_id),
        'payments', 0, 'payment_events', 0, 'shipments', 0, 'reservations', 0, 'idempotency_claims', v_claims)
    );
  END IF;

  IF v_confirmation <> 'XOA' THEN RETURN jsonb_build_object('outcome', 'invalid_request'); END IF;
  BEGIN
    IF NULLIF(p->>'expected_updated_at', '') IS NULL
       OR v_order.updated_at IS DISTINCT FROM (p->>'expected_updated_at')::timestamptz THEN
      RETURN jsonb_build_object('outcome', 'stale_preview', 'eligible', false);
    END IF;
  EXCEPTION WHEN invalid_datetime_format THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END;

  -- Only the order's own idempotency claim, initial history and line
  -- snapshots may cascade. All financial, shipment, inventory and business
  -- history evidence was proven absent above; the claim is idempotency
  -- infrastructure bound to this order's identity and is cleared first
  -- because it carries an ON DELETE RESTRICT foreign key.
  DELETE FROM public.order_idempotency WHERE order_id = v_order_id;
  DELETE FROM public.orders WHERE order_id = v_order_id;
  INSERT INTO public.audit_logs(actor_member_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_actor_id, 'order.physical_delete', 'order', v_order_id,
    jsonb_build_object('order_code', v_order.order_code, 'order_status', v_order.order_status,
      'payment_status', v_order.payment_status, 'delivery_status', v_order.delivery_status,
      'final_amount', v_order.final_amount),
    jsonb_build_object('result', 'deleted', 'reason', v_reason, 'idempotency_claims_removed', v_claims));
  RETURN jsonb_build_object('outcome', 'deleted', 'eligible', true, 'order_id', v_order_id, 'order_code', v_order.order_code, 'idempotency_claims_removed', v_claims);
END;
$$;
