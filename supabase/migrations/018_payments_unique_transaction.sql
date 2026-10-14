-- ========================================================
-- GIEO MƠ — DATABASE MIGRATION 018
-- Payments idempotency: unique (order_id, transaction_code)
-- Batch 2E: chống duplicate payment row khi concurrent request
-- ========================================================
-- KHÔNG đụng migrations 001→017.
-- Áp dụng qua Supabase Dashboard SQL Editor (standalone).
-- Verification read-only nằm trong comment cuối file.
-- ========================================================
--
-- ROOT CAUSE (Batch 2E audit):
--   payments (001:269-280) chỉ có PK payment_id + idx_payments_order
--   (KHÔNG unique). recordPaymentOnce chống trùng bằng SELECT-then-INSERT
--   ở tầng ứng dụng (paymentRecordService.ts:44-66) — RACY: 2 request
--   đồng thời có thể cùng vượt SELECT rồi cùng INSERT → 2 rows cùng
--   (order_id, transaction_code) → ghi nhận doanh thu trùng.
--
-- CONTRACT ĐÃ XÁC MINH TỪ CODE:
--   - Cả 2 caller đều truyền transactionCode KHÔNG NULL, deterministic:
--       admin confirm  : "ADMIN-CONFIRM-<order_code>"  (payment/route.ts:65)
--       SePay webhook  : referenceNumber || "SEPAY-<id>" (sepay/route.ts:141)
--   - Cùng (order_id, transaction_code) = cùng giao dịch → tối đa 1 row.
--   - Hai transaction_code KHÁC nhau trên cùng order vẫn hợp lệ
--     (nhiều giao dịch thật) — index này KHÔNG chặn.
--
-- PRECONDITION — KIỂM TRA TRƯỚC KHI ÁP DỤNG (read-only, KHÔNG tự xóa):
--   Nếu Production đã có dữ liệu trùng, CREATE UNIQUE INDEX sẽ FAIL với
--   duplicate key và migration ROLLBACK an toàn (dữ liệu KHÔNG bị đụng).
--   Khi đó PHẢI đối soát thủ công các dòng trùng rồi mới chạy lại:
--
--     SELECT order_id, transaction_code, COUNT(*) AS n
--       FROM public.payments
--      WHERE transaction_code IS NOT NULL
--      GROUP BY order_id, transaction_code
--     HAVING COUNT(*) > 1;
--
--   Migration này KHÔNG tự xóa/chọn payment records — dừng cho review.
-- ========================================================

-- 1) Partial unique index.
--    WHERE transaction_code IS NOT NULL: row NULL không conflict
--    (mọi caller thực tế đều set non-NULL; NULL vẫn cho phép nhiều dòng).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_order_transaction_code
  ON public.payments (order_id, transaction_code)
  WHERE transaction_code IS NOT NULL;

-- 2) Xác minh định nghĩa (fail-closed).
--    IF NOT EXISTS KHÔNG xác minh định nghĩa nếu index cùng tên đã tồn tại
--    với definition khác → bước này RAISE để dừng, không im lặng chấp nhận.
DO $$
DECLARE
  def TEXT;
BEGIN
  SELECT indexdef INTO def
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'uq_payments_order_transaction_code';

  IF def IS NULL THEN
    RAISE EXCEPTION
      'Index uq_payments_order_transaction_code không tồn tại sau CREATE — kiểm tra quyền/transaction';
  END IF;

  IF position('(order_id, transaction_code)' IN def) = 0
     OR position('transaction_code IS NOT NULL' IN def) = 0 THEN
    RAISE EXCEPTION
      'Index uq_payments_order_transaction_code có định nghĩa KHÔNG đúng mong đợi: %', def;
  END IF;
END $$;

-- ========================================================
-- VERIFICATION READ-ONLY (chạy tay sau khi apply):
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'payments' AND indexname = 'uq_payments_order_transaction_code';
--   -- mong đợi: CREATE UNIQUE INDEX uq_payments_order_transaction_code
--   --   ON public.payments USING btree (order_id, transaction_code)
--   --   WHERE (transaction_code IS NOT NULL)
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'payments';
--   -- payments có: payments_pkey, idx_payments_order, uq_payments_order_transaction_code
--
--   Kiểm tra chống duplicate sau apply (phải 0 dòng):
--     SELECT order_id, transaction_code, COUNT(*) FROM public.payments
--      WHERE transaction_code IS NOT NULL
--      GROUP BY order_id, transaction_code HAVING COUNT(*) > 1;
-- ========================================================
