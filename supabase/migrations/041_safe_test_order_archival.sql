-- Safe cleanup for explicitly classified test orders.
-- This is archival only: orders, payment ledger, payment events, inventory and
-- audit evidence are never deleted or rewritten.

CREATE TABLE public.test_cleanup_environments (
  project_ref TEXT PRIMARY KEY,
  environment_kind TEXT NOT NULL CHECK (environment_kind IN ('local', 'test', 'preview')),
  cleanup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  configured_by_member_id UUID NOT NULL REFERENCES public.members(member_id),
  configured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.test_order_cleanup_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_ref TEXT NOT NULL REFERENCES public.test_cleanup_environments(project_ref),
  actor_member_id UUID NOT NULL REFERENCES public.members(member_id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  preview_token TEXT NOT NULL,
  order_count INTEGER NOT NULL CHECK (order_count BETWEEN 1 AND 20),
  total_amount NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.test_order_archives (
  order_id UUID PRIMARY KEY REFERENCES public.orders(order_id) ON DELETE RESTRICT,
  batch_id UUID NOT NULL REFERENCES public.test_order_cleanup_batches(batch_id) ON DELETE RESTRICT,
  classification_reason TEXT NOT NULL CHECK (char_length(classification_reason) BETWEEN 8 AND 500),
  snapshot JSONB NOT NULL,
  archived_by_member_id UUID NOT NULL REFERENCES public.members(member_id),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.test_cleanup_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_order_cleanup_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_order_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.test_cleanup_environments, public.test_order_cleanup_batches, public.test_order_archives FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.test_cleanup_environments TO service_role;
GRANT SELECT, INSERT ON public.test_order_cleanup_batches, public.test_order_archives TO service_role;

CREATE POLICY "Service role test cleanup environments" ON public.test_cleanup_environments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role test cleanup batches" ON public.test_order_cleanup_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role test order archives" ON public.test_order_archives
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.manage_test_order_archival_atomic(p JSONB)
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
  v_candidates JSONB := p->'candidates';
  v_candidate_count INTEGER;
  v_found_count INTEGER;
  v_token TEXT;
  v_expected_token TEXT := COALESCE(p->>'preview_token', '');
  v_confirmation TEXT := upper(btrim(COALESCE(p->>'confirmation', '')));
  v_rows JSONB;
  v_total NUMERIC(14,2);
  v_batch UUID;
BEGIN
  BEGIN v_actor := NULLIF(p->>'actor_member_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN RETURN jsonb_build_object('outcome', 'invalid_request'); END;

  IF v_mode NOT IN ('preview', 'archive') OR jsonb_typeof(v_candidates) <> 'array' THEN
    RETURN jsonb_build_object('outcome', 'invalid_request');
  END IF;
  v_candidate_count := jsonb_array_length(v_candidates);
  IF v_candidate_count < 1 OR v_candidate_count > 20 OR
     v_actor IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.members WHERE member_id = v_actor AND role = 'admin' AND status = 'active'
     ) THEN
    RETURN jsonb_build_object('outcome', 'invalid_actor_or_batch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.test_cleanup_environments
     WHERE project_ref = v_project_ref AND cleanup_enabled IS TRUE
       AND environment_kind IN ('local', 'test', 'preview')
  ) THEN
    RETURN jsonb_build_object('outcome', 'environment_unverified');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_candidates) c
     WHERE COALESCE(btrim(c->>'classification_reason'), '') = ''
        OR char_length(btrim(c->>'classification_reason')) NOT BETWEEN 8 AND 500
        OR COALESCE(c->>'order_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) OR (SELECT count(DISTINCT c->>'order_id') FROM jsonb_array_elements(v_candidates) c) <> v_candidate_count THEN
    RETURN jsonb_build_object('outcome', 'invalid_candidates');
  END IF;

  -- Archive mode obtains locks in stable order. Preview remains read-only.
  IF v_mode = 'archive' THEN
    PERFORM o.order_id FROM public.orders o
      JOIN jsonb_array_elements(v_candidates) c ON o.order_id::TEXT = c->>'order_id'
      ORDER BY o.order_id FOR UPDATE;
  END IF;

  WITH requested AS (
    SELECT (c->>'order_id')::UUID order_id, btrim(c->>'classification_reason') classification_reason
      FROM jsonb_array_elements(v_candidates) c
  ), snapshot AS (
    SELECT o.order_id, o.order_code, o.order_status::TEXT order_status,
      o.payment_status::TEXT payment_status, o.delivery_status::TEXT delivery_status,
      o.final_amount, o.updated_at, r.classification_reason,
      (SELECT count(*) FROM public.payments x WHERE x.order_id = o.order_id) payment_count,
      (SELECT count(*) FROM public.payment_events x WHERE x.matched_order_id = o.order_id) payment_event_count
    FROM requested r JOIN public.orders o ON o.order_id = r.order_id
  )
  SELECT count(*), COALESCE(sum(final_amount), 0),
    jsonb_agg(to_jsonb(snapshot) ORDER BY order_id),
    md5(COALESCE(jsonb_agg(to_jsonb(snapshot) ORDER BY order_id)::TEXT, '[]'))
  INTO v_found_count, v_total, v_rows, v_token FROM snapshot;

  IF v_found_count <> v_candidate_count THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.test_order_archives a
      JOIN jsonb_array_elements(v_candidates) c ON a.order_id::TEXT = c->>'order_id'
  ) THEN RETURN jsonb_build_object('outcome', 'already_archived'); END IF;

  IF v_mode = 'preview' THEN
    RETURN jsonb_build_object('outcome', 'eligible', 'order_count', v_found_count,
      'total_amount', v_total, 'preview_token', v_token, 'orders', v_rows,
      'destructive', FALSE, 'ledger_preserved', TRUE);
  END IF;
  IF char_length(v_reason) NOT BETWEEN 8 AND 500
     OR v_expected_token <> v_token
     OR v_confirmation <> ('LUU TRU ' || v_found_count::TEXT || ' DON') THEN
    RETURN jsonb_build_object('outcome', 'stale_or_unconfirmed');
  END IF;

  INSERT INTO public.test_order_cleanup_batches(project_ref, actor_member_id, reason, preview_token, order_count, total_amount)
  VALUES (v_project_ref, v_actor, v_reason, v_token, v_found_count, v_total)
  RETURNING batch_id INTO v_batch;

  INSERT INTO public.test_order_archives(order_id, batch_id, classification_reason, snapshot, archived_by_member_id)
  SELECT (row->>'order_id')::UUID, v_batch, row->>'classification_reason', row, v_actor
    FROM jsonb_array_elements(v_rows) row;

  INSERT INTO public.audit_logs(actor_member_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_actor, 'test_orders.archive_batch', 'test_order_cleanup_batch', v_batch,
    jsonb_build_object('orders', v_rows),
    jsonb_build_object('reason', v_reason, 'project_ref', v_project_ref,
      'order_count', v_found_count, 'total_amount', v_total,
      'orders_deleted', 0, 'ledger_preserved', TRUE));

  RETURN jsonb_build_object('outcome', 'archived', 'batch_id', v_batch,
    'order_count', v_found_count, 'total_amount', v_total,
    'orders_deleted', 0, 'ledger_preserved', TRUE);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('outcome', 'concurrent_change');
END;
$$;

REVOKE ALL ON FUNCTION public.manage_test_order_archival_atomic(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_test_order_archival_atomic(JSONB) TO service_role;

COMMENT ON FUNCTION public.manage_test_order_archival_atomic(JSONB) IS
  'Preview/test-only, admin-controlled non-destructive archival of manually classified test orders. Preserves all business and payment evidence.';
