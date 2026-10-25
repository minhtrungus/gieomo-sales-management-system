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

test("CG1 — tạo đơn canonical hardcode pending/pending, bỏ qua client payment_status/order_status", () => {
  const canonical = readFileSync(
    new URL("../src/lib/services/orderRequestHashV2.ts", import.meta.url),
    "utf8"
  );
  // Whitelist canonical payload KHÔNG chứa trạng thái client (order_status,
  // payment_status, delivery_status...). Status chỉ được đặt trong SQL.
  assert.doesNotMatch(canonical, /order_status|payment_status|delivery_status/);
  const writer = readFileSync(
    new URL("../src/lib/services/orderCreateAtomicV2.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(writer, /order_status|payment_status/);
  // Đơn luôn khởi tạo pending/pending/not_ready trong SQL (migration 025).
  const sql = readFileSync(
    new URL("../supabase/migrations/025_atomic_idempotent_order_creation.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /'pending', 'pending', 'not_ready',/);
  // Client không gửi order_code — code do SQL sinh từ order_code_seq.
  assert.doesNotMatch(writer, /generateOrderCode/);
  assert.match(sql, /'GM-' \|\| to_char\(now\(\), 'YYMMDD'\)/);
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

test("CG3 — saveNewOrder async server-canonical: await POST, gửi Idempotency-Key, trả định danh server", () => {
  const src = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");
  // Hàm async, KHÔNG còn fire-and-forget .catch(console.warn).
  assert.match(src, /export async function saveNewOrder/);
  const saveNewOrderStart = src.indexOf("export async function saveNewOrder");
  const saveNewOrderEnd = src.indexOf("function persistLocalOrderSideEffects");
  const body = src.slice(saveNewOrderStart, saveNewOrderEnd);
  // Await POST + gửi Idempotency-Key (sang đường atomic RPC).
  assert.match(body, /await fetch\("\/api\/orders"/);
  assert.match(body, /Idempotency-Key/);
  // Đọc response + validate success + trả serverOrderId/serverOrderCode.
  assert.match(body, /serverOrderId/);
  assert.match(body, /serverOrderCode/);
  assert.match(body, /data\.success !== true/);
  // Ghi đè định danh local bằng canonical của server trước side-effect.
  assert.match(body, /newOrder\.order_id = serverOrderId/);
  assert.match(body, /newOrder\.order_code = serverOrderCode/);
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
  // Options phải chứa attemptScope (P0-A — attempt idempotency theo từng luồng).
  assert.match(src, /await saveNewOrder\(\s*newOrder\s*,\s*\{[^{}]*attemptScope:\s*"admin-create"[^{}]*\}/);
  assert.match(src, /if \(!result\.success\)/);
});

test("CG5 — POS confirm qua atomic pipeline và đồng bộ trạng thái canonical server", () => {
  const src = readFileSync(new URL("../src/app/admin/orders/pos/page.tsx", import.meta.url), "utf8");
  // QR gửi amount + mã ngân hàng thật; cash gửi amount và method cod.
  assert.match(src, /confirmPaymentServerFirst\(activeQrModal\.orderCode,\s*\{/);
  assert.match(src, /referenceNumber/);
  assert.match(src, /amount:\s*activeQrModal\.amount/);
  assert.match(
    src,
    /confirmPaymentServerFirst\(serverOrderCode,\s*\{\s*paymentMethod:\s*"cod",\s*amount/
  );
  assert.match(src, /outcome\.orderStatus/);
  // Không còn CALL tới updateStoredPaymentStatus / updateStoredOrderStatus.
  assert.doesNotMatch(src, /updateStoredPaymentStatus\(/);
  assert.doesNotMatch(src, /updateStoredOrderStatus\(/);
  // Tạo đơn server-first + chặn double-submit (pendingCashConfirm).
  // Options phải chứa attemptScope (P0-A — attempt idempotency theo từng luồng).
  assert.match(src, /await saveNewOrder\(\s*newOrder\s*,\s*\{[^{}]*attemptScope:\s*"pos-create"[^{}]*\}/);
  assert.match(src, /pendingCashConfirm/);
  // newOrder tạo với trạng thái khớp server (banking/pending/pending) —
  // không còn local-first paid/completed.
  assert.match(src, /payment_status:\s*"pending"/);
  assert.match(src, /order_status:\s*"pending"/);
});
