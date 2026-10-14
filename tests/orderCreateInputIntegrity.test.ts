import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "next/server": "mock:next-server",
  "@/lib/supabase/admin": "mock:supabase-admin",
  "@/lib/services/configService": "mock:config-service",
  "@/lib/auth/serverAuth": "mock:server-auth",
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true };
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

export async function load(url, context, nextLoad) {
  if (url === "mock:next-server") {
    return { format: "module", shortCircuit: true, source: 'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { "content-type": "application/json" } }); } }' };
  }
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: 'export function createAdminClient() { globalThis.__p0a3AdminClientCalls += 1; throw new Error("database access must not occur"); }',
    };
  }
  if (url === "mock:config-service") {
    return { format: "module", shortCircuit: true, source: 'export async function getSystemSettingsServer() { throw new Error("not expected"); }' };
  }
  if (url === "mock:server-auth") {
    return { format: "module", shortCircuit: true, source: 'export function createOrderProofToken() { return "unused"; } export async function getAuthenticatedUser() { return null; } export async function requireAdmin() { throw new Error("not expected"); } export async function requireAuth() { throw new Error("not expected"); }' };
  }
  return nextLoad(url, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const runtime = globalThis as typeof globalThis & { __p0a3AdminClientCalls: number };
runtime.__p0a3AdminClientCalls = 0;

const { validateOrderCreateLines } = await import("../src/lib/orderCreateInput.ts");
const { canExposeOrderPaymentProof, createOrderServer } = await import("../src/lib/services/orderService.ts");
const { POST } = await import("../src/app/api/orders/route.ts");

const validProductLine = { product_id: "product-slug", quantity: 1 };

test("payment proof content requires admin access or verified phone ownership", () => {
  assert.equal(canExposeOrderPaymentProof(false, false), false);
  assert.equal(canExposeOrderPaymentProof(false, true), true);
  assert.equal(canExposeOrderPaymentProof(true, false), true);
});

test("rejects a missing, empty, or malformed items collection", () => {
  for (const input of [null, {}, { items: [] }, { items: [null] }]) {
    assert.equal(validateOrderCreateLines(input).ok, false);
  }
});

test("rejects quantity coercion, defaulting, flooring, and unsafe integers", () => {
  const invalidQuantities = [undefined, null, "2", 0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1];
  for (const quantity of invalidQuantities) {
    const result = validateOrderCreateLines({
      items: [{ product_id: "product-slug", quantity }],
    });
    assert.equal(result.ok, false, `quantity ${String(quantity)} must be rejected`);
  }
});

test("requires one unambiguous supported line identity", () => {
  const invalidLines = [
    { quantity: 1 },
    { product_id: "", quantity: 1 },
    { product_id: 42, quantity: 1 },
    { product_id: "product-1", combo_id: "combo-1", quantity: 1 },
    { variant_id: "variant-1", combo_id: "combo-1", quantity: 1 },
  ];

  for (const line of invalidLines) {
    assert.equal(validateOrderCreateLines({ items: [line] }).ok, false);
  }
});

test("accepts documented product, variant, and combo shapes without imposing an unapproved maximum", () => {
  const result = validateOrderCreateLines({
    items: [
      validProductLine,
      { variant_id: "variant-1", quantity: 2 },
      { product_id: "parent-1", variant_id: "variant-2", quantity: 3 },
      { combo_id: "combo-1", quantity: 100 },
    ],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.items.map((item) => item.quantity), [1, 2, 3, 100]);
    assert.deepEqual(result.items[3], { combo_id: "combo-1", quantity: 100 });
  }
});

test("preserves duplicate lines instead of merging their quantities", () => {
  const result = validateOrderCreateLines({ items: [validProductLine, validProductLine] });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.items.length, 2);
});

test("createOrderServer rejects invalid lines before constructing a database client", async () => {
  runtime.__p0a3AdminClientCalls = 0;
  const result = await createOrderServer({
    buyer_phone: "0900000000",
    items: [{ product_id: "product-1", quantity: "2" }],
  } as never);

  assert.equal(result.success, false);
  assert.match(result.error || "", /số lượng phải là số nguyên dương an toàn/);
  assert.equal(runtime.__p0a3AdminClientCalls, 0);
});

test("POST returns an explicit 400 client error without database access", async () => {
  runtime.__p0a3AdminClientCalls = 0;
  const response = await POST(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        buyer_phone: "0900000000",
        items: [{ product_id: "product-1", quantity: 0 }],
      }),
    })
  );
  const body = (await response.json()) as { success: boolean; error: string };

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.error, /số lượng phải là số nguyên dương an toàn/);
  assert.equal(runtime.__p0a3AdminClientCalls, 0);
});
