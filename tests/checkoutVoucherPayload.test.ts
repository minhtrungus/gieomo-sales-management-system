import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try {
      return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" });
    } catch (err) {
      return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { resolveCheckoutVoucherState } = await import("../src/lib/checkout/voucherState.ts");

const VOUCHER_SUMMER20 = {
  voucher_id: "11111111-1111-1111-1111-111111111111",
  code: "SUMMER20",
  discount_type: "percentage",
  discount_value: 20,
  min_order_value: 0,
  times_used: 0,
  usage_limit: null,
  start_date: null,
  end_date: null,
  status: "active",
} as const;

const VOUCHER_MIN100K = {
  voucher_id: "22222222-2222-2222-2222-222222222222",
  code: "MIN100K",
  discount_type: "fixed_amount",
  discount_value: 10000,
  min_order_value: 100000,
  times_used: 0,
  usage_limit: null,
  start_date: null,
  end_date: null,
  status: "active",
} as const;

const VOUCHER_EXPIRED = {
  voucher_id: "33333333-3333-3333-3333-333333333333",
  code: "EXPIRED1",
  discount_type: "fixed_amount",
  discount_value: 5000,
  min_order_value: 0,
  times_used: 0,
  usage_limit: null,
  start_date: null,
  end_date: "2020-01-01T00:00:00Z",
  status: "active",
} as const;

const ALL_VOUCHERS = [VOUCHER_SUMMER20, VOUCHER_MIN100K, VOUCHER_EXPIRED];

function resolve(params: {
  voucherApplied?: string | null;
  formDataVoucherCode?: string;
  vouchers?: typeof ALL_VOUCHERS;
  subtotal?: number;
  totalItemCount?: number;
}) {
  return resolveCheckoutVoucherState({
    voucherApplied: params.voucherApplied ?? null,
    formDataVoucherCode: params.formDataVoucherCode ?? "",
    vouchers: (params.vouchers ?? ALL_VOUCHERS) as never,
    subtotal: params.subtotal ?? 200000,
    totalItemCount: params.totalItemCount ?? 2,
  });
}

test("A3-1 — chưa nhập voucher → activeVoucher null, voucherCode null", () => {
  const r = resolve({});
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});

test("A3-2 — nhập mã không tồn tại, chưa áp dụng → null (không gửi mã rác)", () => {
  const r = resolve({ formDataVoucherCode: "KHONGTONTAI" });
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});

test("A3-3 — nhập mã hợp lệ nhưng chưa bấm Áp dụng → null (chỉ gửi khi xác nhận)", () => {
  const r = resolve({ formDataVoucherCode: "SUMMER20" });
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});

test("A3-4 — áp dụng thành công → gửi đúng mã đã áp", () => {
  const r = resolve({ voucherApplied: "SUMMER20", formDataVoucherCode: "SUMMER20" });
  assert.ok(r.activeVoucher);
  assert.equal(r.voucherCode, "SUMMER20");
});

test("A3-5 — URL param ?voucher=SUMMER20 → tự áp dụng, gửi đúng mã", () => {
  const r = resolve({ voucherApplied: "SUMMER20", formDataVoucherCode: "SUMMER20" });
  assert.ok(r.activeVoucher);
  assert.equal(r.voucherCode, "SUMMER20");
});

test("A3-6 — đổi voucher: applied=SUMMER20, form=NEWCODE → vẫn gửi SUMMER20 (voucherApplied ưu tiên)", () => {
  const r = resolve({ voucherApplied: "SUMMER20", formDataVoucherCode: "NEWCODE" });
  assert.ok(r.activeVoucher);
  assert.equal(r.voucherCode, "SUMMER20");
});

test("A3-7 — xóa voucher (applied=null, form='') → null", () => {
  const r = resolve({ voucherApplied: null, formDataVoucherCode: "" });
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});

test("A3-8 — voucher hết hạn → null (không gửi mã đã hết hạn)", () => {
  const r = resolve({ voucherApplied: "EXPIRED1", formDataVoucherCode: "EXPIRED1" });
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});

test("A3-9 — voucher yêu cầu đơn tối thiểu nhưng subtotal thấp → null", () => {
  const r = resolve({ voucherApplied: "MIN100K", formDataVoucherCode: "MIN100K", subtotal: 50000 });
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});

test("A3-10 — voucher inactive → null", () => {
  const inactive = { ...VOUCHER_SUMMER20, status: "inactive" as const };
  const r = resolve({ voucherApplied: "SUMMER20", formDataVoucherCode: "SUMMER20", vouchers: [inactive] as never });
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});

test("A3-11 — mã có khoảng trắng thừa khi applied → trim + uppercase vẫn khớp", () => {
  const r = resolve({ voucherApplied: "  summer20  ", formDataVoucherCode: "SUMMER20" });
  assert.ok(r.activeVoucher);
  assert.equal(r.voucherCode, "SUMMER20");
});

test("A3-12 — voucher đã hết lượt sử dụng → null", () => {
  const exhausted = { ...VOUCHER_SUMMER20, usage_limit: 5, times_used: 5 };
  const r = resolve({ voucherApplied: "SUMMER20", formDataVoucherCode: "SUMMER20", vouchers: [exhausted] as never });
  assert.equal(r.activeVoucher, null);
  assert.equal(r.voucherCode, null);
});
