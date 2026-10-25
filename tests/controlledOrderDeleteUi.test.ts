import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/admin/ControlledOrderDeletePanel.tsx", import.meta.url), "utf8");

test("OD-UI — preview precedes delete and confirmation is explicit", () => {
  assert.match(source, /request\("preview"\)/);
  assert.match(source, /preview\?\.eligible/);
  assert.match(source, /confirmation !== "XOA"/);
  assert.match(source, /expectedUpdatedAt/);
  assert.doesNotMatch(source, /keepOrderId|category/);
  assert.match(source, /Xóa đơn test\/nháp/);
  assert.match(source, /payment_evidence_present/);
  assert.match(source, /idempotency_claim_present/);
  assert.match(source, /disabled=\{busy/);
});
