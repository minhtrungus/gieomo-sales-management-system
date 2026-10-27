import test from "node:test";
import assert from "node:assert/strict";
import { extractOrderCodeCandidates, normalizePersistedOrderCode } from "../src/lib/payments/orderReference.ts";

test("canonical order references accept supported separator variants", () => {
  for (const value of ["GM-261027-000001", "gm_261027_000001", "GM261027000001", "GM 261027 000001"]) {
    assert.deepEqual(extractOrderCodeCandidates(value), ["GM-261027-000001"]);
  }
});

test("legacy order references remain compatible, including reported GM-26102700", () => {
  assert.deepEqual(extractOrderCodeCandidates("Thanh toan GM-26102700 cam on"), ["GM-26102700"]);
  assert.deepEqual(extractOrderCodeCandidates("CK GM369817"), ["GM-369817"]);
  assert.equal(normalizePersistedOrderCode(" gm-369817 "), "GM-369817");
});

test("prefix/suffix text is allowed but identifier substrings are not", () => {
  assert.deepEqual(extractOrderCodeCandidates("PAY:GM-261027-000001;MB"), ["GM-261027-000001"]);
  assert.deepEqual(extractOrderCodeCandidates("XGM-261027-000001Z"), []);
});

test("multiple exact references are returned separately so callers fail closed", () => {
  assert.deepEqual(
    extractOrderCodeCandidates("GM-1234 GM-12345"),
    ["GM-1234", "GM-12345"],
  );
});

test("malformed or missing references do not produce guessed identities", () => {
  assert.deepEqual(extractOrderCodeCandidates("khong co ma don"), []);
  assert.deepEqual(extractOrderCodeCandidates("GM-12"), []);
});
