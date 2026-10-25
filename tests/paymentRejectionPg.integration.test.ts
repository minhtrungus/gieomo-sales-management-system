import { test } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is a test-only runtime dependency without bundled TypeScript declarations.
const pg: any = await import("pg");

const url = process.env.ATOMIC_PG_URL;
const canRun = Boolean(url && process.env.GIEOMO_PG_ISOLATED === "1");
const ACTOR = "00000000-0000-4000-8000-000000000029";

async function client() {
  const value = new pg.Client({ connectionString: url });
  await value.connect();
  return value;
}

async function seed(c: any, suffix: string, status = "pending") {
  await c.query(`INSERT INTO public.members(member_id,full_name,role,status) VALUES($1,'Reject actor','admin','active') ON CONFLICT DO NOTHING`, [ACTOR]);
  const customer = (await c.query(`INSERT INTO public.customers(full_name,phone) VALUES('Reject test',$1) RETURNING customer_id`, [`08${Date.now().toString().slice(-8)}${suffix}`])).rows[0].customer_id;
  return (await c.query(`INSERT INTO public.orders(customer_id,order_code,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,payment_status) VALUES($1,$2,'Reject','0900000000','home_delivery',1000,1000,$3) RETURNING order_id,order_code`, [customer, `GM-RJ-${Date.now()}-${suffix}`, status])).rows[0];
}

async function reject(c: any, orderId: string, actor = ACTOR) {
  return (await c.query("SELECT public.reject_payment_atomic($1::jsonb) r", [{ order_id: orderId, actor_member_id: actor, reason: "bank evidence mismatch" }])).rows[0].r;
}

test("payment rejection is atomic, audited, idempotent, and rejects paid state", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const pending = await seed(c, "1");
    const first = await reject(c, pending.order_id);
    assert.equal(first.outcome, "rejected");
    assert.equal((await c.query("SELECT payment_status FROM public.orders WHERE order_id=$1", [pending.order_id])).rows[0].payment_status, "failed");
    assert.equal(Number((await c.query("SELECT count(*) n FROM public.order_status_history WHERE order_id=$1", [pending.order_id])).rows[0].n), 1);
    assert.equal(Number((await c.query("SELECT count(*) n FROM public.audit_logs WHERE entity_id=$1 AND action='payment.reject'", [pending.order_id])).rows[0].n), 1);
    assert.equal((await reject(c, pending.order_id)).outcome, "already_rejected");
    assert.equal(Number((await c.query("SELECT count(*) n FROM public.order_status_history WHERE order_id=$1", [pending.order_id])).rows[0].n), 1);
    const paid = await seed(c, "2", "paid");
    assert.equal((await reject(c, paid.order_id)).outcome, "invalid_state");
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("payment rejection rolls back if history insertion fails", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const order = await seed(c, "3");
    await c.query(`CREATE FUNCTION pg_temp.fail_history() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fault'; END$$`);
    await c.query(`CREATE TRIGGER reject_fault BEFORE INSERT ON public.order_status_history FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_history()`);
    await c.query("SAVEPOINT before_reject");
    await assert.rejects(reject(c, order.order_id), /fault/);
    await c.query("ROLLBACK TO SAVEPOINT before_reject");
    assert.equal((await c.query("SELECT payment_status FROM public.orders WHERE order_id=$1", [order.order_id])).rows[0].payment_status, "pending");
    assert.equal(Number((await c.query("SELECT count(*) n FROM public.audit_logs WHERE entity_id=$1", [order.order_id])).rows[0].n), 0);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("concurrent rejection has one transition and one history row", { skip: !canRun }, async () => {
  const setup = await client();
  const order = await seed(setup, "4");
  const a = await client(); const b = await client();
  try {
    const results = await Promise.all([reject(a, order.order_id), reject(b, order.order_id)]);
    assert.deepEqual(results.map((x) => x.outcome).sort(), ["already_rejected", "rejected"]);
    assert.equal(Number((await setup.query("SELECT count(*) n FROM public.order_status_history WHERE order_id=$1", [order.order_id])).rows[0].n), 1);
  } finally { await a.end(); await b.end(); await setup.end(); }
});

test("runtime authenticated role cannot execute rejection RPC", { skip: !canRun }, async () => {
  const c = await client();
  try {
    await c.query("SET ROLE authenticated");
    await assert.rejects(c.query("SELECT public.reject_payment_atomic('{}'::jsonb)"), /permission denied/);
  } finally { await c.end(); }
});
