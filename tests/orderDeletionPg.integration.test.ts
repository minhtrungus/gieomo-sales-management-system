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

async function seedOrder(c: any, suffix: string) {
  const customerId = (
    await c.query(
      "INSERT INTO public.customers(full_name,phone) VALUES($1,$2) RETURNING customer_id",
      [`Deletion ${suffix}`, `09${suffix.replace(/\D/g, "").slice(-8).padStart(8, "0")}`]
    )
  ).rows[0].customer_id;
  const order = (
    await c.query(
      `INSERT INTO public.orders(
         order_code, customer_id, receiver_name, receiver_phone, delivery_type,
         subtotal, final_amount, order_status, payment_status, delivery_status
       ) VALUES($1,$2,'Test receiver','0900000000','self_pickup',10000,10000,'pending','pending','not_ready')
       RETURNING order_id, updated_at`,
      [`DEL-${suffix}`, customerId]
    )
  ).rows[0];
  await c.query(
    `INSERT INTO public.order_items(
       order_id,item_name_snapshot,quantity,unit_price,subtotal
     ) VALUES($1,'Test item',1,10000,10000)`,
    [order.order_id]
  );
  await c.query(
    "INSERT INTO public.order_status_history(order_id,status_type,from_status,to_status) VALUES($1,'order',NULL,'pending')",
    [order.order_id]
  );
  return { customerId, orderId: order.order_id, updatedAt: order.updated_at };
}

async function seedActor(c: any, suffix: string) {
  return (
    await c.query(
      "INSERT INTO public.members(full_name,role,status,referral_code) VALUES($1,'admin','active',$2) RETURNING member_id",
      [`Deletion Admin ${suffix}`, `DELADM${suffix.replace(/\D/g, "").slice(-10)}`],
    )
  ).rows[0].member_id;
}

async function manage(c: any, payload: Record<string, unknown>) {
  return (
    await c.query("SELECT public.manage_order_deletion_atomic($1::jsonb) result", [payload])
  ).rows[0].result;
}

test("controlled deletion previews, rejects stale state, then deletes children and audits", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const seeded = await seedOrder(c, `${Date.now()}-eligible`);
    const actorId = await seedActor(c, `${Date.now()}-eligible`);
    const base = {
      order_id: seeded.orderId,
      reason: "Local automated test order",
      actor_member_id: actorId,
    };
    const preview = await manage(c, { ...base, mode: "preview" });
    assert.equal(preview.outcome, "eligible");
    assert.deepEqual(preview.relations, {
      idempotency_claims: 0,
      initial_history: 1,
      order_items: 1,
      payment_events: 0,
      payments: 0,
      reservations: 0,
      shipments: 0,
    });

    const stale = await manage(c, {
      ...base,
      mode: "delete",
      confirmation: "XOA",
      expected_updated_at: "2000-01-01T00:00:00Z",
    });
    assert.equal(stale.outcome, "stale_preview");

    const deleted = await manage(c, {
      ...base,
      mode: "delete",
      confirmation: "XOA",
      expected_updated_at: preview.updated_at,
    });
    assert.equal(deleted.outcome, "deleted");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [seeded.orderId])).rows[0].n, 0);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.order_items WHERE order_id=$1", [seeded.orderId])).rows[0].n, 0);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.order_status_history WHERE order_id=$1", [seeded.orderId])).rows[0].n, 0);
    const audit = await c.query(
      "SELECT action, before_data, after_data FROM public.audit_logs WHERE entity_id=$1",
      [seeded.orderId]
    );
    assert.equal(audit.rows[0].action, "order.physical_delete");
    assert.equal(audit.rows[0].before_data.order_code.startsWith("DEL-"), true);
    assert.equal(audit.rows[0].after_data.result, "deleted");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.customers WHERE customer_id=$1", [seeded.customerId])).rows[0].n, 1);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("controlled deletion blocks payment evidence, paid state, delivery progress, and runtime execution", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const seeded = await seedOrder(c, `${Date.now()}-payment`);
    const actorId = await seedActor(c, `${Date.now()}-payment`);
    await c.query(
      "INSERT INTO public.payments(order_id,payment_method,amount,payment_status) VALUES($1,'banking',10000,'pending')",
      [seeded.orderId]
    );
    const preview = await manage(c, {
      mode: "preview",
      order_id: seeded.orderId,
      reason: "Must be blocked by payment",
      actor_member_id: actorId,
    });
    assert.equal(preview.outcome, "blocked");
    assert.ok(preview.blockers.includes("payment_evidence_present"));

    await c.query("UPDATE public.orders SET payment_status='paid' WHERE order_id=$1", [seeded.orderId]);
    const paidPreview = await manage(c, {
      mode: "preview",
      order_id: seeded.orderId,
      reason: "Must be blocked after payment",
      actor_member_id: actorId,
    });
    assert.equal(paidPreview.outcome, "blocked");
    assert.ok(paidPreview.blockers.includes("payment_state_not_pending"));

    await c.query("DELETE FROM public.payments WHERE order_id=$1", [seeded.orderId]);
    await c.query("UPDATE public.orders SET payment_status='pending', delivery_status='packed' WHERE order_id=$1", [seeded.orderId]);
    const deliveryPreview = await manage(c, {
      mode: "preview",
      order_id: seeded.orderId,
      reason: "Must be blocked after delivery starts",
      actor_member_id: actorId,
    });
    assert.equal(deliveryPreview.outcome, "blocked");
    assert.ok(deliveryPreview.blockers.includes("delivery_started"));

    await c.query("SET LOCAL ROLE authenticated");
    await assert.rejects(
      c.query("SELECT public.manage_order_deletion_atomic('{}'::jsonb)"),
      /permission denied/
    );
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("controlled deletion blocks every retained business-evidence class", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const actorId = await seedActor(c, `${Date.now()}-matrix`);
    const cases: Array<{
      blocker: string;
      seed: (orderId: string, index: number) => Promise<void>;
    }> = [
      {
        blocker: "payment_event_present",
        seed: async (orderId, index) => {
          await c.query(
            `INSERT INTO public.payment_events(
               provider,provider_transaction_id,matched_order_id,received_amount,classification
             ) VALUES('local-test',$1,$2,10000,'matched')`,
            [`DEL-EVENT-${index}-${Date.now()}`, orderId],
          );
        },
      },
      {
        blocker: "shipment_present",
        seed: async (orderId) => {
          await c.query("INSERT INTO public.shipments(order_id) VALUES($1)", [orderId]);
        },
      },
      {
        blocker: "business_history_present",
        seed: async (orderId) => {
          await c.query(
            `INSERT INTO public.order_status_history(order_id,status_type,from_status,to_status)
             VALUES($1,'order','pending','confirmed')`,
            [orderId],
          );
        },
      },
      {
        blocker: "inventory_effect_present",
        seed: async (orderId) => {
          await c.query(
            "UPDATE public.orders SET inventory_reservation_recorded_at=now() WHERE order_id=$1",
            [orderId],
          );
        },
      },
      {
        blocker: "lifecycle_effect_present",
        seed: async (orderId, index) => {
          const voucherId = (
            await c.query(
              `INSERT INTO public.vouchers(code,discount_type,discount_value)
               VALUES($1,'fixed_amount',1000) RETURNING voucher_id`,
              [`DEL-VOUCHER-${index}-${Date.now()}`],
            )
          ).rows[0].voucher_id;
          await c.query("UPDATE public.orders SET voucher_id=$2 WHERE order_id=$1", [orderId, voucherId]);
        },
      },
    ];

    for (const [index, scenario] of cases.entries()) {
      const seeded = await seedOrder(c, `${Date.now()}-block-${index}`);
      await scenario.seed(seeded.orderId, index);
      const preview = await manage(c, {
        mode: "preview",
        order_id: seeded.orderId,
        reason: `Verify ${scenario.blocker}`,
        actor_member_id: actorId,
      });
      assert.equal(preview.outcome, "blocked", scenario.blocker);
      assert.ok(preview.blockers.includes(scenario.blocker), scenario.blocker);
      assert.equal(
        (await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [seeded.orderId])).rows[0].n,
        1,
        `${scenario.blocker} must preserve the order`,
      );
    }
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("H51 — completed idempotency claim no longer blocks deletion; it is removed atomically with the order", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const seeded = await seedOrder(c, `${Date.now()}-claim`);
    const actorId = await seedActor(c, `${Date.now()}-claim`);
    const base = {
      order_id: seeded.orderId,
      reason: "Atomic-created draft order cleanup",
      actor_member_id: actorId,
    };

    // Every order created through create_order_atomic leaves a completed
    // claim whose order_id points at the order (ON DELETE RESTRICT). It is
    // idempotency infrastructure, not business evidence.
    await c.query(
      `INSERT INTO public.order_idempotency(
         scope_key,idempotency_key,request_hash,status,order_id,response_json,completed_at
       ) VALUES($1,$2,$3,'completed',$4,$5::jsonb,now())`,
      [`guest:${"a".repeat(64)}`, crypto.randomUUID(), "b".repeat(64), seeded.orderId, JSON.stringify({ outcome: "created" })],
    );

    const preview = await manage(c, { ...base, mode: "preview" });
    assert.equal(preview.outcome, "eligible", "claim-only draft order must be deletable");
    assert.equal(preview.relations.idempotency_claims, 1, "preview reports the removable claim count");

    // A downstream audit failure must roll back both the order deletion and
    // the idempotency-claim cleanup performed by the same RPC transaction.
    await c.query(
      `CREATE OR REPLACE FUNCTION pg_temp.fail_delete_audit() RETURNS trigger LANGUAGE plpgsql AS
       $$BEGIN RAISE EXCEPTION 'delete-audit-fault'; END$$`,
    );
    await c.query(
      `CREATE TRIGGER fail_delete_audit BEFORE INSERT ON public.audit_logs
       FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_delete_audit()`,
    );
    await c.query("SAVEPOINT before_faulted_delete");
    await assert.rejects(
      manage(c, {
        ...base,
        mode: "delete",
        confirmation: "XOA",
        expected_updated_at: preview.updated_at,
      }),
      /delete-audit-fault/,
    );
    await c.query("ROLLBACK TO SAVEPOINT before_faulted_delete");
    assert.equal((await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [seeded.orderId])).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.order_idempotency WHERE order_id=$1", [seeded.orderId])).rows[0].n, 1);
    await c.query("DROP TRIGGER fail_delete_audit ON public.audit_logs");

    const stale = await manage(c, {
      ...base, mode: "delete", confirmation: "XOA", expected_updated_at: "2000-01-01T00:00:00Z",
    });
    assert.equal(stale.outcome, "stale_preview", "fresh preview is still required");

    const deleted = await manage(c, {
      ...base, mode: "delete", confirmation: "XOA", expected_updated_at: preview.updated_at,
    });
    assert.equal(deleted.outcome, "deleted");
    assert.equal(deleted.idempotency_claims_removed, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [seeded.orderId])).rows[0].n, 0);
    assert.equal((await c.query("SELECT count(*)::int n FROM public.order_idempotency WHERE order_id=$1", [seeded.orderId])).rows[0].n, 0);
    const audit = (await c.query(
      "SELECT after_data FROM public.audit_logs WHERE entity_type='order' AND action='order.physical_delete' AND entity_id=$1",
      [seeded.orderId],
    )).rows[0];
    assert.equal(audit.after_data.idempotency_claims_removed, 1, "audit records the removed claim count");
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("duplicate review is non-destructive, stale-safe, and idempotent", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const actorId = await seedActor(c, `${Date.now()}-duplicate`);
    const keep = await seedOrder(c, `${Date.now()}-KEEP`);
    const duplicate = await seedOrder(c, `${Date.now()}-DUPLICATE`);
    const keepCode = (
      await c.query("SELECT order_code FROM public.orders WHERE order_id=$1", [keep.orderId])
    ).rows[0].order_code;
    const base = {
      duplicate_order_id: duplicate.orderId,
      keep_order_code: keepCode,
      reason: "Synthetic duplicate review",
      actor_member_id: actorId,
    };
    const preview = (
      await c.query("SELECT public.mark_duplicate_order_atomic($1::jsonb) result", [{ ...base, mode: "preview" }])
    ).rows[0].result;
    assert.equal(preview.outcome, "review");

    const stale = (
      await c.query("SELECT public.mark_duplicate_order_atomic($1::jsonb) result", [{
        ...base,
        mode: "mark",
        confirmation: "TRUNG",
        expected_updated_at: "2000-01-01T00:00:00Z",
      }])
    ).rows[0].result;
    assert.equal(stale.outcome, "stale_preview");

    const marked = (
      await c.query("SELECT public.mark_duplicate_order_atomic($1::jsonb) result", [{
        ...base,
        mode: "mark",
        confirmation: "TRUNG",
        expected_updated_at: preview.duplicate_updated_at,
      }])
    ).rows[0].result;
    assert.equal(marked.outcome, "marked");
    assert.equal(marked.physical_delete_performed, false);

    const replayed = (
      await c.query("SELECT public.mark_duplicate_order_atomic($1::jsonb) result", [{
        ...base,
        mode: "mark",
        confirmation: "TRUNG",
        expected_updated_at: preview.duplicate_updated_at,
      }])
    ).rows[0].result;
    assert.equal(replayed.outcome, "replayed");
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM public.orders WHERE order_id IN ($1,$2)", [keep.orderId, duplicate.orderId])).rows[0].n,
      2,
    );
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM public.audit_logs WHERE action='order.duplicate_marked' AND entity_id=$1", [duplicate.orderId])).rows[0].n,
      1,
    );
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("two concurrent delete requests remove one order once and preserve one audit decision", { skip: !canRun }, async () => {
  const setup = await client();
  const first = await client();
  const second = await client();
  let customerId: string | undefined;
  let actorId: string | undefined;
  let orderId: string | undefined;
  try {
    const seeded = await seedOrder(setup, `${Date.now()}-race`);
    customerId = seeded.customerId;
    orderId = seeded.orderId;
    actorId = await seedActor(setup, `${Date.now()}-race`);
    const preview = await manage(setup, {
      mode: "preview",
      order_id: orderId,
      reason: "Concurrent synthetic delete",
      actor_member_id: actorId,
    });
    assert.equal(preview.outcome, "eligible");
    const payload = {
      mode: "delete",
      order_id: orderId,
      reason: "Concurrent synthetic delete",
      actor_member_id: actorId,
      confirmation: "XOA",
      expected_updated_at: preview.updated_at,
    };
    const [a, b] = await Promise.all([manage(first, payload), manage(second, payload)]);
    assert.deepEqual([a.outcome, b.outcome].sort(), ["deleted", "not_found"]);
    assert.equal((await setup.query("SELECT count(*)::int n FROM public.orders WHERE order_id=$1", [orderId])).rows[0].n, 0);
    assert.equal(
      (await setup.query("SELECT count(*)::int n FROM public.audit_logs WHERE action='order.physical_delete' AND entity_id=$1", [orderId])).rows[0].n,
      1,
    );
  } finally {
    if (orderId) await setup.query("DELETE FROM public.audit_logs WHERE entity_id=$1", [orderId]).catch(() => undefined);
    if (customerId) await setup.query("DELETE FROM public.customers WHERE customer_id=$1", [customerId]).catch(() => undefined);
    if (actorId) await setup.query("DELETE FROM public.members WHERE member_id=$1", [actorId]).catch(() => undefined);
    await Promise.all([setup.end(), first.end(), second.end()]);
  }
});
