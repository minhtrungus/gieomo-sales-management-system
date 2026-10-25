import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalOrderPayload,
  buildOrderRequestHash,
  stableStringify,
} from "../src/lib/services/orderRequestHash.ts";

const baseRaw = {
  buyer_phone: "0901 234 567",
  recipient_phone: "0901-234-567",
  address_detail: " 123 Test St ",
  province: " Hanoi ",
  delivery_type: "home_delivery",
  voucher_code: "save10",
  referral_code: "ref123",
  seller_id: "seller-1",
  items: [
    { product_id: "p1", variant_id: null, combo_id: null, quantity: 2 },
  ],
};

test("canonical strips digits and trims", () => {
  const c = buildCanonicalOrderPayload({
    buyer_phone: "0901 234 567",
    recipient_phone: "0901-234-567",
    address_detail: " 123 Test St ",
    province: " Hanoi ",
    delivery_type: "home_delivery",
    voucher_code: " save10 ",
    referral_code: " ref123 ",
    seller_id: " seller-1 ",
    items: [{ product_id: "p1", quantity: 2 }],
  });
  assert.equal(c.buyer_phone, "0901234567");
  assert.equal(c.recipient_phone, "0901234567");
  assert.equal(c.address_detail, "123 Test St");
  assert.equal(c.province, "Hanoi");
  assert.equal(c.voucher_code, "SAVE10");
  assert.equal(c.referral_code, "REF123");
  assert.equal(c.seller_id, "seller-1");
  assert.deepEqual(c.items, [{ kind: "product", id: "p1", quantity: 2 }]);
});

test("canonical merges duplicate product lines", () => {
  const c = buildCanonicalOrderPayload({
    ...baseRaw,
    items: [
      { product_id: "p1", quantity: 1 },
      { product_id: "p1", quantity: 1 },
    ],
  });
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].quantity, 2);
});

test("canonical prefers combo over variant over product", () => {
  const c = buildCanonicalOrderPayload({
    ...baseRaw,
    items: [
      {
        product_id: "p1",
        variant_id: "v1",
        combo_id: "c1",
        quantity: 1,
      },
    ],
  });
  assert.equal(c.items[0].kind, "combo");
  assert.equal(c.items[0].id, "c1");
});

test("canonical sorts items by kind then id", () => {
  const c = buildCanonicalOrderPayload({
    ...baseRaw,
    items: [
      { product_id: "p2", quantity: 1 },
      { product_id: "p1", quantity: 1 },
      { variant_id: "v9", quantity: 1 },
    ],
  });
  assert.deepEqual(
    c.items.map((i) => `${i.kind}:${i.id}`),
    ["product:p1", "product:p2", "variant:v9"]
  );
});

test("same logical payload → same hash; qty change → different", async () => {
  const a = await buildOrderRequestHash({
    ...baseRaw,
    items: [
      { product_id: "p1", quantity: 1 },
      { product_id: "p1", quantity: 1 },
    ],
  });
  const b = await buildOrderRequestHash({
    ...baseRaw,
    items: [{ product_id: "p1", quantity: 2 }],
  });
  assert.equal(a, b);

  const c = await buildOrderRequestHash({
    ...baseRaw,
    items: [{ product_id: "p1", quantity: 3 }],
  });
  assert.notEqual(a, c);
});

test("stableStringify sorts object keys", () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("voucher code case insensitive", async () => {
  const a = await buildOrderRequestHash({
    ...baseRaw,
    voucher_code: "FREESHIP",
  });
  const b = await buildOrderRequestHash({
    ...baseRaw,
    voucher_code: "freeship",
  });
  assert.equal(a, b);
});
