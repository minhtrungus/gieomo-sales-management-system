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
let updateErrorCode: string | null = null;

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
      if (state.op === "update") {
        if (updateErrorCode) {
          return Promise.resolve({ data: null, error: { code: updateErrorCode, message: "duplicate key value violates unique constraint" } });
        }
        const found = vouchersTable.find((r) =>
          state.filters.every((f) => r[f.key] === f.value)
        );
        if (!found) return Promise.resolve({ data: null, error: { message: "not found" } });
        Object.assign(found, state.payload as object);
        return Promise.resolve({ data: { ...found }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then<A, B>(
      onFulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
      onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
    ): Promise<A | B> {
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
  calls.length = 0;
  vouchersTable = [];
  updateErrorCode = null;
});

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

test("PC1 — giữ nguyên mã, cập nhật trường khác → thành công", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "SUMMER20", status: "active", discount_value: 20 });
  const res = await patchRequest({ id: UUID_A, discount_value: 25 });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; voucher: { discount_value: number; code: string } };
  assert.equal(body.success, true);
  assert.equal(body.voucher.discount_value, 25);
  assert.equal(body.voucher.code, "SUMMER20", "mã không đổi");
});

test("PC2 — đổi sang mã mới chưa tồn tại → thành công", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "OLD20", status: "active" });
  const res = await patchRequest({ id: UUID_A, code: "NEW20" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; voucher: { code: string } };
  assert.equal(body.success, true);
  assert.equal(body.voucher.code, "NEW20");
});

test("PC3 — đổi sang mã của voucher khác → 409, không ghi đè", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "CODE_A", status: "active" });
  vouchersTable.push({ voucher_id: UUID_B, code: "CODE_B", status: "active" });
  const res = await patchRequest({ id: UUID_A, code: "CODE_B" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /đã tồn tại/);
  const voucherB = vouchersTable.find((v) => v.voucher_id === UUID_B);
  assert.equal(voucherB?.code, "CODE_B", "voucher B không bị ghi đè");
});

test("PC4 — hai voucher đổi sang cùng một mã → chỉ một thành công", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "CODE_A", status: "active" });
  vouchersTable.push({ voucher_id: UUID_B, code: "CODE_B", status: "active" });

  const resA = await patchRequest({ id: UUID_A, code: "SHARED" });
  assert.equal(resA.status, 200);

  const resB = await patchRequest({ id: UUID_B, code: "SHARED" });
  assert.equal(resB.status, 409);
});

test("PC5 — concurrent: update bị UNIQUE violation (23505) → 409", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "RACE_OLD", status: "active" });
  updateErrorCode = "23505";
  const res = await patchRequest({ id: UUID_A, code: "RACE_NEW" });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /đã tồn tại/);
});

test("PC6 — request không có code → không thay đổi mã", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "KEEPME", status: "active" });
  const res = await patchRequest({ id: UUID_A, status: "inactive" });
  assert.equal(res.status, 200);
  const voucher = vouchersTable.find((v) => v.voucher_id === UUID_A);
  assert.equal(voucher?.code, "KEEPME", "mã giữ nguyên");
  assert.equal(voucher?.status, "inactive");
});

test("PC7 — code rỗng / whitespace → 400, không gọi update", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "VALID", status: "active" });
  const res = await patchRequest({ id: UUID_A, code: "   " });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /không được để trống/);
  const updateCalls = calls.filter((c) => c.action === "update");
  assert.equal(updateCalls.length, 0, "không gọi update");
});

test("PC8 — code normalize trim + uppercase trước khi kiểm tra trùng", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "CODE_A", status: "active" });
  vouchersTable.push({ voucher_id: UUID_B, code: "SUMMER20", status: "active" });
  const res = await patchRequest({ id: UUID_A, code: "  summer20  " });
  assert.equal(res.status, 409, "phải normalize thành SUMMER20 và bị chặn trùng");
});

test("PC9 — giữ nguyên mã của chính nó (gửi lại code hiện tại) → thành công", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "SAME20", status: "active" });
  const res = await patchRequest({ id: UUID_A, code: "SAME20", discount_value: 30 });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; voucher: { code: string; discount_value: number } };
  assert.equal(body.success, true);
  assert.equal(body.voucher.code, "SAME20");
  assert.equal(body.voucher.discount_value, 30);
});

test("PC10 — tìm theo code cũ (non-UUID id) khi đổi mã → thành công", async () => {
  vouchersTable.push({ voucher_id: UUID_A, code: "LOOKUP", status: "active" });
  const res = await patchRequest({ id: "LOOKUP", code: "RENAMED" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; voucher: { code: string } };
  assert.equal(body.success, true);
  assert.equal(body.voucher.code, "RENAMED");
});
