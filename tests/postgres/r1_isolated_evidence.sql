\set ON_ERROR_STOP on

CREATE TEMP TABLE gieomo_evidence (
  test_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'SKIP', 'BLOCKED', 'NOT RUN')),
  detail TEXT NOT NULL
);

INSERT INTO gieomo_evidence VALUES
  ('MIG-013', CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'payments'
         AND policyname = 'Authenticated read payments'
    ) THEN 'PASS' ELSE 'FAIL' END,
   'Migration 013 policy prerequisite/catalog check'),
  ('MIG-018', CASE WHEN to_regclass('public.uq_payments_order_transaction_code') IS NOT NULL
    THEN 'PASS' ELSE 'FAIL' END,
   'Migration 018 unique index exists'),
  ('MIG-021', CASE WHEN
      NOT has_table_privilege('anon', 'public.payments', 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.payments', 'INSERT')
      AND has_table_privilege('authenticated', 'public.payments', 'SELECT')
      AND has_table_privilege('service_role', 'public.payments', 'INSERT')
      AND NOT has_function_privilege('anon', 'public.create_order_atomic(jsonb)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.create_order_atomic(jsonb)', 'EXECUTE')
      AND NOT has_function_privilege(0::oid, 'public.create_order_atomic(jsonb)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.create_order_atomic(jsonb)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END,
   'Draft 021 final ACL: anon/auth DML denied, authenticated SELECT retained, RPC service_role-only'),
  ('MIG-022', CASE WHEN
      to_regclass('public.inbound_payment_events') IS NOT NULL
      AND to_regprocedure('public.record_inbound_payment_event(jsonb)') IS NOT NULL
      AND NOT has_table_privilege('anon', 'public.inbound_payment_events', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.inbound_payment_events', 'SELECT')
      AND has_table_privilege('service_role', 'public.inbound_payment_events', 'INSERT')
      AND NOT has_function_privilege('anon', 'public.record_inbound_payment_event(jsonb)', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.record_inbound_payment_event(jsonb)', 'EXECUTE')
    THEN 'PASS' ELSE 'FAIL' END,
   'Draft 022 objects and service-role-only ACL exist');

INSERT INTO public.customers (customer_id, full_name, phone)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'R1 Synthetic Customer 1', '0900000001'),
  ('10000000-0000-4000-8000-000000000002', 'R1 Synthetic Customer 2', '0900000002'),
  ('10000000-0000-4000-8000-000000000003', 'R1 Synthetic Customer 3', '0900000003'),
  ('10000000-0000-4000-8000-000000000004', 'R1 Synthetic Customer 4', '0900000004');

INSERT INTO public.orders (
  order_id, order_code, customer_id, receiver_name, receiver_phone,
  delivery_type, subtotal, final_amount, order_status, payment_status,
  payment_method
) VALUES
  ('20000000-0000-4000-8000-000000000001', 'GM-R1ISO1', '10000000-0000-4000-8000-000000000001',
   'R1 Synthetic 1', '0900000001', 'home_delivery', 100000, 100000, 'pending', 'pending', 'banking'),
  ('20000000-0000-4000-8000-000000000002', 'GM-R1ISO2', '10000000-0000-4000-8000-000000000002',
   'R1 Synthetic 2', '0900000002', 'home_delivery', 100000, 100000, 'pending', 'pending', 'banking'),
  ('20000000-0000-4000-8000-000000000003', 'GM-R1ISO3', '10000000-0000-4000-8000-000000000003',
   'R1 Synthetic 3', '0900000003', 'home_delivery', 100000, 100000, 'pending', 'pending', 'banking'),
  ('20000000-0000-4000-8000-000000000004', 'GM-R1ISO4', '10000000-0000-4000-8000-000000000004',
   'R1 Synthetic 4', '0900000004', 'home_delivery', 100000, 100000, 'pending', 'pending', 'banking');

DO $$
DECLARE
  duplicate_blocked BOOLEAN := false;
  payment_count INT;
BEGIN
  INSERT INTO public.payments (
    order_id, payment_method, amount, payment_status, transaction_code
  ) VALUES (
    '20000000-0000-4000-8000-000000000001', 'banking', 100000, 'paid', 'R1-SAME-TX'
  );

  BEGIN
    INSERT INTO public.payments (
      order_id, payment_method, amount, payment_status, transaction_code
    ) VALUES (
      '20000000-0000-4000-8000-000000000001', 'banking', 100000, 'paid', 'R1-SAME-TX'
    );
  EXCEPTION WHEN unique_violation THEN
    duplicate_blocked := true;
  END;

  SELECT count(*) INTO payment_count
    FROM public.payments
   WHERE order_id = '20000000-0000-4000-8000-000000000001'
     AND transaction_code = 'R1-SAME-TX';

  INSERT INTO gieomo_evidence VALUES (
    'R1-DUPLICATE-SEQUENTIAL',
    CASE WHEN duplicate_blocked AND payment_count = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('Same transaction identity: rows=%s, unique_violation=%s', payment_count, duplicate_blocked)
  );
END
$$;

INSERT INTO public.payments (
  order_id, payment_method, amount, payment_status, transaction_code
) VALUES
  ('20000000-0000-4000-8000-000000000002', 'banking', 100000, 'paid', 'R1-TX-A'),
  ('20000000-0000-4000-8000-000000000002', 'banking', 100000, 'paid', 'R1-TX-B');

INSERT INTO gieomo_evidence
SELECT 'R1-TWO-CODES-ONE-ORDER',
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END,
       format('Current migration 018 contract permits %s rows for two transaction codes', count(*))
  FROM public.payments
 WHERE order_id = '20000000-0000-4000-8000-000000000002';

SELECT public.record_inbound_payment_event(jsonb_build_object(
  'provider', 'sepay-test',
  'provider_transaction_id', 'R1-EVENT-DUP',
  'matched_order_id', '20000000-0000-4000-8000-000000000001',
  'matched_order_code', 'GM-R1ISO1',
  'received_amount', 100000,
  'expected_amount_snapshot', 100000,
  'classification', 'matched',
  'processing_status', 'eligible_for_apply',
  'payload_fingerprint', 'fingerprint-1',
  'sanitized_payload', jsonb_build_object('source', 'synthetic')
));
SELECT public.record_inbound_payment_event(jsonb_build_object(
  'provider', 'sepay-test',
  'provider_transaction_id', 'R1-EVENT-DUP',
  'matched_order_id', '20000000-0000-4000-8000-000000000001',
  'matched_order_code', 'GM-R1ISO1',
  'received_amount', 100000,
  'expected_amount_snapshot', 100000,
  'classification', 'matched',
  'processing_status', 'eligible_for_apply',
  'payload_fingerprint', 'fingerprint-1',
  'sanitized_payload', jsonb_build_object('source', 'synthetic')
));

INSERT INTO gieomo_evidence
SELECT 'R1-DUPLICATE-EVENT',
       CASE WHEN count(*) = 1 AND max(delivery_count) = 2 THEN 'PASS' ELSE 'FAIL' END,
       format('Provider identity rows=%s, delivery_count=%s', count(*), max(delivery_count))
  FROM public.inbound_payment_events
 WHERE provider = 'sepay-test' AND provider_transaction_id = 'R1-EVENT-DUP';

SELECT public.record_inbound_payment_event(jsonb_build_object(
  'provider', 'sepay-test',
  'provider_transaction_id', 'R1-EVENT-UNKNOWN',
  'matched_order_code', 'GM-NOT-FOUND',
  'received_amount', 75000,
  'classification', 'unmatched_order',
  'processing_status', 'review_required',
  'payload_fingerprint', 'fingerprint-unknown'
));
SELECT public.record_inbound_payment_event(jsonb_build_object(
  'provider', 'sepay-test',
  'provider_transaction_id', 'R1-EVENT-UNDER',
  'matched_order_id', '20000000-0000-4000-8000-000000000001',
  'matched_order_code', 'GM-R1ISO1',
  'received_amount', 75000,
  'expected_amount_snapshot', 100000,
  'classification', 'underpaid',
  'processing_status', 'review_required',
  'payload_fingerprint', 'fingerprint-under'
));

INSERT INTO gieomo_evidence
SELECT 'R1-DURABLE-UNKNOWN-UNDERPAYMENT',
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL' END,
       format('Durable review events=%s', count(*))
  FROM public.inbound_payment_events
 WHERE provider_transaction_id IN ('R1-EVENT-UNKNOWN', 'R1-EVENT-UNDER')
   AND processing_status = 'review_required';

-- Current HTTP/PostgREST flow uses separate transactions. These two probes
-- deliberately demonstrate the persistent partial states accepted by the schema.
INSERT INTO public.payments (
  order_id, payment_method, amount, payment_status, transaction_code
) VALUES (
  '20000000-0000-4000-8000-000000000003', 'banking', 100000, 'paid', 'R1-GAP-PAYMENT-FIRST'
);

DO $$
BEGIN
  BEGIN
    UPDATE public.orders
       SET payment_status = 'not-a-payment-status'::payment_status
     WHERE order_id = '20000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END
$$;

INSERT INTO gieomo_evidence
SELECT 'R1-ATOMIC-PAYMENT-THEN-ORDER-FAIL',
       CASE WHEN EXISTS (
         SELECT 1 FROM public.payments
          WHERE order_id = '20000000-0000-4000-8000-000000000003'
            AND transaction_code = 'R1-GAP-PAYMENT-FIRST'
       ) AND EXISTS (
         SELECT 1 FROM public.orders
          WHERE order_id = '20000000-0000-4000-8000-000000000003'
            AND payment_status = 'pending'
       ) THEN 'FAIL' ELSE 'PASS' END,
       'Payment row persists while order remains pending; no atomic apply RPC exists';

UPDATE public.orders
   SET payment_status = 'paid'
 WHERE order_id = '20000000-0000-4000-8000-000000000004';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.order_status_history (
      order_id, status_type, from_status, to_status, note
    ) VALUES (
      '20000000-0000-4000-8000-000000000004', 'invalid', 'pending', 'paid', 'synthetic failure'
    );
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

INSERT INTO gieomo_evidence
SELECT 'R1-ATOMIC-ORDER-THEN-HISTORY-FAIL',
       CASE WHEN EXISTS (
         SELECT 1 FROM public.orders
          WHERE order_id = '20000000-0000-4000-8000-000000000004'
            AND payment_status = 'paid'
       ) AND NOT EXISTS (
         SELECT 1 FROM public.order_status_history
          WHERE order_id = '20000000-0000-4000-8000-000000000004'
       ) THEN 'FAIL' ELSE 'PASS' END,
       'Order remains paid while payment history is absent; history insert is not atomic';

INSERT INTO gieomo_evidence VALUES
  ('R1-CONCURRENT-WEBHOOKS', 'BLOCKED', 'Requires route/apply RPC concurrency test; draft 022 only records inbound delivery'),
  ('R1-WEBHOOK-ADMIN-RACE', 'BLOCKED', 'No approved arbitration policy and no atomic payment apply RPC'),
  ('R1-FAULT-INJECTION', 'BLOCKED', 'No server-side apply RPC or test-only failure injection points'),
  ('R1-OVERPAYMENT-APPLY', 'BLOCKED', 'Business disposition is not approved'),
  ('R1-ADDITIONAL-TRANSFER-APPLY', 'BLOCKED', 'Business disposition is not approved'),
  ('P0-A3-CONCURRENCY-LIMITS', 'BLOCKED', 'Quantity, line-count and aggregate limits plus v2 implementation are not approved');

TABLE gieomo_evidence ORDER BY test_id;

SELECT status, count(*) AS test_count
  FROM gieomo_evidence
 GROUP BY status
 ORDER BY status;

