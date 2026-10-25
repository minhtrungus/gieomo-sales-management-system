import type { Voucher } from "@/types/database";
import { isVoucherApplicable } from "@/lib/pricing";

export interface CheckoutVoucherInput {
  voucherApplied: string | null;
  formDataVoucherCode: string;
  vouchers: Voucher[];
  subtotal: number;
  totalItemCount: number;
}

export interface CheckoutVoucherState {
  activeVoucher: Voucher | null;
  voucherCode: string | null;
}

export function resolveCheckoutVoucherState(params: CheckoutVoucherInput): CheckoutVoucherState {
  const code = (params.voucherApplied || "").trim().toUpperCase();
  if (!code || params.vouchers.length === 0) {
    return { activeVoucher: null, voucherCode: null };
  }
  const found = params.vouchers.find((v) => v.code === code && v.status === "active");
  if (!found) return { activeVoucher: null, voucherCode: null };
  if (found.min_items_count && params.totalItemCount < found.min_items_count) {
    return { activeVoucher: null, voucherCode: null };
  }
  if (!isVoucherApplicable(found, params.subtotal)) {
    return { activeVoucher: null, voucherCode: null };
  }
  return { activeVoucher: found, voucherCode: found.code };
}
