import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Batch 2G — MOCK/UNIT tests cho inventoryAdjustService
 * (validate + executeStockAdjustment + postAdjustStock).
 *
 * File này chạy KHÔNG cần PostgreSQL — mô phỏng supabase.rpc.
 * PG concurrency cho RPC adjust_variant_stock nằm ở
 * tests/adjustStockPg.integration.test.ts (tự SKIP khi thiếu env).
 *
 * Map yêu cầu → tests:
 *   M1  delta dương hợp lệ → applied (đúng tham số RPC, relative)
 *   M2  delta âm hợp lệ → applied
 *   M3  delta = 0 / không nguyên / thiếu variant / thiếu reason/key → invalid
 *   M4  RPC outcome insufficient_stock → status insufficient_stock (fail-closed)
 *   M5  RPC outcome not_found → status not_found
 *   M6  duplicate key payload giống → status duplicate, applied=false
 *   M7  duplicate key payload khác (23505 ledger / RAISE mismatch) → idempotency_mismatch
 *   M8  RPC lỗi / outcome lạ / dữ liệu null → error, KHÔNG có applied=true
 *   M9  PGRST202 (thiếu function) → rpc_unavailable
 *   M10 postAdjustStock: HTTP 200 applied → ok=true; HTTP 409 insufficient →
 *       ok=false; fetch throw → throw (giữ key retry)
 */

const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

const {
  validateAdjustStockInput,
  executeStockAdjustment,
  postAdjustStock,
} = await import("../src/lib/services/inventoryAdjustService.ts");

type RpcCall = { name: string; args: Record<string, unknown> };
type RpcError = { code?: string; message?: string; details?: string };

function makeSupabase(
  impl: (name: string, args: Record<string, unknown>) => { data: unknown; error?: RpcError | null },
  calls: RpcCall[] = []
) {
  return {
    async rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: RpcError | null }> {
      calls.push({ name, args });
      const r = impl(name, args);
      return { data: r.data, error: r.error ?? null };
    },
  };
}

const validBody = {
  variantId: V1,
  delta: 3,
  reason: "Kiểm kê định kỳ",
  idempotencyKey: "idem-key-1",
};

// --- M1/M2: delta dương / âm hợp lệ ---
test("M1 — delta dương hợp lệ → applied, gọi RPC đúng tham số relative", async () => {
  const calls: RpcCall[] = [];
  const supabase = makeSupabase(
    () => ({
      data: {
        outcome: "applied",
        variantId: V1,
        delta: 3,
        stockBefore: 10,
        stockAfter: 13,
        reason: "Kiểm kê định kỳ",
        idempotencyKey: "idem-key-1",
      },
      error: null,
    }),
    calls
  );

  const v = validateAdjustStockInput(validBody);
  assert.equal(v.ok, true);
  if (!v.ok) return;

  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "applied");
  assert.equal(r.applied, true);
  assert.equal(r.duplicate, false);
  assert.equal(r.stockBefore, 10);
  assert.equal(r.stockAfter, 13);

  // RPC đúng tên + đúng tham số relative (KHÔNG có absolute stock)
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "adjust_variant_stock");
  assert.equal(calls[0].args.p_variant_id, V1);
  assert.equal(calls[0].args.p_delta, 3);
  assert.equal(calls[0].args.p_idempotency_key, "idem-key-1");
  assert.ok(!("p_new_stock" in calls[0].args), "không gửi absolute stock");
});

test("M2 — delta âm hợp lệ → applied với delta âm", async () => {
  const calls: RpcCall[] = [];
  const supabase = makeSupabase(
    () => ({
      data: { outcome: "applied", variantId: V1, delta: -2, stockBefore: 10, stockAfter: 8 },
      error: null,
    }),
    calls
  );

  const v = validateAdjustStockInput({ ...validBody, delta: -2 });
  assert.equal(v.ok, true);
  if (!v.ok) return;

  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "applied");
  assert.equal(calls[0].args.p_delta, -2);
});

// --- M3: input không hợp lệ ---
test("M3 — delta=0, không nguyên, thiếu variant/reason/key → invalid", () => {
  assert.equal(validateAdjustStockInput({ ...validBody, delta: 0 }).ok, false);
  assert.equal(validateAdjustStockInput({ ...validBody, delta: 1.5 }).ok, false);
  assert.equal(validateAdjustStockInput({ ...validBody, delta: "3" }).ok, false);
  assert.equal(validateAdjustStockInput({ ...validBody, variantId: "not-a-uuid" }).ok, false);
  assert.equal(validateAdjustStockInput({ ...validBody, variantId: "" }).ok, false);
  assert.equal(validateAdjustStockInput({ ...validBody, reason: "  " }).ok, false);
  assert.equal(validateAdjustStockInput({ ...validBody, idempotencyKey: "" }).ok, false);
  assert.equal(validateAdjustStockInput({ ...validBody, delta: 2_000_000 }).ok, false);
  assert.equal(validateAdjustStockInput(null).ok, false);
});

// --- M4: insufficient_stock ---
test("M4 — RPC outcome insufficient_stock → status insufficient_stock, không applied", async () => {
  const supabase = makeSupabase(() => ({
    data: { outcome: "insufficient_stock", variantId: V1, stockBefore: 1, delta: -5 },
    error: null,
  }));
  const v = validateAdjustStockInput({ ...validBody, delta: -5 });
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "insufficient_stock");
  assert.equal(r.applied, false);
  assert.equal(r.stockAfter, null);
});

// --- M5: not_found ---
test("M5 — RPC outcome not_found → status not_found", async () => {
  const supabase = makeSupabase(() => ({
    data: { outcome: "not_found", variantId: V1 },
    error: null,
  }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "not_found");
  assert.equal(r.applied, false);
});

// --- M6: duplicate payload giống ---
test("M6 — duplicate key payload giống → status duplicate, applied=false, duplicate=true", async () => {
  const supabase = makeSupabase(() => ({
    data: {
      outcome: "duplicate",
      variantId: V1,
      delta: 3,
      stockBefore: 13,
      stockAfter: 16,
      reason: "Kiểm kê định kỳ",
      idempotencyKey: "idem-key-1",
    },
    error: null,
  }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "duplicate");
  assert.equal(r.applied, false, "duplicate KHÔNG được coi là applied mới");
  assert.equal(r.duplicate, true);
});

// --- M7: duplicate key payload khác → fail-closed ---
test("M7a — 23505 trên ledger constraint → idempotency_mismatch, không applied", async () => {
  const supabase = makeSupabase(() => ({
    data: null,
    error: {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "uq_inventory_adjustments_idempotency_key"',
    },
  }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "idempotency_mismatch");
  assert.equal(r.applied, false);
  assert.equal(r.retryable, false);
});

test("M7b — RAISE B2G:IDEMPOTENCY_PAYLOAD_MISMATCH → idempotency_mismatch", async () => {
  const supabase = makeSupabase(() => ({
    data: null,
    error: {
      code: "P0001",
      message: 'Idempotency key "idem-key-1" đã dùng cho điều chỉnh KHÁC',
      details: "B2G:IDEMPOTENCY_PAYLOAD_MISMATCH",
    },
  }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "idempotency_mismatch");
  assert.equal(r.applied, false);
});

// --- M8: lỗi RPC / outcome lạ / dữ liệu null ---
test("M8a — RPC error chung → error, retryable, không applied", async () => {
  const supabase = makeSupabase(() => ({
    data: null,
    error: { code: "XX000", message: "connection lost" },
  }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "error");
  assert.equal(r.applied, false);
  assert.equal(r.retryable, true);
});

test("M8b — outcome lạ → error fail-closed (không có applied=true)", async () => {
  const supabase = makeSupabase(() => ({
    data: { outcome: "weird_unknown" },
    error: null,
  }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "error");
  assert.equal(r.applied, false);
  assert.equal(r.duplicate, false);
});

test("M8c — data null → error fail-closed", async () => {
  const supabase = makeSupabase(() => ({ data: null, error: null }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "error");
  assert.equal(r.applied, false);
});

test("M8d — rpc throw exception → error retryable, không applied", async () => {
  const supabase = {
    async rpc() {
      throw new Error("network reset");
    },
  };
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "error");
  assert.equal(r.applied, false);
  assert.equal(r.retryable, true);
});

// --- M9: PGRST202 (thiếu function) ---
test("M9 — PGRST202 (thiếu RPC) → rpc_unavailable, retryable", async () => {
  const supabase = makeSupabase(() => ({
    data: null,
    error: {
      code: "PGRST202",
      message: "Could not find the function public.adjust_variant_stock in the schema cache",
    },
  }));
  const v = validateAdjustStockInput(validBody);
  assert.ok(v.ok);
  if (!v.ok) return;
  const r = await executeStockAdjustment(supabase, v.input);
  assert.equal(r.status, "rpc_unavailable");
  assert.equal(r.applied, false);
  assert.equal(r.retryable, true);
  assert.match(r.message, /migration 019/i);
});

// --- M10: postAdjustStock HTTP behavior ---
test("M10a — HTTP 200 outcome applied → ok=true với result", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: true, outcome: "applied", stockBefore: 10, stockAfter: 13 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const r = await postAdjustStock({
      variantId: V1,
      delta: 3,
      reason: "Nhập kho",
      idempotencyKey: "k1",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.result.status, "applied");
      assert.equal(r.result.applied, true);
      assert.equal(r.result.stockAfter, 13);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("M10b — HTTP 409 insufficient_stock → ok=false với message (không false success)", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: false, outcome: "insufficient_stock", error: "Tồn kho không đủ" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const r = await postAdjustStock({
      variantId: V1,
      delta: -99,
      reason: "Xuất kho",
      idempotencyKey: "k2",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.message, /Tồn kho không đủ/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("M10c — HTTP 409 idempotency_mismatch → ok=false", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: false, outcome: "idempotency_mismatch", error: "key đã dùng" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const r = await postAdjustStock({
      variantId: V2,
      delta: 3,
      reason: "Lý do",
      idempotencyKey: "k3",
    });
    assert.equal(r.ok, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("M10d — fetch throw (timeout) → throw để caller GIỮ key retry", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        postAdjustStock({
          variantId: V1,
          delta: 1,
          reason: "Nhập kho",
          idempotencyKey: "k4",
        }),
      /thử lại/i
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("M10e — HTTP 200 outcome duplicate → ok=true, duplicate (idempotent)", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: true, outcome: "duplicate", alreadyApplied: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const r = await postAdjustStock({
      variantId: V1,
      delta: 3,
      reason: "Nhập kho",
      idempotencyKey: "k5",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.result.status, "duplicate");
      assert.equal(r.result.applied, false);
      assert.equal(r.result.duplicate, true);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("M10f — HTTP 503 rpc_unavailable → ok=false", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ success: false, outcome: "rpc_unavailable", error: "cần apply migration 019" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const r = await postAdjustStock({
      variantId: V1,
      delta: 1,
      reason: "Nhập kho",
      idempotencyKey: "k6",
    });
    assert.equal(r.ok, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});
