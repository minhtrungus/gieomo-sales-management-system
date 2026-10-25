import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/app/admin/payments/page.tsx", import.meta.url),
  "utf8",
);

test("H29-P1 — admin payments reads recorded ledger rows and does not synthesize transactions from orders", () => {
  assert.match(source, /\/api\/admin\/reconciliation\?limit=200&offset=0/);
  assert.match(source, /record\.payments/);
  assert.doesNotMatch(source, /getStoredPayments/);
  assert.doesNotMatch(source, /Math\.random/);
});

test("H29-P2 — paid orders without payment rows are shown as reconciliation gaps, not fake VietQR transactions", () => {
  assert.match(source, /record\.payment_status === "paid"/);
  assert.match(source, /\(record\.payments\?\.length \|\| 0\) === 0/);
  assert.match(source, /Đơn đã đánh dấu thanh toán nhưng thiếu giao dịch đối soát/);
  assert.match(source, /Đây không phải giao dịch VietQR/);
  assert.doesNotMatch(source, /paymentId:\s*record\.order_code/);
});
