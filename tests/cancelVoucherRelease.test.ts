import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * Batch 2A-1 — MOCK contract tests cho nhánh hủy đơn của PATCH /api/orders.
 * Route gọi RPC public.cancel_order_atomic (migration 017) thay vì tự
 * CAS-flip + releaseVoucherSlot như trước.
 *
 * ĐÂY LÀ MOCK TESTS: fake supabase mô phỏng hợp đồng outcome của RPC ở mức
 * route quan sát được (args truyền xuống, outcome → HTTP mapping, lỗi → 500).
 * Bằng chứng transaction/locking/concurrency THẬT nằm ở
 * tests/cancelOrderPg.integration.test.ts (tự SKIP khi thiếu pg /
 * ATOMIC_PG_URL) — KHÔNG tuyên bố atomicity đã nghiệm thu từ file này.
 *
 * MAP TỪ BỘ TEST CŨ (C1–C9 — PostgREST CAS flip + releaseVoucherSlot):
 *   C1 (hủy lần đầu, decrement đúng 1 lần)      → M1 (route gọi RPC đúng
 *                                                 args, 1 lần) + PG T1
 *                                                 (side effect thật)
 *   C2 (hủy lại → idempotent)                   → M2 + PG T1 (lần 2 already)
 *   C3 (2 req đồng thời ≤ 1 decrement)           → PG T9 (lock FOR UPDATE
 *                                                 thật) — route-level không
 *                                                 còn CAS để mô phỏng
 *   C4 (không voucher → không decrement)         → PG T4 (no_voucher thật)
 *   C5 (DB error → 500, không side effect)       → M6 (rpc error → 500
 *                                                 retryable; side effect do
 *                                                 tx rollback — PG T7)
 *   C6 (release fail SAU cancel → vẫn 200)       → ĐÃ ĐỔI HỢP ĐỒNG theo
 *                                                 2A-PRE phần C: release
 *                                                 fail giờ RAISE trong tx →
 *                                                 rollback toàn bộ → 500
 *                                                 retryable:false +
 *                                                 needsRecon (M6b + PG T7).
 *                                                 KHÔNG còn "success giả".
 *   C7 (voucher đã xóa — FK SET NULL)            → PG T4 (xóa voucher thật)
 *   C8 (PATCH paymentStatus)                     → M9 (Batch 1: 400, đóng
 *                                                 bypass — trước đây 200
 *                                                 generic path)
 *   C9 (hủy theo order_code → idempotent)       → M10 (normalize args) +
 *                                                 PG T8 (code path thật)
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "next/server": "mock:next-server",
  "@/lib/supabase/admin": "mock:supabase-admin",
  "@/lib/services/configService": "mock:config-service",
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
  if (url === "mock:supabase-admin") {
    return { format: "module", shortCircuit: true, source: 'export function createAdminClient() { return globalThis.__fakeCancelDb; }' };
  }
  if (url === "mock:config-service") {
    return { format: "module", shortCircuit: true, source: 'export async function getSystemSettingsServer() { return { flatShippingFee: 25000, freeShippingThreshold: 0 }; }' };
  }
  if (url === "mock:server-auth") {
    return { format: "module", shortCircuit: true, source: 'export async function requireAdmin() { if (globalThis.__fakeAuthDeny) { return { authorized: false, response: new Response(JSON.stringify({ success: false, error: "Yêu cầu đăng nhập quản trị viên (401 Unauthorized)" }), { status: 401 }) }; } return { authorized: true, user: { memberId: "33333333-3333-3333-3333-333333333333", role: "admin" } }; } export async function requireAuth() { return { authorized: true }; } export async function getAuthenticatedUser() { return { role: "admin" }; } export function createOrderProofToken(code) { return "proof-" + code; } export function verifyOrderProofToken() { return false; }' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { PATCH } = await import("../src/app/api/orders/route.ts");

type FakeRow = Record<string, unknown>;

type CancelWorld = {
  orders: FakeRow[];
  vouchers: FakeRow[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  fromCalls: Array<{ table: string; action: string; payload?: unknown }>;
  effects: { flips: number; voucherReleases: number };
  force: {
    rpcThrow?: string | null;
    rpcError?: { message: string; details?: string } | null;
    rpcOutcome?: string | null;
  };
};

function emptyWorld(): CancelWorld {
  return {
    orders: [],
    vouchers: [],
    rpcCalls: [],
    fromCalls: [],
    effects: { flips: 0, voucherReleases: 0 },
    force: {},
  };
}

// PostgREST fake — chỉ dùng cho nhánh PATCH KHÔNG phải cancel (generic path)
class PatchQuery {
  private table: string;
  private world: CancelWorld;
  private op: "select" | "insert" | "update" | null = null;
  private filters: Array<{ kind: string; key: string; value: unknown }> = [];
  private payload: unknown = null;
  private selectCols: string | null = null;

  constructor(table: string, world: CancelWorld) {
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
    return this.exec("many").then(onFulfilled ?? undefined, onRejected ?? undefined);
  }

  private matches(row: FakeRow): boolean {
    for (const f of this.filters) {
      if (f.kind === "eq" && row[f.key] !== f.value) return false;
      if (f.kind === "neq" && row[f.key] === f.value) return false;
    }
    return true;
  }

  private async exec(_mode: "many"): Promise<{ data: unknown; error: unknown }> {
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

/**
 * Fake RPC mô phỏng HỢP ĐỒNG quan sát được của cancel_order_atomic:
 * not_found / already_cancelled / not_cancellable / cancelled + side effect
 * (flip + release voucher) xảy ra đúng 1 lần cho lần hủy đầu. Kiểm tra
 * voucher times_used=0 trả lỗi B2A1:VOUCHER_RELEASE_UNSAFE TRƯỚC khi đụng
 * dữ liệu — tương đương rollback toàn tx trong DB thật (không có thay đổi nào).
 */
function createFakeSupabase(world: CancelWorld) {
  return {
    from(table: string) {
      return new PatchQuery(table, world);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      world.rpcCalls.push({ name, args });

      if (world.force.rpcThrow) throw new Error(world.force.rpcThrow);
      if (world.force.rpcError) return { data: null, error: world.force.rpcError };
      if (world.force.rpcOutcome) return { data: { outcome: world.force.rpcOutcome }, error: null };
      if (name !== "cancel_order_atomic") {
        return { data: null, error: { message: `unknown rpc: ${name}` } };
      }

      const payload = args.p as Record<string, unknown>;
      let order: FakeRow | undefined;
      if (payload.order_id) {
        order = world.orders.find((o) => o.order_id === payload.order_id);
      } else if (payload.order_code) {
        order = world.orders.find((o) => String(o.order_code) === payload.order_code);
      }
      if (!order) return { data: { outcome: "not_found" }, error: null };

      const status = String(order.order_status);
      if (status === "cancelled") {
        return {
          data: {
            outcome: "already_cancelled",
            orderId: order.order_id,
            orderCode: order.order_code,
            cancelledAt: order.cancelled_at ?? null,
            stockRestoredAt: order.stock_restored_at ?? null,
            voucherReleasedAt: order.voucher_released_at ?? null,
          },
          error: null,
        };
      }
      if (status !== "pending" && status !== "confirmed" && status !== "processing") {
        return {
          data: {
            outcome: "not_cancellable",
            currentStatus: status,
            allowedFrom: ["pending", "confirmed", "processing"],
          },
          error: null,
        };
      }

      const voucher = order.voucher_id
        ? world.vouchers.find((v) => v.voucher_id === order.voucher_id)
        : null;
      if (order.voucher_id && (!voucher || Number(voucher.times_used) <= 0)) {
        return {
          data: null,
          error: {
            message: "Không thể giải phóng voucher slot an toàn (times_used đã = 0)",
            details: "B2A1:VOUCHER_RELEASE_UNSAFE",
          },
        };
      }

      // Side effect (mô phỏng tx thành công — all-or-nothing)
      const now = new Date().toISOString();
      order.order_status = "cancelled";
      order.cancelled_at = now;
      if (payload.reason) order.cancel_reason = payload.reason;
      order.stock_restored_at = now;
      world.effects.flips += 1;

      let voucherOutcome = "no_voucher";
      if (voucher) {
        voucher.times_used = Number(voucher.times_used) - 1;
        order.voucher_released_at = now;
        world.effects.voucherReleases += 1;
        voucherOutcome = "released";
      }

      return {
        data: {
          outcome: "cancelled",
          orderId: order.order_id,
          orderCode: order.order_code,
          cancelledAt: now,
          stock: { restoredLines: 0, variants: [] },
          voucher: { outcome: voucherOutcome, voucherId: order.voucher_id ?? null },
          unrestoredLines: [],
          notes: [],
          needsRecon: false,
        },
        error: null,
      };
    },
  };
}

const VOUCHER_ID = "11111111-1111-1111-1111-111111111111";
const ORDER_ID = "22222222-2222-2222-2222-222222222222";
const UNKNOWN_ID = "99999999-9999-9999-9999-999999999999";
const ADMIN_MEMBER_ID = "33333333-3333-3333-3333-333333333333";

function seedOrder(
  world: CancelWorld,
  opts: { voucherId?: string | null; status?: string; code?: string } = {}
) {
  const { voucherId = null, status = "pending", code = "GM-TEST1" } = opts;
  world.orders.push({
    order_id: ORDER_ID,
    order_code: code,
    order_status: status,
    voucher_id: voucherId,
    cancelled_at: null,
    cancel_reason: null,
    stock_restored_at: null,
    voucher_released_at: null,
  });
  if (voucherId) {
    world.vouchers.push({ voucher_id: voucherId, times_used: 1 });
  }
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

const g = globalThis as unknown as { __fakeCancelDb?: unknown; __fakeAuthDeny?: boolean };

test("M1 — hủy lần đầu: gọi RPC đúng args (1 lần), 200 outcome=cancelled, effects x1", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Body;
  assert.equal(body.success, true);
  assert.equal(body.outcome, "cancelled");
  assert.equal((body.voucher as Body).outcome, "released");

  assert.equal(world.rpcCalls.length, 1, "phải gọi RPC đúng 1 lần (không CAS qua .from)");
  assert.equal(world.rpcCalls[0].name, "cancel_order_atomic");
  const cancelPayload = world.rpcCalls[0].args.p as Record<string, unknown>;
  assert.equal(cancelPayload.order_id, ORDER_ID);
  assert.equal(cancelPayload.order_code, null);
  assert.equal(cancelPayload.reason, null);
  assert.equal(cancelPayload.actor_member_id, ADMIN_MEMBER_ID);

  assert.equal(world.fromCalls.length, 0, "không dùng PostgREST .from() cho nhánh cancel");
  assert.equal(world.effects.flips, 1);
  assert.equal(world.effects.voucherReleases, 1);
  assert.equal(world.vouchers[0].times_used, 0);
  assert.equal(world.orders[0].order_status, "cancelled");
  assert.ok(world.orders[0].cancelled_at);
});

test("M2 — hủy lần 2: 200 outcome=already_cancelled + alreadyCancelled, KHÔNG side effect đôi", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  g.__fakeCancelDb = createFakeSupabase(world);

  await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  const res2 = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res2.status, 200);
  const body2 = (await res2.json()) as Body;
  assert.equal(body2.success, true);
  assert.equal(body2.outcome, "already_cancelled");
  assert.equal(body2.alreadyCancelled, true);

  assert.equal(world.rpcCalls.length, 2);
  assert.equal(world.effects.flips, 1, "flip chỉ 1 lần");
  assert.equal(world.effects.voucherReleases, 1, "release chỉ 1 lần");
  assert.equal(world.vouchers[0].times_used, 0);
});

test("M3 — đơn không tồn tại: 404 outcome=not_found, không giả lập thành công", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: UNKNOWN_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 404);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.outcome, "not_found");
  assert.match(String(body.error), /không tồn tại/i);
  assert.equal(world.effects.flips, 0);
  assert.equal(world.effects.voucherReleases, 0);
  assert.equal(world.orders[0].order_status, "pending");
});

test("M4 — trạng thái không cho hủy (completed): 409 outcome=not_cancellable, không đổi dữ liệu", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: null, status: "completed" });
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.outcome, "not_cancellable");
  assert.equal(body.currentStatus, "completed");
  assert.deepEqual(body.allowedFrom, ["pending", "confirmed", "processing"]);
  assert.equal(world.effects.flips, 0);
  assert.equal(world.orders[0].order_status, "completed");
});

test("M5 — RPC throw (mạng): 500 retryable=true, không side effect", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  world.force.rpcThrow = "fetch failed";
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.retryable, true);
  assert.match(String(body.error), /fetch failed/);
  assert.equal(world.effects.flips, 0);
  assert.equal(world.orders[0].order_status, "pending");
  assert.equal(world.vouchers[0].times_used, 1);
});

test("M6 — RPC trả lỗi DB (PostgREST error): 500 retryable=true", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  world.force.rpcError = { message: "permission denied for table orders" };
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.retryable, true);
  assert.equal(body.needsRecon, undefined, "lỗi DB thường không phải case đối soát");
  assert.equal(world.effects.flips, 0);
});

test("M6b — VOUCHER_RELEASE_UNSAFE (RAISE trong tx): 500 retryable=false + needsRecon (thay kỳ vọng C6 cũ)", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  world.force.rpcError = {
    message: "Không thể giải phóng voucher slot an toàn (times_used đã = 0) cho đơn GM-TEST1",
    details: "B2A1:VOUCHER_RELEASE_UNSAFE",
  };
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false, "KHÔNG được trả success giả khi release voucher fail (đổi hợp đồng so với C6)");
  assert.equal(body.retryable, false, "lỗi dữ liệu lệch — retry không tự hết");
  assert.equal(body.needsRecon, true);
  assert.equal(world.effects.flips, 0);
  assert.equal(world.orders[0].order_status, "pending");
  assert.equal(world.vouchers[0].times_used, 1);
});

test("M7 — outcome lạ từ RPC: 500, KHÔNG BAO GIỜ trả success", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  world.force.rpcOutcome = "banana";
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.retryable, true);
  assert.match(String(body.error), /banana/);
});

test("M8 — thiếu cả orderCode và orderId: 400, không gọi RPC", async () => {
  const world = emptyWorld();
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderStatus: "cancelled" });
  assert.equal(res.status, 400);
  assert.equal(world.rpcCalls.length, 0);
});

test("M9 — PATCH paymentStatus bị TỪ CHỐI (Batch 1 đóng bypass): 400, payment_status giữ nguyên, không RPC", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  world.orders[0].payment_status = "pending";
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, paymentStatus: "paid" });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Body;
  assert.equal(body.success, false);
  assert.equal(body.error, "paymentStatus chỉ đổi qua /api/orders/payment");
  assert.equal(world.rpcCalls.length, 0, "không gọi cancel_order_atomic cho PATCH bị reject");
  assert.equal(world.effects.flips, 0);
  assert.equal(world.orders[0].order_status, "pending");
  assert.equal(world.orders[0].payment_status, "pending", "payment_status KHÔNG được cập nhật");
  assert.equal(world.vouchers[0].times_used, 1);
  assert.equal(
    world.fromCalls.filter((c) => c.action === "update").length,
    0,
    "không có UPDATE nào chạm DB"
  );
});

test("M10a — hủy theo orderCode: normalize UPPER, p_order_id=null", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID, code: "GM-TEST1" });
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderCode: "gm-test1", orderStatus: "cancelled" });
  assert.equal(res.status, 200);
  const cancelPayload = world.rpcCalls[0].args.p as Record<string, unknown>;
  assert.equal(cancelPayload.order_id, null);
  assert.equal(cancelPayload.order_code, "GM-TEST1");
  assert.equal(world.effects.flips, 1);
});

test("M10b — orderId không phải UUID (chuỗi code): chuyển thành p_order_code UPPER", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: null, code: "GM-UPPER" });
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: "gm-upper", orderStatus: "cancelled" });
  assert.equal(res.status, 200);
  const cancelPayload = world.rpcCalls[0].args.p as Record<string, unknown>;
  assert.equal(cancelPayload.order_id, null);
  assert.equal(cancelPayload.order_code, "GM-UPPER");
});

test("M11 — requireAdmin từ chối: 401, không gọi RPC", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  g.__fakeCancelDb = createFakeSupabase(world);
  g.__fakeAuthDeny = true;

  try {
    const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
    assert.equal(res.status, 401);
    assert.equal(world.rpcCalls.length, 0);
    assert.equal(world.effects.flips, 0);
  } finally {
    g.__fakeAuthDeny = false;
  }
});

test("M12 — retry sau lỗi giữa chừng: 500 không đụng state, lần sau vẫn already_cancelled (không side effect đôi)", async () => {
  const world = emptyWorld();
  seedOrder(world, { voucherId: VOUCHER_ID });
  g.__fakeCancelDb = createFakeSupabase(world);

  // Lần 1: thành công
  const res1 = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res1.status, 200);
  assert.equal(world.effects.flips, 1);
  assert.equal(world.vouchers[0].times_used, 0);

  // Lần 2: lỗi giữa chừng (mô phỏng timeout) → 500, state giữ nguyên
  world.force.rpcError = { message: "frontend timeout" };
  const res2 = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res2.status, 500);
  assert.equal(((await res2.json()) as Body).retryable, true);
  assert.equal(world.effects.flips, 1, "lỗi không tạo thêm side effect");

  // Lần 3: lỗi hết → already_cancelled (idempotent), vẫn chỉ 1 side effect
  world.force.rpcError = null;
  const res3 = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res3.status, 200);
  const body3 = (await res3.json()) as Body;
  assert.equal(body3.outcome, "already_cancelled");
  assert.equal(body3.alreadyCancelled, true);
  assert.equal(world.effects.flips, 1);
  assert.equal(world.effects.voucherReleases, 1);
  assert.equal(world.vouchers[0].times_used, 0);
});

beforeEach(() => {
  g.__fakeCancelDb = undefined;
  g.__fakeAuthDeny = false;
});
