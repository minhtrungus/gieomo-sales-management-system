import type { PricingParams, PricingResult } from "../../src/lib/pricing.ts";

/**
 * Bảng case parity pricing — MỘT nguồn sự thật dùng cho:
 *   - tests/pricingSqlParity.test.ts: khẳng định computePricing (TS) đúng spec.
 *   - tests/atomicOrderPg.integration.test.ts: so sánh TS === SQL
 *     public.pricing_preview() (chỉ chạy khi có pg + ATOMIC_PG_URL).
 *
 * `expected` được viết tay từ spec của src/lib/pricing.ts (không tự suy ra
 * từ code) để câu truy vấn "đúng hay sai" là độc lập.
 */
export interface PricingParityCase {
  name: string;
  params: PricingParams;
  expected: PricingResult;
}

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

const ACTIVE_FIXED = {
  status: "active",
  discount_type: "fixed",
  discount_value: 10000,
  min_order_value: 0,
  usage_limit: 10,
  times_used: 0,
  start_date: null,
  end_date: null,
  max_discount_amount: null,
};

export const PRICING_PARITY_CASES: PricingParityCase[] = [
  {
    name: "P01 home_delivery dưới threshold, không voucher → phí cơ bản",
    params: { subtotal: 100000, baseShippingFee: 25000, deliveryType: "home_delivery", freeShippingThreshold: 500000 },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 },
  },
  {
    name: "P02 home_delivery đạt threshold → free ship",
    params: { subtotal: 600000, baseShippingFee: 25000, deliveryType: "home_delivery", freeShippingThreshold: 500000 },
    expected: { shippingFee: 0, voucherDiscount: 0, finalAmount: 600000 },
  },
  {
    name: "P03 self_pickup → phí 0",
    params: { subtotal: 100000, baseShippingFee: 25000, deliveryType: "self_pickup", freeShippingThreshold: 500000 },
    expected: { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 },
  },
  {
    name: "P04 member_delivery → phí 0",
    params: { subtotal: 100000, baseShippingFee: 25000, deliveryType: "member_delivery", freeShippingThreshold: 0 },
    expected: { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 },
  },
  {
    name: "P05 pickup_point → phí 0",
    params: { subtotal: 100000, baseShippingFee: 25000, deliveryType: "pickup_point", freeShippingThreshold: 0 },
    expected: { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 },
  },
  {
    name: "P06 delivery_type thiếu → default home_delivery",
    params: { subtotal: 100000, baseShippingFee: 25000, freeShippingThreshold: 0 },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 },
  },
  {
    name: "P07 voucher fixed hợp lệ → giảm đúng số tiền",
    params: {
      subtotal: 200000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: ACTIVE_FIXED,
    },
    expected: { shippingFee: 25000, voucherDiscount: 10000, finalAmount: 215000 },
  },
  {
    name: "P08 voucher percentage có max cap → cap chiết khấu",
    params: {
      subtotal: 1000000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: {
        status: "active",
        discount_type: "percentage",
        discount_value: 10,
        max_discount_amount: 50000,
        min_order_value: 0,
        usage_limit: 0,
        times_used: 0,
        start_date: null,
        end_date: null,
      },
    },
    expected: { shippingFee: 25000, voucherDiscount: 50000, finalAmount: 975000 },
  },
  {
    name: "P09 voucher percentage không cap → phần trăm tròn",
    params: {
      subtotal: 100000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: {
        status: "active",
        discount_type: "percentage",
        discount_value: 10,
        max_discount_amount: 0,
        min_order_value: 0,
        usage_limit: 0,
        times_used: 0,
        start_date: null,
        end_date: null,
      },
    },
    expected: { shippingFee: 25000, voucherDiscount: 10000, finalAmount: 115000 },
  },
  {
    name: "P10 voucher freeship → phí 0, không giảm tiền hàng",
    params: {
      subtotal: 100000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: {
        status: "active",
        discount_type: "freeship",
        discount_value: 50000,
        min_order_value: 0,
        usage_limit: 0,
        times_used: 0,
        start_date: null,
        end_date: null,
      },
    },
    expected: { shippingFee: 0, voucherDiscount: 0, finalAmount: 100000 },
  },
  {
    name: "P11 voucher fixed vượt subtotal → clamp theo subtotal",
    params: {
      subtotal: 5000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: { ...ACTIVE_FIXED, discount_value: 10000 },
    },
    expected: { shippingFee: 25000, voucherDiscount: 5000, finalAmount: 25000 },
  },
  {
    name: "P12 chưa đủ min_order → không áp dụng voucher",
    params: {
      subtotal: 50000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 500000,
      voucher: { ...ACTIVE_FIXED, min_order_value: 100000 },
    },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 75000 },
  },
  {
    name: "P13 hết lượt sử dụng → không áp dụng voucher",
    params: {
      subtotal: 100000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: { ...ACTIVE_FIXED, usage_limit: 5, times_used: 5 },
    },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 },
  },
  {
    name: "P14 voucher inactive → không áp dụng",
    params: {
      subtotal: 100000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: { ...ACTIVE_FIXED, status: "inactive" },
    },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 },
  },
  {
    name: "P15 start_date tương lai → không áp dụng",
    params: {
      subtotal: 100000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: { ...ACTIVE_FIXED, start_date: FUTURE },
    },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 },
  },
  {
    name: "P16 end_date quá khứ → không áp dụng",
    params: {
      subtotal: 100000,
      baseShippingFee: 25000,
      deliveryType: "home_delivery",
      freeShippingThreshold: 0,
      voucher: { ...ACTIVE_FIXED, end_date: PAST },
    },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 125000 },
  },
  {
    name: "P17 subtotal 0 → final bằng phí ship (không âm)",
    params: { subtotal: 0, baseShippingFee: 25000, deliveryType: "home_delivery", freeShippingThreshold: 0 },
    expected: { shippingFee: 25000, voucherDiscount: 0, finalAmount: 25000 },
  },
];
