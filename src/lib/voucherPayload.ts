export const VOUCHER_DISCOUNT_TYPES = ["percentage", "fixed_amount", "freeship"];

export interface VoucherPayloadInput {
  code: string;
  voucher_id?: string;
  discount_type?: string | null;
  discount_value?: number | string | null;
  min_order_value?: number | string | null;
  usage_limit?: number | string | null;
  times_used?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
}

export interface VoucherPayload {
  voucher_id?: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_value: number;
  usage_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export function buildVoucherPayload(body: VoucherPayloadInput): VoucherPayload {
  const voucherId = typeof body.voucher_id === "string" ? body.voucher_id : null;
  const isUuid =
    voucherId !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(voucherId);

  const requestedType =
    typeof body.discount_type === "string" && VOUCHER_DISCOUNT_TYPES.indexOf(body.discount_type) >= 0
      ? body.discount_type
      : "fixed_amount";
  const isFreeship = requestedType === "freeship";

  const payload: VoucherPayload = {
    code: body.code.trim().toUpperCase(),
    discount_type: requestedType,
    discount_value: isFreeship ? 1 : Math.max(1, Number(body.discount_value) || 10000),
    min_order_value: Number(body.min_order_value) || 0,
    usage_limit: body.usage_limit ? Number(body.usage_limit) : null,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    status: body.status || "active",
  };

  if (isUuid && voucherId) {
    payload.voucher_id = voucherId;
  }

  return payload;
}
