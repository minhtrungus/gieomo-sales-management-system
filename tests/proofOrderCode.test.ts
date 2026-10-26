import { test } from "node:test";
import assert from "node:assert/strict";
import { isSupportedOrderCode, normalizeOrderCode } from "../src/lib/orders/orderCode.ts";

test("proof order identity accepts legacy and canonical persisted formats", () => {
  assert.equal(isSupportedOrderCode("GM-369817"), true);
  assert.equal(isSupportedOrderCode("GM-001"), true);
  assert.equal(isSupportedOrderCode("GM-260901-000001"), true);
});

test("proof order identity normalization is exact and rejects malformed input", () => {
  assert.equal(normalizeOrderCode("  gm-260901-000001  "), "GM-260901-000001");
  for (const value of ["", "GM-", "GM-260901-1", "GM-260901-000001-extra", "GM_369817", "XX-369817"]) {
    assert.equal(isSupportedOrderCode(value), false, value);
  }
});
