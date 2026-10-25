import { test } from "node:test";
import assert from "node:assert/strict";
import { computePricing } from "../src/lib/pricing.ts";
import { PRICING_PARITY_CASES } from "./helpers/pricingCases.ts";

/**
 * Nửa TScript của parity pricing (Q3):
 * mỗi case khẳng định computePricing đúng `expected` viết tay từ spec.
 * Nửa SQL (public.pricing_preview) chạy trong tests/atomicOrderPg.integration
 * .test.ts — file đó tự SKIP khi thiếu pg/ATOMIC_PG_URL (Q5: NOT RUN tại đây).
 */
for (const c of PRICING_PARITY_CASES) {
  test(`parity TS — ${c.name}`, () => {
    const got = computePricing(c.params);
    assert.deepEqual(got, c.expected);
  });
}

test("bảng case phủ đủ nhánh: phí ship, free-ship, fixed/percentage/freeship, các nhánh voucher không hợp lệ", () => {
  const names = PRICING_PARITY_CASES.map((c) => c.name).join("|");
  assert.match(names, /fixed/);
  assert.match(names, /percentage/);
  assert.match(names, /freeship/);
  assert.match(names, /min_order/);
  assert.match(names, /hết lượt/);
  assert.match(names, /inactive/);
  assert.match(names, /start_date/);
  assert.match(names, /end_date/);
  assert.match(names, /threshold/);
  assert.ok(PRICING_PARITY_CASES.length >= 15);
});
