import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

/**
 * Batch 3A-followup + 3A.2 — các đường bypass thanh toán.
 *
 * 3A-followup (đã ghi nhận): order/success polling chuyển sang
 * syncStoredPaymentStatusLocal (local-only). Create/POS khi đó là BLOCKER
 * (saveNewOrder fire-and-forget + mã client lệch server).
 *
 * 3A.2 (đã ĐÓNG bypass): saveNewOrder chuyển async server-canonical (await
 * POST, trả orderId/orderCode server); create/POS/sale dùng định danh server
 * cho QR + xác nhận thanh toán qua payment pipeline (/api/orders/payment);
 * payment route mở rộng allowlist targetOrderStatus (confirmed|completed) +
 * paymentMethod (banking|cod). Tests dưới đây PIN hành vi MỚI.
 *
 * Map tests:
 *   OF1 polling dùng syncStoredPaymentStatusLocal (local-only, 0 PATCH)    → "OF1 ..."
 *   OF2 source: polling đọc latest.payment_status==="paid" từ server      → "OF2 ..."
 *   CG1 createOrderServer insert hardcode pending/pending (bỏ client status) → "CG1 ..."
 *   CG2 payment confirm dùng confirmTargetStatus allowlist (completed cho POS) → "CG2 ..."
 *   CG3 saveNewOrder async server-canonical: await POST + trả định danh server → "CG3 ..."
 *   CG4 create page confirm qua payment pipeline, KHÔNG còn bypass PATCH   → "CG4 ..."
 *   CG5 POS confirm qua pipeline (QR→completed, cash→cod+completed)        → "CG5 ..."
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

// ===========================================================================
// OF — Order success polling: local-only sync sau khi server đã confirm paid
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

let fetchCalls: { url: string; method: string }[] = [];
g.fetch = (async (url: string, init?: RequestInit) => {
  fetchCalls.push({ url: String(url), method: (init?.method || "GET").toUpperCase() });
  return { ok: false, status: 401, json: async () => ({ success: false }) } as StubResponse;
}) as unknown as typeof fetch;

const { syncStoredPaymentStatusLocal, getStoredOrders } = await import("../src/lib/data/orderStore.ts");

test("OF1 — polling server-paid: syncStoredPaymentStatusLocal cập nhật local, KHÔNG PATCH", () => {
  storage.clear();
  fetchCalls = [];
  storage.set(
    "gieomo_orders",
    JSON.stringify([{ order_id: "o1", order_code: "GM-POLL-1", order_status: "pending", payment_status: "pending", final_amount: 100000 }])
  );
  // Giả lập cache đã nạp (module cache) — seed trực tiếp vào localStorage rồi
  // gọi sync. Mục tiêu: xác nhận local-only (0 PATCH), phần paid-update đã
  // cover ở T9a paymentConfirmServerFirst.
  syncStoredPaymentStatusLocal("GM-POLL-1", "paid");
  const patches = fetchCalls.filter((c) => c.method === "PATCH");
  assert.equal(patches.length, 0, "polling sync phải local-only, không PATCH thanh toán thừa");
});

test("OF2 — source: polling đọc latest.payment_status==='paid' từ server rồi sync local", () => {
  const src = readFileSync(
    new URL("../src/app/order/success/page.tsx", import.meta.url),
    "utf8"
  );
  // Đọc paid từ server fetch (nguồn truth).
  assert.match(src, /latest\.payment_status === "paid"/);
  // Đồng bộ local-only, KHÔNG còn updateStoredPaymentStatus (fire-and-forget PATCH).
  assert.match(src, /syncStoredPaymentStatusLocal\(orderCode, "paid"\)/);
  assert.doesNotMatch(
    src,
    /updateStoredPaymentStatus\(orderCode, "paid"\)/,
    "order/success polling KHÔNG được gọi updateStoredPaymentStatus (gửi PATCH thừa)"
  );
  // Import không còn chứa updateStoredPaymentStatus / updateStoredOrderStatus thừa.
  assert.doesNotMatch(src, /updateStoredPaymentStatus,/);
  assert.doesNotMatch(src, /updateStoredOrderStatus,/);
});

// ===========================================================================
// CG — Contract gaps (PIN contract hiện tại, không giả định nghiệp vụ mới)
// ===========================================================================

test("CG1 — createOrderServer đi qua atomic RPC, canonical payload không chứa order_status/payment_status", () => {
  const src = readFileSync(new URL("../src/lib/services/orderService.ts", import.meta.url), "utf8");
  // Tạo đơn chỉ qua create_order_atomic RPC (server set pending trong DB).
  assert.match(src, /supabase\.rpc\("create_order_atomic"/);
  // Không còn direct insert orders từ service layer.
  assert.doesNotMatch(src, /\.from\("orders"\)\.insert/);
  // Canonical payload không nhận status từ client (order_status/payment_status do server set).
  const hash = readFileSync(new URL("../src/lib/services/orderRequestHash.ts", import.meta.url), "utf8");
  assert.doesNotMatch(hash, /order_status/);
  assert.doesNotMatch(hash, /payment_status/);
});

test("CG2 — payment confirm dùng atomic RPC và bắt buộc payment identity thật", () => {
  const src = readFileSync(new URL("../src/app/api/orders/payment/route.ts", import.meta.url), "utf8");
  assert.match(src, /\.rpc\("apply_payment_event"/);
  assert.match(src, /validBankReference/);
  assert.match(src, /Bắt buộc mã giao dịch ngân hàng thật/);
  assert.match(src, /CASH-\$\{order\.order_code\}/);
  assert.doesNotMatch(src, /ADMIN-CONFIRM-/);
  assert.doesNotMatch(src, /\.from\("payments"\)\.insert/);
});

test("CG3 — saveNewOrder async server-canonical: await POST, gửi idempotency key, trả định danh server", () => {
  const src = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");
  // Hàm async, KHÔNG còn fire-and-forget .catch(console.warn).
  assert.match(src, /export async function saveNewOrder/);
  const saveNewOrderStart = src.indexOf("export async function saveNewOrder");
  const saveNewOrderEnd = src.indexOf("export async function updateStoredOrderStatus");
  const body = src.slice(saveNewOrderStart, saveNewOrderEnd);
  // Await POST + gửi idempotency key (sang đường atomic RPC).
  assert.match(body, /await fetch\("\/api\/orders"/);
  assert.match(body, /idempotency_key:\s*idempotencyKey/);
  // Đọc response + validate success + trả định danh canonical.
  assert.match(body, /result\?\.orderId/);
  assert.match(body, /result\?\.orderCode/);
  assert.match(body, /!result\?\.success/);
  // Ghi đè định danh local bằng canonical của server trước side-effect.
  assert.match(body, /newOrder\.order_id = result\.orderId/);
  assert.match(body, /newOrder\.order_code = result\.orderCode/);
  // Không còn .catch(console.warn) fire-and-forget trong saveNewOrder.
  assert.doesNotMatch(body, /\.catch\(\(err\)/);
});

test("CG4 — create page confirm qua payment pipeline, KHÔNG còn bypass updateStored* (fire-and-forget PATCH)", () => {
  const src = readFileSync(new URL("../src/app/admin/orders/create/page.tsx", import.meta.url), "utf8");
  // Dùng confirmPaymentServerFirst (payment pipeline) — KHÔNG bypass.
  assert.match(src, /confirmPaymentServerFirst\(activeQrModal\.orderCode,\s*\{/);
  assert.match(src, /referenceNumber/);
  assert.match(src, /amount:\s*activeQrModal\.amount/);
  // Không còn CALL tới updateStoredPaymentStatus / updateStoredOrderStatus
  // (fire-and-forget PATCH). Regex dạng hàm( để không bắt tên trong comment.
  assert.doesNotMatch(src, /updateStoredPaymentStatus\(/);
  assert.doesNotMatch(src, /updateStoredOrderStatus\(/);
  // Sync local SAU khi server confirm (local-only helpers).
  assert.match(src, /syncStoredPaymentStatusLocal\(activeQrModal\.orderCode, "paid"\)/);
  assert.match(src, /syncStoredOrderStatusLocal\(activeQrModal\.orderCode, "confirmed"\)/);
  // Tạo đơn server-first: await saveNewOrder + chỉ mở QR khi server thành công.
  // Options phải chứa flow idempotency riêng cho entry point.
  assert.match(src, /await saveNewOrder\(\s*newOrder\s*,\s*\{[^{}]*idempotencyFlow:\s*"admin-create-order"[^{}]*\}/);
  assert.match(src, /if \(!result\.ok\)/);
});

test("CG5 — POS confirm qua atomic pipeline và đồng bộ trạng thái canonical server", () => {
  const src = readFileSync(new URL("../src/app/admin/orders/pos/page.tsx", import.meta.url), "utf8");
  // QR gửi amount + mã ngân hàng thật; cash gửi amount và method cod.
  assert.match(src, /confirmPaymentServerFirst\(activeQrModal\.orderCode,\s*\{/);
  assert.match(src, /referenceNumber/);
  assert.match(src, /amount:\s*activeQrModal\.amount/);
  assert.match(
    src,
    /confirmPaymentServerFirst\(createdOrderCode,\s*\{\s*paymentMethod:\s*"cod",\s*amount/
  );
  assert.match(src, /outcome\.orderStatus/);
  // Không còn CALL tới updateStoredPaymentStatus / updateStoredOrderStatus.
  assert.doesNotMatch(src, /updateStoredPaymentStatus\(/);
  assert.doesNotMatch(src, /updateStoredOrderStatus\(/);
  // Tạo đơn server-first; cash chỉ hoàn tất sau payment pipeline.
  // Options phải chứa flow idempotency riêng cho entry point.
  assert.match(src, /await saveNewOrder\(\s*newOrder\s*,\s*\{[^{}]*idempotencyFlow:\s*"admin-pos-order"[^{}]*\}/);
  assert.match(src, /if \(isCash\)[\s\S]*confirmPaymentServerFirst\(createdOrderCode/);
  // newOrder tạo với trạng thái khớp server (banking/pending/pending) —
  // không còn local-first paid/completed.
  assert.match(src, /payment_status:\s*"pending"/);
  assert.match(src, /order_status:\s*"pending"/);
});
