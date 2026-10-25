import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beginCreateOrderAttempt } from "../src/lib/checkout/createOrderAttempt.ts";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
Object.defineProperty(globalThis, "window", { value: { sessionStorage: storage }, configurable: true });
const payload = { buyer_name: "Tên fake", buyer_phone: "0000000000", voucher_code: "TEST", items: [{ variant_id: "v1", quantity: 1 }] };

for (const scope of ["admin-create", "pos-create", "sale-create", "checkout"]) {
  test(`${scope}: timeout/reload → same key; changed input blocked; resolved → new key`, async () => {
    values.clear();
    const first = await beginCreateOrderAttempt(scope, payload);
    const key = first.key;
    first.release(); // transport failed; intentionally not resolved
    assert.equal([...values.values()].some((v) => v.includes(payload.buyer_name) || v.includes(payload.buyer_phone)), false);
    const retry = await beginCreateOrderAttempt(scope, structuredClone(payload));
    assert.equal(retry.key, key);
    retry.release();
    await assert.rejects(beginCreateOrderAttempt(scope, { ...payload, voucher_code: "OTHER" }), /chưa xác định/);
    const resolved = await beginCreateOrderAttempt(scope, payload);
    assert.equal(resolved.key, key);
    resolved.resolve();
    resolved.release();
    const next = await beginCreateOrderAttempt(scope, payload);
    assert.notEqual(next.key, key);
    next.resolve();
    next.release();
  });
}

test("double submit during digest/request is blocked synchronously", async () => {
  values.clear();
  const firstPromise = beginCreateOrderAttempt("guard", payload);
  await assert.rejects(beginCreateOrderAttempt("guard", payload), /đang được xử lý/);
  const first = await firstPromise;
  await assert.rejects(beginCreateOrderAttempt("guard", payload), /đang được xử lý/);
  first.resolve(); first.release();
});

test("pending attempt rejects a new explicit key", async () => {
  values.clear();
  const first = await beginCreateOrderAttempt("explicit", payload);
  first.release();
  await assert.rejects(beginCreateOrderAttempt("explicit", payload, crypto.randomUUID()), /chưa xác định/);
  const retry = await beginCreateOrderAttempt("explicit", payload, first.key);
  retry.resolve(); retry.release();
});

test("checkout adopts existing legacy key instead of rotating it", async () => {
  values.clear();
  const key = crypto.randomUUID();
  values.set("gieomo_checkout_idempotency_key", key);
  const first = await beginCreateOrderAttempt("checkout", payload);
  assert.equal(first.key, key);
  first.release();
  const retry = await beginCreateOrderAttempt("checkout", payload);
  assert.equal(retry.key, key);
  retry.resolve(); retry.release();
  assert.equal(values.has("gieomo_checkout_idempotency_key"), false);
});

test("corrupt attempt or blocked storage fails closed; never creates a fresh key", async () => {
  values.clear();
  values.set("gieomo_create_attempt_corrupt", "not JSON");
  await assert.rejects(beginCreateOrderAttempt("corrupt", payload));
  assert.equal(values.get("gieomo_create_attempt_corrupt"), "not JSON");
  const previous = storage.setItem;
  storage.setItem = () => { throw new Error("storage blocked"); };
  try { await assert.rejects(beginCreateOrderAttempt("blocked", payload), /storage blocked/); }
  finally { storage.setItem = previous; }
  const next = await beginCreateOrderAttempt("blocked", payload);
  next.resolve(); next.release();
});

test("caller wiring: distinct scopes; checkout cannot rotate a key on conflict", () => {
  const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const [path, scope] of [
    ["src/app/admin/orders/create/page.tsx", "admin-create"],
    ["src/app/admin/orders/pos/page.tsx", "pos-create"],
    ["src/app/sale/create-order/page.tsx", "sale-create"],
  ]) assert.ok(source(path).includes(`saveNewOrder(newOrder, { attemptScope: "${scope}" })`));
  const checkout = source("src/app/checkout/page.tsx");
  assert.ok(checkout.includes('beginCreateOrderAttempt("checkout", orderPayload)'));
  assert.equal(checkout.includes("action.rotateKey"), false);
  assert.equal(checkout.includes("saveNewOrder("), false);
});
