import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Order } from "../src/types/database";

const SRC_ROOT = new URL("../src/", import.meta.url).href;
const hooksSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try {
      return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" });
    } catch {
      return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const storage = new Map<string, string>();
let orderPostCount = 0;

const runtime = globalThis as unknown as {
  window: typeof globalThis;
  localStorage: Storage;
  sessionStorage: Storage;
  addEventListener: () => void;
  dispatchEvent: () => boolean;
  fetch: typeof fetch;
};

runtime.window = globalThis;
runtime.addEventListener = () => undefined;
runtime.dispatchEvent = () => true;
runtime.localStorage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => {
    storage.delete(key);
  },
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
};
runtime.sessionStorage = runtime.localStorage;
runtime.fetch = (async (input) => {
  if (String(input) === "/api/orders") orderPostCount += 1;
  return new Response(JSON.stringify({
    success: true,
    orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    orderCode: "GM-SERVER-000001",
    finalAmount: 10_000,
    replayed: false,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const { saveNewOrder } = await import("../src/lib/data/orderStore.ts");

function order(code: string): Order {
  return {
    order_id: `id-${code}`,
    order_code: code,
    delivery_type: "home_delivery",
    subtotal: 10_000,
    shipping_fee: 0,
    final_amount: 10_000,
    order_status: "pending",
    payment_status: "pending",
    delivery_status: "not_ready",
    payment_method: "cod",
    items: [],
    created_at: "2026-10-13T00:00:00.000Z",
  };
}

test("checkout cache mode does not POST an already-created order again", async () => {
  orderPostCount = 0;
  await saveNewOrder(order("GM-CHECKOUT"), { syncToServer: false });
  assert.equal(orderPostCount, 0);
  assert.match(storage.get("gieomo_orders") || "", /GM-CHECKOUT/);
});

test("admin/sale mode persists only after server creation and adopts server identity", async () => {
  orderPostCount = 0;
  const result = await saveNewOrder(order("GM-LOCAL"));
  assert.equal(orderPostCount, 1);
  assert.equal(result.ok, true);
  assert.equal(result.orderId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(result.orderCode, "GM-SERVER-000001");
  assert.match(storage.get("gieomo_orders") || "", /GM-SERVER-000001/);
});

test("ambiguous network retry reuses the same idempotency key", async () => {
  storage.clear();
  const keys: string[] = [];
  let attempt = 0;
  runtime.fetch = (async (_input, init) => {
    attempt += 1;
    const body = JSON.parse(String(init?.body || "{}"));
    keys.push(body.idempotency_key);
    if (attempt === 1) throw new Error("connection reset after commit");
    return new Response(JSON.stringify({
      success: true,
      orderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      orderCode: "GM-REPLAY-000001",
      finalAmount: 10_000,
      replayed: true,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const pending = order("GM-CLIENT-TEMP");
  const first = await saveNewOrder(pending, { idempotencyFlow: "retry-test" });
  const second = await saveNewOrder(pending, { idempotencyFlow: "retry-test" });
  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
  assert.equal(second.replayed, true);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(storage.has("gieomo_order_attempt_retry-test"), false);
});
