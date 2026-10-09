import { test } from "node:test";
import assert from "node:assert/strict";
import { computePricing, isVoucherApplicable } from "../src/lib/pricing.ts";
import { buildVoucherPayload } from "../src/lib/voucherPayload.ts";

const SUBTOTAL = 100000;
const SHIP = 25000;

const activeVoucher = {
  status: "active",
  start_date: null,
  end_date: null,
  usage_limit: null,
  times_used: 0,
  min_order_value: 0,
};

test("TR1 — Không có voucher: 100.000 + ship 25.000 = 125.000", () => {
  const r = computePricing({ subtotal: SUBTOTAL, baseShippingFee: SHIP });
  assert.deepEqual(r, { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 });
});

test("TR2 — Voucher freeship: ship 0, voucher_discount 0, tổng 100.000", () => {
  const r = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    voucher: { ...activeVoucher, discount_type: "freeship", discount_value: 1 },
  });
  assert.deepEqual(r, { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 });
});

test("TR3 — Đạt ngưỡng miễn phí ship: ship 0, voucher_discount 0, tổng 100.000", () => {
  const r = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    freeShippingThreshold: 100000,
  });
  assert.deepEqual(r, { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 });
});

test("TR4 — Voucher giảm cố định 15.000, vẫn tính ship: 110.000", () => {
  const r = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    voucher: { ...activeVoucher, discount_type: "fixed_amount", discount_value: 15000 },
  });
  assert.deepEqual(r, { shippingFee: 25000, voucherDiscount: 15000, finalAmount: 110000 });
});

test("TR4b — Cùng TR4 ở dạng công thức server: max(0, subtotal + ship - discount)", () => {
  const r = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    voucher: { ...activeVoucher, discount_type: "fixed_amount", discount_value: 15000 },
  });
  assert.equal(r.finalAmount, Math.max(0, SUBTOTAL + r.shippingFee - r.voucherDiscount));
});

test("TR5 — API payload: freeship giữ discount_type='freeship', không gán 15.000", () => {
  const freeship = buildVoucherPayload({
    code: "  fs2026 ",
    discount_type: "freeship",
    discount_value: 15000,
    min_order_value: 0,
    usage_limit: null,
    times_used: 0,
    start_date: null,
    end_date: null,
    status: "active",
  });
  assert.equal(freeship.discount_type, "freeship");
  assert.equal(freeship.discount_value, 1);
  assert.equal(freeship.code, "FS2026");

  const invalidType = buildVoucherPayload({ code: "X", discount_type: "unknown_type" });
  assert.equal(invalidType.discount_type, "fixed_amount");
  assert.equal(invalidType.discount_value, 10000);

  const fixed = buildVoucherPayload({ code: "Y", discount_type: "fixed_amount", discount_value: 15000 });
  assert.equal(fixed.discount_type, "fixed_amount");
  assert.equal(fixed.discount_value, 15000);
});

test("TR6 — Voucher không hợp lệ/hết hạn không được áp dụng", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  assert.equal(isVoucherApplicable({ ...activeVoucher, status: "inactive" }, SUBTOTAL, now), false);
  assert.equal(
    isVoucherApplicable({ ...activeVoucher, end_date: "2026-06-14T23:59:59Z" }, SUBTOTAL, now),
    false
  );
  assert.equal(
    isVoucherApplicable({ ...activeVoucher, start_date: "2026-06-16T00:00:00Z" }, SUBTOTAL, now),
    false
  );
  assert.equal(
    isVoucherApplicable({ ...activeVoucher, usage_limit: 3, times_used: 3 }, SUBTOTAL, now),
    false
  );
  assert.equal(
    isVoucherApplicable({ ...activeVoucher, min_order_value: 150000 }, SUBTOTAL, now),
    false
  );
  assert.equal(
    isVoucherApplicable({ ...activeVoucher, start_date: "2026-06-01T00:00:00Z", end_date: "2026-06-30T00:00:00Z", usage_limit: 5, times_used: 4 }, SUBTOTAL, now),
    true
  );

  const expiredFreeship = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    now,
    voucher: { ...activeVoucher, discount_type: "freeship", discount_value: 1, end_date: "2026-06-14T23:59:59Z" },
  });
  assert.deepEqual(expiredFreeship, { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 });
});

test("TR7 — Biên ngưỡng freeship: dưới / đúng / trên ngưỡng", () => {
  const below = computePricing({ subtotal: 99999, baseShippingFee: SHIP, freeShippingThreshold: 100000 });
  assert.deepEqual(below, { shippingFee: 25000, voucherDiscount: 0, finalAmount: 124999 });

  const at = computePricing({ subtotal: 100000, baseShippingFee: SHIP, freeShippingThreshold: 100000 });
  assert.deepEqual(at, { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 });

  const above = computePricing({ subtotal: 100001, baseShippingFee: SHIP, freeShippingThreshold: 100000 });
  assert.deepEqual(above, { shippingFee: 0, voucherDiscount: 0, finalAmount: 100001 });

  const thresholdZero = computePricing({ subtotal: SUBTOTAL, baseShippingFee: SHIP, freeShippingThreshold: 0 });
  assert.deepEqual(thresholdZero, { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 });
});

test("TR8 — Cart, checkout và server tính cùng kết quả (cùng input → cùng output)", () => {
  const scenarios = [
    { name: "no-voucher", voucher: null, freeShippingThreshold: 0 },
    {
      name: "freeship",
      voucher: { ...activeVoucher, discount_type: "freeship", discount_value: 1 },
      freeShippingThreshold: 0,
    },
    { name: "threshold", voucher: null, freeShippingThreshold: 100000 },
    {
      name: "fixed-15000",
      voucher: { ...activeVoucher, discount_type: "fixed_amount", discount_value: 15000 },
      freeShippingThreshold: 0,
    },
  ] as const;

  for (const s of scenarios) {
    const cartView = computePricing({
      subtotal: SUBTOTAL,
      baseShippingFee: SHIP,
      freeShippingThreshold: s.freeShippingThreshold,
      voucher: s.voucher,
    });
    const checkoutView = computePricing({
      subtotal: SUBTOTAL,
      baseShippingFee: SHIP,
      deliveryType: "home_delivery",
      freeShippingThreshold: s.freeShippingThreshold,
      voucher: s.voucher,
    });
    const serverView = computePricing({
      subtotal: SUBTOTAL,
      baseShippingFee: SHIP,
      deliveryType: "home_delivery",
      freeShippingThreshold: s.freeShippingThreshold,
      voucher: s.voucher,
    });
    assert.deepEqual(checkoutView, cartView, `checkout != cart (${s.name})`);
    assert.deepEqual(serverView, cartView, `server != cart (${s.name})`);
    assert.equal(serverView.finalAmount, Math.max(0, SUBTOTAL + serverView.shippingFee - serverView.voucherDiscount));
  }
});

test("TR8b — Không gộp freeship vào voucher_discount khi có cả ngưỡng và voucher", () => {
  const r = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    freeShippingThreshold: 50000,
    voucher: { ...activeVoucher, discount_type: "freeship", discount_value: 1 },
  });
  assert.equal(r.voucherDiscount, 0);
  assert.equal(r.shippingFee, 0);
  assert.equal(r.finalAmount, 100000);
});

test("TR8c — member_delivery: ship 0 nhưng voucher fixed vẫn giữ nguyên giảm", () => {
  const r = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    deliveryType: "member_delivery",
    voucher: { ...activeVoucher, discount_type: "fixed_amount", discount_value: 15000 },
  });
  assert.deepEqual(r, { shippingFee: 0, voucherDiscount: 15000, finalAmount: 85000 });
});

test("TR9 — Voucher percentage có giới hạn giảm tối đa (max_discount_amount)", () => {
  const capped = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    voucher: { ...activeVoucher, discount_type: "percentage", discount_value: 20, max_discount_amount: 10000 },
  });
  assert.deepEqual(capped, { shippingFee: 25000, voucherDiscount: 10000, finalAmount: 115000 });

  const underCap = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    voucher: { ...activeVoucher, discount_type: "percentage", discount_value: 10, max_discount_amount: 50000 },
  });
  assert.deepEqual(underCap, { shippingFee: 25000, voucherDiscount: 10000, finalAmount: 115000 });

  const withoutCap = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    voucher: { ...activeVoucher, discount_type: "percentage", discount_value: 20, max_discount_amount: 0 },
  });
  assert.equal(withoutCap.voucherDiscount, 20000);
});

test("TR10 — Voucher giảm cố định lớn hơn subtotal: giảm tối đa bằng subtotal", () => {
  const r = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    voucher: { ...activeVoucher, discount_type: "fixed_amount", discount_value: 150000 },
  });
  assert.deepEqual(r, { shippingFee: 25000, voucherDiscount: 100000, finalAmount: 25000 });
});

test("TR11 — pickup_point và self_pickup: phí giao hàng bằng 0", () => {
  const pickupPoint = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    deliveryType: "pickup_point",
  });
  assert.deepEqual(pickupPoint, { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 });

  const selfPickup = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    deliveryType: "self_pickup",
  });
  assert.deepEqual(selfPickup, { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 });

  const homeDelivery = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    deliveryType: "home_delivery",
  });
  assert.equal(homeDelivery.shippingFee, 25000);
});

test("TR12 — Freeship kết hợp ngưỡng miễn phí chưa đạt: voucher vẫn miễn ship", () => {
  const active = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    freeShippingThreshold: 150000,
    voucher: { ...activeVoucher, discount_type: "freeship", discount_value: 1 },
  });
  assert.deepEqual(active, { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 });

  const expired = computePricing({
    subtotal: SUBTOTAL,
    baseShippingFee: SHIP,
    freeShippingThreshold: 150000,
    now: new Date("2026-06-15T00:00:00Z"),
    voucher: {
      ...activeVoucher,
      discount_type: "freeship",
      discount_value: 1,
      end_date: "2026-06-14T23:59:59Z",
    },
  });
  assert.deepEqual(expired, { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 });
});

test("TR13 — Payload freeship: voucher_id UUID được giữ, voucher_id không phải UUID bị bỏ", () => {
  const uuid = "3f2b7a4e-9c1d-4f6a-8e2b-1a5c9d7e3f10";
  const withUuid = buildVoucherPayload({
    code: "FREESHIP1",
    voucher_id: uuid,
    discount_type: "freeship",
    discount_value: 15000,
  });
  assert.equal(withUuid.voucher_id, uuid);
  assert.equal(withUuid.discount_type, "freeship");
  assert.equal(withUuid.discount_value, 1);

  const withoutUuid = buildVoucherPayload({
    code: "FREESHIP2",
    voucher_id: "vouch-1728000000000",
    discount_type: "freeship",
    discount_value: 15000,
  });
  assert.equal(withoutUuid.voucher_id, undefined);
  assert.equal(withoutUuid.discount_type, "freeship");
});

test("TR14 — Biên điều kiện áp dụng: ngưỡng tối thiểu, mốc thời gian, giới hạn sử dụng", () => {
  const now = new Date("2026-06-15T00:00:00Z");

  assert.equal(isVoucherApplicable({ ...activeVoucher, min_order_value: 150000 }, 150000, now), true);
  assert.equal(isVoucherApplicable({ ...activeVoucher, min_order_value: 150000 }, 149999, now), false);

  assert.equal(isVoucherApplicable({ ...activeVoucher, start_date: "2026-06-15T00:00:00Z" }, SUBTOTAL, now), true);
  assert.equal(isVoucherApplicable({ ...activeVoucher, end_date: "2026-06-15T00:00:00Z" }, SUBTOTAL, now), true);

  assert.equal(isVoucherApplicable({ ...activeVoucher, usage_limit: 3, times_used: 2 }, SUBTOTAL, now), true);
  assert.equal(isVoucherApplicable({ ...activeVoucher, usage_limit: 3, times_used: 3 }, SUBTOTAL, now), false);
  assert.equal(isVoucherApplicable({ ...activeVoucher, usage_limit: null, times_used: 999 }, SUBTOTAL, now), true);

  assert.equal(isVoucherApplicable({ ...activeVoucher, status: "scheduled" }, SUBTOTAL, now), false);
});
