export type CheckoutOrderResponseBody = {
  success?: boolean;
  idempotency?: string;
  error?: string;
  orderCode?: string;
  orderId?: string;
  finalAmount?: number | string;
};

export type CheckoutSubmitAction =
  | { kind: "success" }
  | { kind: "retry"; delayMs: number; rotateKey: boolean; errorMessage: string }
  | { kind: "stop"; clearKey: boolean; message: string };

export const CHECKOUT_MAX_SUBMIT_RETRIES = 3;

const RETRY_BASE_DELAY_MS = 400;

/**
 * Pure decision for the checkout idempotency submit loop.
 * Encodes the key lifecycle:
 * - processing        → retry (keep key) with backoff
 * - hash_mismatch     → stop, keep key (old attempt must be resolved first)
 * - needs_reconciliation → stop, keep key (ops must close recon first)
 * - replay_cancelled  → stop, clear key (customer may create a new order)
 * - failed_terminal   → stop, clear key (fresh key on next attempt)
 * - success           → success (caller clears key)
 * - other failure     → retry with backoff while attempts remain, else stop
 *   keeping the key (so the retry re-reads the same ledger row).
 */
export function decideCheckoutSubmitAction(
  status: number,
  body: CheckoutOrderResponseBody,
  attempt: number,
  maxAttempts: number = CHECKOUT_MAX_SUBMIT_RETRIES
): CheckoutSubmitAction {
  if (status === 409 && body.idempotency === "processing") {
    return {
      kind: "retry",
      delayMs: RETRY_BASE_DELAY_MS * attempt,
      rotateKey: false,
      errorMessage: body.error || "Đơn hàng đang được xử lý. Vui lòng thử lại.",
    };
  }

  if (status === 409 && body.idempotency === "needs_reconciliation") {
    return {
      kind: "stop",
      clearKey: false,
      message:
        body.error ||
        "Đơn hàng cần được đối soát thủ công. Vui lòng liên hệ hỗ trợ — giỏ hàng được giữ nguyên.",
    };
  }

  if (status === 409 && body.idempotency === "hash_mismatch") {
    return {
      kind: "stop",
      clearKey: false,
      message: body.error || "Attempt trước dùng thông tin khác. Cần xác minh trạng thái trước khi tạo đơn mới.",
    };
  }

  if (status === 409 && body.success === false && body.idempotency === "replay_cancelled") {
    return {
      kind: "stop",
      clearKey: true,
      message: body.error || "Đơn hàng trước đã bị hủy. Vui lòng thử tạo đơn mới.",
    };
  }

  const amount = typeof body.finalAmount === "number" ||
    (typeof body.finalAmount === "string" && body.finalAmount.trim() !== "")
    ? Number(body.finalAmount) : NaN;
  if (status >= 200 && status < 300 && body.success === true &&
      typeof body.orderId === "string" && body.orderId.trim() &&
      typeof body.orderCode === "string" && body.orderCode.trim() &&
      Number.isFinite(amount) && amount >= 0) {
    return { kind: "success" };
  }

  const failMsg = body.error || "Không thể tạo đơn hàng. Vui lòng kiểm tra lại giỏ hàng!";

  if (status === 400 && body.success === false && body.idempotency === "failed_terminal") {
    return { kind: "stop", clearKey: true, message: failMsg };
  }

  if (attempt < maxAttempts) {
    return {
      kind: "retry",
      delayMs: RETRY_BASE_DELAY_MS * attempt,
      rotateKey: false,
      errorMessage: failMsg,
    };
  }

  return { kind: "stop", clearKey: false, message: failMsg };
}
