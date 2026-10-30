import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is a test-only runtime dependency without bundled TypeScript declarations.
const pg: any = await import("pg");

const databaseUrl = process.env.ATOMIC_PG_URL;
const canRun = Boolean(databaseUrl && process.env.GIEOMO_PG_ISOLATED === "1");

async function client() {
  const value = new pg.Client({ connectionString: databaseUrl });
  await value.connect();
  return value;
}

async function seedActor(c: any, suffix: string, role = "admin") {
  return (
    await c.query(
      "INSERT INTO public.members(full_name,role,status,referral_code) VALUES($1,$2,'active',$3) RETURNING member_id",
      [`Adjustment ${suffix}`, role, `ADJ${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`],
    )
  ).rows[0].member_id;
}

async function seedOrder(c: any, suffix: string, method: "cod" | "banking" = "cod") {
  const customerId = (
    await c.query(
      "INSERT INTO public.customers(full_name,phone,email) VALUES($1,$2,$3) RETURNING customer_id",
      [`Adjustment ${suffix}`, `07${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, `adjust-${suffix}@example.test`],
    )
  ).rows[0].customer_id;
  const order = (
    await c.query(
      `INSERT INTO public.orders(
         order_code,customer_id,receiver_name,receiver_phone,delivery_type,
         subtotal,final_amount,order_status,payment_status,delivery_status,payment_method
       ) VALUES($1,$2,'Adjustment','0900000000','self_pickup',10000,10000,'pending','pending','not_ready',$3)
       RETURNING order_id,order_code`,
      [`ADJ-${suffix}`, customerId, method],
    )
  ).rows[0];
  return { ...order, customerId };
}

async function applyPayment(c: any, orderCode: string, actorId: string, provider = "cash") {
  const transactionCode = provider === "cash" ? `CASH-${orderCode}` : `ADJ-TX-${crypto.randomUUID()}`;
  const result = (
    await c.query("SELECT public.apply_payment_event($1::jsonb) result", [{
      order_code: orderCode,
      amount: 10000,
      transaction_code: transactionCode,
      payment_method: provider === "cash" ? "cod" : "banking",
      provider,
      source: provider === "cash" ? "admin" : "webhook",
      ...(provider === "cash" ? { admin_member_id: actorId } : {}),
    }])
  ).rows[0].result;
  assert.equal(result.outcome, "applied");
  return transactionCode;
}

async function adjust(c: any, payload: Record<string, unknown>) {
  return (
    await c.query("SELECT public.adjust_payment_confirmation_atomic($1::jsonb) result", [payload])
  ).rows[0].result;
}

test("039 adjusts one reversible cash confirmation atomically and preserves its ledger", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const suffix = `${Date.now()}-success`;
    const actorId = await seedActor(c, suffix);
    const order = await seedOrder(c, suffix);
    await applyPayment(c, order.order_code, actorId);
    const state = (await c.query("SELECT updated_at::text AS updated_at FROM public.orders WHERE order_id=$1", [order.order_id])).rows[0];
    const payload = {
      order_id: order.order_id,
      actor_member_id: actorId,
      reason: "Local correction for a mistaken cash confirmation",
      expected_updated_at: state.updated_at,
    };

    await c.query(
      `CREATE OR REPLACE FUNCTION pg_temp.fail_adjust_audit() RETURNS trigger LANGUAGE plpgsql AS
       $$BEGIN RAISE EXCEPTION 'adjust-audit-fault'; END$$`,
    );
    await c.query(
      `CREATE TRIGGER fail_adjust_audit BEFORE INSERT ON public.audit_logs
       FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_adjust_audit()`,
    );
    await c.query("SAVEPOINT before_adjust");
    await assert.rejects(adjust(c, payload), /adjust-audit-fault/);
    await c.query("ROLLBACK TO SAVEPOINT before_adjust");
    assert.equal((await c.query("SELECT payment_status FROM public.orders WHERE order_id=$1", [order.order_id])).rows[0].payment_status, "paid");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payment_confirmation_adjustments WHERE order_id=$1", [order.order_id])).rows[0].n, 0);

    await c.query("DROP TRIGGER fail_adjust_audit ON public.audit_logs");
    const result = await adjust(c, payload);
    assert.equal(result.outcome, "adjusted");
    assert.equal(result.payment_ledger_preserved, true);
    assert.equal((await c.query("SELECT payment_status FROM public.orders WHERE order_id=$1", [order.order_id])).rows[0].payment_status, "pending");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payments WHERE order_id=$1 AND payment_status='paid'", [order.order_id])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payment_events WHERE matched_order_id=$1", [order.order_id])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payment_confirmation_adjustments WHERE order_id=$1", [order.order_id])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.order_status_history WHERE order_id=$1 AND from_status='paid' AND to_status='pending'", [order.order_id])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.audit_logs WHERE entity_id=$1 AND action='payment.manual_unconfirm'", [order.order_id])).rows[0].n, 1);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("039 blocks non-admin, external money, fulfillment, and direct runtime execution", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const suffix = `${Date.now()}-blocked`;
    const actorId = await seedActor(c, suffix);
    const nonAdminId = await seedActor(c, `${suffix}-sale`, "btc_sale");
    const bankOrder = await seedOrder(c, `${suffix}-bank`, "banking");
    await applyPayment(c, bankOrder.order_code, actorId, "sepay");
    const bankState = (await c.query("SELECT updated_at::text AS updated_at FROM public.orders WHERE order_id=$1", [bankOrder.order_id])).rows[0];
    const base = {
      order_id: bankOrder.order_id,
      reason: "This reason is long enough",
      expected_updated_at: bankState.updated_at,
    };
    assert.equal((await adjust(c, { ...base, actor_member_id: nonAdminId })).outcome, "forbidden");
    assert.equal((await adjust(c, { ...base, actor_member_id: actorId })).outcome, "external_money_requires_reconciliation");

    const cashOrder = await seedOrder(c, `${suffix}-fulfilled`);
    await applyPayment(c, cashOrder.order_code, actorId);
    await c.query("UPDATE public.orders SET delivery_status='packed' WHERE order_id=$1", [cashOrder.order_id]);
    const cashState = (await c.query("SELECT updated_at::text AS updated_at FROM public.orders WHERE order_id=$1", [cashOrder.order_id])).rows[0];
    assert.equal((await adjust(c, {
      order_id: cashOrder.order_id,
      actor_member_id: actorId,
      reason: "Fulfillment must prevent reversal",
      expected_updated_at: cashState.updated_at,
    })).outcome, "fulfillment_started");

    await c.query("SET LOCAL ROLE authenticated");
    await assert.rejects(c.query("SELECT public.adjust_payment_confirmation_atomic('{}'::jsonb)"), /permission denied/);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("039 serializes competing adjustments with one durable decision", { skip: !canRun }, async () => {
  const setup = await client();
  const first = await client();
  const second = await client();
  let orderId: string | undefined;
  let customerId: string | undefined;
  let actorId: string | undefined;
  try {
    const suffix = `${Date.now()}-race`;
    const createdActorId = await seedActor(setup, suffix);
    actorId = createdActorId;
    const order = await seedOrder(setup, suffix);
    orderId = order.order_id;
    customerId = order.customerId;
    await applyPayment(setup, order.order_code, createdActorId);
    const version = (await setup.query("SELECT updated_at::text AS updated_at FROM public.orders WHERE order_id=$1", [orderId])).rows[0].updated_at;
    const payload = {
      order_id: orderId,
      actor_member_id: createdActorId,
      reason: "Concurrent local correction request",
      expected_updated_at: version,
    };
    const results = await Promise.all([adjust(first, payload), adjust(second, payload)]);
    assert.deepEqual(results.map((x: any) => x.outcome).sort(), ["adjusted", "version_conflict"]);
    assert.equal((await setup.query("SELECT count(*)::int n FROM public.payment_confirmation_adjustments WHERE order_id=$1", [orderId])).rows[0].n, 1);
    assert.equal((await setup.query("SELECT count(*)::int n FROM public.payments WHERE order_id=$1", [orderId])).rows[0].n, 1);
  } finally {
    if (orderId) {
      await setup.query("DELETE FROM public.audit_logs WHERE entity_id=$1", [orderId]).catch(() => undefined);
      await setup.query("DELETE FROM public.order_status_history WHERE order_id=$1", [orderId]).catch(() => undefined);
      await setup.query("DELETE FROM public.payment_confirmation_adjustments WHERE order_id=$1", [orderId]).catch(() => undefined);
      await setup.query("DELETE FROM public.payment_events WHERE matched_order_id=$1", [orderId]).catch(() => undefined);
      await setup.query("DELETE FROM public.payments WHERE order_id=$1", [orderId]).catch(() => undefined);
      await setup.query("DELETE FROM public.orders WHERE order_id=$1", [orderId]).catch(() => undefined);
    }
    if (customerId) await setup.query("DELETE FROM public.customers WHERE customer_id=$1", [customerId]).catch(() => undefined);
    if (actorId) await setup.query("DELETE FROM public.members WHERE member_id=$1", [actorId]).catch(() => undefined);
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
});
