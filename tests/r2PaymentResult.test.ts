import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCanonicalSuccessOrder } from "../src/lib/payment/orderSuccessContract.ts";
import { resolvePaymentFlowState } from "../src/lib/payment/paymentFlowState.ts";

const canonical = {
  order_id: "order-1",
  order_code: "GM-R2-1",
  final_amount: 125000,
  payment_method: "banking",
  payment_status: "pending",
};

test("R2-T1 canonical server identity is required", () => {
  const result = resolveCanonicalSuccessOrder("GM-R2-1", [canonical]);
  assert.equal(result.kind, "verified");
  if (result.kind === "verified") assert.equal(result.order.order_code, "GM-R2-1");
});

test("R2-T2 missing/unknown lookup is not success", () => {
  assert.equal(resolveCanonicalSuccessOrder("GM-R2-1", []).kind, "not_found");
  const page = readFileSync(new URL("../src/app/order/success/page.tsx", import.meta.url), "utf8");
  assert.match(page, /controller\.abort\(\)/, "lookup must have an abort/timeout path");
  assert.match(page, /setVerificationState\("unknown"\)/);
});

test("R2-T3 query string cannot decide paid state", () => {
  const state = resolvePaymentFlowState(canonical as never, "cod");
  assert.equal(state.isPaid, false);
  assert.equal(state.flowMethod, "banking");
});

test("R2-T4 reference and amount mismatch fail closed", () => {
  assert.equal(resolveCanonicalSuccessOrder("GM-OTHER", [canonical]).kind, "reference_mismatch");
  assert.equal(
    resolveCanonicalSuccessOrder("GM-R2-1", [{ ...canonical, final_amount: 0 }]).kind,
    "invalid_server_state"
  );
});

test("R2-T5 invalid payment method/status fail closed", () => {
  assert.equal(
    resolveCanonicalSuccessOrder("GM-R2-1", [{ ...canonical, payment_status: "mystery" }]).kind,
    "invalid_server_state"
  );
  assert.equal(
    resolveCanonicalSuccessOrder("GM-R2-1", [{ ...canonical, payment_method: "cash-ish" }]).kind,
    "invalid_server_state"
  );
});

test("R2-T6 polling is read-only and cannot send duplicate email", () => {
  const page = readFileSync(new URL("../src/app/order/success/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /fetch\(["']\/api\/notify\/email["']/);
  assert.match(page, /syncStoredPaymentStatusLocal/);
});
