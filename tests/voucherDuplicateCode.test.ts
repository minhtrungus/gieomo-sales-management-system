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

type DbCall = { table: string; action: string; payload?: Record<string, unknown> };

const calls: DbCall[] = [];
let vouchersTable: Array<Record<string, unknown>> = [];
let insertErrorCode: string | null = null;

function makeChain(table: string) {
  const state: { filters: Array<{ key: string; value: unknown }>; op: string | null; payload: unknown } = {
    filters: [],
    op: null,
    payload: null,
  };
  const chain = {
    select() {
      if (state.op === null) state.op = "select";
      return chain;
    },
    insert(payload: Record<string, unknown>) {
      state.op = "insert";
      state.payload = payload;
      return chain;
    },
    update(payload: Record<string, unknown>) {
      state.op = "update";
      state.payload = payload;
      return chain;
    },
    eq(key: string, value: unknown) {
      state.filters.push({ key, value });
      return chain;
    },
    maybeSingle() {
      calls.push({ table, action: state.op ?? "unknown" });
      if (state.op === "select") {
        const found = vouchersTable.find((r) =>
          state.filters.every((f) => r[f.key] === f.value)
        );
        return Promise.resolve({ data: found ?? null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    single() {
      calls.push({ table, action: state.op ?? "unknown", payload: state.payload as Record<string, unknown> | undefined });
      if (state.op === "insert") {
        if (insertErrorCode) {
          return Promise.resolve({ data: null, error: { code: insertErrorCode, message: "duplicate key value violates unique constraint" } });
        }
        const row = { voucher_id: "new-uuid", ...(state.payload as Record<string, unknown>) };
        vouchersTable.push(row);
        return Promise.resolve({ data: row, error: null });
      }
      if (state.op === "update") {
        const found = vouchersTable.find((r) =>
          state.filters.every((f) => r[f.key] === f.value)
        );
        if (!found) return Promise.resolve({ data: null, error: { message: "not found" } });
        Object.assign(found, state.payload as object);
        return Promise.resolve({ data: found, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then<A, B>(
      onFulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
      onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
    ): Promise<A | B> {
      calls.push({ table, action: state.op ?? "unknown", payload: state.payload as Record<string, unknown> | undefined });
      if (state.op === "select") {
        const found = vouchersTable.find((r) =>
          state.filters.every((f) => r[f.key] === f.value)
        );
        return Promise.resolve({ data: found ? [found] : [], error: null }).then(
          onFulfilled ?? undefined,
          onRejected ?? undefined
        );
      }
      return Promise.resolve({ data: null, error: null }).then(
        onFulfilled ?? undefined,
        onRejected ?? undefined
      );
    },
  };
  return chain;
}

const g = globalThis as unknown as { __voucherDb: { from: (t: string) => ReturnType<typeof makeChain> } };
g.__voucherDb = { from: (t: string) => makeChain(t) };

const { POST } = await import("../src/app/api/vouchers/route.ts");

function postRequest(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/vouchers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  calls.length = 0;
  vouchersTable = [];
  insertErrorCode = null;
});

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

test("VC1 — tạo voucher mới thành công", async () => {
  const res = await postRequest({
    code: "SUMMER20",
    discount_type: "percentage",
    discount_value: 20,
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; voucher: { code: string } };
  assert.equal(body.success, true);
  assert.equal(body.voucher.code, "SUMMER20");
});

test("VC2 — tạo voucher trùng mã → 409, không insert", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "SUMMER20", status: "active" });
  const res = await postRequest({
    code: "SUMMER20",
    discount_type: "percentage",
    discount_value: 20,
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /đã tồn tại/);
  assert.equal(vouchersTable.length, 1, "không tạo voucher thứ hai");
});

test("VC3 — update voucher giữ nguyên mã → thành công", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "SUMMER20", status: "active", discount_value: 20 });
  const res = await postRequest({
    voucher_id: UUID_A,
    code: "SUMMER20",
    discount_type: "percentage",
    discount_value: 25,
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; voucher: { discount_value: number } };
  assert.equal(body.success, true);
  assert.equal(body.voucher.discount_value, 25);
});

test("VC4 — update voucher A sang mã đang thuộc voucher B → 409", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "CODE_A", status: "active" });
  vouchersTable.push({ voucher_id: UUID_B, code: "CODE_B", status: "active" });
  const res = await postRequest({
    voucher_id: UUID_A,
    code: "CODE_B",
    discount_type: "fixed_amount",
    discount_value: 10000,
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /đã tồn tại/);
  const voucherB = vouchersTable.find((v) => v.voucher_id === UUID_B);
  assert.equal(voucherB?.code, "CODE_B", "voucher B không bị ghi đè");
});

test("VC5 — update voucher A sang mã mới (chưa tồn tại) → thành công", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "CODE_A", status: "active" });
  const res = await postRequest({
    voucher_id: UUID_A,
    code: "NEWCODE",
    discount_type: "fixed_amount",
    discount_value: 10000,
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; voucher: { code: string } };
  assert.equal(body.success, true);
  assert.equal(body.voucher.code, "NEWCODE");
});

test("VC6 — race: insert bị UNIQUE violation (23505) → 409, không thành công giả", async () => {
  insertErrorCode = "23505";
  const res = await postRequest({
    code: "RACE1",
    discount_type: "percentage",
    discount_value: 10,
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /đã tồn tại/);
});

test("VC7 — mã normalize: trim + uppercase trước khi kiểm tra trùng", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "SUMMER20", status: "active" });
  const res = await postRequest({
    code: "  summer20  ",
    discount_type: "percentage",
    discount_value: 20,
  });
  assert.equal(res.status, 409, "mã '  summer20  ' phải normalize thành 'SUMMER20' và bị chặn trùng");
});

test("VC8 — không gọi upsert (kiểm tra không có action 'upsert')", async () => {
  const res = await postRequest({
    code: "NEWONE",
    discount_type: "fixed_amount",
    discount_value: 5000,
  });
  assert.equal(res.status, 200);
  const upsertCalls = calls.filter((c) => c.action === "upsert");
  assert.equal(upsertCalls.length, 0, "không được dùng upsert");
});
