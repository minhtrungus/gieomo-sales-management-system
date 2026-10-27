import test from "node:test";
import assert from "node:assert/strict";
import { allocateComboVariantsBottomUp } from "../src/lib/comboInventory.ts";

test("wildcard combo takes active in-stock variants from the bottom up", () => {
  const variants = [
    { variant_id: "top", sort_order: 1, stock: 0, status: "active" },
    { variant_id: "middle", sort_order: 2, stock: 2, status: "active" },
    { variant_id: "bottom", sort_order: 3, stock: 3, status: "active" },
  ];
  assert.deepEqual(allocateComboVariantsBottomUp(variants, 4), [
    { variant_id: "bottom", quantity: 3 },
    { variant_id: "middle", quantity: 1 },
  ]);
});

test("disabled variants are skipped and insufficient total stock fails closed", () => {
  const variants = [
    { variant_id: "disabled", sort_order: 9, stock: 99, status: "archived" },
    { variant_id: "active", sort_order: 1, stock: 1, status: "active" },
  ];
  assert.deepEqual(allocateComboVariantsBottomUp(variants, 1), [{ variant_id: "active", quantity: 1 }]);
  assert.equal(allocateComboVariantsBottomUp(variants, 2), null);
});

test("multiple in-stock variants use descending sort order with a stable fallback", () => {
  const variants = [
    { variant_id: "a", sort_order: 1, stock: 4 },
    { variant_id: "b", sort_order: 3, stock: 4 },
    { variant_id: "c", sort_order: 2, stock: 4 },
  ];
  assert.deepEqual(allocateComboVariantsBottomUp(variants, 2), [{ variant_id: "b", quantity: 2 }]);
});
