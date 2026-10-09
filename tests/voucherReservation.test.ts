import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
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
  if (url === "mock:supabase-admin") {
    return { format: "module", shortCircuit: true, source: 'export function createAdminClient() { return globalThis.__fakeOrderDb; }' };
  }
  if (url === "mock:config-service") {
    return { format: "module", shortCircuit: true, source: 'export async function getSystemSettingsServer() { return { flatShippingFee: 25000, freeShippingThreshold: 0 }; }' };
  }
  if (url === "mock:server-auth") {
    return { format: "module", shortCircuit: true, source: 'export function createOrderProofToken(code) { return "proof-" + code; }' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { createOrderServer, reserveVoucherSlot, releaseVoucherSlot } = await import(
  "../src/lib/services/orderService.ts"
);
import { buildVoucherPayload } from "../src/lib/voucherPayload.ts";
import type { VoucherCasOps } from "../src/lib/services/orderService.ts";

type FakeRow = Record<string, unknown>;
type CallLog = { table: string; action: string; payload?: unknown };

type FakeWorld = {
  tables: Record<string, FakeRow[]>;
  calls: CallLog[];
  force: {
    productDeductFail?: boolean;
    ordersInsertError?: { code?: string; message: string } | null;
    orderItemsInsertError?: { message: string } | null;
    throwOnCustomersSelect?: boolean;
    voucherCasIncrementOverride?: (
      attempt: number,
      snapshot: number
    ) => { rowsAffected: number | null; error: string | null } | "passthrough";
    voucherCasDecrementOverride?: (
      attempt: number,
      snapshot: number
    ) => { rowsAffected: number | null; error: string | null } | "passthrough";
  };
  voucherIncAttempt: number;
  voucherDecAttempt: number;
};

function emptyWorld(): FakeWorld {
  return {
    tables: {
      products: [],
      product_variants: [],
      combos: [],
      vouchers: [],
      customers: [],
      members: [],
      orders: [],
      order_items: [],
      order_status_history: [],
    },
    calls: [],
    force: {},
    voucherIncAttempt: 0,
    voucherDecAttempt: 0,
  };
}

class FakeQuery {
  private table: string;
  private world: FakeWorld;
  private op: "select" | "insert" | "update" | null = null;
  private filters: Array<{ kind: string; key: string; value: unknown }> = [];
  private payload: unknown = null;
  private selectCols: string | null = null;
  private orExpr: string | null = null;

  constructor(table: string, world: FakeWorld) {
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

  gte(key: string, value: unknown) {
    this.filters.push({ kind: "gte", key, value });
    return this;
  }

  gt(key: string, value: unknown) {
    this.filters.push({ kind: "gt", key, value });
    return this;
  }

  or(expr: string) {
    this.orExpr = expr;
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

  private matches(row: FakeRow): boolean {
    for (const f of this.filters) {
      if (f.kind === "eq" && row[f.key] !== f.value) return false;
      if (f.kind === "gte" && Number(row[f.key]) < Number(f.value)) return false;
      if (f.kind === "gt" && Number(row[f.key]) <= Number(f.value)) return false;
    }
    if (this.orExpr) {
      const parts = this.orExpr.split(",").map((p) => {
        const segs = p.split(".");
        return { key: segs[0], op: segs[1], value: segs.slice(2).join(".") };
      });
      if (!parts.some((p) => p.op === "eq" && row[p.key] === p.value)) return false;
    }
    return true;
  }

  private async exec(mode: "many" | "maybe" | "single"): Promise<{ data: unknown; error: unknown }> {
    const world = this.world;
    world.calls.push({ table: this.table, action: this.op ?? "unknown", payload: this.payload });

    if (this.table === "customers" && this.op === "select" && world.force.throwOnCustomersSelect) {
      throw new Error("customers select exploded");
    }

    if (this.op === "insert") {
      if (this.table === "orders") {
        if (world.force.ordersInsertError) return { data: null, error: world.force.ordersInsertError };
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = (rows as FakeRow[]).map((r, i) => ({
          ...r,
          order_id: `order-${world.tables.orders.length + 1 + i}`,
        }));
        for (const r of inserted) world.tables.orders.push(r);
        return { data: mode === "many" ? inserted : inserted[0], error: null };
      }
      if (this.table === "order_items") {
        if (world.force.orderItemsInsertError) {
          return { data: null, error: world.force.orderItemsInsertError };
        }
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        for (const r of rows as FakeRow[]) world.tables.order_items.push(r);
        return { data: null, error: null };
      }
      if (this.table === "customers") {
        const row = { customer_id: "cust-1", ...(this.payload as FakeRow) };
        world.tables.customers.push(row);
        return { data: mode === "many" ? [row] : row, error: null };
      }
      if (this.table === "order_status_history") {
        world.tables.order_status_history.push(this.payload as FakeRow);
        return { data: null, error: null };
      }
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const r of rows as FakeRow[]) {
        if (!world.tables[this.table]) world.tables[this.table] = [];
        world.tables[this.table].push(r);
      }
      return { data: mode === "many" ? rows : rows[0], error: null };
    }

    if (this.op === "update") {
      if (this.table === "products") {
        const row = world.tables.products[0];
        if (!row) return { data: null, error: null };
        const gteF = this.filters.find((f) => f.kind === "gte");
        if (gteF && Number(row[gteF.key]) < Number(gteF.value)) {
          return { data: null, error: null };
        }
        if (world.force.productDeductFail && (this.selectCols ?? "").includes("product_id")) {
          return { data: null, error: { message: "forced deduct failure" } };
        }
        Object.assign(row, this.payload as object);
        if (this.selectCols) return { data: { ...row }, error: null };
        return { data: null, error: null };
      }
      if (this.table === "vouchers") {
        const eqVoucher = this.filters.find((f) => f.key === "voucher_id");
        const eqTimes = this.filters.find((f) => f.key === "times_used");
        if (!eqVoucher) return { data: [], error: null };
        const row = world.tables.vouchers.find((r) => r.voucher_id === eqVoucher.value);
        if (!row) return { data: [], error: null };
        if (eqTimes) {
          const nextVal = Number((this.payload as FakeRow).times_used);
          const isInc = nextVal > Number(row.times_used);
          if (isInc && world.force.voucherCasIncrementOverride) {
            const o = world.force.voucherCasIncrementOverride(
              ++world.voucherIncAttempt,
              Number(eqTimes.value)
            );
            if (o !== "passthrough") {
              return {
                data: o.rowsAffected === 1 ? [{ voucher_id: row.voucher_id }] : [],
                error: o.error ? { message: o.error } : null,
              };
            }
          }
          if (!isInc && world.force.voucherCasDecrementOverride) {
            const o = world.force.voucherCasDecrementOverride(
              ++world.voucherDecAttempt,
              Number(eqTimes.value)
            );
            if (o !== "passthrough") {
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
        Object.assign(row, this.payload as object);
        return { data: [{ voucher_id: row.voucher_id }], error: null };
      }
      if (this.table === "customers") {
        const row = world.tables.customers[0];
        if (row) Object.assign(row, this.payload as object);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    const rows = (world.tables[this.table] || []).filter((r) => this.matches(r)).map((r) => ({ ...r }));
    if (mode === "maybe") return { data: rows[0] ?? null, error: null };
    if (mode === "single") {
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { message: `No row found for ${this.table}` } };
    }
    return { data: rows, error: null };
  }
}

function createFakeSupabase(world: FakeWorld) {
  return {
    from(table: string) {
      return new FakeQuery(table, world);
    },
  };
}

function makeOps(overrides: Partial<VoucherCasOps> = {}): VoucherCasOps {
  return {
    readSnapshot: async () => ({ row: { times_used: 0, usage_limit: null }, error: null }),
    casIncrement: async (_id, snapshot) => ({ rowsAffected: snapshot === 0 ? 1 : 0, error: null }),
    casDecrement: async (_id, snapshot) => ({ rowsAffected: snapshot > 0 ? 1 : 0, error: null }),
    ...overrides,
  };
}

const VOUCHER_ID = "11111111-1111-1111-1111-111111111111";

function seedHappyWorld(world: FakeWorld) {
  world.tables.products.push({
    product_id: "prod-1",
    name: "Gieo Mo Item",
    sku: "SKU1",
    price: 100000,
    stock: 10,
    status: "active",
  });
  world.tables.vouchers.push({
    voucher_id: VOUCHER_ID,
    code: "CAS15K",
    status: "active",
    discount_type: "fixed_amount",
    discount_value: 15000,
    min_order_value: 0,
    usage_limit: null,
    times_used: 0,
    start_date: null,
    end_date: null,
  });
}

function happyOrderInput() {
  return {
    buyer_name: "Test Buyer",
    buyer_phone: "0900000001",
    items: [{ product_id: "prod-1", quantity: 1 }],
    voucher_code: "CAS15K",
  };
}

function countAction(world: FakeWorld, action: string): number {
  return world.calls.filter((c) => c.action === action).length;
}

const g = globalThis as unknown as { __fakeOrderDb?: unknown };

test("T1 — CAS giữ chỗ thành công khi snapshot khớp", async () => {
  let sawSnapshot = -1;
  const ops = makeOps({
    readSnapshot: async () => ({ row: { times_used: 2, usage_limit: 10 }, error: null }),
    casIncrement: async (_id, snapshot) => {
      sawSnapshot = snapshot;
      return { rowsAffected: 1, error: null };
    },
  });
  const r = await reserveVoucherSlot(ops, VOUCHER_ID);
  assert.deepEqual(r, { ok: true, timesUsed: 2 });
  assert.equal(sawSnapshot, 2);
});

test("T2 — voucher không tồn tại → not_found, không gọi CAS", async () => {
  let incCalled = 0;
  const ops = makeOps({
    readSnapshot: async () => ({ row: null, error: null }),
    casIncrement: async () => {
      incCalled++;
      return { rowsAffected: 1, error: null };
    },
  });
  const r = await reserveVoucherSlot(ops, VOUCHER_ID);
  assert.deepEqual(r, { ok: false, reason: "not_found" });
  assert.equal(incCalled, 0);
});

test("T3 — đạt usage_limit → reason limit, không gọi CAS", async () => {
  let incCalled = 0;
  const ops = makeOps({
    readSnapshot: async () => ({ row: { times_used: 5, usage_limit: 5 }, error: null }),
    casIncrement: async () => {
      incCalled++;
      return { rowsAffected: 1, error: null };
    },
  });
  const r = await reserveVoucherSlot(ops, VOUCHER_ID);
  assert.deepEqual(r, { ok: false, reason: "limit" });
  assert.equal(incCalled, 0);
});

test("T4 — CAS luôn thua (0 hàng) hết retries → contention", async () => {
  let incCalls = 0;
  const ops = makeOps({
    readSnapshot: async () => ({ row: { times_used: 0, usage_limit: null }, error: null }),
    casIncrement: async () => {
      incCalls++;
      return { rowsAffected: 0, error: null };
    },
  });
  const r = await reserveVoucherSlot(ops, VOUCHER_ID, 2);
  assert.deepEqual(r, { ok: false, reason: "contention" });
  assert.equal(incCalls, 2);
});

test("T5 — CAS thua 1 lần rồi thắng → retry, ok=true", async () => {
  let incCalls = 0;
  const ops = makeOps({
    readSnapshot: async () => ({ row: { times_used: 3, usage_limit: 10 }, error: null }),
    casIncrement: async (_id, snapshot) => {
      incCalls++;
      return incCalls === 1 ? { rowsAffected: 0, error: null } : { rowsAffected: 1, error: null };
    },
  });
  const r = await reserveVoucherSlot(ops, VOUCHER_ID);
  assert.deepEqual(r, { ok: true, timesUsed: 3 });
  assert.equal(incCalls, 2);
});

test("T6 — đọc snapshot lỗi DB → db_error kèm errorMessage", async () => {
  const ops = makeOps({
    readSnapshot: async () => ({ row: null, error: "connection lost" }),
  });
  const r = await reserveVoucherSlot(ops, VOUCHER_ID);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "db_error");
    assert.equal(r.errorMessage, "connection lost");
  }
});

test("T7 — release thành công → released, CAS decrement đúng snapshot", async () => {
  let sawSnapshot = -1;
  const ops = makeOps({
    readSnapshot: async () => ({ row: { times_used: 3, usage_limit: null }, error: null }),
    casDecrement: async (_id, snapshot) => {
      sawSnapshot = snapshot;
      return { rowsAffected: 1, error: null };
    },
  });
  const r = await releaseVoucherSlot(ops, VOUCHER_ID);
  assert.equal(r, "released");
  assert.equal(sawSnapshot, 3);
});

test("T9 — hai release đồng thời: không đè snapshot cũ, times_used cuối = 3", async () => {
  let row = { times_used: 5, usage_limit: null } as { times_used: number; usage_limit: number | null };
  let readsInFlight = 0;
  let openBarrier: (() => void) | null = null;
  const barrier = new Promise<void>((resolve) => {
    openBarrier = resolve;
  });

  const ops: VoucherCasOps = {
    async readSnapshot() {
      const snap = { ...row };
      readsInFlight++;
      if (readsInFlight === 2) openBarrier?.();
      await barrier;
      return { row: snap, error: null };
    },
    async casIncrement() {
      throw new Error("unused");
    },
    async casDecrement(_id, snapshot) {
      if (row.times_used === snapshot) {
        row = { ...row, times_used: snapshot - 1 };
        return { rowsAffected: 1, error: null };
      }
      return { rowsAffected: 0, error: null };
    },
  };

  const [r1, r2] = await Promise.all([
    releaseVoucherSlot(ops, VOUCHER_ID),
    releaseVoucherSlot(ops, VOUCHER_ID),
  ]);
  assert.equal(r1, "released");
  assert.equal(r2, "released");
  assert.equal(row.times_used, 3);
});

test("T11 — voucher bị xóa trước khi release → not_found, không crash", async () => {
  const ops = makeOps({
    readSnapshot: async () => ({ row: null, error: null }),
  });
  const r = await releaseVoucherSlot(ops, VOUCHER_ID);
  assert.equal(r, "not_found");
});

test("T12 — buildVoucherPayload không gửi times_used lên DB", () => {
  const payload = buildVoucherPayload({
    code: " cas15k ",
    discount_type: "fixed_amount",
    discount_value: 15000,
    min_order_value: 0,
    usage_limit: 10,
    times_used: 7,
    start_date: null,
    end_date: null,
    status: "active",
  });
  assert.equal("times_used" in payload, false);
  assert.equal(payload.usage_limit, 10);
  assert.equal(payload.code, "CAS15K");
});

test("T13 — createOrderServer thành công: tăng times_used 1 lần, KHÔNG release, finalAmount đúng", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(happyOrderInput());
  assert.equal(r.success, true);
  assert.equal(r.finalAmount, 110000);
  assert.equal(countAction(world, "voucher-cas-increment"), 1);
  assert.equal(countAction(world, "voucher-cas-decrement"), 0);
  assert.equal(world.tables.vouchers[0].times_used, 1);
});

test("T14a — stock fail sau khi giữ chỗ → release đúng 1 lần, không tăng times_used", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.force.productDeductFail = true;
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(happyOrderInput());
  assert.equal(r.success, false);
  assert.match(r.error || "", /hết hàng/);
  assert.equal(countAction(world, "voucher-cas-increment"), 1);
  assert.equal(countAction(world, "voucher-cas-decrement"), 1);
  assert.equal(world.tables.vouchers[0].times_used, 0);
});

test("T8 — orders insert fail: restore stock TRƯỚC release, release đúng 1 lần", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.force.ordersInsertError = { message: "orders insert failed" };
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(happyOrderInput());
  assert.equal(r.success, false);
  assert.equal(r.error, "orders insert failed");
  assert.equal(countAction(world, "voucher-cas-decrement"), 1);
  assert.equal(world.tables.vouchers[0].times_used, 0);
  assert.equal(world.tables.products[0].stock, 10);

  const idxInsert = world.calls.findIndex((c) => c.table === "orders" && c.action === "insert");
  const idxRelease = world.calls.findIndex((c) => c.action === "voucher-cas-decrement");
  assert.ok(idxInsert >= 0 && idxRelease > idxInsert, "release phải sau failed insert");
  const idxRestore = world.calls.findIndex(
    (c, i) =>
      i > idxInsert &&
      c.table === "products" &&
      c.action === "update" &&
      c.payload &&
      typeof c.payload === "object" &&
      "stock" in (c.payload as FakeRow) &&
      Number((c.payload as FakeRow).stock) >= 10
  );
  assert.ok(idxRestore > idxInsert, "restore stock phải sau failed insert");
  assert.ok(idxRelease > idxRestore, "release phải sau restore stock");
});

test("T10 — insert fail + release fail: vẫn trả lỗi gốc, không throw", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.force.ordersInsertError = { message: "orders insert failed" };
  world.force.voucherCasDecrementOverride = () => ({ rowsAffected: null, error: "release boom" });
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(happyOrderInput());
  assert.equal(r.success, false);
  assert.equal(r.error, "orders insert failed");
  assert.ok(world.voucherDecAttempt >= 3, "release đã thử lại tối đa");
});

test("T14b — exception ngoài luồng sau khi giữ chỗ → release trong catch", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.force.throwOnCustomersSelect = true;
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(happyOrderInput());
  assert.equal(r.success, false);
  assert.match(r.error || "", /customers select exploded/);
  assert.equal(countAction(world, "voucher-cas-increment"), 1);
  assert.equal(countAction(world, "voucher-cas-decrement"), 1);
  assert.equal(world.tables.vouchers[0].times_used, 0);
});

test("T15 — M5A: đơn có voucher lưu đúng voucher_id từ reservedVoucherId", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(happyOrderInput());
  assert.equal(r.success, true);
  assert.equal(world.tables.orders.length, 1);
  assert.equal(world.tables.orders[0].voucher_id, VOUCHER_ID);
  assert.equal(world.tables.orders[0].voucher_discount, 15000);
});

test("T16 — M5A: đơn không dùng voucher → voucher_id null", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer({
    buyer_name: "No Voucher",
    buyer_phone: "0900000002",
    items: [{ product_id: "prod-1", quantity: 1 }],
  });
  assert.equal(r.success, true);
  assert.equal(world.tables.orders[0].voucher_id, null);
  assert.equal(world.tables.orders[0].voucher_discount, 0);
  assert.equal(countAction(world, "voucher-cas-increment"), 0);
});

test("T17 — M5A: CAS giữ chỗ thất bại → đơn tạo không gắn voucher_id, không tăng quota", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.force.voucherCasIncrementOverride = () => ({ rowsAffected: 0, error: null });
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(happyOrderInput());
  assert.equal(r.success, true);
  assert.equal(world.tables.orders[0].voucher_id, null);
  assert.equal(world.tables.orders[0].voucher_discount, 0);
  assert.equal(world.tables.vouchers[0].times_used, 0);
});

beforeEach(() => {
  g.__fakeOrderDb = undefined;
});
