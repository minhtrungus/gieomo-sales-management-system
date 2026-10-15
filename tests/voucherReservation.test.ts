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
    return {
      format: "module",
      shortCircuit: true,
      source:
        'export function createAdminClient() { if (!globalThis.__fakeOrderDb) throw new Error("database access must not occur"); return globalThis.__fakeOrderDb; }',
    };
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
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  rpcHandler:
    | ((name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null })
    | null;
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
    rpcCalls: [],
    rpcHandler: null,
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
    async rpc(name: string, args: Record<string, unknown>) {
      world.rpcCalls.push({ name, args });
      if (!world.rpcHandler) {
        throw new Error(`create_order_atomic handler not configured for ${name}`);
      }
      return world.rpcHandler(name, args);
    },
  };
}

const RPC_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function okRpcResult(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      outcome: "created",
      order_id: RPC_UUID,
      order_code: "GM-261014-000001",
      final_amount: 110000,
      replayed: false,
      ...overrides,
    },
    error: null,
  };
}

function errorRpcResult(message: string) {
  return { data: null, error: { message } };
}

function rpcPayloadOf(args: Record<string, unknown>): Record<string, unknown> {
  const payload = args.p;
  assert.ok(payload && typeof payload === "object", "RPC phải nhận tham số p dạng jsonb");
  return payload as Record<string, unknown>;
}

function tableWrites(world: FakeWorld): CallLog[] {
  return world.calls;
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
    casIncrement: async () => {
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

function atomicInput(overrides: Record<string, unknown> = {}) {
  return {
    ...happyOrderInput(),
    idempotency_key: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Decision 3 contract: createOrderServer now issues exactly ONE
// create_order_atomic RPC. Stock, voucher quota, order rows, history and audit
// are the database transaction's responsibility, so the client must never issue
// compensating table writes. Row-level rollback/concurrency evidence lives in
// tests/atomicOrderPg.integration.test.ts (real PostgreSQL).
// ---------------------------------------------------------------------------

test("T13 — createOrderServer dùng đúng MỘT RPC và nhận finalAmount do máy chủ quyết định", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.rpcHandler = (_name, args) => {
    const payload = rpcPayloadOf(args);
    assert.equal(payload.final_amount, undefined, "client không được gửi final_amount");
    assert.equal(payload.subtotal, undefined, "client không được gửi subtotal");
    assert.equal(payload.shipping_fee, undefined, "client không được gửi shipping_fee");
    assert.equal(payload.voucher_discount, undefined, "client không được gửi voucher_discount");
    assert.match(String(payload.scope_key), /^guest:[0-9a-f]{64}$/);
    assert.match(String(payload.request_hash), /^[0-9a-f]{64}$/);
    assert.match(String(payload.idempotency_key), /^[0-9a-f-]{36}$/i);
    return okRpcResult();
  };
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(atomicInput());
  assert.equal(r.success, true);
  assert.equal(r.orderId, RPC_UUID);
  assert.equal(r.orderCode, "GM-261014-000001");
  assert.equal(r.finalAmount, 110000);
  assert.equal(world.rpcCalls.length, 1);
  assert.equal(world.rpcCalls[0].name, "create_order_atomic");
  assert.equal(tableWrites(world).length, 0, "không được ghi bảng trực tiếp ngoài RPC");
  assert.equal(world.tables.orders.length, 0, "không có đơn nào được ghi phía client");
  assert.equal(world.tables.vouchers[0].times_used, 0, "quota voucher chỉ do máy chủ tăng");
});

test("T14a — RPC báo thiếu tồn kho → fail closed, không bù trừ cục bộ", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.rpcHandler = () => errorRpcResult("D3:STOCK_INSUFFICIENT");
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(atomicInput());
  assert.equal(r.success, false);
  assert.match(r.error || "", /không còn đủ tồn kho/);
  assert.equal(world.rpcCalls.length, 1);
  assert.equal(tableWrites(world).length, 0, "rollback thuộc về transaction, không có bù trừ phía client");
  assert.equal(world.tables.vouchers[0].times_used, 0);
  assert.equal(world.tables.products[0].stock, 10);
});

test("T8 — máy chủ báo lỗi ghi đơn → trả success:false, KHÔNG restore stock/voucher cục bộ", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.rpcHandler = () => errorRpcResult("orders insert failed");
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(atomicInput());
  assert.equal(r.success, false);
  assert.ok(r.error, "phải trả lỗi cho client");
  assert.equal(tableWrites(world).length, 0, "không được ghi/restore bảng trực tiếp");
  assert.equal(world.tables.orders.length, 0);
  assert.equal(world.tables.vouchers[0].times_used, 0);
  assert.equal(world.tables.products[0].stock, 10);
});

test("T10 — RPC ném lỗi bất ngờ → bắt exception, trả success:false, không throw ra ngoài", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.rpcHandler = () => {
    throw new Error("release boom");
  };
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(atomicInput());
  assert.equal(r.success, false);
  assert.ok(r.error);
  assert.equal(tableWrites(world).length, 0);
  assert.equal(world.tables.vouchers[0].times_used, 0);
});

test("T14b — exception ngoài luồng khi mở kết nối → fail closed, không trả đơn giả", async () => {
  const world = emptyWorld();
  g.__fakeOrderDb = undefined;

  const r = await createOrderServer(atomicInput());
  assert.equal(r.success, false);
  assert.ok(r.error);
  assert.equal(r.orderId, undefined);
  assert.equal(r.orderCode, undefined);
  assert.equal(tableWrites(world).length, 0);
});

test("T15 — M5A: đơn có voucher gửi voucher_code cho RPC và nhận identity từ máy chủ", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.rpcHandler = (_name, args) => {
    const payload = rpcPayloadOf(args);
    assert.equal(payload.voucher_code, "CAS15K");
    assert.equal(payload.voucher_id, undefined, "client không tự chọn voucher_id");
    assert.equal(payload.voucher_discount, undefined, "client không tự tính discount");
    assert.equal(payload.final_amount, undefined, "client không tự quyết định tổng tiền");
    return okRpcResult();
  };
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(atomicInput());
  assert.equal(r.success, true);
  assert.equal(r.orderId, RPC_UUID);
  assert.equal(r.finalAmount, 110000);
  assert.equal(world.rpcCalls.length, 1);
  assert.equal(tableWrites(world).length, 0);
  assert.equal(world.tables.vouchers[0].times_used, 0, "quota chỉ do server tăng trong transaction");
});

test("T16 — M5A: đơn không dùng voucher → voucher_code null, không đụng bảng vouchers", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.rpcHandler = (_name, args) => {
    assert.equal(rpcPayloadOf(args).voucher_code, null);
    return okRpcResult();
  };
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(
    atomicInput({
      buyer_name: "No Voucher",
      buyer_phone: "0900000002",
      voucher_code: null,
    })
  );
  assert.equal(r.success, true);
  assert.equal(tableWrites(world).length, 0);
  assert.equal(world.tables.vouchers[0].times_used, 0);
  assert.equal(countAction(world, "voucher-cas-increment"), 0);
});

test("T17 — M5A: voucher không khả dụng → fail closed, không tạo đơn, không tăng quota", async () => {
  const world = emptyWorld();
  seedHappyWorld(world);
  world.rpcHandler = () => errorRpcResult("D3:VOUCHER_UNAVAILABLE");
  g.__fakeOrderDb = createFakeSupabase(world);

  const r = await createOrderServer(atomicInput());
  assert.equal(r.success, false);
  assert.match(r.error || "", /Voucher không hợp lệ/);
  assert.equal(world.rpcCalls.length, 1);
  assert.equal(tableWrites(world).length, 0);
  assert.equal(world.tables.orders.length, 0);
  assert.equal(world.tables.vouchers[0].times_used, 0);
});

beforeEach(() => {
  g.__fakeOrderDb = undefined;
});
