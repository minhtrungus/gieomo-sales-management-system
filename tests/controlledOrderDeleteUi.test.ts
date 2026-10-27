import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/admin/ControlledOrderDeletePanel.tsx", import.meta.url), "utf8");

test("OD-UI — one clear confirmation archives an order with an audit reason", () => {
  assert.match(source, /mode: "archive"/);
  assert.match(source, /Xóa đơn hàng/);
  assert.match(source, /Lý do xóa/);
  assert.match(source, /không tự hoàn tiền/);
  assert.doesNotMatch(source, /request\("preview"\)|confirmation !== "XOA"|expectedUpdatedAt/);
  assert.match(source, /disabled=\{busy \|\| !reason\.trim\(\)\}/);
});
