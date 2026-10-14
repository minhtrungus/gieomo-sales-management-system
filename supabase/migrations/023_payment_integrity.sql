-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 023
-- Payment integrity: single-payment invariant, atomic apply RPC,
-- durable payment event ledger, revoke anon INSERT on payments
-- ========================================================
-- ADDITIVE ONLY. Không đụng migrations 001→012.
-- Được thiết kế để apply sau khi operator phê duyệt.
-- Compatible với 018 (nếu đã apply trên DB — dùng IF NOT EXISTS).
-- ========================================================
--
-- BUSINESS RULES (đã thống nhất — xem SESSION_10 §9.5):
--   1. Single-payment: mỗi order tối đa một payment 'paid'.
--   2. Underpayment: ghi nhận, order giữ 'pending'.
--   3. Tiền đến sau khi cancelled/completed: ghi nhận, review, KHÔNG reopen.
--   4. Additional transfer sau khi paid: ghi nhận, review.
--   5. Admin confirm: phải có referenceNumber ngân hàng thật.
--
-- SCHEMA THẬT (001:269-279):
--   payments có payment_status (KHÔNG phải 'status'),
--   KHÔNG có confirmed_at (chỉ orders có).
-- ========================================================

-- ========================================================
-- PHẦN 1: Payment event ledger (durable recording)
-- ========================================================
-- Ghi MỌI sự kiện thanh toán đến, kể cả unmatched/underpayment.
-- Cho phép truy vết tiền mà không cần gán vào order.
-- ========================================================

CREATE TABLE IF NOT EXISTS public.payment_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'sepay',
  provider_transaction_id TEXT,
  order_code TEXT,
  matched_order_id UUID REFERENCES public.orders(order_id) ON DELETE SET NULL,
  received_amount DECIMAL(12,0) CHECK (received_amount IS NULL OR received_amount > 0),
  expected_amount DECIMAL(12,0),
  classification TEXT NOT NULL CHECK (classification IN (
    'unmatched_reference',
    'unmatched_order',
    'underpaid',
    'matched',
    'overpaid',
    'paid_order_additional_transfer',
    'cancelled_order_payment',
    'completed_order_payment',
    'duplicate_delivery',
    'admin_confirm'
  )),
  outcome TEXT,
  payload_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order
  ON public.payment_events(matched_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_classification
  ON public.payment_events(classification, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_txn
  ON public.payment_events(provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role all payment_events" ON public.payment_events;
CREATE POLICY "Service role all payment_events"
  ON public.payment_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.payment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_events TO service_role;

-- ========================================================
-- PHẦN 2: Unique indexes (idempotency + single-payment)
-- ========================================================

-- 2a. Transaction identity unique (idempotency chống duplicate).
--     Tương đương 018 — IF NOT EXISTS để compatible nếu 018 đã apply.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_order_transaction_code
  ON public.payments (order_id, transaction_code)
  WHERE transaction_code IS NOT NULL;

-- 2b. Single-payment: mỗi order tối đa một payment 'paid'.
--     Partial index — nhiều payment 'pending' (review) vẫn cho phép.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_paid_per_order
  ON public.payments (order_id)
  WHERE payment_status = 'paid';

-- ========================================================
-- PHẦN 3: Verify fail-closed
-- ========================================================

DO $$
DECLARE
  v_def TEXT;
  v_count INT;
BEGIN
  -- Verify uq_payments_order_transaction_code
  SELECT indexdef INTO v_def
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'uq_payments_order_transaction_code';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Index uq_payments_order_transaction_code không tồn tại sau CREATE';
  END IF;
  IF position('(order_id, transaction_code)' IN v_def) = 0
     OR position('transaction_code IS NOT NULL' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Index uq_payments_order_transaction_code sai định nghĩa: %', v_def;
  END IF;

  -- Verify uq_payments_one_paid_per_order
  SELECT indexdef INTO v_def
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'uq_payments_one_paid_per_order';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Index uq_payments_one_paid_per_order không tồn tại sau CREATE';
  END IF;
  IF position('payment_status' IN v_def) = 0
     OR position('paid' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Index uq_payments_one_paid_per_order sai định nghĩa: %', v_def;
  END IF;

  -- Verify payment_events table
  SELECT count(*) INTO v_count
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'payment_events';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Table payment_events không tồn tại sau CREATE';
  END IF;
END $$;

-- ========================================================
-- PHẦN 4: Revoke anon INSERT trên payments
-- ========================================================
-- Checkout đi qua RPC create_order_atomic (service-role),
-- không cần anon INSERT payments. Giữ anon SELECT đã bị 011 revoke.
-- ========================================================

DO $$
BEGIN
  DROP POLICY IF EXISTS "Public insert payments" ON public.payments;
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

REVOKE INSERT ON public.payments FROM anon;

-- Verify: anon không còn INSERT payments
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.payments', 'INSERT') THEN
    RAISE EXCEPTION 'anon vẫn có INSERT trên payments sau REVOKE';
  END IF;
END $$;

-- ========================================================
-- PHẦN 5: Atomic apply RPC
-- ========================================================
-- apply_payment_event(p JSONB) → JSONB
--
-- Input JSONB:
--   order_code            TEXT   (required)
--   amount                NUMERIC (required, > 0)
--   transaction_code      TEXT   (required, deterministic identity)
--   payment_method        TEXT   (default 'banking'; accepted: cod|banking|momo)
--   provider              TEXT   (default 'sepay')
--   gateway               TEXT   (nullable)
--   account_number        TEXT   (nullable)
--   source                TEXT   (default 'webhook'; 'admin' hoặc 'webhook')
--   admin_member_id       UUID   (nullable, cần khi source='admin')
--   note                  TEXT   (nullable)
--
-- Output JSONB:
--   outcome               TEXT   (applied|underpaid|paid_order_additional_transfer|
--                                cancelled_order_payment|completed_order_payment|
--                                duplicate|unmatched_order)
--   order_id              UUID   (nullable)
--   order_code            TEXT
--   payment_id            UUID   (nullable)
--   payment_status        TEXT   (trạng thái payment row sau xử lý)
--   order_status          TEXT   (trạng thái order sau xử lý)
--   needs_review          BOOLEAN
--   message               TEXT
--   amount_received       NUMERIC
--   amount_expected       NUMERIC (nullable)
-- ========================================================

CREATE OR REPLACE FUNCTION public.apply_payment_event(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_code     TEXT := NULLIF(p->>'order_code', '');
  v_amount         DECIMAL := (p->>'amount')::DECIMAL;
  v_txn_code       TEXT := NULLIF(p->>'transaction_code', '');
  v_method_input   TEXT := COALESCE(NULLIF(p->>'payment_method', ''), 'banking');
  v_method         public.payment_method;
  v_provider       TEXT := COALESCE(NULLIF(p->>'provider', ''), 'sepay');
  v_gateway        TEXT := NULLIF(p->>'gateway', '');
  v_account        TEXT := NULLIF(p->>'account_number', '');
  v_source         TEXT := COALESCE(NULLIF(p->>'source', ''), 'webhook');
  v_admin_id       UUID := NULLIF(p->>'admin_member_id', '')::UUID;
  v_note           TEXT := NULLIF(p->>'note', '');

  v_order          public.orders%ROWTYPE;
  v_payment_id     UUID;
  v_existing_payment public.payments%ROWTYPE;
  v_existing_event_outcome TEXT;
  v_outcome        TEXT;
  v_needs_review   BOOLEAN := FALSE;
  v_message        TEXT;
  v_order_status_after TEXT;
  v_now            TIMESTAMPTZ := now();
  v_history_note   TEXT;
BEGIN
  -- Validate input
  IF v_order_code IS NULL THEN
    RAISE EXCEPTION 'order_code là bắt buộc';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'amount phải là số dương';
  END IF;
  IF v_txn_code IS NULL THEN
    RAISE EXCEPTION 'transaction_code là bắt buộc (idempotency identity)';
  END IF;
  IF v_method_input NOT IN ('cod', 'banking', 'momo') THEN
    RAISE EXCEPTION 'payment_method không được hỗ trợ: % (chỉ nhận cod|banking|momo)', v_method_input;
  END IF;
  v_method := v_method_input::public.payment_method;
  IF v_source NOT IN ('webhook', 'admin') THEN
    RAISE EXCEPTION 'source phải là webhook hoặc admin';
  END IF;
  IF v_source = 'admin' AND v_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_member_id là bắt buộc khi source=admin';
  END IF;
  IF v_provider = 'cash' AND (
    v_source != 'admin'
    OR v_method != 'cod'::public.payment_method
    OR v_txn_code != 'CASH-' || v_order_code
  ) THEN
    RAISE EXCEPTION 'cash contract không hợp lệ: cần source=admin, payment_method=cod, transaction_code=CASH-<order_code>';
  END IF;

  -- Lock order FOR UPDATE (chống race)
  SELECT * INTO v_order
    FROM public.orders
   WHERE order_code = v_order_code
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Ghi event unmatched_order
    INSERT INTO public.payment_events (
      provider, provider_transaction_id, order_code,
      received_amount, classification, outcome, payload_fingerprint
    ) VALUES (
      v_provider, v_txn_code, v_order_code,
      v_amount, 'unmatched_order', 'unmatched_order',
      v_provider || ':' || v_txn_code
    );
    RETURN jsonb_build_object(
      'outcome', 'unmatched_order',
      'order_code', v_order_code,
      'needs_review', TRUE,
      'message', 'Không tìm thấy đơn hàng',
      'amount_received', v_amount
    );
  END IF;

  -- Check duplicate transaction while holding the order lock.
  -- Cash uses one deterministic server-only identity per order. A retry returns
  -- the committed result and performs ZERO additional ledger/audit/history writes.
  SELECT * INTO v_existing_payment
    FROM public.payments
   WHERE order_id = v_order.order_id
     AND transaction_code = v_txn_code;

  IF FOUND AND v_provider = 'cash' THEN
    SELECT outcome INTO v_existing_event_outcome
      FROM public.payment_events
     WHERE matched_order_id = v_order.order_id
       AND provider = v_provider
       AND provider_transaction_id = v_txn_code
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_existing_payment.payment_status = 'paid'
       AND v_order.payment_status = 'paid'
       AND v_existing_event_outcome = 'applied' THEN
      RETURN jsonb_build_object(
        'outcome', 'applied',
        'order_id', v_order.order_id,
        'order_code', v_order.order_code,
        'payment_id', v_existing_payment.payment_id,
        'payment_status', 'paid',
        'order_status', v_order.order_status,
        'needs_review', FALSE,
        'replayed', TRUE,
        'message', 'Xác nhận tiền mặt đã được ghi nhận trước đó',
        'amount_received', v_existing_payment.amount,
        'amount_expected', v_order.final_amount
      );
    END IF;

    RETURN jsonb_build_object(
      'outcome', 'duplicate',
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'payment_id', v_existing_payment.payment_id,
      'payment_status', v_existing_payment.payment_status,
      'order_status', v_order.order_status,
      'needs_review', TRUE,
      'replayed', TRUE,
      'message', 'Xác nhận tiền mặt đã tồn tại nhưng trạng thái không thể tự đối soát',
      'amount_received', v_existing_payment.amount,
      'amount_expected', v_order.final_amount
    );
  END IF;

  IF FOUND THEN
    INSERT INTO public.payment_events (
      provider, provider_transaction_id, order_code, matched_order_id,
      received_amount, expected_amount, classification, outcome, payload_fingerprint
    ) VALUES (
      v_provider, v_txn_code, v_order_code, v_order.order_id,
      v_amount, v_order.final_amount, 'duplicate_delivery', 'duplicate',
      v_provider || ':' || v_txn_code
    );
    RETURN jsonb_build_object(
      'outcome', 'duplicate',
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'needs_review', FALSE,
      'message', 'Giao dịch đã được ghi nhận trước đó',
      'amount_received', v_amount
    );
  END IF;

  -- POS cash is an exact, immediate collection for a newly-created pending
  -- order. Unlike bank events, an amount/state mismatch must not create a
  -- review ledger row because no external transfer needs preserving.
  IF v_provider = 'cash' AND v_amount != v_order.final_amount THEN
    RETURN jsonb_build_object(
      'outcome', 'amount_mismatch',
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'payment_status', v_order.payment_status,
      'order_status', v_order.order_status,
      'needs_review', TRUE,
      'replayed', FALSE,
      'message', 'Số tiền mặt phải khớp chính xác giá trị đơn hàng',
      'amount_received', v_amount,
      'amount_expected', v_order.final_amount
    );
  END IF;

  IF v_provider = 'cash' AND (
    v_order.payment_status != 'pending'::public.payment_status
    OR v_order.order_status != 'pending'::public.order_status
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'invalid_state',
      'order_id', v_order.order_id,
      'order_code', v_order.order_code,
      'payment_status', v_order.payment_status,
      'order_status', v_order.order_status,
      'needs_review', TRUE,
      'replayed', FALSE,
      'message', 'Chỉ xác nhận tiền mặt cho đơn đang pending và chưa thanh toán',
      'amount_received', v_amount,
      'amount_expected', v_order.final_amount
    );
  END IF;

  v_order_status_after := v_order.order_status;

  -- CASE 1: Order đã paid → additional transfer, review, KHÔNG tạo paid payment thứ 2
  IF v_order.payment_status = 'paid' THEN
    v_outcome := 'paid_order_additional_transfer';
    v_needs_review := TRUE;
    v_message := 'Đơn đã thanh toán — giao dịch bổ sung được ghi nhận để đối soát';
    v_history_note := format(
      'Giao dịch bổ sung sau khi đơn đã thanh toán — cần đối soát. Mã GD: %s. Số tiền: %s.',
      v_txn_code, v_amount
    );

    INSERT INTO public.payments (order_id, payment_method, amount, payment_status, transaction_code)
    VALUES (v_order.order_id, v_method, v_amount, 'pending', v_txn_code)
    RETURNING payment_id INTO v_payment_id;

  -- CASE 2: Order cancelled → ghi nhận, KHÔNG reopen, review
  ELSIF v_order.order_status = 'cancelled' THEN
    v_outcome := 'cancelled_order_payment';
    v_needs_review := TRUE;
    v_message := 'Đơn đã hủy — tiền được ghi nhận để đối soát/hoàn tiền, KHÔNG mở lại đơn';
    v_history_note := format(
      'Tiền đến sau khi đơn đã hủy — KHÔNG mở lại đơn. Mã GD: %s. Số tiền: %s. Cần đối soát/hoàn tiền.',
      v_txn_code, v_amount
    );

    INSERT INTO public.payments (order_id, payment_method, amount, payment_status, transaction_code)
    VALUES (v_order.order_id, v_method, v_amount, 'pending', v_txn_code)
    RETURNING payment_id INTO v_payment_id;

  -- CASE 3: Order completed (chưa paid — edge case) → ghi nhận, review
  ELSIF v_order.order_status = 'completed' AND v_order.payment_status != 'paid' THEN
    v_outcome := 'completed_order_payment';
    v_needs_review := TRUE;
    v_message := 'Đơn đã hoàn tất nhưng chưa thanh toán — ghi nhận để đối soát';
    v_history_note := format(
      'Tiền đến sau khi đơn đã hoàn tất — cần đối soát. Mã GD: %s. Số tiền: %s.',
      v_txn_code, v_amount
    );

    INSERT INTO public.payments (order_id, payment_method, amount, payment_status, transaction_code)
    VALUES (v_order.order_id, v_method, v_amount, 'pending', v_txn_code)
    RETURNING payment_id INTO v_payment_id;

  -- CASE 4: Underpayment → ghi nhận pending payment, order giữ nguyên, review
  ELSIF v_amount < v_order.final_amount THEN
    v_outcome := 'underpaid';
    v_needs_review := TRUE;
    v_message := format(
      'Khách chuyển thiếu tiền. Cần: %s, Nhận: %s. Đơn giữ nguyên trạng thái.',
      v_order.final_amount, v_amount
    );
    v_history_note := format(
      'Khách chuyển thiếu tiền. Cần: %s, Nhận: %s. Mã GD: %s. Đơn giữ nguyên pending.',
      v_order.final_amount, v_amount, v_txn_code
    );

    INSERT INTO public.payments (order_id, payment_method, amount, payment_status, transaction_code)
    VALUES (v_order.order_id, v_method, v_amount, 'pending', v_txn_code)
    RETURNING payment_id INTO v_payment_id;

  -- CASE 5: Matched / overpaid trên đơn đang hoạt động → APPLY
  ELSE
    v_outcome := 'applied';
    v_needs_review := FALSE;
    v_message := format(
      'Đã xác nhận thanh toán đơn #%s%s.',
      v_order.order_code,
      CASE WHEN v_amount > v_order.final_amount THEN ' (khách chuyển dư — cần đối soát phần thừa)' ELSE '' END
    );
    v_history_note := format(
      'Xác nhận thanh toán%s. Mã GD: %s. Số tiền: %s.',
      CASE WHEN v_source = 'admin' THEN ' thủ công bởi admin' ELSE ' tự động qua SePay' END,
      v_txn_code, v_amount
    );

    -- Tạo paid payment row (unique index chặn nếu đã có paid)
    INSERT INTO public.payments (order_id, payment_method, amount, payment_status, transaction_code)
    VALUES (v_order.order_id, v_method, v_amount, 'paid', v_txn_code)
    RETURNING payment_id INTO v_payment_id;

    -- Cập nhật order: paid + advance pending→confirmed
    UPDATE public.orders
       SET payment_status = 'paid',
           order_status = CASE WHEN order_status = 'pending' THEN 'confirmed' ELSE order_status END,
           confirmed_at = CASE WHEN order_status = 'pending' THEN v_now ELSE confirmed_at END,
           updated_at = v_now
     WHERE order_id = v_order.order_id;

    v_order_status_after := CASE WHEN v_order.order_status = 'pending' THEN 'confirmed' ELSE v_order.order_status END;
  END IF;

  -- Ghi payment history (luôn luôn)
  INSERT INTO public.order_status_history (
    order_id, status_type, from_status, to_status, note, changed_by_member_id
  ) VALUES (
    v_order.order_id, 'payment', v_order.payment_status,
    CASE WHEN v_outcome = 'applied' THEN 'paid' ELSE v_order.payment_status END,
    v_history_note, v_admin_id
  );

  -- Ghi audit log (luôn luôn)
  INSERT INTO public.audit_logs (
    actor_member_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_admin_id,
    CASE WHEN v_source = 'admin' THEN 'payment.confirm' ELSE 'payment.webhook_apply' END,
    'order', v_order.order_id,
    jsonb_build_object('payment_status', v_order.payment_status, 'order_status', v_order.order_status),
    jsonb_build_object(
      'payment_status', CASE WHEN v_outcome = 'applied' THEN 'paid' ELSE v_order.payment_status END,
      'order_status', v_order_status_after,
      'outcome', v_outcome,
      'payment_method', v_method::TEXT,
      'provider', v_provider,
      'transaction_code', v_txn_code
    )
  );

  -- Ghi payment event (luôn luôn — durable ledger)
  INSERT INTO public.payment_events (
    provider, provider_transaction_id, order_code, matched_order_id,
    received_amount, expected_amount, classification, outcome, payload_fingerprint
  ) VALUES (
    v_provider, v_txn_code, v_order_code, v_order.order_id,
    v_amount, v_order.final_amount,
    CASE v_outcome
      WHEN 'applied' THEN
        CASE WHEN v_amount > v_order.final_amount THEN 'overpaid' ELSE 'matched' END
      ELSE v_outcome
    END,
    v_outcome,
    v_provider || ':' || v_txn_code
  );

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'order_id', v_order.order_id,
    'order_code', v_order.order_code,
    'payment_id', v_payment_id,
    'payment_status', CASE WHEN v_outcome = 'applied' THEN 'paid' ELSE 'pending' END,
    'order_status', v_order_status_after,
    'needs_review', v_needs_review,
    'replayed', FALSE,
    'message', v_message,
    'amount_received', v_amount,
    'amount_expected', v_order.final_amount
  );

EXCEPTION
  -- Unique violation trên one-paid index: state không nhất quán
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%uq_payments_one_paid_per_order%' THEN
      RAISE EXCEPTION 'Order % đã có payment paid — single-payment invariant bị vi phạm (state không nhất quán)', v_order_code;
    END IF;
    IF SQLERRM LIKE '%uq_payments_order_transaction_code%' THEN
      RAISE EXCEPTION 'Transaction % đã tồn tại cho order % — duplicate', v_txn_code, v_order_code;
    END IF;
    RAISE;
END;
$$;

-- Restrict EXECUTE: chỉ service_role
REVOKE ALL ON FUNCTION public.apply_payment_event(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_event(JSONB) TO service_role;

-- ========================================================
-- PHẦN 6: Final verification
-- ========================================================

DO $$
BEGIN
  -- Verify RPC exists and is executable by service_role only
  IF NOT has_function_privilege('service_role', 'public.apply_payment_event(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role không có EXECUTE trên apply_payment_event';
  END IF;
  IF has_function_privilege('anon', 'public.apply_payment_event(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon có EXECUTE trên apply_payment_event — phải bị revoke';
  END IF;
  IF has_function_privilege('authenticated', 'public.apply_payment_event(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated có EXECUTE trên apply_payment_event — phải bị revoke';
  END IF;
END $$;

-- ========================================================
-- VERIFICATION READ-ONLY (chạy tay sau khi apply):
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'payments' ORDER BY indexname;
--   -- mong đợi: payments_pkey, idx_payments_order,
--   --   uq_payments_order_transaction_code, uq_payments_one_paid_per_order
--
--   SELECT has_table_privilege('anon','public.payments','INSERT');
--   -- mong đợi: f
--
--   SELECT has_function_privilege('service_role','public.apply_payment_event(jsonb)','EXECUTE');
--   -- mong đợi: t
--
--   Test duplicate trên rehearsal DB:
--     INSERT INTO payments (order_id, payment_method, amount, payment_status, transaction_code)
--     VALUES ('<existing-paid-order>', 'banking', 1000, 'paid', 'TEST-DUP');
--     -- mong đợi: unique_violation trên uq_payments_one_paid_per_order
-- ========================================================
