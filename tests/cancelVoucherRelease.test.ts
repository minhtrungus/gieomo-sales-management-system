import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    return { format: "module", shortCircuit: true, source: 'export async function requireAdmin() { return { authorized: true, user: { memberId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" } }; } export async function requireAuth() { return { authorized: true, user: { memberId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" } }; } export async function getAuthenticatedUser() { return { memberId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin" }; } export function createOrderProofToken(code) { return "proof-" + code; }' };
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
  calls: Array<{ table: string; action: string; payload?: unknown }>;
  force: {
    ordersUpdateError?: { message: string } | null;
    voucherCasDecrementOverride?: () => { rowsAffected: number | null; error: string | null };
  };
  voucherDecAttempts: number;
};

function emptyWorld(): CancelWorld {
  return {
    orders: [],
    vouchers: [],
    calls: [],
    force: {},
    voucherDecAttempts: 0,
  };
}

function matchesEq(row: FakeRow, filters: Array<{ kind: string; key: string; value: unknown }>): boolean {
  for (const f of filters) {
    if (f.kind === "eq" && row[f.key] !== f.value) return false;
    if (f.kind === "neq" && row[f.key] === f.value) return false;
  }
  return true;
}

class CancelQuery {
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

  gte(key: string, value: unknown) {
    this.filters.push({ kind: "gte", key, value });
    return this;
  }

  gt(key: string, value: unknown) {
    this.filters.push({ kind: "gt", key, value });
    return this;
  }

  or() {
    return this;
  }

  ilike(key: string, value: unknown) {
    this.filters.push({ kind: "eq", key, value: String(value).toUpperCase() });
    return this;
  }

  maybeSingle() {
    return this.exec("maybe") as Promise<{ data: unknown; error: unknown }>;
  }

  single() {
    return this.exec("single") as Promise<{ data: unknown; error: unknown }>;
  }

  then<A, B>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): Promise<A | B> {
    return this.exec("many").then(onFulfilled ?? undefined, onRejected ?? undefined);
  }

  private rows(): FakeRow[] {
    if (this.table === "orders") return this.world.orders;
    if (this.table === "vouchers") return this.world.vouchers;
    return [];
  }

  private async exec(mode: "many" | "maybe" | "single"): Promise<{ data: unknown; error: unknown }> {
    const world = this.world;
    world.calls.push({ table: this.table, action: this.op ?? "unknown", payload: this.payload });

    if (this.op === "update") {
      if (this.table === "orders") {
        if (world.force.ordersUpdateError) {
          return { data: null, error: world.force.ordersUpdateError };
        }
        const matched = this.rows().filter((r) => matchesEq(r, this.filters));
        for (const row of matched) Object.assign(row, this.payload as object);
        if (this.selectCols) {
          return {
            data: matched.map((r) => ({
              order_id: r.order_id,
              voucher_id: r.voucher_id ?? null,
            })),
            error: null,
          };
        }
        return { data: null, error: null };
      }
      if (this.table === "vouchers") {
        const eqVoucher = this.filters.find((f) => f.key === "voucher_id");
        const eqTimes = this.filters.find((f) => f.key === "times_used");
        const row = this.rows().find((r) => r.voucher_id === eqVoucher?.value);
        if (!row || !eqTimes) return { data: [], error: null };
        const nextVal = Number((this.payload as FakeRow).times_used);
        const isInc = nextVal > Number(row.times_used);
        if (!isInc) {
          world.voucherDecAttempts++;
          if (world.force.voucherCasDecrementOverride) {
            const o = world.force.voucherCasDecrementOverride();
            return {
              data: o.rowsAffected === 1 ? [{ voucher_id: row.voucher_id }] : [],
              error: o.error ? { message: o.error } : null,
            };
          }
        }
        if (Number(row.times_used) !== Number(eqTimes.value)) {
          return { data: [], error: null };
        }
        const gtTimes = this.filters.find((f) => f.kind === "gt" && f.key === "times_used");
        if (gtTimes && Number(row.times_used) <= Number(gtTimes.value)) {
          return { data: [], error: null };
        }
        Object.assign(row, this.payload as object);
        world.calls.push({
          table: "vouchers",
          action: isInc ? "voucher-cas-increment" : "voucher-cas-decrement",
          payload: { times_used: row.times_used },
        });
        return { data: [{ voucher_id: row.voucher_id }], error: null };
      }
      return { data: null, error: null };
    }

    const matched = this.rows().filter((r) => matchesEq(r, this.filters)).map((r) => ({ ...r }));
    if (mode === "maybe") return { data: matched[0] ?? null, error: null };
    if (mode === "single") {
      return matched[0]
        ? { data: matched[0], error: null }
        : { data: null, error: { message: "No row" } };
    }
    return { data: matched, error: null };
  }
}

function createFakeSupabase(world: CancelWorld) {
  return {
    async rpc(name: string, args: { p: Record<string, unknown> }) {
      world.calls.push({ table: "rpc", action: name, payload: args });
      if (name !== "cancel_order_atomic") return { data: null, error: { message: "unexpected rpc" } };
      if (world.force.ordersUpdateError) return { data: null, error: world.force.ordersUpdateError };

      const order = world.orders.find((row) =>
        args.p.order_id ? row.order_id === args.p.order_id : row.order_code === args.p.order_code
      );
      if (!order) return { data: { outcome: "not_found" }, error: null };
      if (order.order_status === "cancelled") {
        return { data: { outcome: "already_cancelled", refund_required: false }, error: null };
      }

      const voucher = world.vouchers.find((row) => row.voucher_id === order.voucher_id);
      if (voucher && world.force.voucherCasDecrementOverride) {
        world.voucherDecAttempts++;
        const forced = world.force.voucherCasDecrementOverride();
        if (forced.error || forced.rowsAffected !== 1) {
          return { data: null, error: { message: forced.error || "voucher release failed" } };
        }
      }

      if (voucher) {
        voucher.times_used = Number(voucher.times_used) - 1;
        world.calls.push({ table: "vouchers", action: "voucher-cas-decrement", payload: { times_used: voucher.times_used } });
      }
      order.order_status = "cancelled";
      order.cancelled_at = new Date().toISOString();
      return { data: { outcome: "cancelled", refund_required: false }, error: null };
    },
    from(table: string) {
      return new CancelQuery(table, world);
    },
  };
}

const VOUCHER_ID = "11111111-1111-1111-1111-111111111111";
const ORDER_ID = "22222222-2222-2222-2222-222222222222";

function seedOrder(world: CancelWorld, voucherId: string | null, status = "pending") {
  world.orders.push({
    order_id: ORDER_ID,
    order_code: "GM-TEST1",
    order_status: status,
    voucher_id: voucherId,
  });
  world.vouchers.push({
    voucher_id: VOUCHER_ID,
    code: "CAS15K",
    status: "active",
    discount_type: "fixed_amount",
    discount_value: 15000,
    min_order_value: 0,
    usage_limit: null,
    times_used: 1,
    start_date: null,
    end_date: null,
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

function countAction(world: CancelWorld, action: string): number {
  return world.calls.filter((c) => c.action === action).length;
}

const g = globalThis as unknown as { __fakeCancelDb?: unknown };

test("C1 — hủy đơn lần đầu có voucher: decrement đúng 1 lần, cancelled_at được set", async () => {
  const world = emptyWorld();
  seedOrder(world, VOUCHER_ID);
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; alreadyCancelled?: boolean };
  assert.equal(body.success, true);
  assert.equal(body.alreadyCancelled, false);
  assert.equal(world.orders[0].order_status, "cancelled");
  assert.ok(world.orders[0].cancelled_at);
  assert.equal(countAction(world, "voucher-cas-decrement"), 1);
  assert.equal(world.vouchers[0].times_used, 0);
});

test("C2 — hủy lại cùng đơn: không decrement lần hai, alreadyCancelled", async () => {
  const world = emptyWorld();
  seedOrder(world, VOUCHER_ID);
  g.__fakeCancelDb = createFakeSupabase(world);

  await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  const res2 = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res2.status, 200);
  const body2 = (await res2.json()) as { success: boolean; alreadyCancelled?: boolean };
  assert.equal(body2.success, true);
  assert.equal(body2.alreadyCancelled, true);
  assert.equal(countAction(world, "voucher-cas-decrement"), 1);
  assert.equal(world.vouchers[0].times_used, 0);
});

test("C3 — hai yêu cầu hủy đồng thời: tối đa một lần decrement", async () => {
  const world = emptyWorld();
  seedOrder(world, VOUCHER_ID);
  g.__fakeCancelDb = createFakeSupabase(world);

  const [resA, resB] = await Promise.all([
    patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" }),
    patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" }),
  ]);
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);
  const decrements = countAction(world, "voucher-cas-decrement");
  assert.equal(decrements, 1, `mong đợi đúng 1 decrement, nhận ${decrements}`);
  assert.equal(world.vouchers[0].times_used, 0);
  assert.equal(world.orders[0].order_status, "cancelled");
});

test("C4 — hủy đơn không có voucher: không decrement", async () => {
  const world = emptyWorld();
  seedOrder(world, null);
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 200);
  assert.equal(countAction(world, "voucher-cas-decrement"), 0);
  assert.equal(world.vouchers[0].times_used, 1);
  assert.equal(world.orders[0].order_status, "cancelled");
});

test("C5 — hủy đơn thất bại (DB error): không decrement, trả 500", async () => {
  const world = emptyWorld();
  seedOrder(world, VOUCHER_ID);
  world.force.ordersUpdateError = { message: "update failed" };
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 500);
  assert.equal(countAction(world, "voucher-cas-decrement"), 0);
  assert.equal(world.vouchers[0].times_used, 1);
  assert.equal(world.orders[0].order_status, "pending");
});

test("C6 — voucher release failure aborts the atomic cancellation", async () => {
  const world = emptyWorld();
  seedOrder(world, VOUCHER_ID);
  world.force.voucherCasDecrementOverride = () => ({ rowsAffected: null, error: "release boom" });
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { success: boolean };
  assert.equal(body.success, false);

  assert.equal(world.orders[0].order_status, "pending");
  assert.equal(world.vouchers[0].times_used, 1, "không decrement khi CAS fail");
  assert.ok(world.voucherDecAttempts >= 1);
});

test("C7 — voucher đã xóa (voucher_id null do FK SET NULL): hủy thành công, không decrement", async () => {
  const world = emptyWorld();
  seedOrder(world, null);
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, orderStatus: "cancelled" });
  assert.equal(res.status, 200);
  assert.equal(world.orders[0].order_status, "cancelled");
  assert.equal(countAction(world, "voucher-cas-decrement"), 0);
});

test("C8 — generic paymentStatus PATCH is rejected without entering voucher release", async () => {
  const world = emptyWorld();
  seedOrder(world, VOUCHER_ID);
  const paymentStatusBefore = world.orders[0].payment_status;
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderId: ORDER_ID, paymentStatus: "paid" });
  assert.equal(res.status, 400);
  assert.equal(countAction(world, "voucher-cas-decrement"), 0);
  assert.equal(world.orders[0].order_status, "pending");
  assert.equal(world.orders[0].payment_status, paymentStatusBefore);
});

test("C9 — hủy theo order_code thay vì orderId: vẫn idempotent", async () => {
  const world = emptyWorld();
  seedOrder(world, VOUCHER_ID);
  g.__fakeCancelDb = createFakeSupabase(world);

  const res = await patchRequest({ orderCode: "GM-TEST1", orderStatus: "cancelled" });
  assert.equal(res.status, 200);
  assert.equal(countAction(world, "voucher-cas-decrement"), 1);
  const res2 = await patchRequest({ orderCode: "GM-TEST1", orderStatus: "cancelled" });
  const body2 = (await res2.json()) as { alreadyCancelled?: boolean };
  assert.equal(body2.alreadyCancelled, true);
  assert.equal(countAction(world, "voucher-cas-decrement"), 1);
});

test("C10 — admin UI awaits cancellation and advances only after a successful result", () => {
  const listPage = readFileSync(new URL("../src/app/admin/orders/page.tsx", import.meta.url), "utf8");
  const detailPage = readFileSync(new URL("../src/app/admin/orders/[id]/page.tsx", import.meta.url), "utf8");
  const store = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");

  assert.match(listPage, /await updateStoredOrderStatus\(pendingStatusChange\.orderId/);
  assert.match(detailPage, /const statusResult = await updateStoredOrderStatus/);
  assert.match(detailPage, /if \(!statusResult\.ok\)[\s\S]*?return;/);
  assert.match(store, /if \(!response\.ok\)[\s\S]*?return \{ ok: false/);
  assert.doesNotMatch(store, /Restore stock if order is cancelled/);
});

beforeEach(() => {
  g.__fakeCancelDb = undefined;
});
