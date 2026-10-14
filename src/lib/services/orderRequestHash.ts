import { createHash } from "node:crypto";
import type { ValidatedOrderCreateLine } from "@/lib/orderCreateInput";

type OrderInput = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function digits(value: unknown): string {
  return text(value).replace(/\D/g, "");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function buildCanonicalOrderPayload(input: OrderInput, items: ValidatedOrderCreateLine[]) {
  const canonicalItems = items
    .map((item) => ({
      product_id: item.product_id ?? null,
      variant_id: item.variant_id ?? null,
      combo_id: item.combo_id ?? null,
      quantity: item.quantity,
    }))
    .sort((left, right) => {
      const leftKey = `${left.combo_id ?? ""}|${left.variant_id ?? ""}|${left.product_id ?? ""}|${left.quantity}`;
      const rightKey = `${right.combo_id ?? ""}|${right.variant_id ?? ""}|${right.product_id ?? ""}|${right.quantity}`;
      return leftKey.localeCompare(rightKey);
    });

  return {
    buyer_name: text(input.buyer_name),
    buyer_phone: digits(input.buyer_phone ?? input.recipient_phone),
    buyer_email: text(input.buyer_email).toLowerCase(),
    recipient_name: text(input.recipient_name ?? input.buyer_name),
    recipient_phone: digits(input.recipient_phone ?? input.buyer_phone),
    delivery_type: text(input.delivery_type) || "home_delivery",
    address_detail: text(input.address_detail),
    district: text(input.district),
    province: text(input.province),
    customer_note: text(input.customer_note),
    voucher_code: nullableText(input.voucher_code)?.toUpperCase() ?? null,
    referral_code: nullableText(input.referral_code)?.toUpperCase() ?? null,
    seller_id: nullableText(input.seller_id),
    introducer_info: text(input.introducer_info),
    source_type: text(input.source_type),
    payment_method: text(input.payment_method) || "banking",
    items: canonicalItems,
  };
}

export function hashCanonicalOrderPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

export function buildOrderIdempotencyScope(memberId: string | null | undefined, guestPhone: unknown): string {
  if (memberId && /^[0-9a-f-]{36}$/i.test(memberId)) return `member:${memberId.toLowerCase()}`;
  const phone = digits(guestPhone);
  return `guest:${createHash("sha256").update(`gieomo-order:${phone}`, "utf8").digest("hex")}`;
}
