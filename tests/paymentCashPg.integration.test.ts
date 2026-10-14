import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";

const databaseUrl = process.env.ATOMIC_PG_URL;
const psql = process.env.PSQL_BIN || "psql.exe";
const execFileAsync = promisify(execFile);
const adminId = "11111111-1111-1111-1111-111111111111";

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(sql: string): string {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  return execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function queryAsync(sql: string): Promise<string> {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  const { stdout } = await execFileAsync(
    psql,
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql],
    { encoding: "utf8" }
  );
  return stdout.trim();
}

function rpcSql(
  orderCode: string,
  transactionCode: string,
  method = "cod",
  provider = "cash",
  amount = 125000
): string {
  const payload = JSON.stringify({
    order_code: orderCode,
    amount,
    transaction_code: transactionCode,
    payment_method: method,
    provider,
    source: "admin",
    admin_member_id: adminId,
    note: "C4 PostgreSQL integration test",
  });
  return `SELECT public.apply_payment_event(${sqlLiteral(payload)}::jsonb)::text;`;
}

function createOrder(label: string): { orderId: string; orderCode: string } {
  const suffix = randomUUID();
  const customerId = randomUUID();
  const orderId = randomUUID();
  const orderCode = `C4-${label}-${suffix.slice(0, 8)}`;
  query(`
    INSERT INTO public.customers (customer_id, full_name, phone)
    VALUES (${sqlLiteral(customerId)}::uuid, 'C4 test customer', ${sqlLiteral(`09${suffix.replaceAll("-", "").slice(0, 8)}`)});
    INSERT INTO public.orders (
      order_id, order_code, customer_id, receiver_name, receiver_phone,
      delivery_type, shipping_address_snapshot, subtotal, final_amount,
      order_status, payment_status
    ) VALUES (
      ${sqlLiteral(orderId)}::uuid, ${sqlLiteral(orderCode)}, ${sqlLiteral(customerId)}::uuid,
      'C4 receiver', '0900000000', 'home_delivery', 'C4 isolated test',
      125000, 125000, 'pending', 'pending'
    );
  `);
  return { orderId, orderCode };
}

function counts(orderId: string): string {
  return query(`
    SELECT
      (SELECT count(*) FROM public.payments WHERE order_id = ${sqlLiteral(orderId)}::uuid) || '|' ||
      (SELECT count(*) FROM public.payment_events WHERE matched_order_id = ${sqlLiteral(orderId)}::uuid) || '|' ||
      (SELECT count(*) FROM public.audit_logs WHERE entity_id = ${sqlLiteral(orderId)}::uuid) || '|' ||
      (SELECT count(*) FROM public.order_status_history WHERE order_id = ${sqlLiteral(orderId)}::uuid);
  `);
}

test("C4 cash RPC PostgreSQL contract", { skip: !databaseUrl, timeout: 60_000 }, async (t) => {
  query(`
    INSERT INTO public.members (member_id, full_name, role, status)
    VALUES (${sqlLiteral(adminId)}::uuid, 'C4 test admin', 'admin', 'active')
    ON CONFLICT (member_id) DO NOTHING;
  `);

  await t.test("persists cash as payment_method=cod with provider=cash", () => {
    const order = createOrder("apply");
    const txn = `CASH-${order.orderCode}`;
    const result = JSON.parse(query(rpcSql(order.orderCode, txn)));
    assert.equal(result.outcome, "applied");
    assert.equal(result.replayed, false);
    assert.equal(
      query(`SELECT payment_method::text || '|' || transaction_code FROM public.payments WHERE order_id = ${sqlLiteral(order.orderId)}::uuid;`),
      `cod|${txn}`
    );
    assert.equal(
      query(`SELECT provider || '|' || provider_transaction_id FROM public.payment_events WHERE matched_order_id = ${sqlLiteral(order.orderId)}::uuid;`),
      `cash|${txn}`
    );
  });

  await t.test("sequential retry returns the committed result without new effects", () => {
    const order = createOrder("sequential");
    const txn = `CASH-${order.orderCode}`;
    const first = JSON.parse(query(rpcSql(order.orderCode, txn)));
    const second = JSON.parse(query(rpcSql(order.orderCode, txn)));
    assert.equal(first.replayed, false);
    assert.equal(second.outcome, "applied");
    assert.equal(second.replayed, true);
    assert.equal(second.payment_id, first.payment_id);
    assert.equal(counts(order.orderId), "1|1|1|1");
  });

  await t.test("lost HTTP response is reconciled by retrying the same operation", () => {
    const order = createOrder("lostresponse");
    const txn = `CASH-${order.orderCode}`;
    query(rpcSql(order.orderCode, txn)); // Simulate commit followed by a lost response.
    const reconciled = JSON.parse(query(rpcSql(order.orderCode, txn)));
    assert.equal(reconciled.outcome, "applied");
    assert.equal(reconciled.replayed, true);
    assert.equal(counts(order.orderId), "1|1|1|1");
  });

  await t.test("concurrent retry serializes on the order and creates one effect", async () => {
    const order = createOrder("concurrent");
    const txn = `CASH-${order.orderCode}`;
    const [left, right] = await Promise.all([
      queryAsync(rpcSql(order.orderCode, txn)),
      queryAsync(rpcSql(order.orderCode, txn)),
    ]);
    const results = [JSON.parse(left), JSON.parse(right)];
    assert.deepEqual(results.map((value) => value.outcome), ["applied", "applied"]);
    assert.deepEqual(results.map((value) => value.replayed).sort(), [false, true]);
    assert.equal(results[0].payment_id, results[1].payment_id);
    assert.equal(counts(order.orderId), "1|1|1|1");
  });

  await t.test("single-paid unique index rejects a second paid row", () => {
    const order = createOrder("onepaid");
    query(rpcSql(order.orderCode, `CASH-${order.orderCode}`));
    assert.throws(() => query(`
      INSERT INTO public.payments (order_id, payment_method, amount, payment_status, transaction_code)
      VALUES (${sqlLiteral(order.orderId)}::uuid, 'cod', 125000, 'paid', 'SECOND-PAID');
    `));
    assert.equal(query(`SELECT count(*) FROM public.payments WHERE order_id = ${sqlLiteral(order.orderId)}::uuid AND payment_status = 'paid';`), "1");
  });

  await t.test("audit failure rolls back payment, order, history, and event", () => {
    const order = createOrder("rollback");
    query(`
      CREATE OR REPLACE FUNCTION public.c4_reject_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'C4 forced audit failure'; END $$;
      CREATE TRIGGER c4_reject_audit_trigger BEFORE INSERT ON public.audit_logs
      FOR EACH ROW WHEN (NEW.entity_id = ${sqlLiteral(order.orderId)}::uuid)
      EXECUTE FUNCTION public.c4_reject_audit();
    `);
    try {
      assert.throws(() => query(rpcSql(order.orderCode, `CASH-${order.orderCode}`)));
    } finally {
      query(`DROP TRIGGER c4_reject_audit_trigger ON public.audit_logs; DROP FUNCTION public.c4_reject_audit();`);
    }
    assert.equal(counts(order.orderId), "0|0|0|0");
    assert.equal(query(`SELECT payment_status::text || '|' || order_status::text FROM public.orders WHERE order_id = ${sqlLiteral(order.orderId)}::uuid;`), "pending|pending");
  });

  await t.test("banking path remains valid", () => {
    const order = createOrder("bank");
    const result = JSON.parse(query(rpcSql(order.orderCode, `BANK-${order.orderCode}`, "banking", "bank")));
    assert.equal(result.outcome, "applied");
    assert.equal(result.replayed, false);
    assert.equal(query(`SELECT payment_method::text FROM public.payments WHERE order_id = ${sqlLiteral(order.orderId)}::uuid;`), "banking");
    assert.equal(counts(order.orderId), "1|1|1|1");
  });

  await t.test("cash amount mismatch is rejected without any effect", () => {
    const order = createOrder("amount");
    const result = JSON.parse(query(rpcSql(order.orderCode, `CASH-${order.orderCode}`, "cod", "cash", 124999)));
    assert.equal(result.outcome, "amount_mismatch");
    assert.equal(result.payment_status, "pending");
    assert.equal(counts(order.orderId), "0|0|0|0");
    assert.equal(query(`SELECT payment_status::text || '|' || order_status::text FROM public.orders WHERE order_id = ${sqlLiteral(order.orderId)}::uuid;`), "pending|pending");
  });

  await t.test("cash confirmation rejects an invalid order/payment state", () => {
    const order = createOrder("state");
    query(`UPDATE public.orders SET order_status = 'cancelled', cancelled_at = now() WHERE order_id = ${sqlLiteral(order.orderId)}::uuid;`);
    const result = JSON.parse(query(rpcSql(order.orderCode, `CASH-${order.orderCode}`)));
    assert.equal(result.outcome, "invalid_state");
    assert.equal(result.order_status, "cancelled");
    assert.equal(counts(order.orderId), "0|0|0|0");
  });

  await t.test("unsupported payment method fails before any ledger write", () => {
    const order = createOrder("invalid");
    assert.throws(() => query(rpcSql(order.orderCode, `CASH-${order.orderCode}`, "cash", "cash")));
    assert.equal(counts(order.orderId), "0|0|0|0");
  });
});
