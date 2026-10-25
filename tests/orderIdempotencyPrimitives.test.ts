import { test, describe } from "node:test";
import assert from "node:assert/strict";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  writable: true,
  value: {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, String(value));
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
  },
});

const { getOrCreateOrderAttemptKey, clearOrderAttemptKey } = await import(
  "../src/lib/orderIdempotency.ts"
);
const {
  stableStringifyV2: stableStringify,
  buildCanonicalOrderPayloadV2: buildCanonicalOrderPayload,
  hashCanonicalOrderPayloadV2: hashCanonicalOrderPayload,
  buildOrderIdempotencyScopeV2: buildOrderIdempotencyScope,
} = await import("../src/lib/services/orderRequestHashV2.ts");

const baseInput = {
  buyer_name: "  Nguyen Van A  ",
  buyer_phone: "090-123-4567",
  buyer_email: "  Buyer@Example.COM ",
  recipient_phone: "0912 345 678",
  delivery_type: "",
  address_detail: "12/34 Duong So 5",
  district: " Quan 1 ",
  province: " TP Ho Chi Minh ",
  customer_note: "  Giao buoi toi  ",
  voucher_code: " tenpro10 ",
  referral_code: " refx ",
  seller_id: null,
  introducer_info: "",
  source_type: "",
  payment_method: "",
};

const baseItems = [
  { product_id: "ao-thun", quantity: 2 },
  { variant_id: "variant-1", product_id: "ao-thun", quantity: 1 },
];

describe("order attempt key (client)", () => {
  test("reuses the same key for a retry with an identical payload", async () => {
    store.clear();
    const payload = { items: baseItems, phone: "0901234567" };
    const first = await getOrCreateOrderAttemptKey("checkout", payload);
    const second = await getOrCreateOrderAttemptKey("checkout", payload);
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.equal(second, first);
  });

  test("issues a new key when the payload changes", async () => {
    store.clear();
    const first = await getOrCreateOrderAttemptKey("checkout", { quantity: 1 });
    const second = await getOrCreateOrderAttemptKey("checkout", { quantity: 2 });
    assert.notEqual(second, first);
  });

  test("flows do not share attempt keys", async () => {
    store.clear();
    const payload = { quantity: 1 };
    const checkout = await getOrCreateOrderAttemptKey("checkout", payload);
    const pos = await getOrCreateOrderAttemptKey("pos", payload);
    assert.notEqual(pos, checkout);
  });

  test("recovers from corrupt or invalid stored entries", async () => {
    store.clear();
    const keyName = "gieomo_order_attempt_checkout";
    store.set(keyName, "{not json");
    const afterCorrupt = await getOrCreateOrderAttemptKey("checkout", { quantity: 1 });
    assert.match(afterCorrupt, /^[0-9a-f-]{36}$/i);

    store.set(keyName, JSON.stringify({ fingerprint: "deadbeef", key: "not-a-uuid" }));
    const afterInvalidKey = await getOrCreateOrderAttemptKey("checkout", { quantity: 1 });
    assert.match(afterInvalidKey, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("clearing the stored key forces a fresh key", async () => {
    store.clear();
    const payload = { quantity: 1 };
    const first = await getOrCreateOrderAttemptKey("checkout", payload);
    clearOrderAttemptKey("checkout");
    const second = await getOrCreateOrderAttemptKey("checkout", payload);
    assert.notEqual(second, first);
  });
});

describe("canonical order request hash", () => {
  test("stableStringify is insensitive to object key order", () => {
    assert.equal(stableStringify({ a: 1, b: { c: 2, d: 3 } }), stableStringify({ b: { d: 3, c: 2 }, a: 1 }));
    assert.notEqual(stableStringify({ a: 1 }), stableStringify({ a: 2 }));
    assert.equal(stableStringify([1, 2]), "[1,2]");
    assert.equal(stableStringify(null), "null");
  });

  test("normalizes phones, email, voucher codes, and defaults", () => {
    const payload = buildCanonicalOrderPayload(baseInput, baseItems);
    assert.equal(payload.buyer_phone, "0901234567");
    assert.equal(payload.recipient_phone, "0912345678");
    assert.equal(payload.buyer_email, "buyer@example.com");
    assert.equal(payload.voucher_code, "TENPRO10");
    assert.equal(payload.referral_code, "REFX");
    assert.equal(payload.delivery_type, "home_delivery");
    assert.equal(payload.payment_method, "banking");
    assert.equal(payload.recipient_name, "Nguyen Van A");
    assert.equal(payload.customer_note, "Giao buoi toi");
    assert.equal(payload.seller_id, null);
  });

  test("item ordering in the request does not change the hash", () => {
    const forward = buildCanonicalOrderPayload(baseInput, baseItems);
    const reversed = buildCanonicalOrderPayload(baseInput, [...baseItems].reverse());
    assert.equal(hashCanonicalOrderPayload(forward), hashCanonicalOrderPayload(reversed));
  });

  test("semantically different requests produce different hashes", () => {
    const baseline = buildCanonicalOrderPayload(baseInput, baseItems);
    const moreQuantity = buildCanonicalOrderPayload(baseInput, [
      baseItems[0],
      { ...baseItems[1], quantity: 5 },
    ]);
    const otherVoucher = buildCanonicalOrderPayload({ ...baseInput, voucher_code: "OTHER" }, baseItems);
    const otherAddress = buildCanonicalOrderPayload({ ...baseInput, address_detail: "99 Duong Khac" }, baseItems);

    const hashes = new Set([
      hashCanonicalOrderPayload(baseline),
      hashCanonicalOrderPayload(moreQuantity),
      hashCanonicalOrderPayload(otherVoucher),
      hashCanonicalOrderPayload(otherAddress),
    ]);
    assert.equal(hashes.size, 4);
  });

  test("ignores client-supplied price, discount, shipping, and stock fields", () => {
    const pricedInput = {
      ...baseInput,
      subtotal: 1,
      discount: 99,
      shipping_fee: 0,
      final_amount: 1,
      stock: 999,
    } as Record<string, unknown>;
    const clean = buildCanonicalOrderPayload(baseInput, baseItems);
    const priced = buildCanonicalOrderPayload(pricedInput, baseItems);
    assert.equal(hashCanonicalOrderPayload(clean), hashCanonicalOrderPayload(priced));
    assert.equal("subtotal" in priced, false);
  });
});

describe("idempotency scope", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  const guestPattern = /^guest:[0-9a-f]{64}$/;
  const memberPattern = /^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  test("member scope uses the server-validated member uuid", () => {
    const scope = buildOrderIdempotencyScope(uuid.toUpperCase(), "0901234567");
    assert.match(scope, memberPattern);
    assert.equal(scope, `member:${uuid}`);
  });

  test("guest scope hashes a normalized phone and matches the migration contract", () => {
    const formatted = buildOrderIdempotencyScope(null, "090-123-4567");
    const compact = buildOrderIdempotencyScope(null, "0901234567");
    assert.match(formatted, guestPattern);
    assert.equal(formatted, compact);
  });

  test("a non-uuid memberId cannot impersonate a member scope", () => {
    const scope = buildOrderIdempotencyScope("admin", "0901234567");
    assert.match(scope, guestPattern);
  });

  test("different phones yield different guest scopes", () => {
    assert.notEqual(
      buildOrderIdempotencyScope(null, "0901234567"),
      buildOrderIdempotencyScope(null, "0901234568")
    );
  });
});
