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

test("041 dry-run is read-only; archive preserves paid order and ledger", { skip: !canRun }, async () => {
  const c = await connect();
  await c.query("BEGIN");
  try {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const actor = (await c.query(
      "INSERT INTO public.members(full_name,role,status,referral_code) VALUES('Cleanup Admin','admin','active',$1) RETURNING member_id",
      [`CLN${suffix}`],
    )).rows[0].member_id;
    const customer = (await c.query(
      "INSERT INTO public.customers(full_name,phone,email) VALUES('Test Cleanup',$1,$2) RETURNING customer_id",
      [`08${suffix.slice(0, 8)}`, `cleanup-${suffix}@example.test`],
    )).rows[0].customer_id;
    const order = (await c.query(
      `INSERT INTO public.orders(order_code,customer_id,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,order_status,payment_status,delivery_status,payment_method)
       VALUES($1,$2,'Test Cleanup','0900000000','self_pickup',25000,25000,'confirmed','paid','not_ready','banking') RETURNING order_id`,
      [`CLN-${suffix}` , customer],
    )).rows[0];
    await c.query("INSERT INTO public.payments(order_id,payment_method,amount,payment_status,transaction_code) VALUES($1,'banking',25000,'paid',$2)", [order.order_id, `TX-${suffix}`]);
    await c.query("INSERT INTO public.test_cleanup_environments(project_ref,environment_kind,cleanup_enabled,configured_by_member_id) VALUES('isolated-test','test',true,$1)", [actor]);

    const base = { project_ref: "isolated-test", actor_member_id: actor,
      candidates: [{ order_id: order.order_id, classification_reason: "Confirmed isolated automated test order" }] };
    const before = (await c.query("SELECT count(*)::int n FROM public.test_order_cleanup_batches")).rows[0].n;
    const preview = (await c.query("SELECT public.manage_test_order_archival_atomic($1::jsonb) r", [{ ...base, mode: "preview" }])).rows[0].r;
    assert.equal(preview.outcome, "eligible");
    assert.equal(preview.ledger_preserved, true);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.test_order_cleanup_batches")).rows[0].n, before);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.test_order_archives")).rows[0].n, 0);

    const archived = (await c.query("SELECT public.manage_test_order_archival_atomic($1::jsonb) r", [{
      ...base, mode: "archive", reason: "Archive a reviewed isolated test batch",
      preview_token: preview.preview_token, confirmation: "LUU TRU 1 DON",
    }])).rows[0].r;
    assert.equal(archived.outcome, "archived");
    assert.equal(archived.orders_deleted, 0);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [order.order_id])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.payments WHERE order_id=$1 AND payment_status='paid'", [order.order_id])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.test_order_archives WHERE order_id=$1", [order.order_id])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.audit_logs WHERE entity_id=$1 AND action='test_orders.archive_batch'", [archived.batch_id])).rows[0].n, 1);
    const replay = (await c.query("SELECT public.manage_test_order_archival_atomic($1::jsonb) r", [{ ...base, mode: "preview" }])).rows[0].r;
    assert.equal(replay.outcome, "already_archived");
  } finally { await c.query("ROLLBACK"); await c.end(); }
});

test("041 fails closed without the database environment switch and denies runtime roles", { skip: !canRun }, async () => {
  const c = await connect();
  await c.query("BEGIN");
  try {
    const actor = (await c.query("INSERT INTO public.members(full_name,role,status,referral_code) VALUES('Guard Admin','admin','active',$1) RETURNING member_id", [`GRD${Date.now()}`])).rows[0].member_id;
    const result = (await c.query("SELECT public.manage_test_order_archival_atomic($1::jsonb) r", [{ mode: "preview", project_ref: "not-enabled", actor_member_id: actor, candidates: [{}] }])).rows[0].r;
    assert.equal(result.outcome, "environment_unverified");
    await c.query("SET LOCAL ROLE authenticated");
    await assert.rejects(c.query("SELECT public.manage_test_order_archival_atomic('{}'::jsonb)"), /permission denied/);
  } finally { await c.query("ROLLBACK"); await c.end(); }
});
