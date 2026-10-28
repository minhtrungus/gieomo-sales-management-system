import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is a test-only runtime dependency without bundled TypeScript declarations.
const pg: any = await import("pg");
const canRun = Boolean(process.env.ATOMIC_PG_URL && process.env.GIEOMO_PG_ISOLATED === "1");

test("045 archives terminal orders only and never changes inventory/payment/history facts", { skip: !canRun }, async () => {
  const client = new pg.Client({ connectionString: process.env.ATOMIC_PG_URL });
  await client.connect();
  await client.query("BEGIN");
  try {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const actor = (await client.query(
      "INSERT INTO public.members(full_name,role,status,referral_code) VALUES('Archive Admin','admin','active',$1) RETURNING member_id",
      [`ARC${suffix}`],
    )).rows[0].member_id;
    const customer = (await client.query(
      "INSERT INTO public.customers(full_name,phone,email) VALUES('Archive Fixture',$1,$2) RETURNING customer_id",
      [`07${suffix.slice(0, 8)}`, `archive-${suffix}@example.test`],
    )).rows[0].customer_id;
    const product = (await client.query(
      "INSERT INTO public.products(name,slug,price,status) VALUES('Archive Product',$1,100000,'active') RETURNING product_id",
      [`archive-product-${suffix}`],
    )).rows[0].product_id;
    const variant = (await client.query(
      "INSERT INTO public.product_variants(product_id,sku,name,price,stock,status) VALUES($1,$2,'Mẫu archive',100000,10,'active') RETURNING variant_id",
      [product, `ARC-${suffix}`],
    )).rows[0].variant_id;

    async function seedOrder(orderStatus: string, paymentStatus: string, deliveryStatus: string, withReservation = true) {
      const id = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
      const row = (await client.query(
        `INSERT INTO public.orders(order_code,customer_id,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,
          order_status,payment_status,delivery_status,payment_method,inventory_reservation_recorded_at,completed_at,cancelled_at)
         VALUES($1,$2,'Archive Fixture','0900000000','self_pickup',200000,200000,$3,$4,$5,'banking',$6,
          CASE WHEN $3='completed' THEN now() ELSE NULL END, CASE WHEN $3='cancelled' THEN now() ELSE NULL END)
         RETURNING order_id`,
        [`ARC-${id}`, customer, orderStatus, paymentStatus, deliveryStatus, withReservation ? new Date() : null],
      )).rows[0];
      await client.query(
        "INSERT INTO public.order_items(order_id,product_id,variant_id,item_name_snapshot,variant_name_snapshot,sku_snapshot,quantity,unit_price,subtotal) VALUES($1,$2,$3,'Archive Product','Mẫu archive',$4,2,100000,200000)",
        [row.order_id, product, variant, `ARC-${suffix}`],
      );
      if (withReservation) await client.query(
        "INSERT INTO public.order_inventory_reservations(order_id,variant_id,quantity) VALUES($1,$2,2)", [row.order_id, variant],
      );
      await client.query(
        "INSERT INTO public.order_status_history(order_id,status_type,from_status,to_status,note,changed_by_member_id) VALUES($1,'order',NULL,$2,'fixture',$3)",
        [row.order_id, orderStatus, actor],
      );
      if (paymentStatus === "paid") {
        await client.query(
          "INSERT INTO public.payments(order_id,payment_method,amount,payment_status,transaction_code,confirmed_by) VALUES($1,'banking',200000,'paid',$2,$3)",
          [row.order_id, `BANK-${id}`, actor],
        );
        await client.query(
          "INSERT INTO public.payment_events(provider,provider_transaction_id,order_code,matched_order_id,received_amount,expected_amount,classification,outcome,payload_fingerprint) VALUES('sepay',$1,$2,$3,200000,200000,'matched','applied',$4)",
          [`PROVIDER-${id}`, `ARC-${id}`, row.order_id, `fingerprint-${id}`],
        );
      }
      if (deliveryStatus === "delivered") await client.query(
        "INSERT INTO public.shipments(order_id,shipping_method,status,tracking_code,delivered_at) VALUES($1,'btc_delivery','delivered',$2,now())",
        [row.order_id, `TRACK-${id}`],
      );
      return row.order_id as string;
    }

    async function facts(orderId: string) {
      return (await client.query(
        `SELECT jsonb_build_object(
          'order', (SELECT jsonb_build_object('order_status',order_status,'payment_status',payment_status,'delivery_status',delivery_status,'final_amount',final_amount) FROM public.orders WHERE order_id=$1),
          'stock', (SELECT stock FROM public.product_variants WHERE variant_id=$2),
          'reservations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('variant_id',variant_id,'quantity',quantity) ORDER BY variant_id),'[]'::jsonb) FROM public.order_inventory_reservations WHERE order_id=$1),
          'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('transaction_code',transaction_code,'status',payment_status,'amount',amount) ORDER BY payment_id),'[]'::jsonb) FROM public.payments WHERE order_id=$1),
          'events', (SELECT COALESCE(jsonb_agg(jsonb_build_object('provider_transaction_id',provider_transaction_id,'classification',classification) ORDER BY event_id),'[]'::jsonb) FROM public.payment_events WHERE matched_order_id=$1),
          'history_count', (SELECT count(*) FROM public.order_status_history WHERE order_id=$1),
          'shipment_count', (SELECT count(*) FROM public.shipments WHERE order_id=$1),
          'archive_count', (SELECT count(*) FROM public.admin_order_archives WHERE order_id=$1),
          'archive_audit_count', (SELECT count(*) FROM public.audit_logs WHERE entity_id=$1 AND action='order.archive')
        ) facts`, [orderId, variant],
      )).rows[0].facts;
    }

    async function archive(orderId: string, actorId = actor) {
      return (await client.query("SELECT public.archive_order_atomic($1::jsonb) result", [{
        order_id: orderId, actor_member_id: actorId, reason: "Archive regression fixture",
      }])).rows[0].result;
    }

    for (const [status, payment, delivery] of [
      ["pending", "pending", "not_ready"],
      ["confirmed", "paid", "not_ready"],
      ["shipping", "paid", "in_transit"],
    ]) {
      const orderId = await seedOrder(status, payment, delivery);
      const before = await facts(orderId);
      const result = await archive(orderId);
      assert.equal(result.outcome, "not_terminal");
      assert.deepEqual(await facts(orderId), before, `${status}/${payment}/${delivery} must remain operational and unchanged`);
    }

    for (const [status, payment, delivery] of [
      ["completed", "paid", "delivered"],
      ["cancelled", "pending", "not_ready"],
    ]) {
      const orderId = await seedOrder(status, payment, delivery);
      const before = await facts(orderId);
      const result = await archive(orderId);
      assert.equal(result.outcome, "archived");
      assert.equal(result.inventory_unchanged, true);
      assert.equal(result.refund_created, false);
      assert.equal(result.restock_created, false);
      const after = await facts(orderId);
      for (const key of ["order", "stock", "reservations", "payments", "events", "history_count", "shipment_count"]) {
        assert.deepEqual(after[key], before[key], `${key} changed while archiving ${status}`);
      }
      assert.equal(Number(after.archive_count), 1);
      assert.equal(Number(after.archive_audit_count), 1);
      assert.equal((await archive(orderId)).outcome, "already_archived");
    }

    const inactiveActor = (await client.query(
      "INSERT INTO public.members(full_name,role,status,referral_code) VALUES('Inactive Archive Admin','admin','inactive',$1) RETURNING member_id",
      [`IARC${suffix}`],
    )).rows[0].member_id;
    const unauthorizedOrder = await seedOrder("completed", "paid", "delivered");
    assert.equal((await archive(unauthorizedOrder, inactiveActor)).outcome, "invalid_actor");
    assert.equal(Number((await facts(unauthorizedOrder)).archive_count), 0);

    const faultOrder = await seedOrder("completed", "paid", "delivered");
    const triggerFunction = `archive_fault_${suffix}`;
    const triggerName = `archive_fault_trigger_${suffix}`;
    await client.query(`CREATE FUNCTION public.${triggerFunction}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive audit fault'; END $$`);
    await client.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON public.audit_logs FOR EACH ROW WHEN (NEW.action='order.archive') EXECUTE FUNCTION public.${triggerFunction}()`);
    const beforeFault = await facts(faultOrder);
    await client.query("SAVEPOINT archive_fault_case");
    await assert.rejects(archive(faultOrder), /archive audit fault/);
    await client.query("ROLLBACK TO SAVEPOINT archive_fault_case");
    assert.deepEqual(await facts(faultOrder), beforeFault, "mid-transaction audit failure must roll back archive row and all facts");
    await client.query(`DROP TRIGGER ${triggerName} ON public.audit_logs`);
    await client.query(`DROP FUNCTION public.${triggerFunction}()`);

    await client.query("SET LOCAL ROLE authenticated");
    await assert.rejects(client.query("SELECT public.archive_order_atomic('{}'::jsonb)"), /permission denied/);
    await client.query("RESET ROLE");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
