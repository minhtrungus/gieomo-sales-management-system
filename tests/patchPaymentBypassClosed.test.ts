import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

/**
 * Batch 1 — ĐÓNG PATCH BYPASS payment_status trên PATCH /api/orders.
 *
 * Server reject own-property `paymentStatus`/`payment_status` (kể cả null/""/
 * giá trị trùng trạng thái hiện tại) bằng 400 TRƯỚC mọi DB write; request
 * trộn payment field với field hợp lệ bị reject toàn bộ (không update partial).
 * Client: updateStoredPaymentStatus (fire-and-forget PATCH) ĐÃ XÓA; không còn
 * caller UI gửi payment field qua PATCH tổng quát.
 *
 * ĐÂY LÀ MOCK TESTS (fake PostgREST + fake requireAdmin) — hành vi quan sát
 * được ở route. PostgreSQL concurrency thật nằm ở các *.Pg.integration.test.ts
 * (SKIP khi thiếu pg/ATOMIC_PG_URL).
 *
 * Map tests:
 *   BP1  PATCH paymentStatus="paid"  → 400, payment_status giữ nguyên       → "BP1 ..."
 *   BP2  PATCH payment_status="paid" (snake_case) → 400                     → "BP2 ..."
 *   BP3a PATCH paymentStatus=null    → 400                                  → "BP3a ..."
 *   BP3b PATCH paymentStatus=""      → 400                                  → "BP3b ..."
 *   BP4  trộn orderStatus+paymentStatus → 400, KHÔNG update partial        → "BP4 ..."
 *   BP5  PATCH orderStatus hợp lệ    → 200, payment_status không đụng       → "BP5 ..."
 *   BP6  unauthorized → 401, 0 DB call                                      → "BP6 ..."
 *   BP7  source: không còn helper/caller PATCH payment field                → "BP7 ..."
 *   BP8  source: confirm thanh toán vẫn qua /api/orders/payment             → "BP8 ..."
 */

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
      return await nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
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
      source:
        'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { "content-type": "application/json" } }); } }',
    };
  }
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: 'export function createAdminClient() { return globalThis.__fakePatchBypassDb; }',
    };
  }
  if (url === "mock:server-auth") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        'export async function requireAdmin() { if (globalThis.__fakePatchBypassAuthDeny) { return { authorized: false, response: new Response(JSON.stringify({ success: false, error: "Yêu cầu đăng nhập quản trị viên (401 Unauthorized)" }), { status: 401 }) }; } return { authorized: true, user: { memberId: "33333333-3333-3333-3333-333333333333", role: "admin" } }; } export async function requireAuth() { return { authorized: true }; } export async function getAuthenticatedUser() { return { role: "admin" }; } export function createOrderProofToken(code) { return "proof-" + code; }',
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { PATCH } = await import("../src/app/api/orders/route.ts");

type FakeRow = Record<string, unknown>;

type World = {
  orders: FakeRow[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  fromCalls: Array<{ table: string; action: string; payload?: unknown }>;
};

function emptyWorld(): World {
  return { orders: [], rpcCalls: [], fromCalls: [] };
}

class PatchQuery {
  private table: string;
  private world: World;
  private op: "select" | "insert" | "update" | null = null;
  private filters: Array<{ kind: string; key: string; value: unknown }> = [];
  private payload: unknown = null;
  private selectCols: string | null = null;

  constructor(table: string, world: World) {
    this.table = table;
    this.world = world;
  }

  select(cols?: string) {
    if (this.op === null) this.op = "select";
    this.selectCols = cols ?? "*";
    return this;
  }

  insert(payload: unknown) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push({ kind: "eq", key, value });
    return this;
  }

  neq(key: string, value: unknown) {
    this.filters.push({ kind: "neq", key, value });
    return this;
  }

  then<A, B>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): Promise<A | B> {
    return this.exec().then(onFulfilled ?? undefined, onRejected ?? undefined);
  }

  private matches(row: FakeRow): boolean {
    for (const f of this.filters) {
      if (f.kind === "eq" && row[f.key] !== f.value) return false;
      if (f.kind === "neq" && row[f.key] === f.value) return false;
    }
    return true;
  }

  private async exec(): Promise<{ data: unknown; error: unknown }> {
    const world = this.world;
    world.fromCalls.push({ table: this.table, action: this.op ?? "unknown", payload: this.payload });

    if (this.op === "update" && this.table === "orders") {
      const matched = world.orders.filter((r) => this.matches(r));
      for (const row of matched) Object.assign(row, this.payload as object);
      return { data: this.selectCols ? matched : null, error: null };
    }
    if (this.op === "select") {
      const matched = world.orders.filter((r) => this.matches(r)).map((r) => ({ ...r }));
      return { data: matched, error: null };
    }
    return { data: null, error: null };
  }
}

function createFakeSupabase(world: World) {
  return {
    from(table: string) {
      return new PatchQuery(table, world);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      world.rpcCalls.push({ name, args });
      return { data: null, error: { message: `rpc không mong đợi trong test: ${name}` } };
    },
  };
}

const ORDER_ID = "22222222-2222-2222-2222-222222222222";

function seedOrder(world: World, opts: { status?: string; paymentStatus?: string } = {}) {
  const { status = "pending", paymentStatus = "pending" } = opts;
  world.orders.push({
    order_id: ORDER_ID,
    order_code: "GM-BP1",
    order_status: status,
    payment_status: paymentStatus,
  });
}

function patchRequest(body: unknown): Promise<Response> {
  return PATCH(
    new Request("http://localhost/api/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

type Body = Record<string, unknown>;

const g = globalThis as unknown as {
  __fakePatchBypassDb?: unknown;
  __fakePatchBypassAuthDeny?: boolean;
};

test("BP1 — PATCH paymentStatus='paid' → 400, payment_status giữ nguyên, 0 update, 0 rpc", async () => {
  const world = emptyWorld();
  seedOrder(world);
  g.__fakePatchBypassDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, paymentStatus: "paid" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.error, "paymentStatus chỉ đổi qua /api/orders/payment");
  assert.equal(world.orders[0].payment_status, "pending");
  assert.equal(world.orders[0].order_status, "pending");
  assert.equal(world.fromCalls.filter((c) => c.action === "update").length, 0);
  assert.equal(world.rpcCalls.length, 0);
});

test("BP2 — PATCH payment_status='paid' (snake_case) → 400, không update", async () => {
  const world = emptyWorld();
  seedOrder(world);
  g.__fakePatchBypassDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, payment_status: "paid" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(world.orders[0].payment_status, "pending");
  assert.equal(world.fromCalls.filter((c) => c.action === "update").length, 0);
});

test("BP3a — PATCH paymentStatus=null (own-property, không truthiness) → 400", async () => {
  const world = emptyWorld();
  seedOrder(world);
  g.__fakePatchBypassDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, paymentStatus: null });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(world.fromCalls.filter((c) => c.action === "update").length, 0);
});

test("BP3b — PATCH paymentStatus='' → 400", async () => {
  const world = emptyWorld();
  seedOrder(world);
  g.__fakePatchBypassDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, paymentStatus: "" });
  assert.equal(res.status, 400);
  assert.equal(world.fromCalls.filter((c) => c.action === "update").length, 0);
});

test("BP4 — trộn orderStatus+paymentStatus → 400 TOÀN BỘ, order_status KHÔNG đổi (không partial)", async () => {
  const world = emptyWorld();
  seedOrder(world, { status: "pending" });
  g.__fakePatchBypassDb = createFakeSupabase(world);

  const res = await patchRequest({
    orderId: ORDER_ID,
    orderStatus: "confirmed",
    paymentStatus: "paid",
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.error, "paymentStatus chỉ đổi qua /api/orders/payment");
  assert.equal(world.orders[0].order_status, "pending", "order_status KHÔNG được update (reject toàn bộ)");
  assert.equal(world.orders[0].payment_status, "pending");
  assert.equal(world.fromCalls.filter((c) => c.action === "update").length, 0);
  assert.equal(world.rpcCalls.length, 0);
});

test("BP5 — PATCH chỉ orderStatus='confirmed' → 200, order_status đổi, payment_status không đụng", async () => {
  const world = emptyWorld();
  seedOrder(world, { status: "pending", paymentStatus: "pending" });
  g.__fakePatchBypassDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "confirmed" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Body;
  assert.equal(body.success, true);
  assert.equal(world.orders[0].order_status, "confirmed");
  assert.equal(world.orders[0].payment_status, "pending", "PATCH hợp lệ không đụng payment_status");
  assert.equal(world.rpcCalls.length, 0, "confirmed không đi nhánh cancel RPC");
});

test("BP6 — unauthorized → 401, không đụng DB (kể cả request có paymentStatus)", async () => {
  const world = emptyWorld();
  seedOrder(world);
  g.__fakePatchBypassDb = createFakeSupabase(world);
  g.__fakePatchBypassAuthDeny = true;
  try {
    const res = await patchRequest({ orderId: ORDER_ID, paymentStatus: "paid" });
    assert.equal(res.status, 401);
    assert.equal(world.fromCalls.length, 0, "không gọi DB khi chưa authorize");
    assert.equal(world.rpcCalls.length, 0);
  } finally {
    g.__fakePatchBypassAuthDeny = false;
  }
});

test("BP7 — source: không còn helper/caller gửi payment field qua PATCH tổng quát", () => {
  const orderStore = readFileSync(new URL("lib/data/orderStore.ts", SRC_ROOT), "utf8");
  assert.doesNotMatch(
    orderStore,
    /export function updateStoredPaymentStatus/,
    "updateStoredPaymentStatus đã bị xóa khỏi orderStore"
  );
  assert.doesNotMatch(
    orderStore,
    /method:\s*"PATCH"[\s\S]{0,400}paymentStatus/,
    "orderStore không còn PATCH body chứa paymentStatus"
  );

  const detailPage = readFileSync(new URL("app/admin/orders/[id]/page.tsx", SRC_ROOT), "utf8");
  assert.doesNotMatch(
    detailPage,
    /updateStoredPaymentStatus/,
    "trang chi tiết không còn import/gọi updateStoredPaymentStatus"
  );

  const saleOrders = readFileSync(new URL("app/sale/orders/page.tsx", SRC_ROOT), "utf8");
  assert.doesNotMatch(
    saleOrders,
    /updateStoredPaymentStatus/,
    "sale/orders không còn import chết updateStoredPaymentStatus"
  );
});

test("BP8 — source: confirm thanh toán hợp lệ vẫn đi qua /api/orders/payment", () => {
  const paymentConfirm = readFileSync(new URL("lib/data/paymentConfirm.ts", SRC_ROOT), "utf8");
  assert.match(
    paymentConfirm,
    /PAYMENT_ENDPOINT\s*=\s*"\/api\/orders\/payment"/,
    "confirmPaymentServerFirst gọi /api/orders/payment"
  );

  const detailPage = readFileSync(new URL("app/admin/orders/[id]/page.tsx", SRC_ROOT), "utf8");
  assert.match(
    detailPage,
    /confirmPaymentServerFirst/,
    "trang chi tiết xác nhận thanh toán qua server-first pipeline"
  );

  const paymentRoute = readFileSync(new URL("app/api/orders/payment/route.ts", SRC_ROOT), "utf8");
  assert.match(
    paymentRoute,
    /\.rpc\("apply_payment_event"/,
    "payment route xác nhận qua atomic payment RPC"
  );
  assert.doesNotMatch(paymentRoute, /ADMIN-CONFIRM-/);
});
