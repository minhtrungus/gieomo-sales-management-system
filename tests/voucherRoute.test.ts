import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "next/server": "mock:next-server",
  "@/lib/supabase/admin": "mock:supabase-admin",
  "@/lib/auth/serverAuth": "mock:server-auth",
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) {
    return { url: MOCKS[specifier], shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try {
      return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" });
    } catch (err) {
      return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url === "mock:next-server") {
    return { format: "module", shortCircuit: true, source: 'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { "content-type": "application/json" } }); } }' };
  }
  if (url === "mock:server-auth") {
    return { format: "module", shortCircuit: true, source: 'export async function requireAdmin() { return { authorized: true }; }' };
  }
  if (url === "mock:supabase-admin") {
    return { format: "module", shortCircuit: true, source: 'export function createAdminClient() { return { from(table) { return globalThis.__voucherDb.from(table); } }; }' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

type UpdateCapture = { table: string | null; payload: Record<string, unknown> | null };
type DbStub = { from: (table: string) => unknown };

const capture: UpdateCapture = { table: null, payload: null };

const chain = {
  eq() {
    return chain;
  },
  select() {
    return chain;
  },
  single() {
    return Promise.resolve({ data: { voucher_id: "test" }, error: null });
  },
  update(payload: Record<string, unknown>) {
    capture.payload = payload;
    return chain;
  },
};

const g = globalThis as unknown as { __voucherDb: DbStub };
g.__voucherDb = {
  from: (table: string) => {
    capture.table = table;
    return chain;
  },
};

const { PATCH } = await import("../src/app/api/vouchers/route.ts");

function patchRequest(body: unknown): Promise<Response> {
  return PATCH(
    new Request("http://localhost/api/vouchers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  capture.table = null;
  capture.payload = null;
});

test("PR1 — discount_value = 0 bị từ chối 400, không gọi DB", async () => {
  const res = await patchRequest({ id: "FREESHIP1", discount_value: 0 });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /lớn hơn 0/);
  assert.equal(capture.payload, null);
  assert.equal(capture.table, null);
});

test("PR2 — discount_value âm bị từ chối 400, không gọi DB", async () => {
  const res = await patchRequest({ id: "FREESHIP1", discount_value: -15000 });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /lớn hơn 0/);
  assert.equal(capture.payload, null);
});

test("PR3 — discount_value dương hợp lệ được chấp nhận", async () => {
  const res = await patchRequest({ id: "FREESHIP1", discount_value: 15000 });
  assert.equal(res.status, 200);
  assert.equal(capture.table, "vouchers");
  assert.deepEqual(capture.payload, { discount_value: 15000 });
});

test("PR4 — PATCH một phần: chỉ trường gửi lên được ghi, các trường không gửi giữ nguyên", async () => {
  const res = await patchRequest({ id: "FREESHIP1", status: "inactive" });
  assert.equal(res.status, 200);
  assert.deepEqual(capture.payload, { status: "inactive" });
});

test("PR5 — Payload không chứa updated_at, max_discount_amount, max_discount dù body có gửi", async () => {
  const res = await patchRequest({
    id: "FREESHIP1",
    status: "active",
    discount_value: 20000,
    min_order_value: 150000,
    usage_limit: 50,
    start_date: "2026-01-01T00:00:00.000Z",
    end_date: "2026-12-31T00:00:00.000Z",
    updated_at: "2099-01-01T00:00:00.000Z",
    max_discount_amount: 99999,
    max_discount: 88888,
  });
  assert.equal(res.status, 200);
  const payload = capture.payload;
  assert.ok(payload);
  assert.equal("updated_at" in payload, false);
  assert.equal("max_discount_amount" in payload, false);
  assert.equal("max_discount" in payload, false);
  assert.equal(payload.discount_value, 20000);
  assert.equal(payload.usage_limit, 50);
  assert.equal(payload.min_order_value, 150000);
});

test("PR6 — Chỉ gửi id, không có trường nào để cập nhật → 400, không gọi DB", async () => {
  const res = await patchRequest({ id: "FREESHIP1" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.equal(capture.payload, null);
});
