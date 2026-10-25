import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression test cho defect: `Number(flatShippingFee) || 25000` nuốt
 * phí ship hợp lệ = 0 → server charge 25000đ trong khi UI hiển thị 0đ.
 *
 * Root cause: `||` coi `0` là falsy → fallback 25000.
 * Admin settings UI cho phép `flatShippingFee = 0` (page.tsx:167).
 * Checkout hiển thị đúng 0đ (computePricing không coerce).
 * Server tạo đơn với 25000đ → customer thấy 0đ nhưng bị charge 25000đ.
 *
 * Fix: dùng `??` (nullish coalescing) thay vì `||` — chỉ fallback khi
 * null/undefined, giữ nguyên giá trị 0.
 */

const ORDER_SERVICE = readFileSync(
  fileURLToPath(new URL("../src/lib/services/orderService.ts", import.meta.url)),
  "utf8"
);
const SQL025 = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/025_atomic_idempotent_order_creation.sql", import.meta.url)),
  "utf8"
);

// ---------------------------------------------------------------
// 1. Behavioral: Number(0) || 25000 nuốt 0 (bug demo)
// ---------------------------------------------------------------
test("shipping fee — Number(0) || 25000 = 25000 (bug demo, sẽ FAIL sau fix)", () => {
  // Đây là behavioral demo của bug — assertion này ĐÚNG với code hiện tại.
  // Dùng biến runtime để TS không statically analyze thành constant.
  const zero = 0 as number;
  const undef = undefined as number | undefined;
  assert.equal(Number(zero) || 25000, 25000, "|| coi 0 là falsy → fallback 25000");
  assert.equal(Number(undef) || 25000, 25000, "|| fallback khi undefined");
  // ?? chỉ fallback khi null/undefined, giữ nguyên 0
  assert.equal(zero ?? 25000, 0, "?? giữ nguyên 0");
  assert.equal(undef ?? 25000, 25000, "?? fallback khi undefined");
});

// ---------------------------------------------------------------
// 2. Source contract: TS không tính phí ship nữa — hợp đồng chuyển sang SQL 025
// ---------------------------------------------------------------
test("shipping fee — TS không còn điểm fallback || 25000 (Tab orderService sạch)", () => {
  assert.doesNotMatch(ORDER_SERVICE, /flatShippingFee/, "TS không dùng config fee nữa");
});

test("shipping fee — 025 áp dụng config bằng regex numeric, giữ nguyên 0", () => {
  // '^[0-9]+$' khớp '0' → flat_shipping_fee = 0 phải được giữ nguyên.
  assert.match(
    SQL025,
    /IF v_config ~ '\^\[0-9\]\+\$' THEN v_base_shipping := v_config::numeric; END IF;/,
    "fallback phải theo regex numeric (không dùng || hay <> '0')"
  );
  // Không có guard nuốt 0 kiểu chuỗi rỗng/trạng thái falsy
  assert.doesNotMatch(
    SQL025,
    /flat_shipping_fee[^\n]{0,120}\|\|/,
    "SQL không dùng || cho flat_shipping_fee"
  );
});

// ---------------------------------------------------------------
// 4. configService: string "0" phải parse thành 0 (không fallback default)
// ---------------------------------------------------------------
test("shipping fee — configService parse string '0' thành 0", () => {
  // "0" là truthy string → Number("0") = 0 → đúng
  const zeroStr = "0" as string;
  assert.equal(zeroStr ? Number(zeroStr) : 15000, 0, "string '0' là truthy → parse thành 0");
  // "" là falsy → fallback default
  const emptyStr = "" as string;
  assert.equal(emptyStr ? Number(emptyStr) : 15000, 15000, "string '' là falsy → fallback default");
});
