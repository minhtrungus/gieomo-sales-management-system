import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const root = new URL("../src/", import.meta.url).href;
const loader = `
const mocks = {
  "next/server": "mock:next",
  "@/lib/services/orderService": "mock:order-service",
  "@/lib/services/orderCreateAtomicV2": "mock:order-v2",
  "@/lib/auth/serverAuth": "mock:auth"
};
export async function resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) return { url: mocks[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try { return await nextResolve(sub, { ...context, parentURL: "${root}" }); }
    catch { return nextResolve(sub + ".ts", { ...context, parentURL: "${root}" }); }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url === "mock:next") return {
    format: "module", shortCircuit: true,
    source: 'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: init?.status || 200, headers: { "content-type": "application/json" } }); } }'
  };
  if (url === "mock:order-service") return {
    format: "module", shortCircuit: true,
    source: "export async function getOrdersServer() { return []; }"
  };
  if (url === "mock:order-v2") return {
    format: "module", shortCircuit: true,
    source: "export async function createOrderServerAtomicV2(input, identity) { globalThis.__orderV2Call = { input, identity }; return globalThis.__orderV2Result; }"
  };
  if (url === "mock:auth") return {
    format: "module", shortCircuit: true,
    source: "export async function getAuthenticatedUser() { return { memberId: '00000000-0000-4000-8000-000000000901', role: 'admin' }; } export async function requireAdmin() { return { authorized: true, user: { memberId: '00000000-0000-4000-8000-000000000901' } }; } export async function requireAuth() { return { authorized: true }; }"
  };
  return nextLoad(url, context);
}`;
register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);

const { POST } = await import("../src/app/api/orders/route.ts");
const globalState = globalThis as any;
const KEY = "00000000-0000-4000-8000-000000000902";

beforeEach(() => {
  globalState.__orderV2Call = null;
  globalState.__orderV2Result = null;
});

function request(body: Record<string, unknown> = {}, key = KEY): Promise<Response> {
  return POST(new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ items: [{ product_id: "p1", quantity: 1 }], buyer_phone: "0900000000", ...body }),
  }));
}

test("V2 route maps created result and forwards header identity", async () => {
  globalState.__orderV2Result = {
    success: true, orderId: "o1", orderCode: "GM-001", finalAmount: 100000,
    proofToken: "proof", idempotency: "created"
  };
  const response = await request();
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.equal(body.success, true);
  assert.equal(body.idempotency, "created");
  assert.equal(globalState.__orderV2Call.input.idempotency_key, KEY);
  assert.equal(globalState.__orderV2Call.identity.memberId, "00000000-0000-4000-8000-000000000901");
});

test("V2 route maps replay as successful canonical response", async () => {
  globalState.__orderV2Result = {
    success: true, orderId: "o1", orderCode: "GM-001", finalAmount: 100000,
    proofToken: "proof", idempotency: "replayed", replayed: true
  };
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal((await response.json() as any).idempotency, "replayed");
});

for (const [outcome, status] of [["processing", 409], ["hash_mismatch", 409], ["failed_terminal", 400]] as const) {
  test(`V2 route maps ${outcome} to HTTP ${status}`, async () => {
    globalState.__orderV2Result = { success: false, idempotency: outcome, error: outcome };
    const response = await request();
    assert.equal(response.status, status);
    assert.equal((await response.json() as any).idempotency, outcome);
  });
}

test("V2 route fails closed on unknown writer result", async () => {
  globalState.__orderV2Result = { success: false, error: "unknown" };
  const response = await request();
  assert.equal(response.status, 400);
  assert.equal((await response.json() as any).success, false);
});

test("BLOCKER-3 — keyless POST chuyển key rỗng nguyên trạng sang V2 (V2 từ chối tường minh)", async () => {
  await request({}, "");
  assert.equal(globalState.__orderV2Call.input.idempotency_key, "");
});

test("BLOCKER-3 — no header + body.idempotency_key được route chuyển qua V2", async () => {
  await POST(new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ product_id: "p1", quantity: 1 }], idempotency_key: KEY }),
  }));
  assert.equal(globalState.__orderV2Call.input.idempotency_key, KEY);
});

test("BLOCKER-3 — writer báo failed_terminal keyless → route 400 tường minh", async () => {
  globalState.__orderV2Result = {
    success: false, idempotency: "failed_terminal", error: "Khóa gửi đơn không hợp lệ."
  };
  const response = await request({}, "");
  assert.equal(response.status, 400);
  const body = await response.json() as any;
  assert.equal(body.idempotency, "failed_terminal");
  assert.match(String(body.error), /Khóa gửi đơn không hợp lệ/);
});
