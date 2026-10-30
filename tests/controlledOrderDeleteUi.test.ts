import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/admin/ControlledOrderDeletePanel.tsx", import.meta.url), "utf8");

test("OD-UI — one clear confirmation archives only a terminal order with an audit reason", () => {
  assert.match(source, /mode: "archive"/);
  assert.match(source, /Lưu trữ đơn hàng/);
  assert.match(source, /Lý do lưu trữ/);
  assert.match(source, /không tự hoàn tiền/);
  assert.match(source, /không tự hoàn hàng về kho/);
  assert.match(source, /!isTerminal/);
  assert.doesNotMatch(source, /request\("preview"\)|confirmation !== "XOA"|expectedUpdatedAt/);
  assert.match(source, /disabled=\{busy \|\| !isTerminal \|\| !reason\.trim\(\)\}/);
});
