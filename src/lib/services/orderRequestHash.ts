/**
 * Canonical request hash for checkout idempotency.
 * Built SERVER-SIDE only. Never trust client-supplied hash or prices.
 */

export type CanonicalItemKind = "product" | "variant" | "combo";

export interface CanonicalItem {
  kind: CanonicalItemKind;
  id: string;
  quantity: number;
}

export interface CanonicalOrderPayload {
  buyer_phone: string;
  recipient_phone: string;
  address_detail: string;
  province: string;
  delivery_type: string;
  voucher_code: string | null;
  referral_code: string | null;
  seller_id: string | null;
  items: CanonicalItem[];
}

export interface RawCheckoutItem {
  product_id?: string | null;
  variant_id?: string | null;
  combo_id?: string | null;
  quantity?: number | number | string;
}

export interface RawOrderPayloadForHash {
  buyer_phone?: string | null;
  recipient_phone?: string | null;
  address_detail?: string | null;
  province?: string | null;
  delivery_type?: string | null;
  voucher_code?: string | null;
  referral_code?: string | null;
  seller_id?: string | null;
  items?: RawCheckoutItem[] | null;
}

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function upperOrNull(value: unknown): string | null {
  const s = trimOrNull(value);
  return s ? s.toUpperCase() : null;
}

function clampQty(value: unknown): number {
  const n = Math.floor(Number(value) || 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 99) return 99;
  return n;
}

function itemKindAndId(item: RawCheckoutItem): { kind: CanonicalItemKind; id: string } | null {
  const comboId = trimOrNull(item.combo_id);
  if (comboId) return { kind: "combo", id: comboId };
  const variantId = trimOrNull(item.variant_id);
  if (variantId) return { kind: "variant", id: variantId };
  const productId = trimOrNull(item.product_id);
  if (productId) return { kind: "product", id: productId };
  return null;
}

/**
 * Normalize + merge duplicate (kind,id) + sort stable.
 * Merging ensures client sending two lines vs one merged line → same hash.
 */
export function buildCanonicalOrderPayload(raw: RawOrderPayloadForHash): CanonicalOrderPayload {
  const merge = new Map<string, CanonicalItem>();
  const items = Array.isArray(raw.items) ? raw.items : [];

  for (const item of items) {
    if (!item) continue;
    const kindId = itemKindAndId(item);
    if (!kindId) continue;
    const key = `${kindId.kind}:${kindId.id}`;
    const qty = clampQty(item.quantity);
    const existing = merge.get(key);
    if (existing) {
      existing.quantity = clampQty(existing.quantity + qty);
    } else {
      merge.set(key, { kind: kindId.kind, id: kindId.id, quantity: qty });
    }
  }

  const sortedItems = Array.from(merge.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });

  return {
    buyer_phone: digits(raw.buyer_phone),
    recipient_phone: digits(raw.recipient_phone || raw.buyer_phone),
    address_detail: trimOrNull(raw.address_detail) ?? "",
    province: trimOrNull(raw.province) ?? "",
    delivery_type: trimOrNull(raw.delivery_type) || "home_delivery",
    voucher_code: upperOrNull(raw.voucher_code),
    referral_code: upperOrNull(raw.referral_code),
    seller_id: trimOrNull(raw.seller_id),
    items: sortedItems,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const cryptoMod = await import("node:crypto");
  return cryptoMod.createHash("sha256").update(input, "utf8").digest("hex");
}

/** Stable JSON stringify with sorted object keys (arrays keep order). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export async function buildOrderRequestHash(raw: RawOrderPayloadForHash): Promise<string> {
  const canonical = buildCanonicalOrderPayload(raw);
  return sha256Hex(stableStringify(canonical));
}
