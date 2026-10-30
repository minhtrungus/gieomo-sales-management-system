import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { createFakeOrderDb, type FakeOrderDb, type HookContext } from "./helpers/fakeOrderDb.ts";

/**
 * Hotfix P1-F6 — đối soát payments chỉ dùng cột có căn cứ schema 001.
 *
 *   payments (001:269-279): payment_id, order_id, payment_method, amount,
 *   payment_status, transaction_code, confirmed_by, created_at, updated_at.
 *   KHÔNG có confirmed_at → select cột đó khiến PostgREST PGRST204 cho
 *   TOÀN bộ truy vấn; lỗi từng bị nuốt (im lặng) thành "không có giao dịch".
 *
 * Tests (MOCK/contract — không phải PostgreSQL integration):
 *   R1  payment records hợp lệ được đọc + verdict đúng + KHÔNG còn confirmed_at
 *   R2  lỗi query payments → THROW (không nuốt thành danh sách rỗng)
 *   R3  payments TRỐNG thật sự (0 dòng) → vẫn trả kết quả, verdict tính đúng
 *   R4  contract cột theo source: payments select ⊆ cột schema 001
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

const ORDER_A = "11111111-1111-4111-8111-111111111111"; // đã paid, khớp 100%
const ORDER_B = "22222222-2222-4222-8222-222222222222"; // chưa có payment

const g = globalThis as unknown as { __fakeOrderDb?: unknown };

function seedDb(opts: { withPayment?: boolean } = {}): FakeOrderDb {
  const db = createFakeOrderDb({
    products: [],
    product_variants: [],
    customers: [],
    members: [],
    order_items: [],
    order_status_history: [],
    order_idempotency: [],
    orders: [
      {
        order_id: ORDER_A,
        order_code: "GM-RECA1",
        order_status: "pending",
        payment_status: "paid",
        final_amount: 100000,
        subtotal: 100000,
        shipping_fee: 0,
        voucher_discount: 0,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        order_id: ORDER_B,
        order_code: "GM-RECB1",
        order_status: "pending",
        payment_status: "pending",
        final_amount: 50000,
        subtotal: 50000,
        shipping_fee: 0,
        voucher_discount: 0,
        created_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    payments: opts.withPayment === false
      ? []
      : [
          {
            payment_id: "pay-rec-1",
            order_id: ORDER_A,
            payment_method: "banking",
            amount: 100000,
            payment_status: "paid",
            transaction_code: "REF-REC-1",
            created_at: "2026-01-01T01:00:00.000Z",
          },
        ],
  });
  g.__fakeOrderDb = db;
  return db;
}

// ============================================================
// R1 — payment records hợp lệ được đọc, verdict đúng,
//      payments select KHÔNG còn confirmed_at
// ============================================================
test("R1 — payments hợp lệ được đọc + verdict OK/UNPAID + KHÔNG select confirmed_at", async () => {
  const db = seedDb();
  const paymentSelects: Array<string | undefined> = [];
  db.hook = (ctx: HookContext) => {
    if (ctx.table === "payments" && ctx.op === "select") {
      paymentSelects.push(ctx.cols);
    }
  };

  const res = await getReconciliationDataServer();

  assert.equal(res.summary.total_orders, 2);
  assert.equal(res.summary.status_counts.ok, 1, "đơn đã paid đủ tiền → OK");
  assert.equal(res.summary.status_counts.unpaid, 1, "đơn chưa có payment → UNPAID");

  const recA = res.records.find((r) => r.order_id === ORDER_A);
  assert.ok(recA);
  assert.equal(recA.paid_amount, 100000, "paid_amount tính từ payment record");
  assert.equal(recA.payments_count, 1);
  assert.equal(recA.payments[0].payment_id, "pay-rec-1");
  assert.equal(recA.payments[0].transaction_code, "REF-REC-1");
  assert.equal(recA.payments[0].status, "paid");
  assert.ok(recA.payments[0].created_at, "cột created_at có trong breakdown");
  assert.ok(
    !("confirmed_at" in recA.payments[0]),
    "breakdown KHÔNG còn field confirmed_at (không tồn tại trong schema 001)"
  );

  const recB = res.records.find((r) => r.order_id === ORDER_B);
  assert.ok(recB);
  assert.equal(recB.paid_amount, 0);
  assert.equal(recB.payments_count, 0);
  assert.equal(recB.reconciliation_status, "UNPAID");

  // Batch C — 2 lần: (1) chunk theo order_ids (Phase A classification),
  // (2) window scan theo created_at (orphan detector). Cả 2 đều chỉ
  // select cột schema 001, không confirmed_at.
  assert.equal(paymentSelects.length, 2, "query payments 2 lần (chunk + orphan window)");
  const chunkCols = String(paymentSelects[0]);
  assert.ok(
    chunkCols.includes("payment_status") && chunkCols.includes("transaction_code"),
    "chunk query giữ đầy đủ cột classification"
  );
  for (const sel of paymentSelects) {
    const cols = String(sel);
    assert.ok(cols.includes("payment_id"));
    assert.ok(!cols.includes("confirmed_at"), `payments select không được chứa confirmed_at, got: ${cols}`);
  }
  db.hook = null;
});

// ============================================================
// R2 — lỗi query payments → THROW, không nuốt thành "không có giao dịch"
// ============================================================
test("R2 — lỗi schema/query payments → THROW 'Không thể tải dữ liệu thanh toán đối soát'", async () => {
  const db = seedDb();
  db.hook = (ctx: HookContext) => {
    if (ctx.table === "payments" && ctx.op === "select") {
      return {
        error: {
          code: "PGRST204",
          message: "Could not find the 'confirmed_at' column of 'payments' in the schema cache",
        },
      };
    }
  };

  await assert.rejects(
    () => getReconciliationDataServer(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Không thể tải dữ liệu thanh toán đối soát/);
      return true;
    },
    "lỗi payments phải ném lỗi → route 500, KHÔNG trả danh sách rỗng"
  );
  db.hook = null;
});

// ============================================================
// R3 — payments TRỐNG (0 dòng, query thành công) → kết quả bình thường
//      → phân biệt "không có payment record" với "không query được"
// ============================================================
test("R3 — payments trống thật sự → không throw, verdict PAYMENT_MISMATCH/UNPAID tính đúng", async () => {
  const db = seedDb({ withPayment: false });

  const res = await getReconciliationDataServer();

  assert.equal(res.summary.total_orders, 2);
  const recA = res.records.find((r) => r.order_id === ORDER_A);
  assert.ok(recA);
  assert.equal(recA.payments_count, 0);
  assert.equal(recA.paid_amount, 0);
  assert.equal(
    recA.reconciliation_status,
    "PAYMENT_MISMATCH",
    "đơn ghi paid nhưng KHÔNG có record → PAYMENT_MISMATCH (khác với R2 = lỗi query)"
  );
  const recB = res.records.find((r) => r.order_id === ORDER_B);
  assert.ok(recB);
  assert.equal(recB.reconciliation_status, "UNPAID");
});

// ============================================================
// R4 — contract cột theo SOURCE: payments select ⊆ cột schema 001
// ============================================================
test("R4 — source contract: payments select chỉ dùng cột có trong migration 001", () => {
  const src = readFileSync(
    new URL("../src/lib/services/reconciliationService.ts", import.meta.url),
    "utf8"
  );

  // 001:269-279 — danh sách cột THẬT của bảng payments
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

  const m = src.match(/from\("payments"\)\s*\.select\("([^"]+)"\)/);
  assert.ok(m, "phải tìm thấy truy vấn .from(\"payments\").select(...) trong source");
  const selected = m![1].split(",").map((c) => c.trim());
  assert.ok(selected.length > 0);
  for (const col of selected) {
    assert.ok(
      paymentsSchemaColumns.includes(col),
      `cột "${col}" không thuộc schema payments theo migration 001`
    );
  }
  assert.ok(!selected.includes("confirmed_at"), "confirmed_at không tồn tại trong 001 → không được select");
});

test("R5 — giao dịch bổ sung pending không bị che bởi payment paid trước đó", async () => {
  const db = seedDb();
  db.tables.payments.push({
    payment_id: "pay-rec-additional",
    order_id: ORDER_A,
    payment_method: "banking",
    amount: 100000,
    payment_status: "pending",
    transaction_code: "REF-REC-ADDITIONAL",
    created_at: "2026-01-01T02:00:00.000Z",
  });

  const res = await getReconciliationDataServer();
  const recA = res.records.find((record) => record.order_id === ORDER_A);
  assert.ok(recA);
  assert.equal(recA.paid_amount, 100000, "chỉ payment paid được cộng vào số đã thu");
  assert.equal(recA.payments_count, 2, "payment pending vẫn phải xuất hiện trong ledger UI");
  assert.equal(recA.reconciliation_status, "NEEDS_REVIEW");
  assert.match(recA.reconciliation_reason, /1 giao dịch.*đang chờ đối soát/);
  assert.match(recA.action_recommended || "", /không xác nhận lại tự động/i);
});
