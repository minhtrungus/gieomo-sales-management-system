import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { createFakeOrderDb, type FakeOrderDb, type Row } from "./helpers/fakeOrderDb.ts";

/**
 * Batch 4b — auth hygiene fixes (source-verified, mock/contract):
 *   BH1 sepay sai API key → 401, không echo token
 *   BH2 sepay đúng key (Authorization: Apikey) → pass auth (test ping 200)
 *   BH3 sepay đúng key qua x-api-key → pass auth
 *   BH4 presence POST: body spoof memberId/email bị BỎ — chỉ ghi session identity
 *   BH5 payment confirm: history row có changed_by_member_id = session admin
 *   BH6 payment reject: history row có changed_by_member_id = session admin
 *
 * MOCK TESTS (fake PostgREST trong tests/helpers/fakeOrderDb.ts). Không chứng
 * minh PostgreSQL concurrency hay runtime ACL thật.
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const ADMIN_ID = "33333333-3333-3333-3333-333333333333";
const STAFF_ID = "55555555-5555-5555-5555-555555555555";

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
    return {
      format: "module",
      shortCircuit: true,
      source: 'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { "content-type": "application/json" } }); } }',
    };
  }
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export function createAdminClient() { return globalThis.__fakeOrderDb; }",
    };
  }
  if (url === "mock:server-auth") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        "export async function requireAdmin() { return { authorized: true, user: { memberId: '${ADMIN_ID}', email: 'admin@test.local', role: 'admin' } }; }" +
        "export async function requireAuth() { return { authorized: true, user: { memberId: '${STAFF_ID}', email: 'staff@test.local', role: 'btc_sale' } }; }" +
        "export async function getAuthenticatedUser() { return { memberId: '${ADMIN_ID}', role: 'admin' }; }" +
        "export function createOrderProofToken(code) { return 'tok-' + code; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { POST: PAYMENT_POST } = await import("../src/app/api/orders/payment/route.ts");
const { POST: SEPAY_POST } = await import("../src/app/api/webhook/sepay/route.ts");
const { POST: PRESENCE_POST, GET: PRESENCE_GET } = await import("../src/app/api/members/presence/route.ts");

// Key test deterministic — không đụng/đọc secret thật
const TEST_SEPAY_KEY = "sepay-test-key-batch4b";
const env = process.env as Record<string, string | undefined>;
env.SEPAY_API_KEY = TEST_SEPAY_KEY;
if (env.NODE_ENV === "production") env.NODE_ENV = "test";

const ORDER_ID = "66666666-6666-6666-6666-666666666666";
const ORDER_CODE = "GM-BH4B";
const FINAL_AMOUNT = 200000;

const g = globalThis as unknown as { __fakeOrderDb?: unknown };

function seedDb(): FakeOrderDb {
  const db = createFakeOrderDb({
    products: [],
    product_variants: [],
    vouchers: [],
    customers: [],
    members: [],
    order_items: [],
    order_status_history: [],
    order_idempotency: [],
    system_configs: [],
    payments: [],
    orders: [
      {
        order_id: ORDER_ID,
        order_code: ORDER_CODE,
        customer_id: null,
        order_status: "pending",
        payment_status: "pending",
        final_amount: FINAL_AMOUNT,
        internal_note: null,
        confirmed_at: null,
        cancelled_at: null,
        cancel_reason: null,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  g.__fakeOrderDb = db;
  return db;
}

function sepayReq(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return SEPAY_POST(
    new Request("http://localhost/api/webhook/sepay", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
}

function paymentReq(body: unknown): Promise<Response> {
  return PAYMENT_POST(
    new Request("http://localhost/api/orders/payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function presenceReq(body: unknown): Promise<Response> {
  return PRESENCE_POST(
    new Request("http://localhost/api/members/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function presenceGetReq(): Promise<Response> {
  return PRESENCE_GET(new Request("http://localhost/api/members/presence", { method: "GET" }));
}

type JsonBody = Record<string, unknown> & { presence: Record<string, unknown> };

const json = async (res: Response): Promise<JsonBody> => {
  const body: unknown = await res.json();
  assert.ok(body && typeof body === "object" && !Array.isArray(body));
  return body as JsonBody;
};
const historyOf = (db: FakeOrderDb): Row[] => db.tables.order_status_history ?? [];
const configsOf = (db: FakeOrderDb): Row[] => db.tables.system_configs ?? [];

test("BH1 — sepay sai API key → 401, success:false", async () => {
  seedDb();
  const res = await sepayReq(
    { transactionContent: "ping" },
    { authorization: `Apikey ${TEST_SEPAY_KEY}-wrong` }
  );
  assert.equal(res.status, 401);
  const body = await json(res);
  assert.equal(body.success, false);
});

test("BH1b — sepay thiếu key khi đã cấu hình → 401", async () => {
  seedDb();
  const res = await sepayReq({ transactionContent: "ping" }, {});
  assert.equal(res.status, 401);
});

test("BH2 — sepay đúng key (Authorization: Apikey) → pass auth, test ping 200", async () => {
  seedDb();
  const res = await sepayReq({}, { authorization: `Apikey ${TEST_SEPAY_KEY}` });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.test, true);
});

test("BH3 — sepay đúng key qua header x-api-key → pass auth", async () => {
  seedDb();
  const res = await sepayReq({}, { "x-api-key": TEST_SEPAY_KEY });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.test, true);
});

test("BH3b — canonical SePay reference resolves exactly and continues through atomic amount handling", async () => {
  const db = seedDb();
  db.tables.orders[0].order_code = "GM-261027-000001";
  db.tables.orders[0].final_amount = 85000;
  const payloads: Record<string, unknown>[] = [];
  db.rpcHandler = (name, args) => {
    assert.equal(name, "apply_payment_event");
    payloads.push(args.p as Record<string, unknown>);
    return { data: { outcome: "applied", order_id: ORDER_ID, payment_status: "paid", order_status: "confirmed" }, error: null };
  };
  const res = await sepayReq(
    { transactionContent: "THANH TOAN GM_261027_000001 CAM ON", referenceNumber: "SEP-BH3B", amountIn: 85000 },
    { authorization: `Apikey ${TEST_SEPAY_KEY}` },
  );
  assert.equal(res.status, 200);
  assert.equal(payloads[0]?.order_code, "GM-261027-000001");
  assert.equal(payloads[0]?.amount, 85000);
});

test("BH3c — reported GM-26102700 fixture matches only the exact legacy order", async () => {
  const db = seedDb();
  db.tables.orders[0].order_code = "GM-26102700";
  db.tables.orders[0].final_amount = 85000;
  let matchedCode: unknown;
  db.rpcHandler = (_name, args) => {
    matchedCode = (args.p as Record<string, unknown>).order_code;
    return { data: { outcome: "applied", order_id: ORDER_ID, payment_status: "paid", order_status: "confirmed" }, error: null };
  };
  const res = await sepayReq(
    { transactionContent: "CK GM-26102700", referenceNumber: "SEP-BH3C", amountIn: 85000 },
    { authorization: `Apikey ${TEST_SEPAY_KEY}` },
  );
  assert.equal(res.status, 200);
  assert.equal(matchedCode, "GM-26102700");
});

test("BH3d — two existing exact order references fail closed as ambiguous", async () => {
  const db = seedDb();
  db.tables.orders = [
    { ...db.tables.orders[0], order_id: ORDER_ID, order_code: "GM-1234" },
    { ...db.tables.orders[0], order_id: "77777777-7777-4777-8777-777777777777", order_code: "GM-12345" },
  ];
  let rpcCalled = false;
  db.rpcHandler = () => { rpcCalled = true; return { data: null, error: null }; };
  const res = await sepayReq(
    { transactionContent: "GM-1234 / GM-12345", referenceNumber: "SEP-BH3D", amountIn: 85000 },
    { authorization: `Apikey ${TEST_SEPAY_KEY}` },
  );
  const body = await json(res);
  assert.equal(body.outcome, "ambiguous_order_reference");
  assert.equal(body.needs_review, true);
  assert.equal(rpcCalled, false);
});

test("BH4 — presence POST: body spoof memberId/email bị bỏ, chỉ ghi session identity", async () => {
  const db = seedDb();
  const res = await presenceReq({
    memberId: "evil-9999-spoof",
    email: "evil@spoof.local",
  });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.ok(body.presence[STAFF_ID], "presence có session memberId");
  assert.ok(body.presence["staff@test.local"], "presence có session email");
  assert.ok(!("evil-9999-spoof" in body.presence), "không ghi memberId spoof từ body");
  assert.ok(!("evil@spoof.local" in body.presence), "không ghi email spoof từ body");
  // persisted vào system_configs
  const cfg = configsOf(db).find((c) => c.config_key === "members_online_presence");
  assert.ok(cfg, "presence được upsert vào system_configs");
  const persisted = JSON.parse(String(cfg!.config_value)) as Record<string, unknown>;
  assert.ok(persisted[STAFF_ID], "persisted map có session identity");
  assert.ok(!("evil-9999-spoof" in persisted), "persisted map không có spoof key");
});

test("BH5 — payment confirm forwards session admin to atomic history/audit writer", () => {
  const route = readFileSync(new URL("../src/app/api/orders/payment/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/023_payment_integrity.sql", import.meta.url), "utf8");
  assert.match(route, /admin_member_id:\s*authCheck\.user\.memberId/);
  assert.match(migration, /changed_by_member_id/);
  assert.match(migration, /v_admin_id/);
});

test("BH6 — payment cancellation delegates actor identity and free-text reason to atomic RPC", async () => {
  const db = seedDb();
  let capturedActor: unknown;
  db.rpcHandler = (name, args) => {
    assert.equal(name, "reject_payment_atomic");
    capturedActor = (args.p as Record<string, unknown>).actor_member_id;
    return {
      data: { outcome: "rejected", order_id: ORDER_ID, order_code: ORDER_CODE, payment_status: "failed" },
      error: null,
    };
  };
  const res = await paymentReq({ orderCode: ORDER_CODE, action: "cancel", reason: "Lý do tùy ý: khách đổi ý ✓" });
  assert.equal(res.status, 200);
  assert.equal(capturedActor, ADMIN_ID);
  assert.equal(historyOf(db).length, 0, "route không còn writer history ngoài transaction RPC");
});

// C11 — presence fail-closed (lỗi DB không được mask thành success:true).
// RMW race trên map JSON vẫn CÒN: atomic fix cần RPC jsonb merge (migration)
// — blocked theo policy migration, không "fix" bằng retry giả trong TS.

test("BH7 — presence GET: lỗi đọc system_configs → 500 success:false (không mask)", async () => {
  const db = seedDb();
  db.hook = (ctx) => {
    if (ctx.table === "system_configs" && ctx.op === "select") {
      return { error: { message: "db read down" } };
    }
    return;
  };
  const res = await presenceGetReq();
  assert.equal(res.status, 500);
  const body = await json(res);
  assert.equal(body.success, false);
  assert.deepEqual(body.presence, {});
});

test("BH8 — presence POST: lỗi đọc → 500, KHÔNG upsert (không ghi đè mất member khác)", async () => {
  const db = seedDb();
  db.hook = (ctx) => {
    if (ctx.table === "system_configs" && ctx.op === "select") {
      return { error: { message: "db read down" } };
    }
    return;
  };
  const res = await presenceReq({});
  assert.equal(res.status, 500);
  const body = await json(res);
  assert.equal(body.success, false);
  assert.equal(configsOf(db).length, 0, "không upsert khi đọc lỗi");
});

test("BH9 — presence POST: upsert lỗi → 500 success:false (không báo heartbeat đã lưu)", async () => {
  const db = seedDb();
  db.hook = (ctx) => {
    if (ctx.table === "system_configs" && ctx.op === "upsert") {
      return { error: { message: "db write down" } };
    }
    return;
  };
  const res = await presenceReq({});
  assert.equal(res.status, 500);
  const body = await json(res);
  assert.equal(body.success, false);
});
