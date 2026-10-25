import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Order } from "../src/types/database";

/**
 * Batch 2D — cancelStoredOrder (orderStore): identity + result contract.
 *
 * ĐÂY LÀ MOCK TESTS (fetch stub theo đúng contract response của route
 * PATCH /api/orders nhánh cancel — đã pin trong cancelVoucherRelease M1-M12).
 * KHÔNG phải bằng chứng PostgreSQL/transaction đã nghiệm thu.
 *
 * Map yêu cầu → tests:
 *   C1  local id ≠ server UUID → gửi orderCode, 200 cancelled        → "C1 ..."
 *   C2  mapping server (UUID) tồn tại → gửi orderId UUID            → "C2 ..."
 *   C3  mapping server thiếu → 404, fail rõ, không false success    → "C3 ..."
 *   C4  409 not_cancellable → fail, currentStatus surfaces          → "C4 ..."
 *   C5  500 server_error → fail, local giữ nguyên                   → "C5 ..."
 *   C6  network exception → fail network_error                      → "C6 ..."
 *   C7  malformed (json throw) → fail                               → "C7 ..."
 *   C8  malformed (200 thiếu success/outcome) → fail                → "C8 ..."
 *   C9  already_cancelled tường minh → idempotent success           → "C9 ..."
 *   C10 gọi lại sau khi local đã cancelled → không hoàn kho đôi     → "C10 ..."
 *   C11 updateStoredOrderStatus(cancelled) delegating, không optimistic → "C11 ..."
 *   C12 input không có local → identity vẫn đúng, không đoán bừa   → "C12 ..."
 *   + pin: lỗi không chốt cancelled (C3-C8), lỗi không hoàn kho (C3-C8)
 *
 * Batch 2D.1 — idempotency + journal + recovery:
 *   C13 2 call đồng thời cùng đơn → 1 request, hoàn kho 1 lần       → "C13 ..."
 *   C14 2 call đồng thời (id + code), shared already_cancelled       → "C14 ..."
 *   C15 request thất bại → không journal, không hoàn kho             → "C15 ..."
 *   C16 crash sau khi flip order, trước khi stock write → recovery 1 lần → "C16 ..."
 *   C17 crash sau stock write, trước journal remove → không hoàn đôi → "C17 ..."
 *   C18 2 đơn khác nhau → recovery hoàn kho độc lập, mỗi đơn 1 lần  → "C18 ..."
 *   C1–C12 không phá → chạy cả file (toàn bộ pass = yêu cầu 7)
 *
 * Batch 2D.1R — journal fail-closed + mutex + identity:
 *   J1  journal setItem lỗi (quota) → fail-closed, không flip/hoàn kho  → "J1 ..."
 *   J1b retry sau journal-fail → apply idempotent, cancelled + stock     → "J1b ..."
 *   M1  fallback mutex tuần tự hóa async (khóa xuyên suốt await)        → "M1 ..."
 *   M2  mutex nhả sau exception, thao tác kế tiếp vẫn chạy              → "M2 ..."
 *   ID1 cùng đơn website (UUID + code) đồng thời → 1 PATCH, hoàn 1 lần  → "ID1 ..."
 *   ID1b cùng đơn POS (ord- id + code) đồng thời → 1 PATCH, hoàn 1 lần  → "ID1b ..."
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
// 2D.1R: injection — fail setItem MỘT lần cho key chỉ định (mô phỏng quota).
let failSetItemOnceFor: string | null = null;
g.localStorage = {
  getItem: (key) => (storage.has(key) ? (storage.get(key) as string) : null),
  setItem: (key, value) => {
    if (failSetItemOnceFor === key) {
      failSetItemOnceFor = null;
      throw new DOMException("Simulated QuotaExceededError", "QuotaExceededError");
    }
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

// ---- Fetch stub: chỉ bắt PATCH /api/orders (cancel); GET sync trả neutral ----
type CapturedPatch = { url: string; body: Record<string, unknown> };
let capturedPatches: CapturedPatch[] = [];
let patchResponder: (body: Record<string, unknown>) => Promise<StubResponse> | StubResponse;

g.fetch = async (url: string, init?: RequestInit) => {
  const method = (init?.method || "GET").toUpperCase();
  if (String(url).startsWith("/api/orders") && method === "PATCH") {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    capturedPatches.push({ url: String(url), body });
    return patchResponder(body);
  }
  // sync background (GET /api/orders?limit=200, /api/products...) → không data
  return { ok: false, status: 401, json: async () => ({ success: false }) };
};

const {
  cancelStoredOrder,
  updateStoredOrderStatus,
  getStoredOrders,
  getStoredProducts,
  recoverPendingCancelJournals,
  withCancelLock,
} = await import("../src/lib/data/orderStore.ts");

// ---- Contract fixtures đúng theo route.ts nhánh cancel (M1-M12) ----
const httpCancelled = (): StubResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, outcome: "cancelled" }),
});
const httpAlreadyCancelled = (): StubResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, alreadyCancelled: true, outcome: "already_cancelled" }),
});
const httpNotFound = (): StubResponse => ({
  ok: false,
  status: 404,
  json: async () => ({ success: false, outcome: "not_found", error: "Đơn hàng không tồn tại" }),
});
const httpNotCancellable = (currentStatus: string): StubResponse => ({
  ok: false,
  status: 409,
  json: async () => ({
    success: false,
    outcome: "not_cancellable",
    error: `Không thể hủy đơn ở trạng thái "${currentStatus}"`,
    currentStatus,
  }),
});
const http500 = (): StubResponse => ({
  ok: false,
  status: 500,
  json: async () => ({ success: false, error: "cancel_order_atomic exploded", retryable: true }),
});
const httpJsonThrows = (): StubResponse => ({
  ok: true,
  status: 200,
  json: async () => {
    throw new Error("invalid json body");
  },
});
const httpMissingSuccess = (): StubResponse => ({
  ok: true,
  status: 200,
  json: async () => ({ unexpected: "shape" }),
});

// ---- Seed: 1 product p1 với 12 variant (mỗi test 1 variant để cô lập stock) ----
const SERVER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function seedVariant(vId: string) {
  return {
    variant_id: vId,
    name: `Variant ${vId}`,
    sku: `SKU-${vId}`,
    price: 100000,
    stock: 10,
    stock_warehouse_1: 10,
    stock_warehouse_2: 0,
    warehouse_stocks: { "wh-1": 10, "wh-2": 0 },
  };
}

function makeOrder(opts: {
  orderId: string;
  orderCode: string;
  variantId: string;
  qty: number;
  orderStatus?: Order["order_status"];
}): Order {
  const createdAt = "2026-10-01T00:00:00.000Z";
  return {
    order_id: opts.orderId,
    order_code: opts.orderCode,
    buyer_name: "Khách Test",
    buyer_phone: "0900000001",
    delivery_type: "home_delivery",
    subtotal: opts.qty * 100000,
    shipping_fee: 0,
    final_amount: opts.qty * 100000,
    order_status: opts.orderStatus ?? "pending",
    payment_status: "pending",
    delivery_status: "not_ready",
    payment_method: "banking",
    warehouse_id: "wh-1",
    created_at: createdAt,
    updated_at: createdAt,
    items: [
      {
        order_item_id: `item-${opts.orderCode}-1`,
        order_id: opts.orderId,
        product_id: "p1",
        variant_id: opts.variantId,
        item_name_snapshot: `Sản phẩm ${opts.variantId}`,
        price_snapshot: 100000,
        quantity: opts.qty,
        subtotal: opts.qty * 100000,
        created_at: createdAt,
      },
    ],
  };
}

// A: website checkout (order_id = server UUID). B–L: POS/local (ord-...).
// M–S (…013–…018): Batch 2D.1 — concurrency + crash-recovery.
const SEED_ORDERS: Order[] = [
  makeOrder({ orderId: SERVER_UUID, orderCode: "GM-SRV001", variantId: "v1", qty: 2 }),
  makeOrder({ orderId: "ord-1728000000001", orderCode: "GM-654321", variantId: "v2", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000002", orderCode: "GM-111222", variantId: "v3", qty: 3 }),
  makeOrder({ orderId: "ord-1728000000003", orderCode: "GM-333444", variantId: "v4", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000004", orderCode: "GM-555666", variantId: "v5", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000005", orderCode: "GM-777888", variantId: "v6", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000006", orderCode: "GM-999000", variantId: "v7", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000007", orderCode: "GM-121212", variantId: "v8", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000008", orderCode: "GM-343434", variantId: "v9", qty: 2 }),
  makeOrder({ orderId: "ord-1728000000009", orderCode: "GM-565656", variantId: "v10", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000010", orderCode: "GM-787878", variantId: "v11", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000013", orderCode: "GM-131313", variantId: "v13", qty: 2 }),
  makeOrder({ orderId: "ord-1728000000014", orderCode: "GM-141414", variantId: "v14", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000015", orderCode: "GM-151515", variantId: "v15", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000016", orderCode: "GM-161616", variantId: "v16", qty: 3 }),
  makeOrder({ orderId: "ord-1728000000017", orderCode: "GM-171717", variantId: "v17", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000018", orderCode: "GM-181818", variantId: "v18", qty: 2 }),
  // 2D.1R — mixed-identity (UUID + code cùng đơn) + journal-fail retry
  makeOrder({ orderId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", orderCode: "GM-MIX001", variantId: "v20", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000019", orderCode: "GM-MIX002", variantId: "v21", qty: 1 }),
  makeOrder({ orderId: "ord-1728000000020", orderCode: "GM-JRN001", variantId: "v22", qty: 1 }),
];

storage.set("gieomo_orders", JSON.stringify(SEED_ORDERS));
storage.set(
  "gieomo_products",
  JSON.stringify([
    {
      product_id: "p1",
      name: "Sản phẩm test",
      slug: "san-pham-test",
      sku: "SKU-P1",
      price: 100000,
      stock: 210,
      status: "active",
      variants: [
        "v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10", "v11",
        "v13", "v14", "v15", "v16", "v17", "v18", "v20", "v21", "v22",
      ].map(seedVariant),
    },
  ])
);

function localOrder(code: string): Order {
  const found = getStoredOrders().find((o) => o.order_code === code);
  assert.ok(found, `seed phải chứa order ${code}`);
  return found;
}
function variantStock(vId: string): number {
  const prod = getStoredProducts().find((p) => p.product_id === "p1");
  const v = prod?.variants?.find((x: any) => x.variant_id === vId);
  return Number(v?.stock);
}
const lastPatchBody = (): Record<string, unknown> => {
  assert.ok(capturedPatches.length > 0, "phải có PATCH /api/orders được gửi");
  return capturedPatches[capturedPatches.length - 1].body;
};

// ============================================================
// C1 — Local id ≠ server UUID: identity qua orderCode, không gửi ord-... qua orderId
// ============================================================
test("C1 — POS order (id local ord-..., code GM-654321): 200 cancelled → local cancelled + stock 10+1, body gửi đúng orderCode", async () => {
  capturedPatches = [];
  patchResponder = httpCancelled;

  const res = await cancelStoredOrder("ord-1728000000001");
  assert.equal(res.success, true);
  assert.equal((res as { alreadyCancelled?: boolean }).alreadyCancelled, false);

  const body = lastPatchBody();
  assert.equal(body.orderCode, "GM-654321", "gửi TRƯỜNG orderCode với order_code");
  assert.equal(body.orderId, undefined, "KHÔNG gửi id local qua trường orderId");
  assert.equal(body.orderStatus, "cancelled");

  assert.equal(localOrder("GM-654321").order_status, "cancelled");
  assert.equal(variantStock("v2"), 11, "hoàn kho local 1 dòng sau khi server xác nhận");
});

// ============================================================
// C2 — Mapping server (UUID) tồn tại: dùng orderId UUID
// ============================================================
test("C2 — website checkout (order_id = server UUID): 200 cancelled → body gửi orderId UUID, local cancelled + stock 10+2", async () => {
  capturedPatches = [];
  patchResponder = httpCancelled;

  const res = await cancelStoredOrder(SERVER_UUID);
  assert.equal(res.success, true);

  const body = lastPatchBody();
  assert.equal(body.orderId, SERVER_UUID, "gửi TRƯỜNG orderId với UUID server");
  assert.equal(body.orderCode, undefined);

  assert.equal(localOrder("GM-SRV001").order_status, "cancelled");
  assert.equal(variantStock("v1"), 12);
});

// ============================================================
// C3 — Mapping server thiếu (404): fail rõ, không false success, không đoán identifier
// ============================================================
test("C3 — 404 not_found: fail outcome=not_found, local KHÔNG cancelled, KHÔNG hoàn kho, vẫn gửi orderCode đúng", async () => {
  capturedPatches = [];
  patchResponder = httpNotFound;

  const res = await cancelStoredOrder("ord-1728000000002");
  assert.equal(res.success, false);
  assert.equal((res as { outcome?: string }).outcome, "not_found");

  assert.equal(lastPatchBody().orderCode, "GM-111222", "identity là order_code local, không đoán bừa");
  assert.equal(localOrder("GM-111222").order_status, "pending", "404 KHÔNG được chốt cancelled local");
  assert.equal(variantStock("v3"), 10, "404 KHÔNG được hoàn kho local");
});

// ============================================================
// C4 — 409 not_cancellable
// ============================================================
test("C4 — 409 not_cancellable: fail + currentStatus, local giữ nguyên, stock không đổi", async () => {
  capturedPatches = [];
  patchResponder = () => httpNotCancellable("completed");

  const res = await cancelStoredOrder("ord-1728000000003");
  assert.equal(res.success, false);
  assert.equal((res as { outcome?: string }).outcome, "not_cancellable");
  assert.equal((res as { currentStatus?: string }).currentStatus, "completed");

  assert.equal(localOrder("GM-333444").order_status, "pending");
  assert.equal(variantStock("v4"), 10);
});

// ============================================================
// C5 — 500 server_error
// ============================================================
test("C5 — 500 server_error: fail, local KHÔNG cancelled, KHÔNG hoàn kho", async () => {
  capturedPatches = [];
  patchResponder = http500;

  const res = await cancelStoredOrder("ord-1728000000004");
  assert.equal(res.success, false);
  assert.equal((res as { outcome?: string }).outcome, "server_error");
  assert.equal((res as { retryable?: boolean }).retryable, true);

  assert.equal(localOrder("GM-555666").order_status, "pending");
  assert.equal(variantStock("v5"), 10);
});

// ============================================================
// C6 — Network exception
// ============================================================
test("C6 — fetch ném (mất mạng): fail network_error, local giữ nguyên, stock không đổi", async () => {
  capturedPatches = [];
  patchResponder = () => {
    throw new TypeError("fetch failed");
  };

  const res = await cancelStoredOrder("ord-1728000000005");
  assert.equal(res.success, false);
  assert.equal((res as { outcome?: string }).outcome, "network_error");
  assert.equal((res as { retryable?: boolean }).retryable, true);

  assert.equal(localOrder("GM-777888").order_status, "pending");
  assert.equal(variantStock("v6"), 10);
});

// ============================================================
// C7 — Malformed: json() ném
// ============================================================
test("C7 — 200 nhưng body không parse được: fail malformed_response, local giữ nguyên", async () => {
  capturedPatches = [];
  patchResponder = httpJsonThrows;

  const res = await cancelStoredOrder("ord-1728000000006");
  assert.equal(res.success, false);
  assert.equal((res as { outcome?: string }).outcome, "malformed_response");

  assert.equal(localOrder("GM-999000").order_status, "pending");
  assert.equal(variantStock("v7"), 10);
});

// ============================================================
// C8 — Malformed: 200 thiếu success/outcome
// ============================================================
test("C8 — 200 success/không có outcome: KHÔNG được coi là thành công, local giữ nguyên", async () => {
  capturedPatches = [];
  patchResponder = httpMissingSuccess;

  const res = await cancelStoredOrder("ord-1728000000007");
  assert.equal(res.success, false);
  assert.equal((res as { outcome?: string }).outcome, "malformed_response");

  assert.equal(localOrder("GM-121212").order_status, "pending");
  assert.equal(variantStock("v8"), 10);
});

// ============================================================
// C9 — already_cancelled tường minh → idempotent success
// ============================================================
test("C9 — 200 already_cancelled (contract tường minh): success idempotent, local pending được chốt cancelled + stock 10+2", async () => {
  capturedPatches = [];
  patchResponder = httpAlreadyCancelled;

  const res = await cancelStoredOrder("ord-1728000000008");
  assert.equal(res.success, true);
  assert.equal((res as { alreadyCancelled?: boolean }).alreadyCancelled, true);

  assert.equal(localOrder("GM-343434").order_status, "cancelled");
  assert.equal(variantStock("v9"), 12, "local cache bắt kịp trạng thái server (hoàn 1 lần)");
});

// ============================================================
// C10 — Gọi lại sau khi local đã cancelled: không hoàn kho lần hai
// ============================================================
test("C10 — cancel lần 2 (local đã cancelled, server already_cancelled): không hoàn kho lần hai", async () => {
  capturedPatches = [];
  patchResponder = httpAlreadyCancelled;

  const res = await cancelStoredOrder("ord-1728000000008");
  assert.equal(res.success, true);
  assert.equal((res as { alreadyCancelled?: boolean }).alreadyCancelled, true);
  assert.equal(variantStock("v9"), 12, "KHÔNG double-restore (vẫn 12, không phải 14)");
  assert.equal(localOrder("GM-343434").order_status, "cancelled");
});

// ============================================================
// C11 — updateStoredOrderStatus(…, "cancelled") delegating: không optimistic
// ============================================================
test("C11 — updateStoredOrderStatus(cancelled): local KHÔNG đổi trước khi server trả lời; sau 200 mới cancelled + stock", async () => {
  capturedPatches = [];
  let resolveFetch!: (r: StubResponse) => void;
  patchResponder = () => new Promise<StubResponse>((resolve) => { resolveFetch = resolve; });

  updateStoredOrderStatus("ord-1728000000009", "cancelled");

  // Phần đồng bộ của updateStoredOrderStatus đã return — nhưng KHÔNG được
  // chốt local khi fetch còn pending (hành vi optimistic cũ đã bị gỡ).
  assert.equal(localOrder("GM-565656").order_status, "pending", "KHÔNG optimistic trước server");
  assert.equal(variantStock("v10"), 10, "KHÔNG hoàn kho trước server");

  resolveFetch(httpCancelled());
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(localOrder("GM-565656").order_status, "cancelled");
  assert.equal(variantStock("v10"), 11);
  assert.equal(lastPatchBody().orderCode, "GM-565656");
});

// ============================================================
// C12 — Input không có local: vẫn gửi identity đúng theo contract, không đoán bừa
// ============================================================
test("C12 — không có local order: code → trường orderCode; UUID → trường orderId; 404 → fail, không false success", async () => {
  capturedPatches = [];
  patchResponder = httpNotFound;

  const byCode = await cancelStoredOrder("GM-KHONGCO");
  assert.equal(byCode.success, false);
  assert.equal(lastPatchBody().orderCode, "GM-KHONGCO");
  assert.equal(lastPatchBody().orderId, undefined);

  const byUuid = await cancelStoredOrder("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.equal(byUuid.success, false);
  assert.equal(lastPatchBody().orderId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  assert.equal(lastPatchBody().orderCode, undefined);

  // Không đụng các order khác — đúng bộ cancelled từ C1/C2/C9/C11
  const cancelledCodes = getStoredOrders()
    .filter((o) => o.order_status === "cancelled")
    .map((o) => o.order_code)
    .sort();
  assert.deepEqual(cancelledCodes, ["GM-343434", "GM-565656", "GM-654321", "GM-SRV001"]);
});

// ============================================================
// Batch 2D.1 — Journal helper + crash-state seeding
// ============================================================
const JOURNAL_KEY = "gieomo_cancel_journal";
const journalSize = (): number => {
  const raw = storage.get(JOURNAL_KEY);
  if (!raw) return 0;
  return Object.keys(JSON.parse(raw) as Record<string, unknown>).length;
};

/** Đọc stock THÔ từ storage (bỏ module cache) — dùng cho assertions trước recovery. */
function rawVariantStock(vId: string): number {
  const prods = JSON.parse(storage.get("gieomo_products") as string) as any[];
  const v = prods
    .find((p) => p.product_id === "p1")
    ?.variants?.find((x: any) => x.variant_id === vId);
  return Number(v?.stock);
}

/** Gie lại trạng thái "crash giữa chừng" trong storage (orders + journal). */
function seedCrashState(opts: {
  orderId: string;
  orderCode: string;
  alreadyRestored?: boolean; // true = products đã ghi + stamp (crash trước journal-remove)
  variantId: string;
  qty: number;
}) {
  const ordersRaw = JSON.parse(storage.get("gieomo_orders") as string) as Order[];
  const row = ordersRaw.find((o) => o.order_id === opts.orderId);
  assert.ok(row, `seedCrashState: phải có order ${opts.orderId}`);
  row.order_status = "cancelled";
  row.cancelled_at = new Date().toISOString();
  storage.set("gieomo_orders", JSON.stringify(ordersRaw));

  storage.set(
    JOURNAL_KEY,
    JSON.stringify({
      [opts.orderId]: {
        orderId: opts.orderId,
        orderCode: opts.orderCode,
        createdAt: new Date().toISOString(),
      },
    })
  );

  if (opts.alreadyRestored) {
    const prods = JSON.parse(storage.get("gieomo_products") as string) as any[];
    const prod = prods.find((p) => p.product_id === "p1");
    const v = prod.variants.find((x: any) => x.variant_id === opts.variantId);
    v.stock = (v.stock || 0) + opts.qty;
    v.stock_warehouse_1 = (v.stock_warehouse_1 || 0) + opts.qty;
    v.warehouse_stocks = { ...(v.warehouse_stocks || {}), "wh-1": ((v.warehouse_stocks || {})["wh-1"] || 0) + opts.qty };
    v.local_cancel_restored_orders = [opts.orderId];
    storage.set("gieomo_products", JSON.stringify(prods));
  }
}

// ============================================================
// C13 — Hai call đồng thời CÙNG đơn → in-flight map gộp 1 promise, 1 PATCH, hoàn kho 1 lần
// ============================================================
test("C13 — hai cancelStoredOrder đồng thời cùng đơn (cancelled): chỉ 1 PATCH, cả hai success, stock hoàn đúng 1 lần, journal rỗng", async () => {
  capturedPatches = [];
  let resolvePatch!: (r: StubResponse) => void;
  patchResponder = () =>
    new Promise<StubResponse>((resolve) => {
      resolvePatch = resolve;
    });

  const p1 = cancelStoredOrder("ord-1728000000013");
  const p2 = cancelStoredOrder("ord-1728000000013"); // gọi 2 ngay tick sau — map đã có
  await new Promise((r) => setTimeout(r, 0)); // để cả hai vào await fetch
  resolvePatch(httpCancelled());
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(capturedPatches.length, 1, "in-flight map phải gộp hai lời gọi thành 1 PATCH");
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal(localOrder("GM-131313").order_status, "cancelled");
  assert.equal(variantStock("v13"), 12, "hoàn kho 1 lần (10+2), KHÔNG 14");
  assert.equal(journalSize(), 0, "journal phải rỗng sau khi apply thành công");
});

// ============================================================
// C14 — Đồng thời + already_cancelled: 1 PATCH (gộp), 1 lần apply; retry thứ ba không hoàn đôi
// Yêu cầu "một cancelled, một already_cancelled": cùng tab đồng thời KHÔNG thể
// có 2 outcome khác nhau (map gộp về 1 promise) — trường hợp tương đương theo
// tuần tự đã được pin bởi C9+C10. Ở đây pin: shared already_cancelled vẫn
// hoàn 1 lần, và call thứ ba (retry) không hoàn đôi.
// ============================================================
test("C14 — hai call đồng thời, response shared already_cancelled: 1 PATCH, stock hoàn 1 lần; call retry sau đó KHÔNG hoàn đôi", async () => {
  capturedPatches = [];
  let resolvePatch!: (r: StubResponse) => void;
  patchResponder = () =>
    new Promise<StubResponse>((resolve) => {
      resolvePatch = resolve;
    });

  const p1 = cancelStoredOrder("ord-1728000000014");
  const p2 = cancelStoredOrder("ord-1728000000014");
  await new Promise((r) => setTimeout(r, 0));
  resolvePatch(httpAlreadyCancelled());
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(capturedPatches.length, 1, "gộp về 1 PATCH duy nhất");
  assert.equal(r1.success, true);
  assert.equal((r1 as { alreadyCancelled?: boolean }).alreadyCancelled, true);
  assert.equal((r2 as { alreadyCancelled?: boolean }).alreadyCancelled, true);
  assert.equal(localOrder("GM-141414").order_status, "cancelled");
  assert.equal(variantStock("v14"), 11, "hoàn 1 lần từ pending (10+1)");
  assert.equal(journalSize(), 0);

  // Retry tuần tự — local đã cancelled + journal vắng → không apply lại (C10)
  patchResponder = httpAlreadyCancelled;
  const r3 = await cancelStoredOrder("ord-1728000000014");
  assert.equal(r3.success, true);
  assert.equal(variantStock("v14"), 11, "KHÔNG double-restore sau retry");
  assert.equal(capturedPatches.length, 2, "retry vẫn gửi PATCH (idempotent theo server)");
});

// ============================================================
// C15 — Request thất bại: KHÔNG ghi journal, KHÔNG hoàn kho
// ============================================================
test("C15 — 500 server_error: journal KHÔNG được ghi, local giữ nguyên, stock không đổi", async () => {
  capturedPatches = [];
  patchResponder = http500;

  const res = await cancelStoredOrder("ord-1728000000015");
  assert.equal(res.success, false);
  assert.equal(journalSize(), 0, "thất bại trước khi apply → không được tạo journal");
  assert.equal(localOrder("GM-151515").order_status, "pending");
  assert.equal(variantStock("v15"), 10);
});

// ============================================================
// C16 — Crash SAU khi ghi order cancelled, TRƯỚC khi ghi product stock:
// journal còn entry + products chưa stamp → recovery hoàn đúng 1 lần
// ============================================================
test("C16 — crash giữa flip-order và products-write: recoverPendingCancelJournals hoàn kho đúng 1 lần, journal xoá, chạy lại vẫn idempotent", async () => {
  seedCrashState({
    orderId: "ord-1728000000016",
    orderCode: "GM-161616",
    variantId: "v16",
    qty: 3,
  });
  assert.equal(rawVariantStock("v16"), 10, "trước recovery: stock chưa hoàn (raw storage)");

  recoverPendingCancelJournals();

  assert.equal(localOrder("GM-161616").order_status, "cancelled");
  assert.equal(variantStock("v16"), 13, "recovery hoàn đúng 1 lần (10+3)");
  assert.equal(rawVariantStock("v16"), 13, "raw storage cũng 13");
  assert.equal(journalSize(), 0, "journal phải được xoá sau recovery");

  // Chạy lại lần nữa (idempotent) — không hoàn đôi
  recoverPendingCancelJournals();
  assert.equal(variantStock("v16"), 13, "recovery lần 2 KHÔNG hoàn đôi");
});

// ============================================================
// C17 — Crash SAU khi ghi product stock (+stamp), TRƯỚC khi xoá journal:
// recovery KHÔNG hoàn kho lần hai (stamp chứng minh đã hoàn)
// ============================================================
test("C17 — crash giữa products-write và journal-remove: recovery KHÔNG hoàn kho lần hai, journal vẫn được dọn", async () => {
  seedCrashState({
    orderId: "ord-1728000000017",
    orderCode: "GM-171717",
    variantId: "v17",
    qty: 1,
    alreadyRestored: true, // products đã ghi + stamp, journal chưa xoá
  });
  assert.equal(rawVariantStock("v17"), 11, "trước recovery: stock đã hoàn sẵn (raw storage)");

  recoverPendingCancelJournals();

  assert.equal(localOrder("GM-171717").order_status, "cancelled");
  assert.equal(variantStock("v17"), 11, "stamp có mặt → KHÔNG hoàn thêm lần nữa");
  assert.equal(rawVariantStock("v17"), 11, "raw storage vẫn 11");
  assert.equal(journalSize(), 0, "journal vẫn được dọn");
});

// ============================================================
// C18 — Hai đơn KHÁC nhau: recovery/cancel hoàn kho độc lập, mỗi đơn đúng 1 lần
// ============================================================
test("C18 — hai đơn khác nhau hủy đồng thời: 2 PATCH, mỗi đơn hoàn kho 1 lần, journal rỗng", async () => {
  capturedPatches = [];
  patchResponder = httpCancelled;

  const [r1, r2] = await Promise.all([
    cancelStoredOrder("ord-1728000000018"), // v18 qty 2
    cancelStoredOrder("ord-1728000000002"), // GM-111222, v3 qty 3 — vẫn pending (C3 chỉ 404)
  ]);

  assert.equal(capturedPatches.length, 2, "hai đơn khác nhau → 2 PATCH riêng biệt");
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal(localOrder("GM-181818").order_status, "cancelled");
  assert.equal(localOrder("GM-111222").order_status, "cancelled");
  assert.equal(variantStock("v18"), 12, "đơn 18 hoàn 1 lần (10+2)");
  assert.equal(variantStock("v3"), 13, "đơn 111222 hoàn 1 lần (10+3) — độc lập");
  assert.equal(journalSize(), 0);
});

// ============================================================
// 2D.1R J1 — Journal setItem THẤT BẠI (quota): fail-closed
// ============================================================
test("J1 — journal setItem THẤT BẠI (quota): fail-closed — KHÔNG flip, KHÔNG hoàn kho, journal rỗng, lỗi retryable local_apply_failed", async () => {
  capturedPatches = [];
  patchResponder = httpCancelled;
  failSetItemOnceFor = JOURNAL_KEY;

  const res = await cancelStoredOrder("ord-1728000000020"); // GM-JRN001

  assert.equal(res.success, false, "KHÔNG được báo thành công khi local chưa cập nhật");
  assert.equal((res as { outcome?: string }).outcome, "local_apply_failed");
  assert.equal((res as { retryable?: boolean }).retryable, true);
  assert.equal(localOrder("GM-JRN001").order_status, "pending", "KHÔNG flip khi journal chưa ghi được");
  assert.equal(variantStock("v22"), 10, "KHÔNG hoàn kho khi journal chưa ghi được");
  assert.equal(journalSize(), 0, "journal ghi thất bại → không có entry");
  assert.equal(capturedPatches.length, 1, "server vẫn nhận 1 PATCH (đã confirm)");
});

// ============================================================
// 2D.1R J1b — Recovery sau journal-fail: retry idempotent
// ============================================================
test("J1b — retry sau journal-fail: server already_cancelled → apply thành công, cancelled + stock, journal rỗng", async () => {
  capturedPatches = [];
  patchResponder = httpAlreadyCancelled;

  const res = await cancelStoredOrder("ord-1728000000020");

  assert.equal(res.success, true, "retry phải thành công khi journal ghi được");
  assert.equal(localOrder("GM-JRN001").order_status, "cancelled");
  assert.equal(variantStock("v22"), 11, "hoàn kho 1 lần (10+1)");
  assert.equal(journalSize(), 0, "journal đã dọn");
});

// ============================================================
// 2D.1R M1 — Fallback mutex tuần tự hóa async critical section
// ============================================================
test("M1 — fallback mutex: thao tác async thứ 2 KHÔNG vào critical section trước khi thao tác 1 hoàn tất", async () => {
  const order: string[] = [];
  let release1!: () => void;
  const gate1 = new Promise<void>((r) => {
    release1 = r;
  });
  const p1 = withCancelLock("mutex-order-x", async () => {
    order.push("1-enter");
    await gate1; // giữ khóa xuyên suốt await
    order.push("1-exit");
    return "a";
  });
  const p2 = withCancelLock("mutex-order-x", async () => {
    order.push("2-enter");
    return "b";
  });
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(order, ["1-enter"], "thao tác 2 chưa được vào critical section");
  release1();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, "a");
  assert.equal(r2, "b");
  assert.deepEqual(order, ["1-enter", "1-exit", "2-enter"], "thao tác 2 vào SAU khi thao tác 1 hoàn tất");
});

// ============================================================
// 2D.1R M2 — Mutex nhả sau exception; thao tác kế tiếp vẫn chạy
// ============================================================
test("M2 — mutex nhả sau exception: thao tác 1 ném lỗi, thao tác 2 vẫn lấy khóa và chạy", async () => {
  const seen: string[] = [];
  const p1 = withCancelLock("mutex-order-y", async () => {
    seen.push("1-enter");
    throw new Error("thao tác 1 cố ý thất bại");
  });
  const p2 = withCancelLock("mutex-order-y", async () => {
    seen.push("2-enter");
    return "ok";
  });
  await assert.rejects(p1, /thao tác 1 cố ý thất bại/);
  const r2 = await p2;
  assert.equal(r2, "ok", "thao tác 2 vẫn chạy sau exception của thao tác 1");
  assert.deepEqual(seen, ["1-enter", "2-enter"]);
});

// ============================================================
// 2D.1R ID1 — Cùng đơn website gọi bằng UUID + order code đồng thời
// ============================================================
test("ID1 — cùng đơn website (UUID + order code) gọi đồng thời: gộp 1 PATCH, hoàn kho 1 lần (không double-restore)", async () => {
  capturedPatches = [];
  let resolvePatch!: (r: StubResponse) => void;
  patchResponder = () =>
    new Promise<StubResponse>((resolve) => {
      resolvePatch = resolve;
    });

  const MIX_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const p1 = cancelStoredOrder(MIX_UUID); // gọi qua UUID
  const p2 = cancelStoredOrder("GM-MIX001"); // gọi qua CODE cùng đơn
  await new Promise((r) => setTimeout(r, 0));
  resolvePatch(httpCancelled());
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(capturedPatches.length, 1, "UUID + code cùng đơn → gộp về 1 PATCH (cùng flight key)");
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal(localOrder("GM-MIX001").order_status, "cancelled");
  assert.equal(variantStock("v20"), 11, "hoàn kho 1 lần (10+1), KHÔNG 12");
  assert.equal(journalSize(), 0);
});

// ============================================================
// 2D.1R ID1b — Cùng đơn POS gọi bằng ord- id + order code đồng thời
// ============================================================
test("ID1b — cùng đơn POS (ord- id + order code) gọi đồng thời: gộp 1 PATCH, hoàn kho 1 lần", async () => {
  capturedPatches = [];
  let resolvePatch!: (r: StubResponse) => void;
  patchResponder = () =>
    new Promise<StubResponse>((resolve) => {
      resolvePatch = resolve;
    });

  const p1 = cancelStoredOrder("ord-1728000000019"); // gọi qua id local
  const p2 = cancelStoredOrder("GM-MIX002"); // gọi qua CODE cùng đơn
  await new Promise((r) => setTimeout(r, 0));
  resolvePatch(httpCancelled());
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(capturedPatches.length, 1, "id local + code cùng đơn → gộp về 1 PATCH");
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal(localOrder("GM-MIX002").order_status, "cancelled");
  assert.equal(variantStock("v21"), 11, "hoàn kho 1 lần (10+1)");
  assert.equal(journalSize(), 0);
});

// ============================================================
// C19 (pin yêu cầu 7) — Toàn bộ C1–C12 PHẢI còn nguyên vẹn sau Batch 2D.1.
// File này chạy tuần tự C1→C18; nếu bất kỳ C nào fail, node:test exit != 0.
// Test cuối chỉ confirm bộ cancelled cuối kỳ đúng theo các case đã chốt.
// ============================================================
test("C19 — chốt cuối: bộ cancelled đúng các case thành công, không có journal thừa, các case failed vẫn pending", async () => {
  const cancelledCodes = getStoredOrders()
    .filter((o) => o.order_status === "cancelled")
    .map((o) => o.order_code)
    .sort();
  // C1, C2, C9, C11 + C13, C14, C16*, C17*, C18(2) + 2D.1R (J1b, ID1, ID1b)
  // C16/C17 là crash-simulation — đơn đã cancelled từ seedCrashState.
  assert.deepEqual(cancelledCodes, [
    "GM-111222", // C18
    "GM-131313", // C13
    "GM-141414", // C14
    "GM-161616", // C16
    "GM-171717", // C17
    "GM-181818", // C18
    "GM-343434", // C9/C10
    "GM-565656", // C11
    "GM-654321", // C1
    "GM-JRN001", // 2D.1R J1b
    "GM-MIX001", // 2D.1R ID1
    "GM-MIX002", // 2D.1R ID1b
    "GM-SRV001", // C2
  ]);

  // Các case failed phải còn pending (C3=GM-111222 đã bị C18 hủy hợp lệ nên loại khỏi danh sách)
  for (const code of ["GM-333444", "GM-555666", "GM-777888", "GM-999000", "GM-121212", "GM-151515"]) {
    assert.equal(
      localOrder(code).order_status,
      "pending",
      `${code} (case failed) phải giữ nguyên pending`
    );
  }

  assert.equal(journalSize(), 0, "không được còn journal thừa sau toàn bộ suite");
});
