import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is a test-only runtime dependency without bundled TypeScript declarations.
const pg: any = await import("pg");
const canRun = Boolean(process.env.ATOMIC_PG_URL && process.env.GIEOMO_PG_ISOLATED === "1");

async function connect() {
  const client = new pg.Client({ connectionString: process.env.ATOMIC_PG_URL });
  await client.connect(); return client;
}

async function createActorAndEnvironment(c: any, suffix: string) {
  const actor = (await c.query(
    "INSERT INTO public.members(full_name,role,status,referral_code) VALUES('Deletion Admin','admin','active',$1) RETURNING member_id",
    [`DEL${suffix}`],
  )).rows[0].member_id;
  await c.query("INSERT INTO public.test_cleanup_environments(project_ref,environment_kind,cleanup_enabled,configured_by_member_id) VALUES($1,'test',true,$2)", [`isolated-${suffix}`, actor]);
  return { actor, projectRef: `isolated-${suffix}` };
}

async function createPaidCancelledOrder(c: any, suffix: string, method: "cod" | "banking" = "cod") {
  const customer = (await c.query(
    "INSERT INTO public.customers(full_name,phone,email) VALUES('Deletion Fixture',$1,$2) RETURNING customer_id",
    [`07${suffix}`, `deletion-${suffix}@example.test`],
  )).rows[0].customer_id;
  const orderCode = `DEL-${suffix}`;
  const order = (await c.query(
    `INSERT INTO public.orders(order_code,customer_id,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,
       order_status,payment_status,delivery_status,payment_method,cancelled_at,cancellation_effects_completed_at)
     VALUES($1,$2,'Deletion Fixture','0900000000','self_pickup',25000,25000,'cancelled','paid','not_ready',$3,now(),now()) RETURNING order_id`,
    [orderCode, customer, method],
  )).rows[0];
  const transactionCode = method === "cod" ? `CASH-${orderCode}` : `BANK-${suffix}`;
  const provider = method === "cod" ? "cash" : "bank";
  await c.query("INSERT INTO public.payments(order_id,payment_method,amount,payment_status,transaction_code) VALUES($1,$2,25000,'paid',$3)", [order.order_id, method, transactionCode]);
  await c.query(`INSERT INTO public.payment_events(provider,provider_transaction_id,order_code,matched_order_id,received_amount,expected_amount,classification,outcome,payload_fingerprint)
    VALUES($1,$2,$3,$4,25000,25000,'admin_confirm','applied',$5)`, [provider, transactionCode, orderCode, order.order_id, `fixture-${suffix}`]);
  return { orderId: order.order_id, orderCode };
}

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

test("042 deletes only a verified synthetic test payment and preserves event/audit evidence", { skip: !canRun }, async () => {
  const c = await connect(); await c.query("BEGIN");
  try {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const { actor, projectRef } = await createActorAndEnvironment(c, suffix);
    const order = await createPaidCancelledOrder(c, suffix);
    const base = { project_ref: projectRef, actor_member_id: actor, order_ids: [order.orderId], session_binding_hash: hashA };

    const preview = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ ...base, mode: "preview" }])).rows[0].r;
    assert.equal(preview.outcome, "eligible"); assert.equal(preview.orders[0].eligible, true);
    const issued = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ ...base, mode: "issue", confirmation_hash: hashB }])).rows[0].r;
    assert.equal(issued.outcome, "challenge_issued");
    const deleted = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "delete", project_ref: projectRef, actor_member_id: actor, challenge_id: issued.challenge_id, session_binding_hash: hashA, confirmation_hash: hashB, reason: "Delete isolated automated fixture" }])).rows[0].r;
    assert.equal(deleted.outcome, "deleted");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [order.orderId])).rows[0].n, 0);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payments WHERE order_id=$1", [order.orderId])).rows[0].n, 0);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payment_events WHERE order_code=$1 AND matched_order_id IS NULL", [order.orderCode])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.audit_logs WHERE entity_id=$1 AND action='test_payments.delete_verified_batch'", [deleted.batch_id])).rows[0].n, 1);
    const replay = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "delete", project_ref: projectRef, actor_member_id: actor, challenge_id: issued.challenge_id, session_binding_hash: hashA, confirmation_hash: hashB, reason: "Replay isolated automated fixture" }])).rows[0].r;
    assert.equal(replay.outcome, "challenge_replayed");
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("042 blocks missing provenance and real/provider payment evidence", { skip: !canRun }, async () => {
  const c = await connect(); await c.query("BEGIN");
  try {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const { actor, projectRef } = await createActorAndEnvironment(c, suffix);
    const unmarked = await createPaidCancelledOrder(c, `${suffix}a`);
    await c.query("DELETE FROM public.test_order_provenance WHERE order_id=$1", [unmarked.orderId]);
    const noMarker = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "preview", project_ref: projectRef, actor_member_id: actor, order_ids: [unmarked.orderId] }])).rows[0].r;
    assert.equal(noMarker.outcome, "blocked"); assert.ok(noMarker.orders[0].blockers.includes("trusted_test_provenance_missing"));

    const provider = await createPaidCancelledOrder(c, `${suffix}b`, "banking");
    const realMoney = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "preview", project_ref: projectRef, actor_member_id: actor, order_ids: [provider.orderId] }])).rows[0].r;
    assert.equal(realMoney.outcome, "blocked"); assert.ok(realMoney.orders[0].blockers.includes("external_or_provider_payment_blocked"));
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("042 rejects expired and stale challenges, denies runtime execution, and rolls back failures", { skip: !canRun }, async () => {
  const c = await connect(); await c.query("BEGIN");
  try {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const { actor, projectRef } = await createActorAndEnvironment(c, suffix);
    const expiredOrder = await createPaidCancelledOrder(c, `${suffix}e`);
    const issue = async (orderId: string) => (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "issue", project_ref: projectRef, actor_member_id: actor, order_ids: [orderId], session_binding_hash: hashA, confirmation_hash: hashB }])).rows[0].r;
    const expired = await issue(expiredOrder.orderId);
    await c.query("UPDATE public.test_payment_deletion_challenges SET created_at=now()-interval '10 minutes', expires_at=now()-interval '5 minutes' WHERE challenge_id=$1", [expired.challenge_id]);
    const expiredResult = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "delete", project_ref: projectRef, actor_member_id: actor, challenge_id: expired.challenge_id, session_binding_hash: hashA, confirmation_hash: hashB, reason: "Expired fixture deletion attempt" }])).rows[0].r;
    assert.equal(expiredResult.outcome, "challenge_expired");

    const staleOrder = await createPaidCancelledOrder(c, `${suffix}s`); const stale = await issue(staleOrder.orderId);
    await c.query("UPDATE public.orders SET final_amount=26000 WHERE order_id=$1", [staleOrder.orderId]);
    const staleResult = (await c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "delete", project_ref: projectRef, actor_member_id: actor, challenge_id: stale.challenge_id, session_binding_hash: hashA, confirmation_hash: hashB, reason: "Stale fixture deletion attempt" }])).rows[0].r;
    assert.equal(staleResult.outcome, "stale_snapshot");

    const rollbackOrder = await createPaidCancelledOrder(c, `${suffix}r`); const rollbackChallenge = await issue(rollbackOrder.orderId);
    await c.query("CREATE FUNCTION public.fail_fixture_order_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced rollback'; END $$");
    await c.query("CREATE TRIGGER fail_fixture_order_delete BEFORE DELETE ON public.orders FOR EACH ROW WHEN (OLD.order_id = '" + rollbackOrder.orderId + "'::uuid) EXECUTE FUNCTION public.fail_fixture_order_delete()");
    await c.query("SAVEPOINT before_forced_failure");
    await assert.rejects(c.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb)", [{ mode: "delete", project_ref: projectRef, actor_member_id: actor, challenge_id: rollbackChallenge.challenge_id, session_binding_hash: hashA, confirmation_hash: hashB, reason: "Forced rollback fixture deletion" }]), /forced rollback/);
    await c.query("ROLLBACK TO SAVEPOINT before_forced_failure");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [rollbackOrder.orderId])).rows[0].n, 1);
    assert.equal((await c.query("SELECT used_at IS NULL AS reusable FROM public.test_payment_deletion_challenges WHERE challenge_id=$1", [rollbackChallenge.challenge_id])).rows[0].reusable, true);

    await c.query("SET LOCAL ROLE authenticated");
    await assert.rejects(c.query("SELECT public.manage_test_payment_deletion_atomic('{}'::jsonb)"), /permission denied/);
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("042 serializes two concurrent delete attempts into one deletion and one replay", { skip: !canRun }, async () => {
  const a = await connect(); const b = await connect();
  let actor = ""; let projectRef = ""; let orderId = ""; let orderCode = "";
  try {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    ({ actor, projectRef } = await createActorAndEnvironment(a, suffix));
    const order = await createPaidCancelledOrder(a, suffix);
    orderId = order.orderId; orderCode = order.orderCode;
    const issued = (await a.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [{ mode: "issue", project_ref: projectRef, actor_member_id: actor, order_ids: [order.orderId], session_binding_hash: hashA, confirmation_hash: hashB }])).rows[0].r;
    const payload = { mode: "delete", project_ref: projectRef, actor_member_id: actor, challenge_id: issued.challenge_id, session_binding_hash: hashA, confirmation_hash: hashB, reason: "Concurrent isolated fixture deletion" };
    const [first, second] = await Promise.all([
      a.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [payload]),
      b.query("SELECT public.manage_test_payment_deletion_atomic($1::jsonb) r", [payload]),
    ]);
    assert.deepEqual([first.rows[0].r.outcome, second.rows[0].r.outcome].sort(), ["challenge_replayed", "deleted"]);
    assert.equal((await a.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [order.orderId])).rows[0].n, 0);
    assert.equal((await a.query("SELECT count(*)::int n FROM public.audit_logs WHERE action='test_payments.delete_verified_batch' AND before_data->'orders' @> $1::jsonb", [JSON.stringify([{ order_id: order.orderId }])])).rows[0].n, 1);
  } finally {
    if (projectRef) {
      await a.query("DELETE FROM public.audit_logs WHERE entity_id IN (SELECT batch_id FROM public.test_payment_deletion_batches WHERE project_ref=$1)", [projectRef]);
      await a.query("DELETE FROM public.test_payment_deletion_batches WHERE project_ref=$1", [projectRef]);
      await a.query("DELETE FROM public.test_payment_deletion_challenges WHERE project_ref=$1", [projectRef]);
    }
    if (orderId) {
      await a.query("DELETE FROM public.payment_events WHERE order_code=$1", [orderCode]);
      await a.query("DELETE FROM public.order_idempotency WHERE order_id=$1", [orderId]);
      await a.query("DELETE FROM public.order_inventory_reservations WHERE order_id=$1", [orderId]);
      await a.query("DELETE FROM public.test_order_provenance WHERE order_id=$1", [orderId]);
      await a.query("DELETE FROM public.orders WHERE order_id=$1", [orderId]);
    }
    if (projectRef) await a.query("DELETE FROM public.test_cleanup_environments WHERE project_ref=$1", [projectRef]);
    if (actor) await a.query("DELETE FROM public.members WHERE member_id=$1", [actor]);
    await a.end(); await b.end();
  }
});
