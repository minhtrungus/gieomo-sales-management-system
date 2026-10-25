import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { createFakeOrderDb, type FakeOrderDb, type HookContext } from "./helpers/fakeOrderDb.ts";

/**
 * Batch C — Orphan Payment Detector (reconciliationService, READ-ONLY).
 *
 * Định nghĩa orphan (theo schema 001 — payments.order_id FK → orders):
 *   (a) order_id IS NULL            → null_order_id_count
 *   (b) order_id trỏ order KHÔNG tồn tại trong DB → missing_order_count
 * Chống false-positive: payment gắn đơn ngoài cửa sổ thời gian (đơn tồn tại
 * nhưng created_at trước start_date) được query xác minh orders .in() riêng
 * → KHÔNG đếm là orphan.
 *
 * Tests:
 *   O1  không có payment → orphan count = 0 (dữ liệu rỗng)
 *   O2  order_id null → null orphan + sample order_id null
 *   O3  order_id trỏ đơn không tồn tại → missing orphan
 *   O4  đơn outside-window (tồn tại trong DB) → KHÔNG false-positive
 *   O5  duplicate payments gắn đơn hợp lệ → không phải orphan
 *   O6  end_date date-only bao trọn ngày (T23:59:59.999Z)
 *   O7  dữ liệu lớn (250 orders + 5 orphan) → count chính xác, samples ≤ 20
 *   O8  lỗi query window payments → THROW "Không thể quét thanh toán mồ côi"
 *   O9  lỗi query xác minh orders → THROW "Không thể xác minh thanh toán mồ côi"
 *   O10 contract: window payments select ⊆ cột schema 001
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "@/lib/supabase/admin": "mock:supabase-admin",
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
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export function createAdminClient() { return globalThis.__fakeOrderDb; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { getReconciliationDataServer } = await import("../src/lib/services/reconciliationService.ts");

const ORDER_A = "11111111-1111-4111-8111-111111111111";
const ORDER_OUT = "55555555-5555-4555-8555-555555555555"; // outside-window (tồn tại)
const MISSING_ORDER = "99999999-9999-4999-8999-999999999999"; // không tồn tại

const g = globalThis as unknown as { __fakeOrderDb?: unknown };

function orderRow(id: string, code: string, createdAt: string) {
  return {
    order_id: id,
    order_code: code,
    order_status: "pending",
    payment_status: "paid",
    final_amount: 100000,
    subtotal: 100000,
    shipping_fee: 0,
    voucher_discount: 0,
    created_at: createdAt,
  };
}

function seedDb(opts: {
  payments?: Array<Record<string, unknown>>;
  extraOrders?: Array<Record<string, unknown>>;
} = {}): FakeOrderDb {
  const db = createFakeOrderDb({
    products: [],
    product_variants: [],
    customers: [],
    members: [],
    order_items: [],
    order_status_history: [],
    order_idempotency: [],
    orders: [orderRow(ORDER_A, "GM-ORP01", "2026-01-05T00:00:00.000Z"), ...(opts.extraOrders || [])],
    payments: opts.payments || [],
  });
  g.__fakeOrderDb = db;
  return db;
}

// ============================================================
// O1 — dữ liệu rỗng: không có payment → orphan = 0
// ============================================================
test("O1 — không payment nào → orphan_payments count = 0, samples = []", async () => {
  seedDb();
  const res = await getReconciliationDataServer();
  const o = res.summary.orphan_payments;
  assert.ok(o, "summary phải có orphan_payments");
  assert.equal(o.count, 0);
  assert.equal(o.null_order_id_count, 0);
  assert.equal(o.missing_order_count, 0);
  assert.deepEqual(o.samples, []);
});

// ============================================================
// O2 — order_id IS NULL → null orphan
// ============================================================
test("O2 — payment order_id null → null_order_id_count = 1, sample order_id null", async () => {
  seedDb({
    payments: [
      {
        payment_id: "pay-null-1",
        order_id: null,
        payment_method: "banking",
        amount: 20000,
        payment_status: "paid",
        transaction_code: "REF-NULL-1",
        created_at: "2026-01-06T01:00:00.000Z",
      },
    ],
  });
  const res = await getReconciliationDataServer();
  const o = res.summary.orphan_payments;
  assert.equal(o.count, 1);
  assert.equal(o.null_order_id_count, 1);
  assert.equal(o.missing_order_count, 0);
  assert.equal(o.samples[0].payment_id, "pay-null-1");
  assert.equal(o.samples[0].order_id, null);
  assert.equal(o.samples[0].amount, 20000);
});

// ============================================================
// O3 — order_id trỏ order KHÔNG tồn tại → missing orphan
// ============================================================
test("O3 — payment trỏ order không tồn tại → missing_order_count = 1", async () => {
  seedDb({
    payments: [
      {
        payment_id: "pay-missing-1",
        order_id: MISSING_ORDER,
        payment_method: "banking",
        amount: 30000,
        payment_status: "paid",
        transaction_code: "REF-MISS-1",
        created_at: "2026-01-06T02:00:00.000Z",
      },
    ],
  });
  const res = await getReconciliationDataServer();
  const o = res.summary.orphan_payments;
  assert.equal(o.count, 1);
  assert.equal(o.missing_order_count, 1);
  assert.equal(o.null_order_id_count, 0);
  assert.equal(o.samples[0].order_id, MISSING_ORDER);
});

// ============================================================
// O4 — đơn outside-window (tồn tại thật) → KHÔNG false-positive
// ============================================================
test("O4 — payment gắn đơn tồn tại nhưng outside start_date → KHÔNG đếm orphan", async () => {
  seedDb({
    extraOrders: [orderRow(ORDER_OUT, "GM-ORPOUT", "2025-12-01T00:00:00.000Z")],
    payments: [
      {
        payment_id: "pay-outside-1",
        order_id: ORDER_OUT,
        payment_method: "banking",
        amount: 40000,
        payment_status: "paid",
        transaction_code: "REF-OUT-1",
        created_at: "2026-01-07T03:00:00.000Z",
      },
    ],
  });
  // start_date = 2026-01-01 → ORDER_OUT (2025-12-01) không nằm trong cửa sổ
  // orders, nhưng order TỒN TẠI trong DB → verification query xác nhận → không orphan.
  const res = await getReconciliationDataServer({ start_date: "2026-01-01T00:00:00.000Z" });
  const o = res.summary.orphan_payments;
  assert.equal(o.count, 0, "order tồn tại ngoài cửa sổ không phải orphan");
  assert.equal(res.summary.total_orders, 1, "ORDER_OUT bị loại khỏi cửa sổ orders");
});

// ============================================================
// O5 — duplicate payments gắn đơn hợp lệ → không phải orphan
// ============================================================
test("O5 — 2 payments trùng gắn đơn hợp lệ → orphan = 0 (không nhầm duplicate thành orphan)", async () => {
  seedDb({
    payments: [
      {
        payment_id: "pay-dup-1",
        order_id: ORDER_A,
        payment_method: "banking",
        amount: 50000,
        payment_status: "paid",
        transaction_code: "REF-DUP-1",
        created_at: "2026-01-05T01:00:00.000Z",
      },
      {
        payment_id: "pay-dup-2",
        order_id: ORDER_A,
        payment_method: "banking",
        amount: 50000,
        payment_status: "paid",
        transaction_code: "REF-DUP-1",
        created_at: "2026-01-05T02:00:00.000Z",
      },
    ],
  });
  const res = await getReconciliationDataServer();
  assert.equal(res.summary.orphan_payments.count, 0);
  const rec = res.records.find((r) => r.order_id === ORDER_A);
  assert.ok(rec);
  assert.equal(rec.payments_count, 2, "cả 2 payments vẫn gắn vào record");
});

// ============================================================
// O6 — end_date date-only bao trọn cả ngày (T23:59:59.999Z)
// ============================================================
test("O6 — end_date YYYY-MM-DD: payment 23:00 ngày cuối VÀO cửa sổ, hôm sau RA cửa sổ", async () => {
  seedDb({
    payments: [
      {
        payment_id: "pay-end-in",
        order_id: null,
        payment_method: "banking",
        amount: 1000,
        payment_status: "paid",
        transaction_code: "REF-END-IN",
        created_at: "2026-01-31T23:00:00.000Z",
      },
      {
        payment_id: "pay-end-out",
        order_id: null,
        payment_method: "banking",
        amount: 2000,
        payment_status: "paid",
        transaction_code: "REF-END-OUT",
        created_at: "2026-02-01T01:00:00.000Z",
      },
    ],
  });
  const res = await getReconciliationDataServer({
    start_date: "2026-01-01T00:00:00.000Z",
    end_date: "2026-01-31",
  });
  const o = res.summary.orphan_payments;
  assert.equal(o.null_order_id_count, 1, "chỉ payment trong trọn ngày end được đếm");
  assert.equal(o.samples[0].payment_id, "pay-end-in");
});

// ============================================================
// O7 — dữ liệu lớn: 250 orders + 5 orphan → count chính xác, samples ≤ 20
// ============================================================
test("O7 — 250 orders + 5 orphan (3 null + 2 missing) → count = 5, samples ≤ 20", async () => {
  const manyOrders: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 250; i++) {
    manyOrders.push(
      orderRow(
        `70000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        `GM-BULK${String(i).padStart(4, "0")}`,
        "2026-01-10T00:00:00.000Z"
      )
    );
  }
  const orphanPays: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 3; i++) {
    orphanPays.push({
      payment_id: `pay-bulk-null-${i}`,
      order_id: null,
      payment_method: "banking",
      amount: 1000,
      payment_status: "paid",
      transaction_code: `REF-BN-${i}`,
      created_at: `2026-01-11T0${i}:00:00.000Z`,
    });
  }
  for (let i = 0; i < 2; i++) {
    orphanPays.push({
      payment_id: `pay-bulk-miss-${i}`,
      order_id: `80000000-0000-4000-8000-00000000000${i}`,
      payment_method: "banking",
      amount: 2000,
      payment_status: "paid",
      transaction_code: `REF-BM-${i}`,
      created_at: `2026-01-12T0${i}:00:00.000Z`,
    });
  }
  seedDb({ extraOrders: manyOrders, payments: orphanPays });

  const res = await getReconciliationDataServer();
  assert.equal(res.summary.total_orders, 251);
  const o = res.summary.orphan_payments;
  assert.equal(o.count, 5);
  assert.equal(o.null_order_id_count, 3);
  assert.equal(o.missing_order_count, 2);
  assert.ok(o.samples.length <= 20, "samples ≤ ORPHAN_PAYMENT_SAMPLE_LIMIT");
});

// ============================================================
// O8 — lỗi query window payments → THROW (không nuốt count=0)
// ============================================================
test("O8 — window payments query lỗi → THROW 'Không thể quét thanh toán mồ côi'", async () => {
  const db = seedDb();
  db.hook = (ctx: HookContext) => {
    // Window query = payments select KHÔNG có filter mảng (`.in` của chunk).
    if (
      ctx.table === "payments" &&
      ctx.op === "select" &&
      !ctx.filters.some(([, v]) => Array.isArray(v))
    ) {
      return { error: { code: "PGRST204", message: "boom-window" } };
    }
  };
  await assert.rejects(
    () => getReconciliationDataServer(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Không thể quét thanh toán mồ côi/);
      return true;
    },
    "lỗi window query phải ném — không nuốt thành orphan=0"
  );
  db.hook = null;
});

// ============================================================
// O9 — lỗi query xác minh orders .in() → THROW
// ============================================================
test("O9 — verification orders .in() lỗi → THROW 'Không thể xác minh thanh toán mồ côi'", async () => {
  const db = seedDb({
    payments: [
      {
        payment_id: "pay-verify-1",
        order_id: MISSING_ORDER,
        payment_method: "banking",
        amount: 5000,
        payment_status: "paid",
        transaction_code: "REF-VER-1",
        created_at: "2026-01-08T00:00:00.000Z",
      },
    ],
  });
  db.hook = (ctx: HookContext) => {
    // Verification query = orders select đúng cột "order_id" + filter mảng.
    if (
      ctx.table === "orders" &&
      ctx.op === "select" &&
      ctx.cols === "order_id" &&
      ctx.filters.some(([, v]) => Array.isArray(v))
    ) {
      return { error: { code: "PGRST204", message: "boom-verify" } };
    }
  };
  await assert.rejects(
    () => getReconciliationDataServer(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Không thể xác minh thanh toán mồ côi/);
      return true;
    }
  );
  db.hook = null;
});

// ============================================================
// O10 — contract cột: window payments select ⊆ schema 001
// ============================================================
test("O10 — window payments select chỉ dùng cột có trong migration 001", () => {
  const src = readFileSync(
    new URL("../src/lib/services/reconciliationService.ts", import.meta.url),
    "utf8"
  );
  const paymentsSchemaColumns = [
    "payment_id",
    "order_id",
    "payment_method",
    "amount",
    "payment_status",
    "transaction_code",
    "confirmed_by",
    "created_at",
    "updated_at",
  ];
  const selects = [...src.matchAll(/from\("payments"\)\s*\.select\("([^"]+)"\)/g)].map(
    (m) => m[1]
  );
  assert.ok(selects.length >= 2, "có ít nhất 2 payments select (chunk + window)");
  for (const sel of selects) {
    for (const col of sel.split(",").map((c) => c.trim())) {
      assert.ok(
        paymentsSchemaColumns.includes(col),
        `cột "${col}" không thuộc schema payments theo migration 001`
      );
    }
  }
});
