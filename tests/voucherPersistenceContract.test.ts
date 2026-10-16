import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnsupportedVoucherFields } from "../src/lib/voucherPayload.ts";

test("voucher persistence accepts only no-op defaults for fields absent from schema 001-030", () => {
  assert.deepEqual(
    findUnsupportedVoucherFields({
      min_items_count: 0,
      is_gift_voucher: false,
      gift_min_order_value: 0,
      visibility: "public",
      max_discount_amount: 0,
    }),
    []
  );
});

test("voucher persistence reports every non-default field that would otherwise be lost", () => {
  assert.deepEqual(
    findUnsupportedVoucherFields({
      min_items_count: 2,
      is_gift_voucher: true,
      gift_min_order_value: 150000,
      visibility: "private",
      max_discount_amount: 50000,
    }),
    [
      "min_items_count",
      "is_gift_voucher",
      "gift_min_order_value",
      "visibility",
      "max_discount_amount",
    ]
  );
});
