import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * N1 — tiền giảm giá voucher ở 2 trang admin: chi tiết đơn + báo cáo.
 *
 * Mapping đã xác minh bằng source (không suy đoán):
 *   - Tạo đơn : orderService.ts ghi `voucher_discount: discountAmount` (cột DB).
 *   - Đọc ra  : getOrdersServer select `voucher_discount` → map `voucher_discount`.
 *   - Local   : checkout / admin create / POS / sale chỉ đặt `discount_amount`.
 *   - Type    : Order.voucher_discount?, Order.discount_amount? (types/database.ts).
 *
 * Hai trang phải dùng CÙNG quy tắc: (voucher_discount ?? discount_amount) || 0.
 * Không còn fallback `discount_amount ?? 10000`.
 */

const SRC_ROOT = new URL("../src/", import.meta.url);
const detailPage = readFileSync(new URL("app/admin/orders/[id]/page.tsx", SRC_ROOT), "utf8");
const reportsPage = readFileSync(new URL("app/admin/reports/page.tsx", SRC_ROOT), "utf8");

// Bắt đúng biểu thức triển khai trong source, group 1 = tên biến (o / order).
const SELECTOR = /\(?(\w+)\.voucher_discount \?\? \1\.discount_amount\)? \|\| 0/;

type OrderLike = { voucher_discount?: number | null; discount_amount?: number | null };

function selectorFrom(src: string, label: string): (o: OrderLike) => number {
  const matched = src.match(SELECTOR);
  assert.ok(matched, `${label} phải đọc voucher_discount (server) ?? discount_amount (local) || 0`);
  const param = matched[1] as string;
  const expression = matched[0] as string;
  return new Function(param, `return ${expression};`) as (o: OrderLike) => number;
}

const CASES: { name: string; order: OrderLike; expected: number }[] = [
  { name: "discount = 0 (server báo không giảm)", order: { voucher_discount: 0 }, expected: 0 },
  { name: "discount > 0 từ server (15000)", order: { voucher_discount: 15000 }, expected: 15000 },
  { name: "discount > 0 chỉ có local (8000)", order: { discount_amount: 8000 }, expected: 8000 },
  { name: "thiếu cả hai trường (undefined)", order: {}, expected: 0 },
  { name: "cả hai trường null", order: { voucher_discount: null, discount_amount: null }, expected: 0 },
  {
    name: "server 0 + local còn số cũ 5000 → theo server (0)",
    order: { voucher_discount: 0, discount_amount: 5000 },
    expected: 0,
  },
];

test("D1 — chi tiết đơn và báo cáo dùng cùng một quy tắc chọn số tiền giảm giá", () => {
  const detailSelector = selectorFrom(detailPage, "admin/orders/[id]");
  const reportsSelector = selectorFrom(reportsPage, "admin/reports");

  for (const c of CASES) {
    assert.equal(detailSelector(c.order), c.expected, `chi tiết đơn: ${c.name}`);
    assert.equal(reportsSelector(c.order), c.expected, `báo cáo: ${c.name}`);
  }
});

test("D2 — không còn fallback `discount_amount ?? 10000` ở cả hai trang", () => {
  assert.doesNotMatch(detailPage, /discount_amount\s*\?\?\s*10000/, "chi tiết đơn không được đoán 10000");
  assert.doesNotMatch(reportsPage, /discount_amount\s*\?\?\s*10000/, "báo cáo không được đoán 10000");
  // Đọc đúng trường của server.
  assert.match(detailPage, /order\.voucher_discount/, "chi tiết đơn phải đọc voucher_discount");
  assert.match(reportsPage, /o\.voucher_discount/, "báo cáo phải đọc voucher_discount");
});

test("D3 — chi tiết đơn: ẩn dòng giảm giá khi bằng 0, hiện đúng số tiền khi > 0", () => {
  // Điều kiện render: chỉ hiển thị khi số tiền > 0 (không hiện "-0đ").
  assert.match(detailPage, /\{voucherDiscount > 0 && \(/, "dòng giảm giá phải có điều kiện > 0");
  // Số tiền hiển thị lấy từ biến đã chuẩn hoá, không hardcode.
  assert.match(detailPage, /amount=\{voucherDiscount\}/, "hiển thị amount={voucher_discount đã chuẩn hoá}");
  assert.match(detailPage, /Giảm giá voucher:/, "nhãn dòng giảm giá vẫn còn");
  // Không còn dùng thẳng discount_amount trong JSX dòng giảm giá.
  assert.doesNotMatch(
    detailPage,
    /<MoneyDisplay amount=\{order\.discount_amount/,
    "không dùng thẳng order.discount_amount trong MoneyDisplay"
  );
});

test("D4 — báo cáo: totalDiscounts dùng đúng quy tắc, các công thức tổng khác giữ nguyên", () => {
  assert.match(
    reportsPage,
    /const totalDiscounts = activeOrders\.reduce\(/,
    "totalDiscounts vẫn là tổng của activeOrders"
  );
  assert.match(reportsPage, SELECTOR, "totalDiscounts dùng selector voucher_discount ?? discount_amount || 0");
  // Không đổi công thức doanh thu / phí ship / doanh thu thuần (N1 không đụng tổng tiền).
  assert.match(
    reportsPage,
    /const totalGrossRevenue = activeOrders\.reduce\(\(sum, o\) => sum \+ \(o\.final_amount \|\| 0\), 0\)/
  );
  assert.match(
    reportsPage,
    /const totalShipping = activeOrders\.reduce\(\(sum, o\) => sum \+ \(o\.shipping_fee \|\| 0\), 0\)/
  );
  assert.match(reportsPage, /const netMerchandiseRevenue = Math\.max\(0, totalGrossRevenue - totalShipping\)/);
});

test("D5 — dòng phí vận chuyển và tổng cộng thực thu của chi tiết đơn không bị đổi", () => {
  assert.match(detailPage, /<MoneyDisplay amount=\{order\.shipping_fee\}/);
  assert.match(detailPage, /<MoneyDisplay amount=\{order\.final_amount\}/);
  assert.match(detailPage, /<MoneyDisplay amount=\{order\.subtotal\}/);
});
