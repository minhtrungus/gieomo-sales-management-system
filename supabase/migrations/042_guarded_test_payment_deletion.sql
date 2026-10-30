-- Guarded physical deletion for verified, isolated, synthetic cash test orders.
-- Historical orders are intentionally not backfilled: provenance is trustworthy
-- only when this migration's trigger records it in the order INSERT transaction.

CREATE TABLE public.test_order_provenance (
  order_id UUID PRIMARY KEY REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  project_ref TEXT NOT NULL REFERENCES public.test_cleanup_environments(project_ref) ON DELETE RESTRICT,
  environment_kind TEXT NOT NULL CHECK (environment_kind IN ('local', 'test', 'preview')),
  evidence_kind TEXT NOT NULL DEFAULT 'database_insert_trigger'
    CHECK (evidence_kind = 'database_insert_trigger'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.capture_isolated_test_order_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_project_ref TEXT;
  v_environment_kind TEXT;
BEGIN
  SELECT count(*), min(project_ref), min(environment_kind)
    INTO v_count, v_project_ref, v_environment_kind
    FROM public.test_cleanup_environments
   WHERE cleanup_enabled IS TRUE
     AND environment_kind IN ('local', 'test', 'preview');

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Ambiguous test cleanup environment configuration';
  END IF;
  IF v_count = 1 THEN
    INSERT INTO public.test_order_provenance(order_id, project_ref, environment_kind)
    VALUES (NEW.order_id, v_project_ref, v_environment_kind);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_isolated_test_order_provenance ON public.orders;
CREATE TRIGGER trg_capture_isolated_test_order_provenance
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_isolated_test_order_provenance();

CREATE TABLE public.test_payment_deletion_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_ref TEXT NOT NULL REFERENCES public.test_cleanup_environments(project_ref) ON DELETE RESTRICT,
  actor_member_id UUID NOT NULL REFERENCES public.members(member_id) ON DELETE RESTRICT,
  session_binding_hash TEXT NOT NULL CHECK (session_binding_hash ~ '^[0-9a-f]{64}$'),
  confirmation_hash TEXT NOT NULL CHECK (confirmation_hash ~ '^[0-9a-f]{64}$'),
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  order_ids UUID[] NOT NULL CHECK (cardinality(order_ids) BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('deleted')),
  CHECK (expires_at > created_at)
);
CREATE INDEX idx_test_payment_deletion_challenges_actor_created
  ON public.test_payment_deletion_challenges(actor_member_id, project_ref, created_at DESC);

CREATE TABLE public.test_payment_deletion_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL UNIQUE REFERENCES public.test_payment_deletion_challenges(challenge_id) ON DELETE RESTRICT,
  project_ref TEXT NOT NULL REFERENCES public.test_cleanup_environments(project_ref) ON DELETE RESTRICT,
  actor_member_id UUID NOT NULL REFERENCES public.members(member_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  order_identifiers JSONB NOT NULL,
  evidence_summary JSONB NOT NULL,
  deleted_counts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.test_order_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_payment_deletion_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_payment_deletion_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_order_provenance, public.test_payment_deletion_challenges,
  public.test_payment_deletion_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.test_order_provenance, public.test_payment_deletion_challenges,
  public.test_payment_deletion_batches TO service_role;
CREATE POLICY "Service role test order provenance" ON public.test_order_provenance
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role deletion challenges" ON public.test_payment_deletion_challenges
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role deletion batches" ON public.test_payment_deletion_batches
  FOR SELECT TO service_role USING (true);

CREATE OR REPLACE FUNCTION public.test_payment_deletion_snapshot(p_order_ids UUID[], p_project_ref TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH requested AS (
  SELECT order_id FROM unnest(p_order_ids) AS order_id
), facts AS (
  SELECT o.order_id, o.order_code, o.order_status::TEXT, o.payment_status::TEXT,
    o.delivery_status::TEXT, o.payment_method::TEXT, o.final_amount, o.updated_at,
    tp.project_ref AS provenance_project_ref, tp.environment_kind,
    tp.evidence_kind, tp.created_at AS provenance_created_at,
    (SELECT count(*)::INTEGER FROM public.payments p WHERE p.order_id = o.order_id) AS payment_count,
    (SELECT count(*)::INTEGER FROM public.payments p WHERE p.order_id = o.order_id
      AND p.payment_method = 'cod' AND p.payment_status = 'paid'
      AND p.amount = o.final_amount AND p.transaction_code = 'CASH-' || o.order_code) AS synthetic_cash_payment_count,
    (SELECT encode(digest(string_agg(p.transaction_code, ',' ORDER BY p.payment_id), 'sha256'), 'hex')
       FROM public.payments p WHERE p.order_id = o.order_id) AS payment_identity_hash,
    (SELECT count(*)::INTEGER FROM public.payment_events pe WHERE pe.matched_order_id = o.order_id) AS payment_event_count,
    (SELECT count(*)::INTEGER FROM public.payment_events pe WHERE pe.matched_order_id = o.order_id
      AND pe.provider = 'cash' AND pe.provider_transaction_id = 'CASH-' || o.order_code
      AND pe.outcome = 'applied') AS synthetic_cash_event_count,
    (SELECT count(*)::INTEGER FROM public.shipments s WHERE s.order_id = o.order_id) AS shipment_count,
    (SELECT count(*)::INTEGER FROM public.payment_confirmation_adjustments a WHERE a.order_id = o.order_id) AS adjustment_count,
    (SELECT count(*)::INTEGER FROM public.payment_reminders r WHERE r.order_id = o.order_id) AS reminder_count,
    (SELECT count(*)::INTEGER FROM public.test_order_archives a WHERE a.order_id = o.order_id) AS archive_count,
    (SELECT count(*)::INTEGER FROM public.order_items i WHERE i.order_id = o.order_id) AS order_item_count,
    (SELECT count(*)::INTEGER FROM public.order_status_history h WHERE h.order_id = o.order_id) AS history_count,
    (SELECT count(*)::INTEGER FROM public.order_inventory_reservations r WHERE r.order_id = o.order_id) AS reservation_count,
    (SELECT count(*)::INTEGER FROM public.order_idempotency i WHERE i.order_id = o.order_id) AS idempotency_count,
    o.cancellation_effects_completed_at
  FROM requested q
  LEFT JOIN public.orders o ON o.order_id = q.order_id
  LEFT JOIN public.test_order_provenance tp ON tp.order_id = o.order_id
), evaluated AS (
  SELECT *, ARRAY_REMOVE(ARRAY[
    CASE WHEN order_code IS NULL THEN 'order_not_found' END,
    CASE WHEN provenance_project_ref IS DISTINCT FROM p_project_ref THEN 'trusted_test_provenance_missing' END,
    CASE WHEN order_status IS DISTINCT FROM 'cancelled' THEN 'order_not_safely_cancelled' END,
    CASE WHEN payment_status IS DISTINCT FROM 'paid' THEN 'order_not_paid' END,
    CASE WHEN delivery_status IS DISTINCT FROM 'not_ready' THEN 'delivery_started' END,
    CASE WHEN cancellation_effects_completed_at IS NULL THEN 'cancellation_effects_unverified' END,
    CASE WHEN payment_method IS DISTINCT FROM 'cod' THEN 'external_or_provider_payment_blocked' END,
    CASE WHEN payment_count IS DISTINCT FROM 1 OR synthetic_cash_payment_count IS DISTINCT FROM 1
      THEN 'non_synthetic_payment_ledger_blocked' END,
    CASE WHEN payment_event_count IS DISTINCT FROM 1 OR synthetic_cash_event_count IS DISTINCT FROM 1
      THEN 'provider_or_ambiguous_payment_event_blocked' END,
    CASE WHEN shipment_count IS DISTINCT FROM 0 THEN 'shipment_exists' END,
    CASE WHEN adjustment_count IS DISTINCT FROM 0 THEN 'payment_adjustment_exists' END,
    CASE WHEN reminder_count IS DISTINCT FROM 0 THEN 'payment_reminder_exists' END,
    CASE WHEN archive_count IS DISTINCT FROM 0 THEN 'legacy_archive_exists' END
  ]::TEXT[], NULL) AS blockers
  FROM facts
), rows AS (
  SELECT jsonb_build_object(
    'order_id', order_id, 'order_code', order_code, 'order_status', order_status,
    'payment_status', payment_status, 'delivery_status', delivery_status,
    'payment_method', payment_method, 'final_amount', final_amount, 'updated_at', updated_at,
    'provenance_project_ref', provenance_project_ref, 'environment_kind', environment_kind,
    'evidence_kind', evidence_kind, 'provenance_created_at', provenance_created_at,
    'payment_count', payment_count, 'payment_event_count', payment_event_count,
    'payment_identity_hash', payment_identity_hash, 'shipment_count', shipment_count,
    'adjustment_count', adjustment_count, 'reminder_count', reminder_count,
    'order_item_count', order_item_count, 'history_count', history_count,
    'reservation_count', reservation_count, 'idempotency_count', idempotency_count,
    'eligible', cardinality(blockers) = 0, 'blockers', to_jsonb(blockers)
  ) AS row, order_id, cardinality(blockers) = 0 AS eligible
  FROM evaluated
), aggregate AS (
  SELECT COALESCE(jsonb_agg(row ORDER BY order_id), '[]'::jsonb) AS orders,
    count(*)::INTEGER AS order_count, bool_and(eligible) AS all_eligible
  FROM rows
)
SELECT jsonb_build_object('orders', orders, 'order_count', order_count,
  'all_eligible', COALESCE(all_eligible, FALSE),
  'snapshot_hash', encode(digest(orders::TEXT, 'sha256'), 'hex'))
FROM aggregate;
$$;

CREATE OR REPLACE FUNCTION public.manage_test_payment_deletion_atomic(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode TEXT := lower(btrim(COALESCE(p->>'mode', '')));
  v_project_ref TEXT := btrim(COALESCE(p->>'project_ref', ''));
  v_reason TEXT := btrim(COALESCE(p->>'reason', ''));
  v_actor UUID;
  v_challenge_id UUID;
  v_order_ids UUID[];
  v_snapshot JSONB;
  v_challenge public.test_payment_deletion_challenges%ROWTYPE;
  v_confirmation_hash TEXT := lower(COALESCE(p->>'confirmation_hash', ''));
  v_session_hash TEXT := lower(COALESCE(p->>'session_binding_hash', ''));
  v_batch_id UUID;
  v_deleted_orders INTEGER := 0;
  v_deleted_payments INTEGER := 0;
  v_deleted_items INTEGER := 0;
  v_deleted_history INTEGER := 0;
  v_deleted_reservations INTEGER := 0;
  v_deleted_idempotency INTEGER := 0;
BEGIN
  BEGIN
    v_actor := NULLIF(p->>'actor_member_id', '')::UUID;
    IF NULLIF(p->>'challenge_id', '') IS NOT NULL THEN v_challenge_id := (p->>'challenge_id')::UUID; END IF;
    SELECT array_agg(value::UUID ORDER BY value::UUID) INTO v_order_ids
      FROM jsonb_array_elements_text(COALESCE(p->'order_ids', '[]'::jsonb));
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END;

  IF v_mode NOT IN ('preview', 'issue', 'delete') OR v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.members WHERE member_id = v_actor AND role = 'admin' AND status = 'active'
  ) THEN RETURN jsonb_build_object('outcome', 'permission_denied'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.test_cleanup_environments
    WHERE project_ref = v_project_ref AND cleanup_enabled IS TRUE
      AND environment_kind IN ('local', 'test', 'preview')) THEN
    RETURN jsonb_build_object('outcome', 'environment_unverified');
  END IF;

  IF v_mode IN ('preview', 'issue') THEN
    IF cardinality(v_order_ids) NOT BETWEEN 1 AND 10
       OR cardinality(v_order_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_order_ids) x) THEN
      RETURN jsonb_build_object('outcome', 'invalid_batch');
    END IF;
    v_snapshot := public.test_payment_deletion_snapshot(v_order_ids, v_project_ref);
    IF NOT COALESCE((v_snapshot->>'all_eligible')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object('outcome', 'blocked') || v_snapshot;
    END IF;
    IF v_mode = 'preview' THEN RETURN jsonb_build_object('outcome', 'eligible') || v_snapshot; END IF;
    IF v_confirmation_hash !~ '^[0-9a-f]{64}$' OR v_session_hash !~ '^[0-9a-f]{64}$' THEN
      RETURN jsonb_build_object('outcome', 'invalid_challenge_binding');
    END IF;
    IF (SELECT count(*) FROM public.test_payment_deletion_challenges
         WHERE actor_member_id = v_actor AND project_ref = v_project_ref
           AND created_at > now() - interval '15 minutes') >= 3 THEN
      RETURN jsonb_build_object('outcome', 'rate_limited');
    END IF;
    INSERT INTO public.test_payment_deletion_challenges(
      project_ref, actor_member_id, session_binding_hash, confirmation_hash,
      snapshot_hash, order_ids, expires_at
    ) VALUES (v_project_ref, v_actor, v_session_hash, v_confirmation_hash,
      v_snapshot->>'snapshot_hash', v_order_ids, now() + interval '5 minutes')
    RETURNING challenge_id, expires_at INTO v_challenge_id, v_challenge.expires_at;
    RETURN jsonb_build_object('outcome', 'challenge_issued', 'challenge_id', v_challenge_id,
      'expires_at', v_challenge.expires_at, 'snapshot_hash', v_snapshot->>'snapshot_hash');
  END IF;

  IF v_challenge_id IS NULL OR char_length(v_reason) NOT BETWEEN 8 AND 500
     OR v_confirmation_hash !~ '^[0-9a-f]{64}$' OR v_session_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END IF;
  SELECT * INTO v_challenge FROM public.test_payment_deletion_challenges
   WHERE challenge_id = v_challenge_id FOR UPDATE;
  IF NOT FOUND OR v_challenge.project_ref <> v_project_ref OR v_challenge.actor_member_id <> v_actor
     OR v_challenge.session_binding_hash <> v_session_hash THEN
    RETURN jsonb_build_object('outcome', 'challenge_not_found');
  END IF;
  IF v_challenge.used_at IS NOT NULL THEN RETURN jsonb_build_object('outcome', 'challenge_replayed'); END IF;
  IF v_challenge.expires_at <= now() THEN RETURN jsonb_build_object('outcome', 'challenge_expired'); END IF;
  IF v_challenge.confirmation_hash <> v_confirmation_hash THEN
    RETURN jsonb_build_object('outcome', 'confirmation_mismatch');
  END IF;

  PERFORM o.order_id FROM public.orders o
   WHERE o.order_id = ANY(v_challenge.order_ids) ORDER BY o.order_id FOR UPDATE;
  v_snapshot := public.test_payment_deletion_snapshot(v_challenge.order_ids, v_project_ref);
  IF NOT COALESCE((v_snapshot->>'all_eligible')::BOOLEAN, FALSE)
     OR v_snapshot->>'snapshot_hash' <> v_challenge.snapshot_hash THEN
    RETURN jsonb_build_object('outcome', 'stale_snapshot');
  END IF;

  SELECT COALESCE(sum((row->>'payment_count')::INTEGER),0),
    COALESCE(sum((row->>'order_item_count')::INTEGER),0),
    COALESCE(sum((row->>'history_count')::INTEGER),0),
    COALESCE(sum((row->>'reservation_count')::INTEGER),0),
    COALESCE(sum((row->>'idempotency_count')::INTEGER),0)
  INTO v_deleted_payments, v_deleted_items, v_deleted_history,
    v_deleted_reservations, v_deleted_idempotency
  FROM jsonb_array_elements(v_snapshot->'orders') row;

  DELETE FROM public.order_idempotency WHERE order_id = ANY(v_challenge.order_ids);
  DELETE FROM public.order_inventory_reservations WHERE order_id = ANY(v_challenge.order_ids);
  DELETE FROM public.test_order_provenance WHERE order_id = ANY(v_challenge.order_ids);
  DELETE FROM public.orders WHERE order_id = ANY(v_challenge.order_ids);
  GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;
  IF v_deleted_orders <> cardinality(v_challenge.order_ids) THEN
    RAISE EXCEPTION 'Deletion count mismatch; rolling back';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE order_id = ANY(v_challenge.order_ids))
     OR EXISTS (SELECT 1 FROM public.payments WHERE order_id = ANY(v_challenge.order_ids))
     OR EXISTS (SELECT 1 FROM public.order_items WHERE order_id = ANY(v_challenge.order_ids))
     OR EXISTS (SELECT 1 FROM public.order_status_history WHERE order_id = ANY(v_challenge.order_ids))
     OR EXISTS (SELECT 1 FROM public.order_inventory_reservations WHERE order_id = ANY(v_challenge.order_ids))
     OR EXISTS (SELECT 1 FROM public.order_idempotency WHERE order_id = ANY(v_challenge.order_ids))
     OR EXISTS (SELECT 1 FROM public.test_order_provenance WHERE order_id = ANY(v_challenge.order_ids)) THEN
    RAISE EXCEPTION 'Related records remain after deletion; rolling back';
  END IF;

  UPDATE public.test_payment_deletion_challenges SET used_at = now(), outcome = 'deleted'
   WHERE challenge_id = v_challenge_id;
  INSERT INTO public.test_payment_deletion_batches(
    challenge_id, project_ref, actor_member_id, reason, order_identifiers,
    evidence_summary, deleted_counts
  ) VALUES (
    v_challenge_id, v_project_ref, v_actor, v_reason,
    (SELECT jsonb_agg(jsonb_build_object('order_id', row->>'order_id', 'order_code', row->>'order_code'))
       FROM jsonb_array_elements(v_snapshot->'orders') row),
    (SELECT jsonb_agg(jsonb_build_object('order_id', row->>'order_id',
       'evidence_kind', row->>'evidence_kind', 'payment_identity_hash', row->>'payment_identity_hash'))
       FROM jsonb_array_elements(v_snapshot->'orders') row),
    jsonb_build_object('orders', v_deleted_orders, 'payments', v_deleted_payments,
      'order_items', v_deleted_items, 'status_history', v_deleted_history,
      'reservations', v_deleted_reservations, 'idempotency_claims', v_deleted_idempotency,
      'payment_events_preserved', (SELECT sum((row->>'payment_event_count')::INTEGER)
        FROM jsonb_array_elements(v_snapshot->'orders') row))
  ) RETURNING batch_id INTO v_batch_id;
  INSERT INTO public.audit_logs(actor_member_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_actor, 'test_payments.delete_verified_batch', 'test_payment_deletion_batch', v_batch_id,
    jsonb_build_object('orders', v_snapshot->'orders', 'snapshot_hash', v_snapshot->>'snapshot_hash'),
    jsonb_build_object('reason', v_reason, 'project_ref', v_project_ref,
      'deleted_counts', (SELECT deleted_counts FROM public.test_payment_deletion_batches WHERE batch_id = v_batch_id)));

  RETURN jsonb_build_object('outcome', 'deleted', 'batch_id', v_batch_id,
    'order_count', v_deleted_orders, 'payment_events_preserved', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.capture_isolated_test_order_provenance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.test_payment_deletion_snapshot(UUID[], TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manage_test_payment_deletion_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_test_payment_deletion_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.manage_test_payment_deletion_atomic(JSONB) IS
  'Preview/test-only deletion of trigger-proven synthetic cash orders. Hash-bound, actor/session-bound, expiring one-time challenge; payment events and audit evidence survive.';
