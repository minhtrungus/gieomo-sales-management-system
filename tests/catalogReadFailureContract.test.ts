import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("H29-R1 — catalog read failures are explicit, not successful empty collections", () => {
  const products = read("../src/lib/services/productService.ts");
  const combos = read("../src/app/api/combos/route.ts");

  assert.match(products, /throw new Error\("Không thể tải danh sách sản phẩm\."\)/);
  assert.match(combos, /Không thể tải danh sách combo/);
  assert.match(combos, /\{ status: 500 \}/);
  assert.doesNotMatch(combos, /success: false, combos: \[\]/);
});
