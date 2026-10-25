import { test } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is a test-only runtime dependency without bundled TypeScript declarations.
const pg: any = await import("pg");

/**
 * P1/P2 — apply_payment_event atomicity + concurrency evidence
 * (batch PAYMENT-ATOMICITY-P1P2, theo discovery report A6.3).
 *
 * Yêu cầu: ATOMIC_PG_URL trỏ tới PostgreSQL isolated đã apply chuỗi canonical
 * 001→030 (apply_payment_event từ 023; cash contract 024; reject 029 —
 * file này KHÔNG đụng reject). KHÔNG apply migration; KHÔNG chạy ngoài
 * môi trường được cấp ATOMIC_PG_URL + GIEOMO_PG_ISOLATED=1.
 *
 * Fault injection dùng trigger pg_temp theo pattern paymentRejectionPg:
 * trigger sống trong session test; RPC raise → transaction aborted →
 * SAVEPOINT + ROLLBACK TO SAVEPOINT rồi đối chiếu baseline theo identifier
 * duy nhất của fixture (không assert absolute-zero toàn bảng).
 */

const url = process.env.ATOMIC_PG_URL;
const canRun = Boolean(url && process.env.GIEOMO_PG_ISOLATED === "1");

const AMOUNT = 100000;
const ADMIN = "00000000-0000-4000-8000-000000000029";

async function client() {
  const value = new pg.Client({ connectionString: url });
  await value.connect();
  return value;
}

async function seedActor(c: any) {
  await c.query(
    `INSERT INTO public.members(member_id,full_name,role,status) VALUES($1,'Apply-fault actor','admin','active') ON CONFLICT DO NOTHING`,
    [ADMIN]
  );
}

async function seedPending(c: any, suffix: string) {
  const customer = (
    await c.query(`INSERT INTO public.customers(full_name,phone) VALUES('Apply-fault test',$1) RETURNING customer_id`, [
      `08${Date.now().toString().slice(-8)}${suffix}`,
    ])
  ).rows[0].customer_id;
  return (
    await c.query(
      `INSERT INTO public.orders(customer_id,order_code,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,payment_status)
       VALUES($1,$2,'ApplyFault','0900000000','home_delivery',$3,$3,'pending') RETURNING order_id,order_code`,
      [customer, `GM-APF-${Date.now()}-${suffix}`, AMOUNT]
    )
  ).rows[0];
}

async function apply(
  c: any,
  orderCode: string,
  opts: { txn: string; amount?: number; source?: string; provider?: string }
) {
  return (
    await c.query("SELECT public.apply_payment_event($1::jsonb) r", [
      {
        order_code: orderCode,
        amount: opts.amount ?? AMOUNT,
        transaction_code: opts.txn,
        payment_method: opts.provider === "cash" ? "cod" : "banking",
        provider: opts.provider ?? "sepay",
        source: opts.source ?? "webhook",
        ...(opts.source === "admin" ? { admin_member_id: ADMIN } : {}),
        note: "P1/P2 probe",
      },
    ])
  ).rows[0].r;
}

async function installFaultTrigger(c: any, table: string, name: string) {
  await c.query(
    `CREATE OR REPLACE FUNCTION pg_temp.apf_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'apf-fault'; END$$`
  );
  await c.query(`CREATE TRIGGER ${name} BEFORE INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION pg_temp.apf_fault()`);
}

async function countOf(c: any, sql: string, params: unknown[]) {
  return Number((await c.query(sql, params)).rows[0].n);
}

/** Baseline residue — luôn lọc theo order_id/transaction_code duy nhất của fixture. */
async function residue(c: any, orderId: string, txn: string) {
  const payments = await countOf(c, `SELECT count(*) n FROM public.payments WHERE order_id=$1 OR transaction_code=$2`, [orderId, txn]);
  const nonPendingOrders = await countOf(c, `SELECT count(*) n FROM public.orders WHERE order_id=$1 AND (payment_status<>'pending' OR order_status<>'pending')`, [orderId]);
  const history = await countOf(c, `SELECT count(*) n FROM public.order_status_history WHERE order_id=$1`, [orderId]);
  const audit = await countOf(c, `SELECT count(*) n FROM public.audit_logs WHERE entity_id=$1`, [orderId]);
  const events = await countOf(c, `SELECT count(*) n FROM public.payment_events WHERE matched_order_id=$1 OR provider_transaction_id=$2`, [orderId, txn]);
  return { payments, nonPendingOrders, history, audit, events };
}

test("P1-A — fault trước payment insert: toàn apply transaction rollback sạch", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const order = await seedPending(c, "A");
    const txn = `P1A-${Date.now()}`;
    await installFaultTrigger(c, "payments", "apf_fault_payments");
    await c.query("SAVEPOINT before_apply");
    await assert.rejects(apply(c, order.order_code, { txn }), /apf-fault/);
    await c.query("ROLLBACK TO SAVEPOINT before_apply");
    const r = await residue(c, order.order_id, txn);
    assert.deepEqual(
      { payments: r.payments, nonPendingOrders: r.nonPendingOrders, history: r.history, audit: r.audit, events: r.events },
      { payments: 0, nonPendingOrders: 0, history: 0, audit: 0, events: 0 },
      JSON.stringify(r)
    );
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("P1-B — fault giữa orders update: không để lại payment/history/audit/event", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const order = await seedPending(c, "B");
    const txn = `P1B-${Date.now()}`;
    await installFaultTrigger(c, "orders", "apf_fault_orders");
    await c.query("SAVEPOINT before_apply");
    await assert.rejects(apply(c, order.order_code, { txn }), /apf-fault/);
    await c.query("ROLLBACK TO SAVEPOINT before_apply");
    const r = await residue(c, order.order_id, txn);
    assert.deepEqual(r, { payments: 0, nonPendingOrders: 0, history: 0, audit: 0, events: 0 }, JSON.stringify(r));
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("P1-C — fault tại order_status_history: payment row + order update phải rollback", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const order = await seedPending(c, "C");
    const txn = `P1C-${Date.now()}`;
    await installFaultTrigger(c, "order_status_history", "apf_fault_history");
    await c.query("SAVEPOINT before_apply");
    await assert.rejects(apply(c, order.order_code, { txn }), /apf-fault/);
    await c.query("ROLLBACK TO SAVEPOINT before_apply");
    const r = await residue(c, order.order_id, txn);
    assert.deepEqual(r, { payments: 0, nonPendingOrders: 0, history: 0, audit: 0, events: 0 }, JSON.stringify(r));
    // xác nhận điều kiện tiền thuận: payment_events được ghi trong cùng tx nên cũng sạch.
    assert.equal(r.events, 0, "applied-event ledger row must not survive the rollback");
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("P2-A — webhook+admin đồng thời, hai code khác nhau: applied một lần + review theo policy", { skip: !canRun }, async () => {
  const setup = await client();
  await seedActor(setup);
  const order = await seedPending(setup, "RA");
  const txnW = `P2A-WEB-${Date.now()}`;
  const txnM = `P2A-ADM-${Date.now()}`;
  const a = await client();
  const b = await client();
  try {
    // Hai connection phát lệnh đồng thời (Promise.all); FOR UPDATE trên orders
    // khiến lời gọi sau CHỜ lời gọi trước COMMIT — race thật, không tuần tự.
    const results = await Promise.all([
      apply(a, order.order_code, { txn: txnW, source: "webhook" }),
      apply(b, order.order_code, { txn: txnM, source: "admin" }),
    ]);
    // Precedence policy 023: lệnh thứ hai (thấy đơn đã paid) → additional transfer review.
    assert.deepEqual(
      results.map((x: any) => x.outcome).sort(),
      ["applied", "paid_order_additional_transfer"],
      JSON.stringify(results)
    );
    // Không một lời gọi nào ném unique-violation — index chỉ là net-lưới dưới policy.
    const q = async (sql: string, params: unknown[]) => await countOf(setup, sql, params);
    assert.equal(await q(`SELECT count(*) n FROM public.payments WHERE order_id=$1 AND payment_status='paid'`, [order.order_id]), 1);
    assert.equal(await q(`SELECT count(*) n FROM public.payments WHERE order_id=$1 AND payment_status='pending'`, [order.order_id]), 1);
    const codes = (await setup.query(`SELECT transaction_code FROM public.payments WHERE order_id=$1 ORDER BY transaction_code`, [order.order_id])).rows.map((x: any) => x.transaction_code).sort();
    assert.deepEqual(codes, [txnM, txnW].sort());
    assert.equal(await q(`SELECT count(*) n FROM public.orders WHERE order_id=$1 AND payment_status='paid'`, [order.order_id]), 1);
    assert.equal(await q(`SELECT count(*) n FROM public.order_status_history WHERE order_id=$1`, [order.order_id]), 2);
    assert.equal(await q(`SELECT count(*) n FROM public.audit_logs WHERE entity_id=$1`, [order.order_id]), 2);
    assert.equal(await q(`SELECT count(*) n FROM public.payment_events WHERE matched_order_id=$1`, [order.order_id]), 2);
    assert.equal(
      await q(`SELECT count(*) n FROM public.payment_events WHERE matched_order_id=$1 AND classification='paid_order_additional_transfer'`, [order.order_id]),
      1
    );
  } finally {
    await a.end();
    await b.end();
    await setup.end();
  }
});

test("P2-B — same provider identity đồng thời: applied một lần + duplicate một lần", { skip: !canRun }, async () => {
  const setup = await client();
  await seedActor(setup);
  const order = await seedPending(setup, "RB");
  const txn = `P2B-SAME-${Date.now()}`;
  const a = await client();
  const b = await client();
  try {
    const results = await Promise.all([
      apply(a, order.order_code, { txn }),
      apply(b, order.order_code, { txn }),
    ]);
    assert.deepEqual(
      results.map((x: any) => x.outcome).sort(),
      ["applied", "duplicate"],
      JSON.stringify(results)
    );
    const q = async (sql: string, params: unknown[]) => await countOf(setup, sql, params);
    assert.equal(await q(`SELECT count(*) n FROM public.payments WHERE order_id=$1 AND transaction_code=$2`, [order.order_id, txn]), 1);
    assert.equal(await q(`SELECT count(*) n FROM public.payments WHERE order_id=$1`, [order.order_id]), 1);
    assert.equal(await q(`SELECT count(*) n FROM public.orders WHERE order_id=$1 AND payment_status='paid'`, [order.order_id]), 1);
    // applied viết 1 history + 1 audit; duplicate chỉ ghi payment_events duplicate_delivery.
    assert.equal(await q(`SELECT count(*) n FROM public.order_status_history WHERE order_id=$1`, [order.order_id]), 1);
    assert.equal(await q(`SELECT count(*) n FROM public.audit_logs WHERE entity_id=$1`, [order.order_id]), 1);
    assert.equal(await q(`SELECT count(*) n FROM public.payment_events WHERE matched_order_id=$1`, [order.order_id]), 2);
    assert.equal(
      await q(`SELECT count(*) n FROM public.payment_events WHERE matched_order_id=$1 AND classification='duplicate_delivery'`, [order.order_id]),
      1
    );
    assert.equal(
      await q(`SELECT count(*) n FROM public.payment_events WHERE matched_order_id=$1 AND classification='matched'`, [order.order_id]),
      1
    );
  } finally {
    await a.end();
    await b.end();
    await setup.end();
  }
});
