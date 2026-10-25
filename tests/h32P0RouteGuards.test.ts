import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

const root = new URL("../src/", import.meta.url).href;
const loader = `
const mocks = {
  "next/server": "mock:next",
  "@/lib/services/orderService": "mock:orders",
  "@/lib/services/orderCreateAtomicV2": "mock:create",
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
  if (url === "mock:next") return { format: "module", shortCircuit: true, source: 'export class NextResponse { static json(body, init) { return Response.json(body, init); } }' };
  if (url === "mock:orders") return { format: "module", shortCircuit: true, source: 'export async function getOrdersServer(options) { globalThis.__h32Lookup = options; return []; }' };
  if (url === "mock:create") return { format: "module", shortCircuit: true, source: 'export async function createOrderServerAtomicV2() { return { success: false }; }' };
  if (url === "mock:auth") return { format: "module", shortCircuit: true, source: 'export async function getAuthenticatedUser() { return globalThis.__h32User; } export async function requireAdmin() { return { authorized: false, response: Response.json({}, { status: 401 }) }; } export async function requireAuth() { return { authorized: false, response: Response.json({}, { status: 401 }) }; }' };
  return nextLoad(url, context);
}`;
register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);

const { GET } = await import("../src/app/api/orders/route.ts");
const g = globalThis as any;

beforeEach(() => {
  g.__h32User = null;
  g.__h32Lookup = null;
});

test("H32-R1 — anonymous order code alone is rejected before database lookup", async () => {
  const response = await GET(new Request("http://localhost/api/orders?code=GM-261023-000001"));
  assert.equal(response.status, 401);
  assert.equal(g.__h32Lookup, null);
});

test("H32-R2 — public tracking forwards code plus ownership credential", async () => {
  assert.equal((await GET(new Request("http://localhost/api/orders?code=GM-1&phone=0900000000"))).status, 200);
  assert.equal(g.__h32Lookup.phone, "0900000000");

  assert.equal((await GET(new Request("http://localhost/api/orders?code=GM-1&token=proof"))).status, 200);
  assert.equal(g.__h32Lookup.proofToken, "proof");
});

test("H32-R3 — admin retains full list access", async () => {
  g.__h32User = { role: "admin", memberId: "member" };
  assert.equal((await GET(new Request("http://localhost/api/orders"))).status, 200);
  assert.equal(g.__h32Lookup.isAdmin, true);
});

test("H32-R4 — clients use proof token and clear legacy bearer storage", () => {
  const successPage = readFileSync(new URL("../src/app/order/success/page.tsx", import.meta.url), "utf8");
  const trackPage = readFileSync(new URL("../src/app/track/page.tsx", import.meta.url), "utf8");
  const loginPage = readFileSync(new URL("../src/app/admin/login/page.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");
  const saleSidebar = readFileSync(new URL("../src/components/sale/SaleSidebar.tsx", import.meta.url), "utf8");

  assert.match(successPage, /api\/orders\?code=.*&token=/);
  assert.match(trackPage, /gieomo_order_token_/);
  assert.match(trackPage, /phone=/);
  assert.doesNotMatch(loginPage, /localStorage\.setItem\("gieomo_session_token"/);
  assert.match(store, /localStorage\.removeItem\("gieomo_session_token"\)/);
  assert.match(saleSidebar, /fetch\("\/api\/auth\/logout"/);
});
