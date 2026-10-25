\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.members (member_id, full_name, role, status)
VALUES ('00000000-0000-4000-8000-000000000001', 'Isolated Test Admin', 'admin', 'active');

INSERT INTO public.customers (customer_id, full_name, phone)
VALUES ('00000000-0000-4000-8000-000000000002', 'Isolated Test Customer', '0900000000');

INSERT INTO public.orders (
  order_id, order_code, customer_id, receiver_name, receiver_phone,
  delivery_type, subtotal, final_amount, payment_status, order_status, payment_method
) VALUES
  ('00000000-0000-4000-8000-000000000010', 'GM-PAY001',
   '00000000-0000-4000-8000-000000000002', 'Receiver', '0900000000',
   'home_delivery', 100000, 100000, 'pending', 'pending', 'banking'),
  ('00000000-0000-4000-8000-000000000011', 'GM-PAY002',
   '00000000-0000-4000-8000-000000000002', 'Receiver', '0900000000',
   'home_delivery', 100000, 100000, 'pending', 'pending', 'banking'),
  ('00000000-0000-4000-8000-000000000012', 'GM-PAY003',
   '00000000-0000-4000-8000-000000000002', 'Receiver', '0900000000',
   'home_delivery', 100000, 100000, 'pending', 'cancelled', 'banking');

DO $test$
DECLARE
  result JSONB;
BEGIN
  result := public.apply_payment_event(jsonb_build_object(
    'order_code', 'GM-PAY001',
    'amount', 100000,
    'transaction_code', 'CASH-GM-PAY001',
    'payment_method', 'cod',
    'provider', 'cash',
    'source', 'admin',
    'admin_member_id', '00000000-0000-4000-8000-000000000001'
  ));
  IF result->>'outcome' <> 'applied' OR result->>'order_status' <> 'confirmed' THEN
    RAISE EXCEPTION 'cash apply failed: %', result;
  END IF;

  result := public.apply_payment_event(jsonb_build_object(
    'order_code', 'GM-PAY001',
    'amount', 100000,
    'transaction_code', 'CASH-GM-PAY001',
    'payment_method', 'cod',
    'provider', 'cash',
    'source', 'admin',
    'admin_member_id', '00000000-0000-4000-8000-000000000001'
  ));
  IF result->>'outcome' <> 'applied' OR COALESCE((result->>'replayed')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'cash replay failed: %', result;
  END IF;

  result := public.apply_payment_event(jsonb_build_object(
    'order_code', 'GM-PAY002',
    'amount', 50000,
    'transaction_code', 'BANK-UNDERPAID-1',
    'payment_method', 'banking',
    'provider', 'sepay',
    'source', 'webhook'
  ));
  IF result->>'outcome' <> 'underpaid' THEN
    RAISE EXCEPTION 'underpayment classification failed: %', result;
  END IF;

  result := public.apply_payment_event(jsonb_build_object(
    'order_code', 'GM-PAY003',
    'amount', 100000,
    'transaction_code', 'BANK-CANCELLED-1',
    'payment_method', 'banking',
    'provider', 'sepay',
    'source', 'webhook'
  ));
  IF result->>'outcome' <> 'cancelled_order_payment' THEN
    RAISE EXCEPTION 'cancelled-order classification failed: %', result;
  END IF;
END
$test$;

DO $test$
DECLARE
  paid_orders INTEGER;
  paid_payments INTEGER;
  cash_events INTEGER;
  pending_review_payments INTEGER;
BEGIN
  SELECT count(*) INTO paid_orders
  FROM public.orders WHERE order_code = 'GM-PAY001' AND payment_status = 'paid';
  SELECT count(*) INTO paid_payments
  FROM public.payments
  WHERE order_id = '00000000-0000-4000-8000-000000000010' AND payment_status = 'paid';
  SELECT count(*) INTO cash_events
  FROM public.payment_events
  WHERE matched_order_id = '00000000-0000-4000-8000-000000000010';
  SELECT count(*) INTO pending_review_payments
  FROM public.payments
  WHERE order_id IN (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012'
  ) AND payment_status = 'pending';

  IF paid_orders <> 1 OR paid_payments <> 1 OR cash_events <> 1 OR pending_review_payments <> 2 THEN
    RAISE EXCEPTION
      'payment invariants failed: paid_orders=%, paid_payments=%, cash_events=%, reviews=%',
      paid_orders, paid_payments, cash_events, pending_review_payments;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE order_code IN ('GM-PAY002', 'GM-PAY003') AND payment_status = 'paid'
  ) THEN
    RAISE EXCEPTION 'review-only events must not mark orders paid';
  END IF;
END
$test$;

ROLLBACK;

SELECT 'PAYMENT_INTEGRITY_PG_PASS' AS result;
