/**
 * Batch 3A — Xác nhận thanh toán SERVER-FIRST (mark-paid).
 *
 * Trước đây admin mark-paid chạy fire-and-forget PATCH /api/orders
 * (orderStore.updateStoredPaymentStatus) → chỉ cập nhật localStorage rồi
 * gửi PATCH không await, bỏ qua payment pipeline tại /api/orders/payment
 * (không ghi payment record, không audit, không paid/cancelled guard).
 *
 * Helper này đảo ngược thứ tự: GỌI server trước (/api/orders/payment
 * action=confirm), CHỜ phản hồi, và CHỈ cập nhật local khi server xác
 * nhận thành công. Mọi lỗi (mạng, 401/403, 4xx/5xx, body không hợp lệ)
 * trả về outcome thất bại → caller GIỮ nguyên trạng thái chưa xác nhận,
 * hiển thị lỗi và cho phép retry an toàn.
 *
 * Chống double-submit: module-level in-flight Set theo orderCode — 2 lần
 * gọi đồng thời cho cùng đơn → lần thứ hai trả in_flight, KHÔNG gửi request
 * thứ hai. (Lớp guard thứ hai nằm ở UI qua isConfirmingPaid.)
 *
 * Idempotency: RPC replay (event đã ghi trước đó, ví dụ webhook chạy trước)
 * trả HTTP 200 + success=true + paymentStatus="paid" + isAlreadyPaid=true →
 * nhánh 1 xử lý thành công (đồng bộ local paid, không record mới). Server cũng
 * có thể trả success=false + isAlreadyPaid=true (legacy shape) → nhánh 2
 * already_paid. Đơn đã hủy server trả order_cancelled (HTTP 409) — server VẪN
 * ghi payment record làm dấu vết (trace) nhưng KHÔNG hồi sinh đơn; caller chỉ
 * đồng bộ payment_status=paid (trace), GIỮ nguyên order_status=cancelled.
 */

export type PaymentConfirmOutcome =
  | { ok: true; paymentStatus: "paid"; orderStatus?: string }
  | {
      ok: false;
      kind:
        | "already_paid"
        | "order_cancelled"
        | "auth_error"
        | "http_error"
        | "business_error"
        | "invalid_response"
        | "network_error"
        | "in_flight";
      message: string;
      /** true khi server ĐÃ set orders.payment_status=paid (dù outcome là failure). */
      paymentStatusIsPaid?: boolean;
    };

const PAYMENT_ENDPOINT = "/api/orders/payment";

/**
 * Payment evidence required by the atomic server contract. A payment event
 * records money received; it does not let the client choose order lifecycle.
 */
export type PaymentConfirmOptions = {
  paymentMethod?: "banking" | "cod";
  amount?: number;
  referenceNumber?: string;
};

/** orderCode đang có confirm request trong flight (chống double-submit). */
const inFlight = new Set<string>();

/** Cho tests dọn dẹp / kiểm tra trạng thái in-flight. */
export function resetPaymentConfirmInFlight(): void {
  inFlight.clear();
}

export function isPaymentConfirmInFlight(orderCode: string): boolean {
  return inFlight.has(orderCode.trim().toUpperCase());
}

/**
 * Gọi /api/orders/payment action=confirm. Tham số thứ hai linh hoạt để giữ
 * backward-compat với caller/test cũ truyền fetchImpl (function) — hoặc caller
 * mới truyền options object (và fetchImpl tùy chọn ở tham số thứ ba).
 */
export async function confirmPaymentServerFirst(
  orderCode: string,
  optionsOrFetch?: PaymentConfirmOptions | typeof fetch,
  fetchImplArg?: typeof fetch
): Promise<PaymentConfirmOutcome> {
  const legacyFetch = typeof optionsOrFetch === "function" ? optionsOrFetch : undefined;
  const options: PaymentConfirmOptions =
    typeof optionsOrFetch === "object" && optionsOrFetch !== null ? optionsOrFetch : {};
  const fetchImpl = legacyFetch ?? fetchImplArg ?? fetch;

  const key = orderCode.trim().toUpperCase();
  const amount = Number(options.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      kind: "business_error",
      message: "Bắt buộc số tiền thực nhận lớn hơn 0.",
    };
  }
  const isCash = options.paymentMethod === "cod";
  const referenceNumber = options.referenceNumber?.trim() || "";
  if (!isCash && !/^[A-Za-z0-9][A-Za-z0-9 _\-/]{2,63}$/.test(referenceNumber)) {
    return {
      ok: false,
      kind: "business_error",
      message: "Bắt buộc mã giao dịch ngân hàng thật (3-64 ký tự).",
    };
  }
  if (inFlight.has(key)) {
    return {
      ok: false,
      kind: "in_flight",
      message: "Đang xác nhận thanh toán cho đơn này — vui lòng đợi.",
    };
  }
  inFlight.add(key);
  try {
    const res = await fetchImpl(PAYMENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderCode: key,
        action: "confirm",
        ...(options.paymentMethod ? { paymentMethod: options.paymentMethod } : {}),
        amount,
        ...(!isCash ? { referenceNumber } : {}),
      }),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    // 1) Thành công thật: HTTP 2xx + success=true + paymentStatus=paid.
    if (res.ok && data?.success === true && data?.paymentStatus === "paid") {
      return { ok: true, paymentStatus: "paid", orderStatus: data.orderStatus };
    }

    // 2) Đã thanh toán trước đó (idempotent) — server KHÔNG tạo record mới.
    if (data?.isAlreadyPaid === true) {
      return {
        ok: false,
        kind: "already_paid",
        message: data?.error || "Đơn hàng này đã được xác nhận thanh toán trước đó.",
        paymentStatusIsPaid: true,
      };
    }

    // 3) Đơn đã hủy — server ghi payment record (trace) + payment_status=paid,
    //    NHƯNG KHÔNG hồi sinh đơn (order_status giữ cancelled).
    if (data?.outcome === "order_cancelled" || data?.outcome === "cancelled_order_payment") {
      return {
        ok: false,
        kind: "order_cancelled",
        message:
          data?.error ||
          "Đơn hàng đã bị hủy — giao dịch đã được ghi nhận (cần đối soát/thủ tục hoàn tiền), KHÔNG hồi sinh đơn.",
        paymentStatusIsPaid: false,
      };
    }

    // 4) HTTP lỗi (401/403/4xx/5xx, 409 state_changed...) — không cập nhật paid.
    if (!res.ok) {
      return {
        ok: false,
        kind: res.status === 401 || res.status === 403 ? "auth_error" : "http_error",
        message: data?.error || `Lỗi máy chủ (${res.status}) — vui lòng thử lại.`,
      };
    }

    // 5) HTTP 2xx nhưng success=false (vd: đơn không ở trạng thái pending).
    if (data && data.success === false) {
      return {
        ok: false,
        kind: "business_error",
        message: data.error || "Không thể xác nhận thanh toán cho đơn hàng này.",
      };
    }

    // 6) HTTP 2xx nhưng body không đúng contract → không bao giờ báo thành công giả.
    return {
      ok: false,
      kind: "invalid_response",
      message: "Phản hồi không hợp lệ từ máy chủ — vui lòng thử lại.",
    };
  } catch (err: any) {
    return {
      ok: false,
      kind: "network_error",
      message: "Lỗi kết nối — vui lòng thử lại." + (err?.message ? ` (${err.message})` : ""),
    };
  } finally {
    inFlight.delete(key);
  }
}
