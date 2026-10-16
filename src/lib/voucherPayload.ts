export const VOUCHER_DISCOUNT_TYPES = ["percentage", "fixed_amount", "freeship"];

const UNSUPPORTED_VOUCHER_DEFAULTS: Record<string, unknown> = {
  min_items_count: 0,
  is_gift_voucher: false,
  gift_min_order_value: 0,
  visibility: "public",
  max_discount_amount: 0,
};

/**
 * These fields are present in the admin model but do not exist in the
 * canonical 001-027 database schema. Default values are harmless because
 * they preserve the schema's current behaviour; non-default values must fail
 * closed so the API never reports a successful save while silently dropping
 * a business rule.
 */
export function findUnsupportedVoucherFields(body: Record<string, unknown>): string[] {
  return Object.entries(UNSUPPORTED_VOUCHER_DEFAULTS)
    .filter(([field, defaultValue]) => {
      if (!(field in body) || body[field] === null || body[field] === undefined) return false;
      if (typeof defaultValue === "number") {
        const value = Number(body[field]);
        return !Number.isFinite(value) || value !== defaultValue;
      }
      return body[field] !== defaultValue;
    })
    .map(([field]) => field);
}

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
