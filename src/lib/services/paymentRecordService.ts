/**
 * Batch 2B — ghi payment record IDEMPOTENT (dùng bởi payment confirm + SePay webhook).
 *
 * Mục tiêu: tiền đã đến thì PHẢI có dấu vết trong bảng payments theo đúng
 * schema hiện có (001: payments.payment_status, transaction_code) — kể cả khi
 * đơn đã bị hủy. Không tự động hoàn tiền ở đây.
 *
 * Chống ghi trùng — 2 lớp:
 *   1) Ứng dụng: kiểm tra (order_id, transaction_code) TRƯỚC khi insert
 *      (retry tuần tự / webhook gửi lại → duplicate, không insert).
 *   2) Database (migration 018): unique index
 *      uq_payments_order_transaction_code trên (order_id, transaction_code)
 *      WHERE transaction_code IS NOT NULL — lớp bảo vệ CUỐI CÙNG khi 2 request
 *      đồng thời cùng vượt SELECT (race window). Insert gặp 23505 TRÊN
 *      constraint này → duplicate, không insert thêm dòng.
 *
 * Cột insert theo schema THẬT: payment_status (enum) — trước đây route từng
 * insert "status"/"confirmed_at" không tồn tại → PostgREST từ chối âm thầm.
 */

export type PaymentRecordInput = {
  orderId: string;
  amount: number;
  transactionCode: string;
  paymentMethod?: string;
};

export type PaymentRecordResult = {
  /** true nếu CHÍNH call này tạo row mới */
  recorded: boolean;
  /** true nếu row đã tồn tại từ trước (retry/duplicate) */
  duplicate: boolean;
  /** thông báo lỗi DB (null = ok) */
  error: string | null;
};

export type PaymentDbError = { message: string; code?: string | null };
export type PaymentInsertRow = Record<string, unknown>;

type PaymentSelectBuilder = {
  eq(column: string, value: unknown): {
    eq(column: string, value: unknown): {
      maybeSingle(): Promise<{
        data: { payment_id: string } | null;
        error: PaymentDbError | null;
      }>;
    };
  };
};

type PaymentTable = {
  select(columns: string): PaymentSelectBuilder;
  insert(rows: PaymentInsertRow[]): PromiseLike<{
    data: unknown;
    error: PaymentDbError | null;
  }>;
};

export type PaymentSupabaseLike = {
  from(table: string): PaymentTable;
};

/** Tên unique constraint do migration 018 tạo (dùng filter 23505 — fail-closed). */
const PAYMENT_UNIQUE_CONSTRAINT = "uq_payments_order_transaction_code";

/**
 * Chỉ coi là duplicate khi 23505 (unique_violation) TRÊN constraint thanh toán
 * dự kiến. Lỗi 23505 khác (PK, constraint lạ) hoặc code khác → KHÔNG nuốt.
 */
function isPaymentUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code !== "23505") return false;
  const msg = typeof e.message === "string" ? e.message : "";
  return msg.includes(PAYMENT_UNIQUE_CONSTRAINT);
}

export async function recordPaymentOnce(
  supabase: PaymentSupabaseLike,
  input: PaymentRecordInput
): Promise<PaymentRecordResult> {
  const { orderId, amount, transactionCode, paymentMethod = "banking" } = input;

  const { data: existing, error: findError } = await supabase
    .from("payments")
    .select("payment_id")
    .eq("order_id", orderId)
    .eq("transaction_code", transactionCode)
    .maybeSingle();

  if (findError) {
    return { recorded: false, duplicate: false, error: findError.message };
  }
  if (existing) {
    return { recorded: false, duplicate: true, error: null };
  }

  const { error: insertError } = await supabase.from("payments").insert([
    {
      order_id: orderId,
      payment_method: paymentMethod,
      amount,
      payment_status: "paid",
      transaction_code: transactionCode,
    },
  ]);

  if (insertError) {
    // Lớp 2 — DB unique constraint (migration 018): 2 request đồng thời cùng
    // vượt SELECT ở trên → request thua nhận 23505 trên constraint thanh toán
    // → duplicate (fail-closed, không tạo dòng thứ hai). Lỗi khác giữ nguyên.
    if (isPaymentUniqueViolation(insertError)) {
      return { recorded: false, duplicate: true, error: null };
    }
    return { recorded: false, duplicate: false, error: insertError.message };
  }
  return { recorded: true, duplicate: false, error: null };
}
