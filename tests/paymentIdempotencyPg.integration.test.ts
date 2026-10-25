import { test } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PG integration — payments unique constraint (Batch 2E, migration 018) —
 * CHỈ chạy khi có cả module `pg` VÀ ATOMIC_PG_URL trỏ PostgreSQL đã apply
 * migrations (001→018).
 *
 *   - Repo KHÔNG có driver PG (`pg` không phải dependency) → mặc định SKIP.
 *   - File này KHÔNG apply migration, KHÔNG chạy ngoài vòng ROLLBACK trừ
 *     phần seed committed có dọn sạch ở cuối.
 *   - KHI SKIP: tuyệt đối KHÔNG tuyên bố unique-constraint concurrency
 *     đã nghiệm thu.
 *
 * Prove ở đây: unique index uq_payments_order_transaction_code chặn 2 INSERT
 * đồng thời cùng (order_id, transaction_code) ở tầng PostgreSQL (lớp DB).
 * Mapping 23505 → duplicate:true của recordPaymentOnce() được unit-test bằng
 * mock (tests/paymentRecordService.test.ts) — PostgREST không có trong repo.
 */

// @ts-expect-error pg là optional (không có trong package.json) — test tự SKIP khi thiếu
const pgMod: any = await import("pg").catch(() => null);
const ATOMIC_PG_URL = process.env.ATOMIC_PG_URL;
const canRun = Boolean(pgMod && ATOMIC_PG_URL);
const skipReason = !pgMod
  ? "thiếu module pg (không phải dependency của repo) — NOT RUN"
  : !ATOMIC_PG_URL
    ? "thiếu ATOMIC_PG_URL — NOT RUN"
    : "";

async function withClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function indexExists(client: any, name: string): Promise<boolean> {
  const res = await client.query(
    "SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1",
    [name]
  );
  return res.rowCount > 0;
}

const mkToken = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function mkCustomer(client: any, token: string): Promise<string> {
  const phone = `09${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)}`;
  const r = await client.query(
    "INSERT INTO public.customers (full_name, phone) VALUES ($1, $2) RETURNING customer_id",
    [`PG2E ${token}`, phone]
  );
  return r.rows[0].customer_id as string;
}

async function mkOrder(client: any, customerId: string, token: string): Promise<{ orderId: string; orderCode: string }> {
  const orderCode = `PG2E-${token}`;
  const r = await client.query(
    `INSERT INTO public.orders
       (order_code, customer_id, receiver_name, receiver_phone, delivery_type,
        subtotal, final_amount, order_status, payment_status)
     VALUES ($1, $2, $3, $4, 'home_delivery', 100000, 100000, 'pending', 'pending')
     RETURNING order_id`,
    [orderCode, customerId, `PG2E ${token}`, "0900000000"]
  );
  return { orderId: r.rows[0].order_id as string, orderCode };
}

async function cleanup(client: any, orderId: string, customerId: string): Promise<void> {
  await client.query("DELETE FROM public.payments WHERE order_id = $1", [orderId]);
  await client.query("DELETE FROM public.orders WHERE order_id = $1", [orderId]);
  await client.query("DELETE FROM public.customers WHERE customer_id = $1", [customerId]);
}

// ============================================================
// T1 — 2 INSERT đồng thời cùng (order_id, transaction_code) → đúng 1 row.
//      Request thua nhận 23505 TRÊN constraint thanh toán.
// ============================================================
test("PG 2E T1 — 2 INSERT đồng thời cùng (order_id, transaction_code) → 1 row, 1×23505", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const clientA = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  const clientB = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  await clientA.connect();
  await clientB.connect();
  try {
    if (!(await indexExists(clientA, "uq_payments_order_transaction_code"))) {
      t.skip("index uq_payments_order_transaction_code chưa tồn tại — apply migration 018 trước");
      return;
    }

    const token = mkToken("T1");
    const customerId = await mkCustomer(clientA, token);
    const { orderId } = await mkOrder(clientA, customerId, token);
    const txCode = `REF-${token}`;

    const insertSql = `INSERT INTO public.payments
       (order_id, payment_method, amount, payment_status, transaction_code)
     VALUES ($1, 'banking', 100000, 'paid', $2)`;

    // Hai kết nối THẬT, bắn song song (không await lần lượt).
    const [resA, resB] = await Promise.allSettled([
      clientA.query(insertSql, [orderId, txCode]),
      clientB.query(insertSql, [orderId, txCode]),
    ]);

    const settled = [resA, resB];
    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const rejected = settled.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "đúng 1 INSERT thành công");
    assert.equal(rejected.length, 1, "đúng 1 INSERT bị unique violation");

    const rej = (rejected[0] as PromiseRejectedResult).reason;
    assert.equal(rej.code, "23505", `lỗi phải là 23505, got ${rej.code}: ${rej.message}`);
    assert.ok(
      String(rej.message).includes("uq_payments_order_transaction_code"),
      `23505 phải trên constraint thanh toán, got: ${rej.message}`
    );

    // Kiểm tra DB: đúng 1 row cho cặp (order_id, txCode)
    const countRes = await clientA.query(
      "SELECT COUNT(*)::int AS n FROM public.payments WHERE order_id = $1 AND transaction_code = $2",
      [orderId, txCode]
    );
    assert.equal(countRes.rows[0].n, 1, "DB phải giữ đúng 1 payment row");

    await cleanup(clientA, orderId, customerId);
  } finally {
    await clientA.end();
    await clientB.end();
  }
});

// ============================================================
// T2 — nhiều giao dịch thật khác nhau được ghi lại, nhưng chỉ một row paid.
// ============================================================
test("PG 2E T2 — 2 transaction_code khác nhau cùng order → 1 paid + 1 pending", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await indexExists(client, "uq_payments_order_transaction_code"))) {
      t.skip("index uq_payments_order_transaction_code chưa tồn tại — apply migration 018 trước");
      return;
    }

    const token = mkToken("T2");
    const customerId = await mkCustomer(client, token);
    const { orderId } = await mkOrder(client, customerId, token);

    const insertSql = `INSERT INTO public.payments
       (order_id, payment_method, amount, payment_status, transaction_code)
     VALUES ($1, 'banking', 100000, 'paid', $2)`;

    await client.query(insertSql, [orderId, `REF-${token}-A`]);
    await client.query(
      `INSERT INTO public.payments
         (order_id, payment_method, amount, payment_status, transaction_code)
       VALUES ($1, 'banking', 100000, 'pending', $2)`,
      [orderId, `REF-${token}-B`]
    );

    const countRes = await client.query(
      "SELECT COUNT(*)::int AS n FROM public.payments WHERE order_id = $1",
      [orderId]
    );
    assert.equal(countRes.rows[0].n, 2, "hai money events khác nhau phải cùng được ghi");
    const statuses = await client.query(
      "SELECT payment_status::text AS status, count(*)::int AS n FROM public.payments WHERE order_id = $1 GROUP BY payment_status ORDER BY status",
      [orderId]
    );
    assert.deepEqual(statuses.rows, [
      { status: "paid", n: 1 },
      { status: "pending", n: 1 },
    ]);

    await cleanup(client, orderId, customerId);
  });
});

// ============================================================
// T3 — retry tuần tự cùng code → lần 2 23505 (mô phỏng app-level SELECT
//      đã bỏ qua, còn lại lớp DB chặn — cùng contract với recordPaymentOnce).
// ============================================================
test("PG 2E T3 — INSERT lần 2 cùng (order_id, txCode) → 23505 trên constraint", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await indexExists(client, "uq_payments_order_transaction_code"))) {
      t.skip("index uq_payments_order_transaction_code chưa tồn tại — apply migration 018 trước");
      return;
    }

    const token = mkToken("T3");
    const customerId = await mkCustomer(client, token);
    const { orderId } = await mkOrder(client, customerId, token);
    const txCode = `REF-${token}`;

    const insertSql = `INSERT INTO public.payments
       (order_id, payment_method, amount, payment_status, transaction_code)
     VALUES ($1, 'banking', 100000, 'paid', $2)`;

    await client.query(insertSql, [orderId, txCode]);

    await assert.rejects(
      () => client.query(insertSql, [orderId, txCode]),
      (err: any) => {
        assert.equal(err.code, "23505");
        assert.ok(String(err.message).includes("uq_payments_order_transaction_code"));
        return true;
      },
      "INSERT thứ 2 cùng cặp phải 23505 trên constraint thanh toán"
    );

    await cleanup(client, orderId, customerId);
  });
});

// ============================================================
// T4 — DEFENSE: index tồn tại + đúng định nghĩa (partial WHERE NOT NULL).
//      transaction_code NULL không bị chặn (nhiều NULL OK).
// ============================================================
test("PG 2E T4 — index đúng định nghĩa + transaction_code NULL không bị chặn", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await indexExists(client, "uq_payments_order_transaction_code"))) {
      t.skip("index uq_payments_order_transaction_code chưa tồn tại — apply migration 018 trước");
      return;
    }

    const defRes = await client.query(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_payments_order_transaction_code'"
    );
    const def: string = defRes.rows[0].indexdef;
    assert.ok(def.includes("(order_id, transaction_code)"), `indexdef phải chứa (order_id, transaction_code), got: ${def}`);
    assert.ok(def.includes("transaction_code IS NOT NULL"), `indexdef phải partial WHERE NOT NULL, got: ${def}`);

    // transaction_code NULL: 2 rows cùng order phải được phép (partial index)
    const token = mkToken("T4");
    const customerId = await mkCustomer(client, token);
    const { orderId } = await mkOrder(client, customerId, token);

    const insertNull = `INSERT INTO public.payments
       (order_id, payment_method, amount, payment_status, transaction_code)
     VALUES ($1, 'banking', 100000, 'pending', NULL)`;
    await client.query(insertNull, [orderId]);
    await client.query(insertNull, [orderId]);

    const countRes = await client.query(
      "SELECT COUNT(*)::int AS n FROM public.payments WHERE order_id = $1 AND transaction_code IS NULL",
      [orderId]
    );
    assert.equal(countRes.rows[0].n, 2, "2 rows NULL transaction_code phải được phép");

    await cleanup(client, orderId, customerId);
  });
});
