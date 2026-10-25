import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideCheckoutSubmitAction,
  CHECKOUT_MAX_SUBMIT_RETRIES,
} from "../src/lib/checkout/checkoutSubmitAction.ts";

test("processing 409 → retry với backoff, giữ nguyên key", () => {
  const action = decideCheckoutSubmitAction(
    409,
    { idempotency: "processing", error: "Đang xử lý" },
    1,
    3
  );
  assert.equal(action.kind, "retry");
  if (action.kind === "retry") {
    assert.equal(action.rotateKey, false);
    assert.equal(action.delayMs, 400);
    assert.equal(action.errorMessage, "Đang xử lý");
  }
});

test("hash_mismatch 409 → stop, giữ key; không tự tạo attempt mới", () => {
  const action = decideCheckoutSubmitAction(409, { idempotency: "hash_mismatch" }, 1, 3);
  assert.equal(action.kind, "stop");
  if (action.kind === "stop") {
    assert.equal(action.clearKey, false);
  }
});

test("needs_reconciliation 409 → stop, GIỮ key (không tạo đơn mới)", () => {
  const action = decideCheckoutSubmitAction(
    409,
    { idempotency: "needs_reconciliation", error: "Cần đối soát" },
    1,
    3
  );
  assert.equal(action.kind, "stop");
  if (action.kind === "stop") {
    assert.equal(action.clearKey, false);
    assert.equal(action.message, "Cần đối soát");
  }
});

test("replay_cancelled 409 → stop, XÓA key (được tạo đơn mới)", () => {
  const action = decideCheckoutSubmitAction(409, { success: false, idempotency: "replay_cancelled" }, 1, 3);
  assert.equal(action.kind, "stop");
  if (action.kind === "stop") {
    assert.equal(action.clearKey, true);
  }
});

test("failed_terminal 400 → stop, XÓA key cho lần submit sau", () => {
  const action = decideCheckoutSubmitAction(
    400,
    { success: false, idempotency: "failed_terminal", error: "Hết hàng" },
    1,
    3
  );
  assert.equal(action.kind, "stop");
  if (action.kind === "stop") {
    assert.equal(action.clearKey, true);
    assert.equal(action.message, "Hết hàng");
  }
});

test("lỗi chung khi còn lượt → retry với backoff, GIỮ key", () => {
  const action = decideCheckoutSubmitAction(400, { error: "Network" }, 2, CHECKOUT_MAX_SUBMIT_RETRIES);
  assert.equal(action.kind, "retry");
  if (action.kind === "retry") {
    assert.equal(action.rotateKey, false);
    assert.equal(action.delayMs, 800);
    assert.equal(action.errorMessage, "Network");
  }
});

test("lỗi chung khi hết lượt → stop, GIỮ key (retry đọc lại ledger cùng key)", () => {
  const action = decideCheckoutSubmitAction(400, { error: "Network" }, 3, 3);
  assert.equal(action.kind, "stop");
  if (action.kind === "stop") {
    assert.equal(action.clearKey, false);
    assert.equal(action.message, "Network");
  }
});

test("2xx + success + canonical identity/amount → success", () => {
  const action = decideCheckoutSubmitAction(200, { success: true, orderId: "server-id", orderCode: "GM-1", finalAmount: 100000 }, 1, 3);
  assert.equal(action.kind, "success");
});

test("2xx thiếu orderCode → không phải success (fallthrough retry/stop)", () => {
  const action = decideCheckoutSubmitAction(200, { success: true }, 3, 3);
  assert.equal(action.kind, "stop");
});

test("malformed success or unconfirmed terminal status never clears an attempt", () => {
  for (const body of [
    { success: true, orderCode: "GM-1", finalAmount: 1 },
    { success: true, orderId: "id", orderCode: "GM-1", finalAmount: "NaN" },
    { success: false, idempotency: "failed_terminal" },
    { success: false, idempotency: "replay_cancelled" },
  ]) {
    const action = decideCheckoutSubmitAction(200, body, 3, 3);
    assert.equal(action.kind, "stop");
    if (action.kind === "stop") assert.equal(action.clearKey, false);
  }
});
