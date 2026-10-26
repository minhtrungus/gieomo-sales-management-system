import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePaymentFlowState } from "../src/lib/payment/paymentFlowState.ts";

/**
 * Batch A — trang kết quả đơn hàng không được tự xác nhận paid từ query string.
 *
 * Scenarios theo yêu cầu hồi quy:
 * - Query giả mạo `payment=cod` trên đơn banking pending → KHÔNG paid,
 *   KHÔNG COD, VẪN hiện banking instructions (chống link lừa).
 * - Reload/back button: hàm pure — cùng (order, query) cho cùng kết quả;
 *   không có client-state cache nào override server truth.
 * - Polling: pending → khi server trả paid thì isPaid=true (webhook/admin
 *   confirm là nguồn); trước đó luôn false.
 * - Webhook đến chậm: order pending + query banking → stays pending,
 *   showBankingInstructions=true, isPaid=false.
 * - COD thật (server payment_method=cod): isCodOrderPlaced=true, isPaid=false
 *   (phân biệt "đã đặt" với "đã thanh toán").
 */

function order(payment_method: string | null, payment_status: string) {
  return { payment_method, payment_status } as Parameters<typeof resolvePaymentFlowState>[0];
}

test("A1 — Query giả mạo payment=cod trên đơn banking pending: KHÔNG paid, VẪN banking", () => {
  const s = resolvePaymentFlowState(order("banking", "pending"), "cod");
  assert.equal(s.isPaid, false, "query không được tự xác nhận paid");
  assert.equal(s.isCodOrderPlaced, false, "đơn banking không phải COD");
  assert.equal(s.flowMethod, "banking", "server payment_method thắng query");
  assert.equal(s.showBankingInstructions, true);
});

test("A2 — Query giả mạo payment=cod, server CHƯA load (order=null): KHÔNG paid", () => {
  const s = resolvePaymentFlowState(null, "cod");
  assert.equal(s.isPaid, false);
  assert.equal(s.isCodOrderPlaced, false, "chưa có server confirmation → không COD banner");
  assert.equal(s.flowMethod, "cod", "query chỉ chọn panel trước khi load");
  assert.equal(s.showBankingInstructions, false);
});

test("A3 — Reload/back: hàm pure — cùng input cho cùng kết quả, không trạng thái ẩn", () => {
  const o = order("banking", "pending");
  const a = resolvePaymentFlowState(o, "banking");
  const b = resolvePaymentFlowState(o, "banking"); // lần "load lại" thứ hai
  assert.deepEqual(a, b);
});

test("A4 — Webhook đến chậm: pending kéo dài → isPaid luôn false cho tới khi server paid", () => {
  const before = resolvePaymentFlowState(order("banking", "pending"), "banking");
  assert.equal(before.isPaid, false);
  assert.equal(before.showBankingInstructions, true, "vẫn hiển thị chờ chuyển khoản");

  // Server (webhook sepay / admin confirm) ghi paid → polling đọc được.
  const after = resolvePaymentFlowState(order("banking", "paid"), "banking");
  assert.equal(after.isPaid, true);
  assert.equal(after.showBankingInstructions, false, "dừng panel banking khi đã paid");
});

test("A5 — COD thật theo server: đã đặt nhưng CHƯA thanh toán", () => {
  const s = resolvePaymentFlowState(order("cod", "pending"), "cod");
  assert.equal(s.isPaid, false, "COD pending không phải paid");
  assert.equal(s.isCodOrderPlaced, true);
  assert.equal(s.showBankingInstructions, false);
});

test("A6 — COD server + query banking giả mạo: server thắng, COD vẫn hiển thị đúng", () => {
  const s = resolvePaymentFlowState(order("cod", "pending"), "banking");
  assert.equal(s.flowMethod, "cod");
  assert.equal(s.isCodOrderPlaced, true);
  assert.equal(s.showBankingInstructions, false, "không hiện QR banking cho đơn COD");
});

test("A7 — Đơn COD đã được confirm paid trên server → isPaid=true (không còn là 'chờ thanh toán khi nhận')", () => {
  const s = resolvePaymentFlowState(order("cod", "paid"), "cod");
  assert.equal(s.isPaid, true);
  assert.equal(s.isCodOrderPlaced, false);
});

test("A8 — momo: query không phải banking → không hiện banking instructions; paid theo server", () => {
  const pending = resolvePaymentFlowState(order("momo", "pending"), "momo");
  assert.equal(pending.isPaid, false);
  assert.equal(pending.flowMethod, "momo");
  assert.equal(pending.showBankingInstructions, false);

  const paid = resolvePaymentFlowState(order("momo", "paid"), "momo");
  assert.equal(paid.isPaid, true);
});

test("A9 — Query rác (không phải cod/momo) → fallback banking; không crash", () => {
  const s = resolvePaymentFlowState(order("banking", "pending"), "hack-value");
  assert.equal(s.flowMethod, "banking");
  assert.equal(s.isPaid, false);
});
