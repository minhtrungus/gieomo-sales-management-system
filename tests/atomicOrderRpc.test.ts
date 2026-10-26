import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import {
  createFakeOrderDb,
  type FakeOrderDb,
  type HookContext,
  type RpcHandlerResult,
} from "./helpers/fakeOrderDb.ts";

/**
 * Batch BLOCKERS-1-3 — contract tests cho writer TẠO ĐƠN duy nhất còn lại:
 * createOrderServerAtomicV2 (migrations 021/025/026 — hợp đồng `D3:*` +
 * outcome 'created' | replay 'replayed:true').
 *
 * Đây là MOCK tests: fake admin client giả lập PostgREST rpc ở mức ứng dụng.
 * Bằng chứng transaction/locking/concurrency THỰC nằm ở
 * tests/atomicOrderPg.integration.test.ts (dựa PostgreSQL thật, SKIP khi
 * thiếu ATOMIC_PG_URL) — file này KHÔNG tuyên bố atomicity DB.
 *
 * BLOCKER-2: hợp đồng idempotency chỉ có outcome 'created' + cờ replay;
 * app không bao giờ đọc/ghi order_idempotency trực tiếp (mọi write nằm trong
 * SQL), do đó các test không seed ledger row nào và giữ bảng luôn trống —
 * hết các mock shape V015 bất hợp lệ (failed_terminal/error_message/
 * reconciliation_required).
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
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
        "export function createOrderProofToken(code, orderId) { return 'tok-' + code + '-' + orderId; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { createOrderServerAtomicV2 } = await import("../src/lib/services/orderCreateAtomicV2.ts");
const { validateOrderCreateLines } = await import("../src/lib/orderCreateInput.ts");
const {
  buildCanonicalOrderPayloadV2,
  buildOrderIdempotencyScopeV2,
  hashCanonicalOrderPayloadV2,
} = await import("../src/lib/services/orderRequestHashV2.ts");

const KEY = "33333333-3333-4333-8333-333333333333";
const MEMBER_ID = "00000000-0000-4000-8000-000000000901";

const PROTECTED_TABLES = [
  "orders",
  "order_items",
  "product_variants",
  "products",
  "customers",
  "vouchers",
  "members",
  "combos",
  "order_idempotency",
  "order_status_history",
];

type RpcCall = { name: string; args: Record<string, unknown> };
type TestGlobal = typeof globalThis & { __fakeOrderDb?: FakeOrderDb };

const testGlobal = globalThis as TestGlobal;
let rpcCalls: RpcCall[] = [];
let opLog: HookContext[] = [];

beforeEach(() => {
  opLog = [];
  rpcCalls = [];
  const db = createFakeOrderDb();
  testGlobal.__fakeOrderDb = db;
  db.hook = (ctx: HookContext) => {
    opLog.push(ctx);
  };
});

function db(): FakeOrderDb {
  assert.ok(testGlobal.__fakeOrderDb, "fake order DB must be initialized");
  return testGlobal.__fakeOrderDb;
}

function rowCount(table: string): number {
  return (db().tables[table] ?? []).length;
}

function input(overrides: Record<string, unknown> = {}): Parameters<typeof createOrderServerAtomicV2>[0] {
  return {
    buyer_name: "Nguyen Van A",
    buyer_phone: "0901234567",
    items: [{ variant_id: "v1", quantity: 1 }],
    idempotency_key: KEY,
    ...overrides,
  } as Parameters<typeof createOrderServerAtomicV2>[0];
}

function captureRpc(
  handler: (name: string, args: Record<string, unknown>) => RpcHandlerResult | Promise<RpcHandlerResult>
): void {
  db().rpcHandler = async (name, args) => {
    rpcCalls.push({ name, args });
    return handler(name, args);
  };
}

function requireRecord(value: unknown, message = "expected an object"): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), message);
  return value as Record<string, unknown>;
}

function protectedOps(): HookContext[] {
  return opLog.filter((c) => c.op !== "rpc" && PROTECTED_TABLES.includes(c.table));
}

function expectedHashAndCanonical(orderInput: Parameters<typeof createOrderServerAtomicV2>[0]) {
  const validated = validateOrderCreateLines(orderInput);
  assert.equal(validated.ok, true);
  if (!validated.ok) throw new Error("payload test không hợp lệ");
  const canonical = buildCanonicalOrderPayloadV2(orderInput, validated.items);
  return { canonical, hash: hashCanonicalOrderPayloadV2(canonical) };
}

const ORDER_ID = "99999999-4444-4444-8444-999999999999";
const ORDER_CODE = "GM-251017-000001";
const CREATED_RESPONSE = {
  outcome: "created",
  order_id: ORDER_ID,
  order_code: ORDER_CODE,
  final_amount: 75000,
  replayed: false,
};

function rpcError(details: string | null, message: string, code = "P0001") {
  return {
    data: null,
    error: { code, message, details, hint: null },
  };
}

test("V2-C1 — key hợp lệ: payload đúng hợp đồng canonical, KHÔNG đụng bảng qua TS", async () => {
  const orderInput = input();
  const { canonical, hash } = expectedHashAndCanonical(orderInput);
  let captured: unknown = null;
  captureRpc((_name, args) => {
    captured = args.p;
    return { data: CREATED_RESPONSE, error: null };
  });

  const result = await createOrderServerAtomicV2(orderInput, { memberId: null });

  assert.equal(result.success, true);
  assert.equal(result.orderId, ORDER_ID);
  assert.equal(result.orderCode, ORDER_CODE);
  assert.equal(result.finalAmount, 75000);
  assert.equal(result.proofToken, "tok-" + ORDER_CODE + "-" + ORDER_ID);
  assert.equal(result.idempotency, "created");
  assert.equal(result.replayed, false);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "create_order_atomic");
  const p = requireRecord(captured);
  assert.ok(p, "rpc phải nhận payload p");

  const scope = buildOrderIdempotencyScopeV2(null, canonical.buyer_phone);
  assert.deepEqual(p, {
    ...canonical,
    idempotency_key: KEY,
    scope_key: scope,
    request_hash: hash,
    actor_member_id: null,
  });
  assert.match(scope, /^guest:[0-9a-f]{64}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(p.buyer_phone, "0901234567");
  assert.equal(p.delivery_type, "home_delivery");
  assert.equal(p.payment_method, "banking");
  assert.deepEqual(p.items, [{ product_id: null, variant_id: "v1", combo_id: null, quantity: 1 }]);

  // Mọi side effect nằm trong SQL — TS không chạm bảng nào.
  assert.equal(protectedOps().length, 0, JSON.stringify(protectedOps()));
  assert.equal(rowCount("orders"), 0);
  assert.equal(rowCount("order_idempotency"), 0);
});

test("V2-C2 — replay (replayed:true) → idempotency 'replayed', cùng định danh server", async () => {
  captureRpc(() => ({ data: { ...CREATED_RESPONSE, replayed: true }, error: null }));

  const result = await createOrderServerAtomicV2(input());

  assert.equal(result.success, true);
  assert.equal(result.idempotency, "replayed");
  assert.equal(result.replayed, true);
  assert.equal(result.orderId, ORDER_ID);
  assert.equal(result.orderCode, ORDER_CODE);
  assert.equal(result.proofToken, "tok-" + ORDER_CODE + "-" + ORDER_ID);
  assert.equal(rowCount("order_idempotency"), 0);
  assert.equal(protectedOps().length, 0);
});

test("V2-C3 — kết quả RPC dị dạng → nghiêm ngặt fail, không success giả", async () => {
  for (const payload of [
    null,
    { outcome: "unexpected" },
    { outcome: "created", order_id: "server" },
    { outcome: "created", order_id: ORDER_ID, order_code: ORDER_CODE },
    { outcome: "created", order_id: ORDER_ID, order_code: ORDER_CODE, final_amount: "abc" },
    { outcome: "created", order_id: ORDER_ID, order_code: ORDER_CODE, final_amount: -1 },
    { outcome: "created", order_id: ORDER_ID, order_code: ORDER_CODE, final_amount: Infinity },
  ]) {
    captureRpc(() => ({ data: payload, error: null }));
    const result = await createOrderServerAtomicV2(input());
    assert.equal(result.success, false, JSON.stringify(payload));
    assert.equal(result.idempotency, undefined, JSON.stringify(payload));
  }
  // key giữ nguyên — client retry sẽ ánh xạ sang replay thay vì tạo lần 2
  assert.equal(rpcCalls.every((c) => requireRecord(c.args.p).idempotency_key === KEY), true);
});

test("V2-C4 — D3:HASH_MISMATCH → hash_mismatch; D3:IN_PROGRESS → processing", async () => {
  captureRpc(() => rpcError(null, "Khóa đã dùng với payload khác: D3:HASH_MISMATCH"));
  const mismatch = await createOrderServerAtomicV2(input());
  assert.equal(mismatch.success, false);
  assert.equal(mismatch.idempotency, "hash_mismatch");

  captureRpc(() => rpcError(null, "Đang xử lý key này: D3:IN_PROGRESS"));
  const processing = await createOrderServerAtomicV2(input());
  assert.equal(processing.success, false);
  assert.equal(processing.idempotency, "processing");
});

test("V2-C5 — D3 nghiệp vụ → failed_terminal + thông điệp rõ (không fallback)", async () => {
  const cases: Array<[string, string]> = [
    ["D3:STOCK_INSUFFICIENT", "Sản phẩm không còn đủ tồn kho."],
    ["D3:VOUCHER_UNAVAILABLE", "Voucher không hợp lệ, đã hết lượt hoặc chưa đủ điều kiện."],
    ["D3:INVALID_PHONE", "Số điện thoại người nhận không hợp lệ."],
    ["D3:INVALID_ACTOR", "Phiên người tạo đơn không còn hợp lệ."],
    ["D3:COMBO_COMPONENTS_UNMAPPED", "Combo chưa được cấu hình đầy đủ tồn kho."],
    ["D3:VARIANT_PRODUCT_MISMATCH", "Phân loại sản phẩm không thuộc sản phẩm đã chọn."],
  ];
  for (const [code, message] of cases) {
    captureRpc(() => rpcError(null, `create_order_atomic: ${code}`));
    const result = await createOrderServerAtomicV2(input());
    assert.equal(result.success, false, code);
    assert.equal(result.idempotency, "failed_terminal", code);
    assert.equal(result.error, message, code);
  }
});

test("V2-C6 — lỗi DB không gắn nhãn D3 → undefined idempotency (retryable), key giữ nguyên", async () => {
  captureRpc(() => rpcError(null, "some db blew up"));
  const result = await createOrderServerAtomicV2(input());
  assert.equal(result.success, false);
  assert.equal(result.error, "Không thể tạo đơn hàng nguyên tử.");
  assert.equal(result.idempotency, undefined);
  assert.equal(rowCount("order_idempotency"), 0);
  assert.equal(rpcCalls.every((c) => requireRecord(c.args.p).idempotency_key === KEY), true);
});

test("V2-C7 — thiếu function (PGRST202) → lỗi migration rõ, KHÔNG fallback TS", async () => {
  // Không set rpcHandler → fake trả PGRST202 như PostgREST thật.
  const result = await createOrderServerAtomicV2(input());
  assert.equal(result.success, false);
  assert.match(String(result.error), /migration 025/);
  assert.equal(result.idempotency, undefined);
  assert.equal(protectedOps().length, 0, JSON.stringify(protectedOps()));
  assert.equal(rowCount("orders"), 0);
  assert.equal(rowCount("order_idempotency"), 0);
  assert.equal(rowCount("product_variants"), 0);
});

test("V2-C8 — transport exception → undefined idempotency, key giữ nguyên", async () => {
  captureRpc(() => {
    throw new Error("response lost after commit");
  });
  const result = await createOrderServerAtomicV2(input());
  assert.equal(result.success, false);
  assert.equal(result.idempotency, undefined);
  assert.equal(rpcCalls.every((c) => requireRecord(c.args.p).idempotency_key === KEY), true);
});

test("V2-C9 — keyless/malformed key → từ chối tường minh trước rpc (BLOCKER-3)", async () => {
  for (const key of ["", "not-a-uuid", null, undefined]) {
    const result = await createOrderServerAtomicV2(input({ idempotency_key: key }));
    assert.equal(result.success, false, String(key));
    assert.equal(result.idempotency, "failed_terminal", String(key));
    assert.match(String(result.error), /Khóa gửi đơn không hợp lệ/);
  }
  assert.equal(rpcCalls.length, 0);
  assert.equal(protectedOps().length, 0, JSON.stringify(protectedOps()));
  assert.equal(rowCount("orders"), 0);
  assert.equal(rowCount("order_idempotency"), 0);
});

test("V2-C10 — giỏ hàng rỗng/dòng không hợp lệ → failed_terminal, 0 rpc", async () => {
  const empty = await createOrderServerAtomicV2(input({ items: [] }));
  assert.equal(empty.success, false);
  assert.equal(empty.idempotency, "failed_terminal");
  assert.match(String(empty.error), /Giỏ hàng không có sản phẩm nào để đặt/);

  const mixed = await createOrderServerAtomicV2(
    input({ items: [{ variant_id: "v1", combo_id: "c1", quantity: 1 }] })
  );
  assert.equal(mixed.success, false);
  assert.equal(mixed.idempotency, "failed_terminal");
  assert.match(String(mixed.error), /định danh không hợp lệ/);

  assert.equal(rpcCalls.length, 0);
  assert.equal(protectedOps().length, 0, JSON.stringify(protectedOps()));
});

test("V2-C11 — response mất sau commit → retry cùng key hội tụ replay, một đơn duy nhất", async () => {
  let commits = 0;
  const keys: string[] = [];
  let committedHash = "";
  const orderInput = input({ voucher_code: "TEST" });
  const expected = expectedHashAndCanonical(orderInput);

  captureRpc((_name, args) => {
    const p = requireRecord(args.p);
    const idempotencyKey = p.idempotency_key;
    if (typeof idempotencyKey !== "string") throw new Error("expected string idempotency key");
    keys.push(idempotencyKey);
    if (commits > 0) {
      assert.equal(p.request_hash, committedHash, "retry cùng payload cùng hash");
      return { data: { outcome: "created", order_id: ORDER_ID, order_code: ORDER_CODE, final_amount: 65000, replayed: true }, error: null };
    }
    assert.equal(p.request_hash, expected.hash);
    const scopeKey = p.scope_key;
    if (typeof scopeKey !== "string") throw new Error("expected string scope key");
    assert.match(scopeKey, /^guest:[0-9a-f]{64}$/);
    commits = 1;
    const requestHash = p.request_hash;
    if (typeof requestHash !== "string") throw new Error("expected string request hash");
    committedHash = requestHash;
    return { data: { outcome: "created", order_id: ORDER_ID, order_code: ORDER_CODE, final_amount: 65000, replayed: false }, error: null };
  });

  const first = await createOrderServerAtomicV2(orderInput);
  assert.equal(first.success, true, first.error);
  assert.equal(first.idempotency, "created");

  // Response thất lạc: client giữ key rồi POST lại — SQL trả replay, TS map lại.
  const second = await createOrderServerAtomicV2(orderInput);
  assert.equal(second.success, true);
  assert.equal(second.idempotency, "replayed");
  assert.equal(second.orderId, first.orderId);
  assert.equal(second.orderCode, first.orderCode);
  assert.equal(second.finalAmount, first.finalAmount);

  assert.equal(commits, 1, "SQL chỉ commit đúng một lần");
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(rowCount("orders"), 0);
  assert.equal(rowCount("order_idempotency"), 0);
});

test("V2-C12 — hash canonical bất biến với thứ tự dòng + khoảng trắng số điện thoại", async () => {
  const a = input({ items: [{ variant_id: "v1", quantity: 1 }, { variant_id: "v2", quantity: 2 }] });
  const b = input({ items: [{ variant_id: "v2", quantity: 2 }, { variant_id: "v1", quantity: 1 }], buyer_phone: "090 123 4567" });
  const { hash: hashA } = expectedHashAndCanonical(a);
  const { hash: hashB } = expectedHashAndCanonical(b);
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, expectedHashAndCanonical(input()).hash);
});

test("V2-C13 — member identity → scope member:<uuid>, actor_member_id truyền qua", async () => {
  let captured: unknown = null;
  captureRpc((_name, args) => {
    captured = args.p;
    return { data: CREATED_RESPONSE, error: null };
  });

  const result = await createOrderServerAtomicV2(input(), { memberId: MEMBER_ID });

  assert.equal(result.success, true);
  const p = requireRecord(captured);
  assert.ok(p);
  assert.equal(p.scope_key, `member:${MEMBER_ID}`);
  assert.equal(p.actor_member_id, MEMBER_ID);
  const scopeKey = p.scope_key;
  if (typeof scopeKey !== "string") throw new Error("expected string scope key");
  assert.match(scopeKey, /^member:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
