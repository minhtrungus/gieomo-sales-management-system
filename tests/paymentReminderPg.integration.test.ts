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
      [`Reminder ${suffix}`, role, `REM${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`],
    )
  ).rows[0].member_id;
}

async function seedOrder(c: any, suffix: string, email: string | null = `rem-${suffix}@example.test`) {
  const customerId = (
    await c.query(
      "INSERT INTO public.customers(full_name,phone,email) VALUES($1,$2,$3) RETURNING customer_id",
      [`Reminder ${suffix}`, `06${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, email],
    )
  ).rows[0].customer_id;
  const order = (
    await c.query(
      `INSERT INTO public.orders(
         order_code,customer_id,receiver_name,receiver_phone,delivery_type,
         subtotal,final_amount,order_status,payment_status,delivery_status,payment_method
       ) VALUES($1,$2,'Reminder','0900000000','self_pickup',10000,10000,'pending','pending','not_ready','banking')
       RETURNING order_id,order_code`,
      [`REM-${suffix}`, customerId],
    )
  ).rows[0];
  return { ...order, customerId };
}

async function claim(c: any, orderId: string, actorId: string) {
  return (
    await c.query("SELECT public.claim_payment_reminder($1::jsonb) result", [{
      order_id: orderId,
      actor_member_id: actorId,
    }])
  ).rows[0].result;
}

test("040 atomically claims once, audits, and enforces cooldown under concurrency", { skip: !canRun }, async () => {
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
    const results = await Promise.all([
      claim(first, order.order_id, createdActorId),
      claim(second, order.order_id, createdActorId),
    ]);
    assert.deepEqual(results.map((x: any) => x.outcome).sort(), ["claimed", "cooldown"]);
    assert.equal((await setup.query("SELECT count(*)::int n FROM public.payment_reminders WHERE order_id=$1", [orderId])).rows[0].n, 1);
    assert.equal((await setup.query("SELECT count(*)::int n FROM public.audit_logs WHERE entity_id=$1 AND action='payment.reminder_claim'", [orderId])).rows[0].n, 1);
  } finally {
    if (orderId) {
      await setup.query("DELETE FROM public.audit_logs WHERE entity_id=$1", [orderId]).catch(() => undefined);
      await setup.query("DELETE FROM public.payment_reminders WHERE order_id=$1", [orderId]).catch(() => undefined);
      await setup.query("DELETE FROM public.orders WHERE order_id=$1", [orderId]).catch(() => undefined);
    }
    if (customerId) await setup.query("DELETE FROM public.customers WHERE customer_id=$1", [customerId]).catch(() => undefined);
    if (actorId) await setup.query("DELETE FROM public.members WHERE member_id=$1", [actorId]).catch(() => undefined);
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
});

test("040 rejects ineligible, review, missing-email, and unauthorized requests", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const suffix = `${Date.now()}-blocked`;
    const actorId = await seedActor(c, suffix);
    const nonAdminId = await seedActor(c, `${suffix}-sale`, "btc_sale");
    const reviewOrder = await seedOrder(c, `${suffix}-review`);
    assert.equal((await claim(c, reviewOrder.order_id, nonAdminId)).outcome, "forbidden");
    await c.query(
      `INSERT INTO public.payment_events(
         provider,provider_transaction_id,matched_order_id,received_amount,classification,outcome
       ) VALUES('local-test',$1,$2,10000,'underpaid','amount_mismatch')`,
      [`REM-EVENT-${crypto.randomUUID()}`, reviewOrder.order_id],
    );
    assert.equal((await claim(c, reviewOrder.order_id, actorId)).outcome, "payment_requires_review");

    const paidOrder = await seedOrder(c, `${suffix}-paid`);
    await c.query("UPDATE public.orders SET payment_status='paid' WHERE order_id=$1", [paidOrder.order_id]);
    assert.equal((await claim(c, paidOrder.order_id, actorId)).outcome, "ineligible_state");

    const noEmailOrder = await seedOrder(c, `${suffix}-email`, null);
    assert.equal((await claim(c, noEmailOrder.order_id, actorId)).outcome, "missing_email");

    await c.query("SET LOCAL ROLE authenticated");
    await assert.rejects(c.query("SELECT public.claim_payment_reminder('{}'::jsonb)"), /permission denied/);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("040 rolls the reminder claim back if audit persistence fails", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const suffix = `${Date.now()}-fault`;
    const actorId = await seedActor(c, suffix);
    const order = await seedOrder(c, suffix);
    await c.query(
      `CREATE OR REPLACE FUNCTION pg_temp.fail_reminder_audit() RETURNS trigger LANGUAGE plpgsql AS
       $$BEGIN RAISE EXCEPTION 'reminder-audit-fault'; END$$`,
    );
    await c.query(
      `CREATE TRIGGER fail_reminder_audit BEFORE INSERT ON public.audit_logs
       FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_reminder_audit()`,
    );
    await c.query("SAVEPOINT before_claim");
    await assert.rejects(claim(c, order.order_id, actorId), /reminder-audit-fault/);
    await c.query("ROLLBACK TO SAVEPOINT before_claim");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payment_reminders WHERE order_id=$1", [order.order_id])).rows[0].n, 0);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});
