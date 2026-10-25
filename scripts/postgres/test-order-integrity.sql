\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.products (product_id, name, slug, price, status)
VALUES ('00000000-0000-4000-8000-000000000101', 'Isolated Product', 'isolated-product', 75000, 'active');

INSERT INTO public.product_variants (
  variant_id, product_id, sku, name, price, stock, status
) VALUES (
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000101',
  'ISO-SKU-001', 'Isolated Variant', 80000, 5, 'active'
);

DO $test$
DECLARE
  payload JSONB := jsonb_build_object(
    'idempotency_key', '00000000-0000-4000-8000-000000000103',
    'scope_key', 'guest:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'request_hash', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'buyer_name', 'Isolated Buyer',
    'buyer_phone', '0900000001',
    'recipient_name', 'Isolated Receiver',
    'recipient_phone', '0900000001',
    'delivery_type', 'self_pickup',
    'payment_method', 'banking',
    'items', jsonb_build_array(jsonb_build_object(
      'product_id', '00000000-0000-4000-8000-000000000101',
      'variant_id', '00000000-0000-4000-8000-000000000102',
      'quantity', 2
    ))
  );
  first_result JSONB;
  replay_result JSONB;
BEGIN
  first_result := public.create_order_atomic(payload);
  replay_result := public.create_order_atomic(payload);
  IF first_result->>'outcome' <> 'created'
     OR COALESCE((first_result->>'replayed')::BOOLEAN, FALSE) IS TRUE THEN
    RAISE EXCEPTION 'initial order create failed: %', first_result;
  END IF;
  IF replay_result->>'order_id' <> first_result->>'order_id'
     OR COALESCE((replay_result->>'replayed')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'idempotent replay failed: first=%, replay=%', first_result, replay_result;
  END IF;
END
$test$;

DO $test$
DECLARE
  order_count INTEGER;
  item_count INTEGER;
  remaining_stock INTEGER;
BEGIN
  SELECT count(*) INTO order_count
  FROM public.orders
  WHERE idempotency_scope = 'guest:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    AND idempotency_key = '00000000-0000-4000-8000-000000000103';
  SELECT count(*) INTO item_count
  FROM public.order_items oi
  JOIN public.orders o ON o.order_id = oi.order_id
  WHERE o.idempotency_key = '00000000-0000-4000-8000-000000000103'
    AND oi.product_id = '00000000-0000-4000-8000-000000000101'
    AND oi.variant_id = '00000000-0000-4000-8000-000000000102'
    AND oi.combo_id IS NULL
    AND oi.sku_snapshot = 'ISO-SKU-001';
  SELECT stock INTO remaining_stock
  FROM public.product_variants
  WHERE variant_id = '00000000-0000-4000-8000-000000000102';

  IF order_count <> 1 OR item_count <> 1 OR remaining_stock <> 3 THEN
    RAISE EXCEPTION
      'order identity/idempotency invariant failed: orders=%, items=%, stock=%',
      order_count, item_count, remaining_stock;
  END IF;
END
$test$;

DO $test$
BEGIN
  BEGIN
    PERFORM public.create_order_atomic(jsonb_build_object(
      'idempotency_key', '00000000-0000-4000-8000-000000000103',
      'scope_key', 'guest:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'request_hash', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      'buyer_phone', '0900000001',
      'recipient_phone', '0900000001',
      'items', jsonb_build_array(jsonb_build_object(
        'variant_id', '00000000-0000-4000-8000-000000000102',
        'quantity', 1
      ))
    ));
    RAISE EXCEPTION 'hash mismatch unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%D3:HASH_MISMATCH%' THEN
        RAISE;
      END IF;
  END;
END
$test$;

ROLLBACK;

SELECT 'ORDER_INTEGRITY_PG_PASS' AS result;
