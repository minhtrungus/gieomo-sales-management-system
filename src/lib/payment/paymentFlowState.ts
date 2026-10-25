import type { Order } from "@/types/database";

/**
 * Batch A — phán đoán trạng thái luồng thanh toán cho trang kết quả đơn hàng.
 *
 * TRUTH MỘT NGUỒN: chỉ `order.payment_status === "paid"` do server trả về
 * được coi là ĐÃ THANH TOÁN. Query string (vd: `?payment=cod`) CHỈ dùng để
 * chọn panel hiển thị trước khi đơn load được từ server — không bao giờ
 * xác nhận thanh toán (chống link giả mạo `payment=cod` trên đơn banking).
 *
 * Phân biệt trạng thái:
 * - paid            → server đã ghi payment_status="paid" (webhook/admin confirm).
 * - COD đã đặt      → server ghi payment_method="cod", CHƯA paid (thanh toán khi nhận).
 * - pending banking → luồng chuyển khoản, chờ webhook/đối soát.
 * - momo/unknown    → theo payment_method server; không hiện banking instructions.
 */
export interface PaymentFlowState {
  /** Server đã xác nhận paid — nguồn sự thật duy nhất. */
  isPaid: boolean;
  /** Đơn COD đã được ghi nhận qua server — CHƯA phải paid. */
  isCodOrderPlaced: boolean;
  /** Luồng hiển thị: ưu tiên payment_method server; query chỉ fallback trước khi load. */
  flowMethod: "cod" | "banking" | "momo";
  /** Panel hướng dẫn chuyển khoản: chỉ khi luồng banking và chưa paid. */
  showBankingInstructions: boolean;
}

export function resolvePaymentFlowState(
  order: Pick<Order, "payment_method" | "payment_status"> | null | undefined,
  queryMethod: string | null | undefined
): PaymentFlowState {
  const isPaid = order?.payment_status === "paid";

  const queryFlow: "cod" | "banking" | "momo" =
    queryMethod === "cod" || queryMethod === "momo" ? queryMethod : "banking";
  const flowMethod = order?.payment_method ?? queryFlow;

  return {
    isPaid,
    // Banner COD chỉ khi SERVER ghi payment_method="cod" trên đơn — query
    // không đủ để khẳng định "đơn đã được ghi nhận".
    isCodOrderPlaced: !isPaid && order?.payment_method === "cod",
    flowMethod,
    showBankingInstructions: !isPaid && flowMethod === "banking",
  };
}
