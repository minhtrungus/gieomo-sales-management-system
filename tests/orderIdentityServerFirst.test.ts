import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

/**
 * Batch 3A.2 — định danh đơn SERVER-CANONICAL + payment contract mở rộng.
 *
 * Trước đây: saveNewOrder fire-and-forget POST, dùng order_code/order_id client
 * tự sinh (GM-<rand>/ord-<ts>) → lệch với mã server (generateOrderCode) →
 * PATCH/payment endpoint match 0 dòng (silent no-op); create/POS confirm-paid
 * chạy local-first (bypass pipeline). Giờ đây:
 *   - saveNewOrder await POST, chỉ success khi server trả định danh canonical;
 *     định danh local bị ghi đè; side-effect local CHỈ sau server xác nhận.
 *   - create/POS/sale dùng mã server cho QR + confirm qua /api/orders/payment.
 *   - payment route: allowlist targetOrderStatus (confirmed|completed) +
 *     paymentMethod (banking|cod).
 *
 * Map tests:
 *   SI1 saveNewOrder success → canonical override + side-effect local        → "SI1 ..."
 *   SI2 saveNewOrder HTTP 4xx → không side-effect, retryable=false           → "SI2 ..."
 *   SI3 saveNewOrder network error → không side-effect, retryable=true       → "SI3 ..."
 *   SI4 saveNewOrder body thiếu định danh → không side-effect                → "SI4 ..."
 *   SI5 saveNewOrder gửi Idempotency-Key + bỏ order_id/order_code client      → "SI5 ..."
 *   SI6 syncStoredOrderStatusLocal local-only (0 PATCH)                      → "SI6 ..."
 *   SI7 confirmPaymentServerFirst forward options (targetOrderStatus/method) → "SI7 ..."
 *   SI8 payment route allowlist targetOrderStatus + paymentMethod (source)   → "SI8 ..."
 *   SI9 payment route confirm completed set completed_at + payment_method    → "SI9 ..."
 */

const hooksSource = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

// ===========================================================================
// Browser-like environment stub
// ===========================================================================

type StubResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

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
// Browser session persistence is required before sending a create attempt.
Object.defineProperty(g, "sessionStorage", { value: g.localStorage, configurable: true });

type FetchCall = { url: string; method: string; headers: Record<string, string>; body: string | null };
let fetchCalls: FetchCall[] = [];
// Kịch bản POST /api/orders trả về (mỗi test set lại).
let postResponse: StubResponse;

g.fetch = (async (url: string, init?: RequestInit) => {
  const method = (init?.method || "GET").toUpperCase();
  const headers = (init?.headers || {}) as Record<string, string>;
  const body = typeof init?.body === "string" ? init.body : null;
  fetchCalls.push({ url: String(url), method, headers, body });

  // syncOrdersFromServer (fire-and-forget GET) → trả fail để không merge.
  if (method === "GET") {
    return { ok: false, status: 401, json: async () => ({ success: false }) } as StubResponse;
  }
  if (method === "POST" && String(url) === "/api/orders") {
    return postResponse;
  }
  return { ok: false, status: 401, json: async () => ({ success: false }) } as StubResponse;
}) as unknown as typeof fetch;

const { saveNewOrder, syncStoredOrderStatusLocal, getStoredOrders } = await import(
  "../src/lib/data/orderStore.ts"
);

const baseOrder = () => ({
  order_id: "ord-client-1",
  order_code: "GM-CLIENT1",
  buyer_name: "Khách test",
  buyer_phone: "0901234567",
  buyer_email: "",
  recipient_name: "Khách test",
  recipient_phone: "0901234567",
  delivery_type: "home_delivery" as const,
  address_detail: "123 Test",
  district: "",
  province: "TP. Hồ Chí Minh",
  payment_method: "banking" as const,
  payment_status: "pending" as const,
  order_status: "pending" as const,
  delivery_status: "not_ready" as const,
  subtotal: 100000,
  discount_amount: 0,
  shipping_fee: 15000,
  final_amount: 115000,
  items: [
    {
      order_item_id: "item-1",
      order_id: "ord-client-1",
      product_id: "prod-1",
      variant_id: null,
      combo_id: null,
      product_name_snapshot: "Sản phẩm",
      item_name_snapshot: "Sản phẩm",
      variant_name_snapshot: null,
      price_snapshot: 100000,
      quantity: 1,
      subtotal: 100000,
      created_at: new Date().toISOString(),
    },
  ],
  created_at: new Date().toISOString(),
  completed_at: null,
  updated_at: new Date().toISOString(),
}) as any;

const posts = () => fetchCalls.filter((c) => c.method === "POST" && c.url === "/api/orders");
const patches = () => fetchCalls.filter((c) => c.method === "PATCH");

test("SI1 — saveNewOrder success: trả canonical server, ghi đè định danh local, side-effect local", async () => {
  storage.clear();
  fetchCalls = [];
  postResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      orderId: "server-uuid-1",
      orderCode: "GM-SERVER1",
      finalAmount: 115000,
      proofToken: "tok",
      idempotency: "created",
    }),
  } as StubResponse;

  const order = baseOrder();
  const result = await saveNewOrder(order);

  assert.equal(result.success, true);
  assert.equal(result.serverOrderId, "server-uuid-1");
  assert.equal(result.serverOrderCode, "GM-SERVER1");
  // Định danh local bị ghi đè bằng canonical của server.
  assert.equal(order.order_id, "server-uuid-1");
  assert.equal(order.order_code, "GM-SERVER1");
  // Side-effect local: đơn nằm trong localStorage với MÃ SERVER.
  const stored = JSON.parse(storage.get("gieomo_orders") || "[]");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].order_code, "GM-SERVER1");
});

test("SI2 — saveNewOrder HTTP 4xx (nghiệp vụ): KHÔNG side-effect local, retryable=false", async () => {
  storage.clear();
  fetchCalls = [];
  postResponse = {
    ok: false,
    status: 400,
    json: async () => ({ success: false, error: "Số điện thoại không hợp lệ" }),
  } as StubResponse;

  const result = await saveNewOrder(baseOrder());

  assert.equal(result.success, false);
  assert.match(result.error || "", /Số điện thoại/);
  assert.equal(result.retryable, false, "4xx là lỗi nghiệp vụ, không auto-retry");
  // KHÔNG có side-effect local nào (localStorage không có đơn).
  assert.equal(storage.has("gieomo_orders"), false, "không ghi đơn local khi server fail");
});

test("SI3 — saveNewOrder network error: KHÔNG side-effect local, retryable=true", async () => {
  storage.clear();
  fetchCalls = [];
  g.fetch = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;

  const result = await saveNewOrder(baseOrder());

  assert.equal(result.success, false);
  assert.equal(result.retryable, true, "mạng lỗi → nên thử lại");
  assert.equal(storage.has("gieomo_orders"), false, "không ghi đơn local khi chưa kết nối server");

  // Khôi phục fetch mock cho các test sau.
  g.fetch = (async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const headers = (init?.headers || {}) as Record<string, string>;
    const body = typeof init?.body === "string" ? init.body : null;
    fetchCalls.push({ url: String(url), method, headers, body });
    if (method === "GET") {
      return { ok: false, status: 401, json: async () => ({ success: false }) } as StubResponse;
    }
    if (method === "POST" && String(url) === "/api/orders") return postResponse;
    return { ok: false, status: 401, json: async () => ({ success: false }) } as StubResponse;
  }) as unknown as typeof fetch;
});

test("SI4 — saveNewOrder body success=true nhưng THIẾU định danh: không side-effect, retryable=false", async () => {
  storage.clear();
  fetchCalls = [];
  postResponse = {
    ok: true,
    status: 200,
    json: async () => ({ success: true }), // thiếu orderId/orderCode
  } as StubResponse;

  const result = await saveNewOrder(baseOrder());

  assert.equal(result.success, false);
  assert.match(result.error || "", /định danh/);
  assert.equal(result.retryable, false);
  assert.equal(storage.has("gieomo_orders"), false, "không side-effect khi định danh server sai");
});

test("SI5 — saveNewOrder gửi Idempotency-Key + BỎ order_id/order_code client khỏi body POST", async () => {
  storage.clear();
  fetchCalls = [];
  postResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      orderId: "server-uuid-2",
      orderCode: "GM-SERVER2",
      finalAmount: 115000,
      idempotency: "created",
    }),
  } as StubResponse;

  await saveNewOrder(baseOrder());

  const post = posts()[0];
  assert.ok(post, "phải có POST /api/orders");
  // Có Idempotency-Key header (đưa request sang đường atomic RPC).
  const idemKey = post.headers["Idempotency-Key"] || post.headers["idempotency-key"];
  assert.ok(idemKey && idemKey.length > 0, "phải gửi Idempotency-Key");
  // Body KHÔNG chứa order_id/order_code client (server tự sinh canonical).
  const parsed = JSON.parse(post.body || "{}");
  assert.equal("order_id" in parsed, false, "body không được chứa order_id client");
  assert.equal("order_code" in parsed, false, "body không được chứa order_code client");
  // Vẫn gửi các trường nghiệp vụ cần thiết.
  assert.equal(parsed.buyer_phone, "0901234567");
  assert.ok(Array.isArray(parsed.items) && parsed.items.length === 1);
});

test("P0-A: malformed success keeps key; terminal confirmed allows a new operation", async () => {
  storage.clear();
  fetchCalls = [];
  postResponse = { ok: true, status: 200, json: async () => ({ success: true, orderId: {}, orderCode: "GM-1", finalAmount: 1 }) };
  assert.equal((await saveNewOrder(baseOrder())).success, false);
  const key = posts()[0].headers["Idempotency-Key"];
  postResponse = { ok: false, status: 500, json: async () => ({ success: false, idempotency: "failed_terminal" }) };
  assert.equal((await saveNewOrder(baseOrder())).success, false);
  assert.equal(posts()[1].headers["Idempotency-Key"], key, "500 marker is not confirmed terminal");
  postResponse = { ok: false, status: 400, json: async () => ({ success: false, idempotency: "failed_terminal" }) };
  assert.equal((await saveNewOrder(baseOrder())).success, false);
  assert.equal(posts()[2].headers["Idempotency-Key"], key);
  postResponse = { ok: true, status: 200, json: async () => ({ success: true, orderId: "server-new", orderCode: "GM-NEW", finalAmount: 115000 }) };
  assert.equal((await saveNewOrder(baseOrder())).success, true);
  assert.notEqual(posts()[3].headers["Idempotency-Key"], key);
});

test("P0-A: changed input after unknown response is blocked before another POST", async () => {
  storage.clear();
  fetchCalls = [];
  postResponse = { ok: false, status: 400, json: async () => ({ success: false, error: "Unknown outcome" }) };
  assert.equal((await saveNewOrder(baseOrder())).success, false);
  const changed = baseOrder();
  changed.buyer_phone = "0901234568";
  const result = await saveNewOrder(changed);
  assert.equal(result.success, false);
  assert.match(result.error || "", /chưa xác định/);
  assert.equal(posts().length, 1);
});

test("SI6 — syncStoredOrderStatusLocal local-only: cập nhật order_status, KHÔNG PATCH", async () => {
  fetchCalls = [];
  // Module cache (cachedOrders) persist xuyên test trong cùng file — dùng đơn
  // đang có trong cache thay vì seed localStorage (cache thắng localStorage).
  const before = getStoredOrders();
  assert.ok(before.length > 0, "cache phải có đơn từ các test trước (SI1/SI5)");
  const targetCode = before[0].order_code;

  syncStoredOrderStatusLocal(targetCode, "completed");

  assert.equal(patches().length, 0, "sync local-only không gửi PATCH thừa");
  const after = getStoredOrders();
  const target = after.find((o: any) => o.order_code === targetCode) as any;
  assert.ok(target, "phải tìm thấy đơn sau khi sync");
  assert.equal(target.order_status, "completed");
  assert.ok(target.completed_at, "completed_at được set local");
});

test("SI7 — confirmPaymentServerFirst forwards immutable payment evidence", async () => {
  const { confirmPaymentServerFirst, resetPaymentConfirmInFlight } = await import(
    "../src/lib/data/paymentConfirm.ts"
  );
  resetPaymentConfirmInFlight();

  let capturedBody: any = null;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, outcome: "applied", paymentStatus: "paid", orderStatus: "confirmed" }),
    } as StubResponse;
  }) as unknown as typeof fetch;

  const outcome = await confirmPaymentServerFirst(
    "GM-FWD-1",
    { paymentMethod: "cod", amount: 125000 },
    fetchImpl
  );

  assert.equal(outcome.ok, true);
  assert.equal(capturedBody.action, "confirm");
  assert.equal(capturedBody.orderCode, "GM-FWD-1");
  assert.equal(capturedBody.paymentMethod, "cod", "phải forward paymentMethod");
  assert.equal(capturedBody.amount, 125000);
  assert.equal(capturedBody.referenceNumber, undefined, "cash identity phải do server tạo");
  assert.equal(capturedBody.targetOrderStatus, undefined, "client không được chọn order lifecycle");
});

test("SI8 — payment route requires evidence and delegates to atomic RPC", () => {
  const src = readFileSync(
    new URL("../src/app/api/orders/payment/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(src, /validBankReference/);
  assert.match(src, /Number\(body\.amount\)/);
  assert.match(src, /\.rpc\("apply_payment_event"/);
  assert.doesNotMatch(src, /ADMIN-CONFIRM-/);
  assert.match(src, /requireAdmin\(request\)/);
});

test("SI9 — payment route cannot directly set paid/order lifecycle", () => {
  const src = readFileSync(
    new URL("../src/app/api/orders/payment/route.ts", import.meta.url),
    "utf8"
  );
  const confirmStart = src.indexOf('if (action === "confirm")');
  const rejectStart = src.indexOf('if (action === "reject")');
  const confirmBranch = src.slice(confirmStart, rejectStart);
  assert.doesNotMatch(confirmBranch, /\.from\("orders"\)\.update/);
  assert.doesNotMatch(confirmBranch, /payment_status:\s*"paid"/);
  assert.doesNotMatch(confirmBranch, /order_status:\s*"completed"/);
});
