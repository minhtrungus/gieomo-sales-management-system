import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../src/components/admin/OrderVariantSwapAction.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/admin/orders/[id]/page.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/lib/services/orderService.ts", import.meta.url), "utf8");

test("swap UI is mounted on order lines and opens an accessible responsive dialog", () => {
  assert.match(page, /OrderVariantSwapAction/);
  assert.match(component, /Thay đổi mẫu/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /max-h-\[90vh\].*overflow-y-auto/);
  assert.match(component, /DOI-MAU/);
  assert.match(component, /reason\.trim\(\)/);
  assert.match(component, /\/api\/orders\/swap-variant/);
});

test("swap UI is state/line gated and combo lines fail closed", () => {
  assert.match(component, /pending.*confirmed.*processing/);
  assert.match(component, /deliveryStatus === "not_ready"/);
  assert.match(component, /item\.combo_id/);
  assert.match(component, /Dòng combo chưa hỗ trợ/);
  assert.match(component, /selected\.stock >= item\.quantity/);
  assert.match(component, /Không thể đổi mẫu: chỉ áp dụng/);
  assert.match(component, /Dòng hàng cũ không có mã variant/);
});

test("order read contract exposes stable product/variant/combo identities", () => {
  for (const field of ["product_id", "variant_id", "combo_id"]) {
    assert.match(service, new RegExp(`${field}: it\\.${field} \\?\\? null`));
  }
});
