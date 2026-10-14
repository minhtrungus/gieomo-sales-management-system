export interface PricingVoucher {
  discount_type?: string | null;
  discount_value?: number | string | null;
  max_discount_amount?: number | string | null;
  min_order_value?: number | string | null;
  usage_limit?: number | string | null;
  times_used?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
}

export interface PricingParams {
  subtotal: number;
  baseShippingFee: number;
  deliveryType?: string | null;
  freeShippingThreshold?: number | string | null;
  voucher?: PricingVoucher | null;
  now?: Date;
}

export interface PricingResult {
  shippingFee: number;
  voucherDiscount: number;
  finalAmount: number;
}

const ZERO_FEE_DELIVERY_TYPES = ["pickup_point", "self_pickup", "member_delivery"];

export function isVoucherApplicable(
  voucher: PricingVoucher | null | undefined,
  subtotal: number,
  now: Date = new Date()
): boolean {
  if (!voucher) return false;
  if (voucher.status !== "active") return false;
  if (voucher.start_date && new Date(voucher.start_date).getTime() > now.getTime()) return false;
  if (voucher.end_date && new Date(voucher.end_date).getTime() < now.getTime()) return false;
  const usageLimit = Number(voucher.usage_limit) || 0;
  if (usageLimit > 0 && (Number(voucher.times_used) || 0) >= usageLimit) return false;
  const minOrderValue = Number(voucher.min_order_value) || 0;
  if (minOrderValue > 0 && subtotal < minOrderValue) return false;
  return true;
}

export function computePricing(params: PricingParams): PricingResult {
  const { subtotal, baseShippingFee, now = new Date() } = params;
  const deliveryType = params.deliveryType ?? "home_delivery";

  let shippingFee = ZERO_FEE_DELIVERY_TYPES.indexOf(deliveryType) >= 0 ? 0 : baseShippingFee;

  const threshold = Number(params.freeShippingThreshold) || 0;
  if (threshold > 0 && subtotal >= threshold) {
    shippingFee = 0;
  }

  let voucherDiscount = 0;
  const voucher = params.voucher;
  if (voucher && isVoucherApplicable(voucher, subtotal, now)) {
    if (voucher.discount_type === "freeship") {
      shippingFee = 0;
    } else if (voucher.discount_type === "percentage") {
      const percent = Math.min(100, Math.max(0, Number(voucher.discount_value) || 0));
      const rawDiscount = Math.round((subtotal * percent) / 100);
      const maxDiscount = Number(voucher.max_discount_amount) || 0;
      voucherDiscount = maxDiscount > 0 ? Math.min(rawDiscount, maxDiscount) : rawDiscount;
    } else {
      const rawDiscount = Number(voucher.discount_value) || 0;
      voucherDiscount = Math.min(subtotal, Math.max(0, rawDiscount));
    }
  }

  const finalAmount = Math.max(0, subtotal - voucherDiscount + shippingFee);
  return { shippingFee, voucherDiscount, finalAmount };
}
