import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "next/server": "mock:next-server",
  "@/lib/auth/serverAuth": "mock:server-auth",
  "@/lib/supabase/admin": "mock:supabase-admin",
  "@/lib/utils/emailService": "mock:email-service",
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
  if (url === "mock:next-server") return {
    format: "module", shortCircuit: true,
    source: "export class NextResponse { static json(body, init = {}) { return new Response(JSON.stringify(body), { status: init.status || 200, headers: init.headers }); } }",
  };
  if (url === "mock:server-auth") return {
    format: "module", shortCircuit: true,
    source: \`export async function requireAdmin(request) {
      globalThis.__endpointProtectionAuthCalls = (globalThis.__endpointProtectionAuthCalls || 0) + 1;
      const mode = request.headers.get("x-test-auth");
      if (mode === "admin") return { authorized: true, user: { memberId: "admin-test" } };
      const status = mode === "staff" ? 403 : 401;
      return { authorized: false, response: Response.json({ success: false, error: "denied" }, { status }) };
    }\`,
  };
  if (url === "mock:supabase-admin") return {
    format: "module", shortCircuit: true,
    source: "export function createAdminClient() { globalThis.__endpointProtectionDbCalls = (globalThis.__endpointProtectionDbCalls || 0) + 1; throw new Error('database must not be reached'); }",
  };
  if (url === "mock:email-service") return {
    format: "module", shortCircuit: true,
    source: "export function generateOrderConfirmationHtml() { return ''; } export function generatePaymentReceivedHtml() { return ''; }",
  };
  return nextLoad(url, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const uploadRoute = await import("../src/app/api/upload/route.ts");
const emailRoute = await import("../src/app/api/notify/email/route.ts");

type EndpointProtectionGlobals = typeof globalThis & {
  __endpointProtectionAuthCalls?: number;
  __endpointProtectionDbCalls?: number;
};

const endpointGlobals = globalThis as EndpointProtectionGlobals;

function resetCounters() {
  endpointGlobals.__endpointProtectionAuthCalls = 0;
  endpointGlobals.__endpointProtectionDbCalls = 0;
}

test("P1 endpoint protection: upload rejects unauthenticated and non-admin requests before parsing/storage", async () => {
  for (const [mode, expected] of [[undefined, 401], ["staff", 403]] as const) {
    resetCounters();
    const headers = mode ? { "x-test-auth": mode } : undefined;
    const request = new Request("http://localhost/api/upload", { method: "POST", headers });
    const response = await uploadRoute.POST(request);
    assert.equal(response.status, expected);
    assert.equal(endpointGlobals.__endpointProtectionAuthCalls, 1);
    assert.equal(endpointGlobals.__endpointProtectionDbCalls, 0);
  }
});

test("P1 endpoint protection: admin upload reaches validation without touching storage for empty form", async () => {
  resetCounters();
  const request = new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "x-test-auth": "admin" },
    body: new FormData(),
  });
  const response = await uploadRoute.POST(request);
  assert.equal(response.status, 400);
  assert.equal(endpointGlobals.__endpointProtectionAuthCalls, 1);
  assert.equal(endpointGlobals.__endpointProtectionDbCalls, 0);
});

test("P1 endpoint protection: email trigger rejects unauthenticated and non-admin requests before DB/provider", async () => {
  for (const [mode, expected] of [[undefined, 401], ["staff", 403]] as const) {
    resetCounters();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (mode) headers["x-test-auth"] = mode;
    const request = new Request("http://localhost/api/notify/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "order_confirmation", orderCode: "GM-TEST" }),
    });
    const response = await emailRoute.POST(request);
    assert.equal(response.status, expected);
    assert.equal(endpointGlobals.__endpointProtectionAuthCalls, 1);
    assert.equal(endpointGlobals.__endpointProtectionDbCalls, 0);
  }
});

test("P1 endpoint protection: admin email request reaches payload validation before DB", async () => {
  resetCounters();
  const request = new Request("http://localhost/api/notify/email", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-auth": "admin" },
    body: "{}",
  });
  const response = await emailRoute.POST(request);
  assert.equal(response.status, 400);
  assert.equal(endpointGlobals.__endpointProtectionAuthCalls, 1);
  assert.equal(endpointGlobals.__endpointProtectionDbCalls, 0);
});
