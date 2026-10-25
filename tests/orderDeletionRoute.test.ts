import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC_ROOT = new URL("../src/", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
const MOCKS = {
  "next/server": "mock:next-server",
  "@/lib/auth/serverAuth": "mock:server-auth",
  "@/lib/supabase/admin": "mock:supabase-admin",
};
export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try { return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" }); }
    catch { return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" }); }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url === "mock:next-server") return { format: "module", shortCircuit: true, source: 'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: init?.status || 200, headers: { "content-type": "application/json" } }); } }' };
  if (url === "mock:server-auth") return { format: "module", shortCircuit: true, source: 'export async function requireAdmin() { return globalThis.__deleteAuth; }' };
  if (url === "mock:supabase-admin") return { format: "module", shortCircuit: true, source: 'export function createAdminClient() { return { rpc: globalThis.__deleteRpc }; }' };
  return nextLoad(url, context);
}
`)}`, import.meta.url);

const ORDER = "11111111-1111-4111-8111-111111111111";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const calls: Array<Record<string, unknown>> = [];
const globals = globalThis as typeof globalThis & {
  __deleteAuth: unknown;
  __deleteRpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

globals.__deleteRpc = async (name, args) => {
  calls.push({ name, args });
  const p = args.p as Record<string, unknown>;
  return {
    data: p.mode === "delete"
      ? { outcome: "deleted", order_id: p.order_id }
      : { outcome: "eligible", eligible: true, order_id: p.order_id, updated_at: "2026-10-23T00:00:00Z" },
    error: null,
  };
};

const { POST } = await import("../src/app/api/orders/delete/route.ts");
const request = (body: unknown) => POST(new Request("http://localhost/api/orders/delete", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}));

beforeEach(() => {
  calls.length = 0;
  globals.__deleteAuth = { authorized: true, user: { memberId: ACTOR } };
});

test("OD1 — non-admin bị chặn trước RPC", async () => {
  globals.__deleteAuth = { authorized: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
  const response = await request({});
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test("OD2 — preview bắt buộc reason và UUID hợp lệ", async () => {
  const response = await request({ mode: "preview", orderId: ORDER, reason: "" });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("OD3 — order id không hợp lệ bị từ chối", async () => {
  const response = await request({ mode: "preview", orderId: "not-a-uuid", reason: "Tạo nhầm" });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("OD4 — preview hợp lệ gọi RPC service-role với actor và không confirmation", async () => {
  const response = await request({ mode: "preview", orderId: ORDER, reason: "Tạo nhầm" });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const args = calls[0].args as { p: Record<string, unknown> };
  assert.equal(args.p.actor_member_id, ACTOR);
  assert.equal(args.p.category, undefined);
  assert.equal(args.p.keep_order_id, undefined);
  assert.equal(args.p.confirmation, null);
});

test("OD5 — delete bắt buộc XOA và chỉ nhận từng đơn", async () => {
  const missingConfirmation = await request({ mode: "delete", orderId: ORDER, reason: "Tạo nhầm", expectedUpdatedAt: "2026-10-23T00:00:00Z" });
  assert.equal(missingConfirmation.status, 400);
  const batch = await request({ mode: "delete", orderIds: [ORDER, "22222222-2222-4222-8222-222222222222"], reason: "Tạo nhầm", confirmation: "XOA" });
  assert.equal(batch.status, 400);
  assert.equal(calls.length, 0);
});

test("OD6 — delete hợp lệ chuyển preview version vào RPC", async () => {
  const expected = "2026-10-23T00:00:00Z";
  const response = await request({ mode: "delete", orderId: ORDER, reason: "Tạo nhầm", confirmation: "XOA", expectedUpdatedAt: expected });
  assert.equal(response.status, 200);
  const args = calls[0].args as { p: Record<string, unknown> };
  assert.equal(args.p.expected_updated_at, expected);
  assert.equal(args.p.confirmation, "XOA");
});
