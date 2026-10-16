import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const hooksSource = `
const MOCKS = {
  "next/server": "mock:next-server",
  "@/lib/supabase/admin": "mock:supabase-admin",
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "mock:next-server") {
    return { format: "module", shortCircuit: true, source: 'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { "content-type": "application/json" } }); } }' };
  }
  if (url === "mock:supabase-admin") {
    return { format: "module", shortCircuit: true, source: 'export function createAdminClient() { throw new Error("database must not be reached during auth rejection"); }' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { POST } = await import("../src/app/api/webhook/sepay/route.ts");

async function withApiKey(value: string | undefined, run: () => Promise<void>): Promise<void> {
  const previous = process.env.SEPAY_API_KEY;
  if (value === undefined) delete process.env.SEPAY_API_KEY;
  else process.env.SEPAY_API_KEY = value;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.SEPAY_API_KEY;
    else process.env.SEPAY_API_KEY = previous;
  }
}

test("SePay webhook fails closed when the API key is missing", async () => {
  await withApiKey(undefined, async () => {
    const response = await POST(new Request("http://localhost/api/webhook/sepay", { method: "POST" }));
    assert.equal(response.status, 500);
  });
});

test("SePay webhook never logs a rejected token", async () => {
  await withApiKey("configured-secret", async () => {
    const originalWarn = console.warn;
    const messages: string[] = [];
    console.warn = (...values: unknown[]) => messages.push(values.map(String).join(" "));
    try {
      const response = await POST(
        new Request("http://localhost/api/webhook/sepay", {
          method: "POST",
          headers: { authorization: "Apikey attacker-secret" },
        })
      );
      assert.equal(response.status, 401);
      assert.doesNotMatch(messages.join("\n"), /attacker-secret|configured-secret/);
    } finally {
      console.warn = originalWarn;
    }
  });
});
