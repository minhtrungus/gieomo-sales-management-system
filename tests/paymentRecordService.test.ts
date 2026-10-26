import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordPaymentOnce,
  type PaymentDbError,
  type PaymentInsertRow,
} from "../src/lib/services/paymentRecordService.ts";

/**
 * Batch 2E — unit/mock tests cho recordPaymentOnce().
 *
 * Mục tiêu: verify 2 lớp chống trùng của recordPaymentOnce:
 *   Lớp 1 (app): SELECT-then-INSERT — retry tuần tự → duplicate, không insert.
 *   Lớp 2 (DB, migration 018): unique index uq_payments_order_transaction_code
 *     — race 2 request đồng thời cùng vượt SELECT → insert thua nhận 23505
 *     TRÊN constraint thanh toán → duplicate (fail-closed).
 *
 * ĐÂY LÀ MOCK TESTS: giả lập SupabaseLike. Bằng chứng concurrency PostgreSQL
 * THẬT nằm trong tests/paymentIdempotencyPg.integration.test.ts (skip khi
 * thiếu pg/ATOMIC_PG_URL). KHÔNG tuyên bố PG concurrency đã nghiệm thu ở đây.
 *
 * Map yêu cầu → tests:
 *   P1  insert thành công → recorded: true                 → "P1 ..."
 *   P2  23505 trên constraint thanh toán → duplicate       → "P2 ..."
 *   P3  lỗi DB khác → error, không duplicate               → "P3 ..."
 *   P4  23505 KHÔNG phải constraint thanh toán → fail closed → "P4 ..."
 *   P5  SELECT thấy đã tồn tại → duplicate, không insert   → "P5 ..."
 *   P6  SELECT lỗi → error, không duplicate                 → "P6 ..."
 *   P7  retry tuần tự: recorded rồi duplicate (1 dòng)     → "P7 ..."
 *   P8  race: 2 lần gọi cùng vượt SELECT, insert thua 23505 → "P8 ..."
 */

type InsertRow = PaymentInsertRow;

interface FakeDbOpts {
  selectResult?: { data: { payment_id: string } | null; error: PaymentDbError | null };
  insertResult?: { data: unknown; error: PaymentDbError | null };
  /** Bảng giả lập payments đã có sẵn (để SELECT thấy duplicate). */
  existingPayments?: InsertRow[];
}

/** SupabaseLike giả lập đúng subset mà recordPaymentOnce dùng. */
function makeDb(opts: FakeDbOpts = {}) {
  const inserted: InsertRow[] = [];
  const insertCalls: InsertRow[][] = [];

  const db = {
    from(table: string) {
      if (table !== "payments") throw new Error(`unexpected table: ${table}`);
      return {
        select(columns: string) {
          void columns;
          return {
            eq(columnOne: string, valueOne: unknown) {
              void columnOne;
              void valueOne;
              return {
                eq(columnTwo: string, valueTwo: unknown) {
                  void columnTwo;
                  void valueTwo;
                  return {
                    async maybeSingle() {
                      if (opts.selectResult) return opts.selectResult;
                      // Mặc định: không có sẵn → null (cho phép insert)
                      return { data: null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert(rows: InsertRow[]) {
          insertCalls.push(rows);
          return Promise.resolve(opts.insertResult ?? { data: null, error: null });
        },
      };
    },
    /** Helpers cho test assert. */
    _inserted: inserted,
    _insertCalls: insertCalls,
  };
  return db;
}

const INPUT = {
  orderId: "11111111-1111-1111-1111-111111111111",
  amount: 100000,
  transactionCode: "REF-P-1",
};

// ============================================================
// P1 — insert thành công → recorded: true
// ============================================================
test("P1 — insert thành công → recorded: true, duplicate: false, error: null", async () => {
  const db = makeDb({ insertResult: { data: null, error: null } });
  const rec = await recordPaymentOnce(db, INPUT);
  assert.deepEqual(rec, { recorded: true, duplicate: false, error: null });
  assert.equal(db._insertCalls.length, 1, "phải gọi insert đúng 1 lần");
  const row = db._insertCalls[0][0];
  assert.equal(row.order_id, INPUT.orderId);
  assert.equal(row.transaction_code, INPUT.transactionCode);
  assert.equal(row.payment_status, "paid", "cột THẬT của schema 001");
  assert.equal(row.amount, INPUT.amount);
  assert.equal(row.payment_method, "banking", "default khi không truyền");
});

// ============================================================
// P2 — 23505 TRÊN constraint thanh toán (migration 018) → duplicate
// ============================================================
test("P2 — insert gặp 23505 trên uq_payments_order_transaction_code → duplicate: true, error: null", async () => {
  const db = makeDb({
    insertResult: {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_payments_order_transaction_code"',
      },
    },
  });
  const rec = await recordPaymentOnce(db, INPUT);
  assert.deepEqual(rec, { recorded: false, duplicate: true, error: null });
});

// ============================================================
// P3 — lỗi DB KHÁC (không phải 23505) → giữ nguyên error, không duplicate
// ============================================================
test("P3 — lỗi DB khác (42P01 / connection) → error, KHÔNG nhận nhầm duplicate", async () => {
  const cases = [
    { code: "42P01", message: 'relation "payments" does not exist' },
    { code: "XX000", message: "connection reset" },
    { code: null, message: "fetch failed" },
  ];
  for (const err of cases) {
    const db = makeDb({ insertResult: { data: null, error: err } });
    const rec = await recordPaymentOnce(db, INPUT);
    assert.equal(rec.recorded, false);
    assert.equal(rec.duplicate, false, `không được coi là duplicate: ${err.code}`);
    assert.equal(rec.error, err.message, "giữ nguyên thông báo lỗi");
  }
});

// ============================================================
// P4 — 23505 NHƯNG không phải constraint thanh toán → fail closed
// ============================================================
test("P4 — 23505 trên constraint KHÔNG phải payments (PK/ lạ) → fail closed, không nuốt", async () => {
  const unrelated = [
    'duplicate key value violates unique constraint "payments_pkey"',
    'duplicate key value violates unique constraint "uq_orders_order_code"',
    "some other 23505 without constraint name",
  ];
  for (const message of unrelated) {
    const db = makeDb({ insertResult: { data: null, error: { code: "23505", message } } });
    const rec = await recordPaymentOnce(db, INPUT);
    assert.equal(rec.recorded, false);
    assert.equal(rec.duplicate, false, `không được coi duplicate: ${message}`);
    assert.equal(rec.error, message, "23505 lạ phải giữ nguyên thành error");
  }
});

// ============================================================
// P5 — SELECT thấy đã tồn tại → duplicate, KHÔNG insert (lớp app)
// ============================================================
test("P5 — SELECT thấy row đã tồn tại → duplicate: true, không gọi insert", async () => {
  const db = makeDb({
    selectResult: { data: { payment_id: "pay-existing" }, error: null },
  });
  const rec = await recordPaymentOnce(db, INPUT);
  assert.deepEqual(rec, { recorded: false, duplicate: true, error: null });
  assert.equal(db._insertCalls.length, 0, "KHÔNG được insert khi đã tồn tại");
});

// ============================================================
// P6 — SELECT lỗi → error, không duplicate, không insert
// ============================================================
test("P6 — SELECT lỗi → error, KHÔNG insert, KHÔNG duplicate", async () => {
  const db = makeDb({
    selectResult: { data: null, error: { message: "schema cache miss" } },
  });
  const rec = await recordPaymentOnce(db, INPUT);
  assert.equal(rec.recorded, false);
  assert.equal(rec.duplicate, false);
  assert.equal(rec.error, "schema cache miss");
  assert.equal(db._insertCalls.length, 0, "không được insert khi chưa xác định được");
});

// ============================================================
// P7 — retry tuần tự: recorded rồi duplicate (mô phỏng 2 lần gọi thật)
// ============================================================
test("P7 — retry tuần tự: call1 recorded, call2 duplicate (app-level dedupe)", async () => {
  // Call 1: SELECT null → insert ok
  const db1 = makeDb({ insertResult: { data: null, error: null } });
  const rec1 = await recordPaymentOnce(db1, INPUT);
  assert.equal(rec1.recorded, true);

  // Call 2 (retry): SELECT thấy row vừa insert (mô phỏng DB đã có) → duplicate
  const db2 = makeDb({
    selectResult: { data: { payment_id: "pay-1" }, error: null },
  });
  const rec2 = await recordPaymentOnce(db2, INPUT);
  assert.equal(rec2.recorded, false);
  assert.equal(rec2.duplicate, true, "retry phải là duplicate");
  assert.equal(db2._insertCalls.length, 0, "retry KHÔNG insert thêm");
});

// ============================================================
// P8 — race: 2 request cùng vượt SELECT, insert thua 23505 (lớp DB)
// ============================================================
test("P8 — race: cả 2 cùng vượt SELECT; request thua nhận 23505 → duplicate, 1 dòng", async () => {
  // Mô phỏng interleaving: cả 2 request đều thấy SELECT = null (chưa ai insert).
  // Request A insert OK. Request B insert → 23505 trên constraint thanh toán.
  const reqA = makeDb({ insertResult: { data: null, error: null } });
  const reqB = makeDb({
    insertResult: {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_payments_order_transaction_code"',
      },
    },
  });

  const [recA, recB] = await Promise.all([
    recordPaymentOnce(reqA, INPUT),
    recordPaymentOnce(reqB, INPUT),
  ]);

  // Request ghi thành công → recorded. Request thua race → duplicate.
  const results = [recA, recB];
  const recordedCount = results.filter((r) => r.recorded).length;
  const duplicateCount = results.filter((r) => r.duplicate).length;
  assert.equal(recordedCount, 1, "đúng 1 request recorded");
  assert.equal(duplicateCount, 1, "đúng 1 request duplicate (thua race 23505)");
  for (const r of results) {
    assert.equal(r.error, null, "không có lỗi nào được báo — cả 2 đều resolve bình thường");
  }
});

// ============================================================
// P9 — contract caller: duplicate được coi là "đã ghi nhận" (rec.recorded || rec.duplicate)
// ============================================================
test("P9 — contract caller: duplicate → paymentRecorded=true (rec.recorded || rec.duplicate)", async () => {
  const db = makeDb({
    insertResult: {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_payments_order_transaction_code"',
      },
    },
  });
  const rec = await recordPaymentOnce(db, INPUT);
  // Caller hiện tại (payment/route.ts, sepay/route.ts): rec.recorded || rec.duplicate
  const paymentRecorded = rec.recorded || rec.duplicate;
  assert.equal(paymentRecorded, true, "duplicate phải được coi là đã ghi nhận");
  assert.equal(rec.error, null, "duplicate không phải lỗi → caller không retry 500");
});
