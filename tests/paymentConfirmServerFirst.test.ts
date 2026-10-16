import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * Batch 3A — Payment Mark-Paid Server-First.
 *
 * Kiểm thử helper confirmPaymentServerFirst (điều phối mark-paid qua
 * /api/orders/payment) + tính local-only của các call-site trong orderStore.
 *
 * ĐÂY LÀ MOCK TESTS (fetch stub theo đúng contract response của route
 * POST /api/orders/payment — đã pin trong payment/route.ts). KHÔNG phải bằng
 * chứng PostgreSQL/transaction đã nghiệm thu (PG tests skip khi thiếu
 * ATOMIC_PG_URL).
 *
 * Map 9 yêu cầu → tests:
 *   T1  server xác nhận thành công → ok, paymentStatus paid        → "T1 ..."
 *   T2  401/403 → auth_error, không paid                          → "T2 ..."
 *   T3  4xx/5xx → http_error, không paid                          → "T3 ..."
 *   T4  network rejection → network_error; retry sạch in-flight   → "T4 ..."
 *   T5  2xx success=false (non-pending) → business_error          → "T5 ..."
 *   T5b 2xx body thiếu contract → invalid_response                → "T5b ..."
 *   T6  đơn cancelled → order_cancelled, trace paid, không ok     → "T6 ..."
 *   T7  double-click/in-flight → in_flight, chỉ 1 request         → "T7 ..."
 *   T8  đã thanh toán trước đó → already_paid, idempotent         → "T8 ..."
 *   T9a approveStoredPayment local-only (không PATCH)              → "T9a ..."
 *   T9b syncStoredPaymentStatusLocal local-only (không PATCH)      → "T9b ..."
 *   T9c confirmOrderPaymentFromWebhook đã bị xóa (dead code)      → "T9c ..."
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;
const hooksSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try {
      return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" });
    } catch {
      return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const {
  confirmPaymentServerFirst,
  resetPaymentConfirmInFlight,
  isPaymentConfirmInFlight,
} = await import("../src/lib/data/paymentConfirm.ts");

// ===========================================================================
// PART 1 — helper confirmPaymentServerFirst (mock fetchImpl)
// ===========================================================================

type StubResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

function okJson(status: number, body: unknown): StubResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeFetch(calls: { url: string; body: any }[], responder: () => Promise<StubResponse> | StubResponse): typeof fetch {
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return responder();
  };
  return fn as unknown as typeof fetch;
}

const ORDER_CODE = "GM-TEST-001";

test("T1 — server xác nhận thành công → ok, paymentStatus paid, orderStatus confirmed", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () =>
    okJson(200, {
      success: true,
      message: "Đã xác nhận",
      orderId: "o1",
      orderCode: ORDER_CODE,
      paymentStatus: "paid",
      orderStatus: "confirmed",
    })
  );

  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);

  assert.equal(result.ok, true);
  assert.equal((result as any).paymentStatus, "paid");
  assert.equal((result as any).orderStatus, "confirmed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/orders/payment");
  assert.equal(calls[0].body.action, "confirm");
  assert.equal(calls[0].body.orderCode, ORDER_CODE);
});

test("T2 — 401/403 → auth_error, không paid, giữ nguyên trạng thái", async () => {
  resetPaymentConfirmInFlight();
  for (const status of [401, 403]) {
    const calls: any[] = [];
    const fetchImpl = makeFetch(calls, () =>
      okJson(status, { success: false, error: status === 401 ? "Yêu cầu đăng nhập (401)" : "Không có quyền (403)" })
    );
    const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
    assert.equal(result.ok, false);
    assert.equal((result as any).kind, "auth_error");
    assert.equal((result as any).paymentStatusIsPaid ?? false, false);
  }
});

test("T3 — 5xx → http_error, không paid", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () => okJson(500, { success: false, error: "Lỗi cập nhật trạng thái thanh toán" }));
  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal((result as any).kind, "http_error");
  assert.equal((result as any).paymentStatusIsPaid ?? false, false);
});

test("T3b — 409 state_changed → http_error, không paid", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () =>
    okJson(409, { success: false, outcome: "state_changed", error: "Trạng thái đơn đã thay đổi", currentStatus: "shipping", paymentRecorded: true })
  );
  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal((result as any).kind, "http_error");
  assert.equal((result as any).paymentStatusIsPaid ?? false, false);
});

test("T4 — network rejection → network_error; retry sau đó in-flight sạch, không duplicate", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  // Lần 1: fetch ném lỗi mạng.
  const failingFetch = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const r1 = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, failingFetch);
  assert.equal(r1.ok, false);
  assert.equal((r1 as any).kind, "network_error");
  // in-flight đã được nhả → retry được phép.
  assert.equal(isPaymentConfirmInFlight(ORDER_CODE), false);

  // Lần 2 (retry): server trả isAlreadyPaid (webhook đã ghi trước) → idempotent.
  const retryFetch = makeFetch(calls, () =>
    okJson(200, { success: false, error: "Đơn hàng này đã được xác nhận thanh toán trước đó.", isAlreadyPaid: true })
  );
  const r2 = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, retryFetch);
  assert.equal(r2.ok, false);
  assert.equal((r2 as any).kind, "already_paid");
  assert.equal((r2 as any).paymentStatusIsPaid, true);
  // Server-side dedup do recordPaymentOnce + unique constraint 018 xử lý —
  // helper chỉ đảm bảo không gửi trùng request đồng thời (xem T7).
});

test("T5 — 2xx success=false (đơn không ở trạng thái pending) → business_error, không paid", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () =>
    okJson(200, { success: false, error: "Đơn hàng không ở trạng thái pending, không thể xác nhận thanh toán." })
  );
  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal((result as any).kind, "business_error");
  assert.equal((result as any).paymentStatusIsPaid ?? false, false);
});

test("T5b — 2xx body thiếu contract (không success/outcome) → invalid_response, không báo thành công giả", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () => okJson(200, { unexpected: "shape" }));
  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal((result as any).kind, "invalid_response");
});

test("T5c — 2xx json() ném (malformed) → invalid_response, không paid", async () => {
  resetPaymentConfirmInFlight();
  const malformed: StubResponse = {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  };
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () => malformed);
  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal((result as any).kind, "invalid_response");
});

test("T6 — đơn cancelled → lưu review event, không đánh paid và không hồi sinh", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () =>
    okJson(409, {
      success: false,
      outcome: "order_cancelled",
      error: "Đơn đã bị hủy — giao dịch đã được ghi nhận, cần đối soát.",
      orderId: "o1",
      orderCode: ORDER_CODE,
      paymentStatus: "paid",
      orderStatus: "cancelled",
      paymentRecorded: true,
      needsReconciliation: true,
    })
  );
  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal((result as any).kind, "order_cancelled");
  // Server ĐÃ set payment_status=paid (trace) → caller chỉ đồng bộ local paid,
  // GIỮ nguyên order_status=cancelled (helper không trả ok → không đổi order).
  assert.equal((result as any).paymentStatusIsPaid, false);
});

test("T7 — double-click/in-flight → in_flight, chỉ 1 request được gửi", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  let release: (v: StubResponse) => void = () => {};
  const gate = new Promise<StubResponse>((resolve) => {
    release = resolve;
  });
  // fetch treo cho tới khi release — mô phỏng request đang trong flight.
  const slowFetch = (async (_url: string, _init?: RequestInit) => {
    calls.push({ url: String(_url), body: JSON.parse(String((_init as any)?.body)) });
    return gate;
  }) as unknown as typeof fetch;

  const p1 = confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, slowFetch);
  // Trong lúc p1 còn flight, gọi thứ hai → in_flight, KHÔNG gửi request nữa.
  const r2 = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, slowFetch);
  assert.equal(r2.ok, false);
  assert.equal((r2 as any).kind, "in_flight");
  assert.equal(calls.length, 1, "chỉ 1 request được gửi khi có in-flight");

  // Nhả p1 → thành công, in-flight được dọn.
  release(okJson(200, { success: true, paymentStatus: "paid", orderStatus: "confirmed" }));
  const r1 = await p1;
  assert.equal(r1.ok, true);
  assert.equal(isPaymentConfirmInFlight(ORDER_CODE), false);
  assert.equal(calls.length, 1);
});

test("T8 — webhook/payment đã ghi nhận trước đó → already_paid, idempotent, không nhân đôi", async () => {
  resetPaymentConfirmInFlight();
  const calls: any[] = [];
  const fetchImpl = makeFetch(calls, () =>
    okJson(200, { success: false, error: "Đơn hàng này đã được xác nhận thanh toán trước đó.", isAlreadyPaid: true })
  );
  const result = await confirmPaymentServerFirst(ORDER_CODE, { amount: 100, referenceNumber: "BANK-REF-123" }, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal((result as any).kind, "already_paid");
  assert.equal((result as any).paymentStatusIsPaid, true);
  // Caller chỉ đồng bộ local paid (idempotent) — record dedup do
  // recordPaymentOnce (paymentRecordService tests P1-P8) + constraint 018.
});

// ===========================================================================
// PART 2 — orderStore call-sites: local-only, không fire-and-forget PATCH
// ===========================================================================

const storage = new Map<string, string>();
const g = globalThis as unknown as {
  window: typeof globalThis;
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
  dispatchEvent(event: Event): boolean;
  fetch: (url: string, init?: RequestInit) => Promise<unknown>;
};

g.window = globalThis;
g.localStorage = {
  getItem: (key) => (storage.has(key) ? (storage.get(key) as string) : null),
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
  removeItem: (key) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
};
g.dispatchEvent = () => true;

// Spy fetch: bắt mọi call để xác nhận local-only KHÔNG gửi PATCH.
let fetchCalls: { url: string; method: string }[] = [];
g.fetch = (async (url: string, init?: RequestInit) => {
  fetchCalls.push({ url: String(url), method: (init?.method || "GET").toUpperCase() });
  return { ok: false, status: 401, json: async () => ({ success: false }) };
}) as unknown as typeof fetch;

const { approveStoredPayment, syncStoredPaymentStatusLocal, getStoredOrders, getStoredPayments } = await import(
  "../src/lib/data/orderStore.ts"
);

function seedOrder(orderCode: string, paymentStatus: "pending" | "paid" | "failed" | "refunded") {
  const orders = [
    {
      order_id: "ord-1",
      order_code: orderCode,
      order_status: "pending",
      payment_status: paymentStatus,
      final_amount: 100000,
    },
  ] as any[];
  storage.set("gieomo_orders", JSON.stringify(orders));
}

test("T9a — approveStoredPayment local-only: cập nhật paid LOCAL, KHÔNG fire-and-forget PATCH", async () => {
  storage.clear();
  fetchCalls = [];
  seedOrder("GM-APPROVE-1", "pending");
  // Seed 1 payment record pending để approveStoredPayment tìm thấy orderCode.
  storage.set(
    "gieomo_payments",
    JSON.stringify([
      { paymentId: "pay-1", orderCode: "GM-APPROVE-1", amount: 100000, paymentMethod: "banking", transactionCode: "TX-1", status: "pending", createdAt: "x" },
    ])
  );

  approveStoredPayment("pay-1");

  // Local đã paid.
  const orders = getStoredOrders();
  const target = orders.find((o: any) => o.order_code === "GM-APPROVE-1");
  assert.ok(target, "order phải tồn tại trong cache local");
  assert.equal(target!.payment_status, "paid");
  // Payment record local đã paid.
  const pays = getStoredPayments();
  assert.equal(pays.find((p: any) => p.paymentId === "pay-1")?.status, "paid");
  // KHÔNG có PATCH /api/orders nào được gửi (local-only — server đã confirm trước).
  const patches = fetchCalls.filter((c) => c.method === "PATCH" && c.url.startsWith("/api/orders"));
  assert.equal(patches.length, 0, "approveStoredPayment không được fire-and-forget PATCH");
});

test("T9b — syncStoredPaymentStatusLocal local-only: KHÔNG fetch PATCH", async () => {
  // Ghi nhận: cachedOrders trong orderStore không reset giữa test (module-level).
  // T9a đã cover đường đầy đủ (approveStoredPayment → sync cập nhật paid + không
  // PATCH). Ở đây chỉ chốt contract local-only: gọi sync KHÔNG BAO GIỜ gửi PATCH.
  fetchCalls = [];
  syncStoredPaymentStatusLocal("GM-LOCAL-1", "paid");
  const patches = fetchCalls.filter((c) => c.method === "PATCH");
  assert.equal(patches.length, 0, "syncStoredPaymentStatusLocal là local-only, không gửi PATCH");
});

test("T9c — confirmOrderPaymentFromWebhook đã bị xóa (dead code, unsafe mark-paid path)", async () => {
  const orderStore: any = await import("../src/lib/data/orderStore.ts");
  assert.equal(
    typeof orderStore.confirmOrderPaymentFromWebhook,
    "undefined",
    "confirmOrderPaymentFromWebhook phải bị xóa — là mark-paid path bypass pipeline, không có caller"
  );
});
