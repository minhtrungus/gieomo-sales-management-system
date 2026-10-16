import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";
import { psqlBin as psql, psqlTimeoutMs } from "./helpers/psqlBin.ts";

const databaseUrl = process.env.ATOMIC_PG_URL;
const execFileAsync = promisify(execFile);
const adminId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function query(sql: string): string {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  return execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: psqlTimeoutMs,
  }).trim();
}

async function queryAsync(sql: string): Promise<string> {
  if (!databaseUrl) throw new Error("ATOMIC_PG_URL is required");
  const { stdout } = await execFileAsync(
    psql,
    ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", databaseUrl, "-c", sql],
    { encoding: "utf8", timeout: psqlTimeoutMs }
  );
  return stdout.trim();
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createVariant(label: string, stock = 20) {
  const productId = randomUUID();
  const variantId = randomUUID();
  query(`
    INSERT INTO public.products(product_id,name,slug,price,status)
    VALUES (${literal(productId)}::uuid,${literal(label)},${literal(`${label}-${productId}`)},100000,'active');
    INSERT INTO public.product_variants(variant_id,product_id,sku,name,price,stock,status)
    VALUES (${literal(variantId)}::uuid,${literal(productId)}::uuid,${literal(`C26-${variantId}`)},'Default',90000,${stock},'active');
  `);
  return { productId, variantId };
}

function createOrder(options: { variantId?: string; comboId?: string; voucherCode?: string }) {
  const nonce = randomUUID();
  const payload = {
    scope_key: `guest:${hash(`scope-${nonce}`)}`,
    idempotency_key: randomUUID(),
    request_hash: hash(`request-${nonce}`),
    buyer_name: "C26 buyer",
    buyer_phone: "0900000000",
    recipient_phone: "0900000000",
    payment_method: "banking",
    actor_member_id: adminId,
    voucher_code: options.voucherCode || null,
    items: [options.comboId
      ? { combo_id: options.comboId, quantity: 1 }
      : { variant_id: options.variantId, quantity: 2 }],
  };
  return JSON.parse(query(`SELECT public.create_order_atomic(${literal(JSON.stringify(payload))}::jsonb)::text;`)) as {
    order_id: string;
    order_code: string;
  };
}

function cancel(orderId: string, reason = "C26 integration test"): string {
  const payload = { order_id: orderId, actor_member_id: adminId, reason };
  return `SELECT public.cancel_order_atomic(${literal(JSON.stringify(payload))}::jsonb)::text;`;
}

test("migration 026 atomic cancellation PostgreSQL contract", { skip: !databaseUrl, timeout: 90_000 }, async (t) => {
  query(`
    INSERT INTO public.members(member_id,full_name,role,status)
    VALUES (${literal(adminId)}::uuid,'C26 admin','admin','active')
    ON CONFLICT (member_id) DO UPDATE SET status='active';
  `);

  await t.test("restores direct stock and voucher exactly once with history and audit", () => {
    const item = createVariant(`c26-direct-${randomUUID()}`, 10);
    const voucherCode = `C26-${randomUUID()}`;
    query(`INSERT INTO public.vouchers(code,discount_type,discount_value,usage_limit,status)
      VALUES (${literal(voucherCode)},'fixed_amount',10000,5,'active');`);
    const order = createOrder({ variantId: item.variantId, voucherCode });
    assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "8");
    assert.equal(query(`SELECT quantity FROM order_inventory_reservations WHERE order_id=${literal(order.order_id)}::uuid;`), "2");

    const first = JSON.parse(query(cancel(order.order_id)));
    const second = JSON.parse(query(cancel(order.order_id)));
    assert.equal(first.outcome, "cancelled");
    assert.equal(second.outcome, "already_cancelled");
    assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "10");
    assert.equal(query(`SELECT times_used FROM vouchers WHERE code=${literal(voucherCode)};`), "0");
    assert.equal(query(`SELECT cancel_reason FROM orders WHERE order_id=${literal(order.order_id)}::uuid;`), "C26 integration test");
    assert.equal(query(`SELECT count(*) FROM order_status_history WHERE order_id=${literal(order.order_id)}::uuid AND to_status='cancelled';`), "1");
    assert.equal(query(`SELECT count(*) FROM audit_logs WHERE entity_id=${literal(order.order_id)}::uuid AND action='order.cancel';`), "1");
  });

  await t.test("two concurrent cancellations produce one reversal", async () => {
    const item = createVariant(`c26-race-${randomUUID()}`, 10);
    const order = createOrder({ variantId: item.variantId });
    const results = await Promise.all([queryAsync(cancel(order.order_id)), queryAsync(cancel(order.order_id))]);
    assert.deepEqual(results.map((value) => JSON.parse(value).outcome).sort(), ["already_cancelled", "cancelled"]);
    assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "10");
    assert.equal(query(`SELECT count(*) FROM audit_logs WHERE entity_id=${literal(order.order_id)}::uuid AND action='order.cancel';`), "1");
  });

  await t.test("paid order remains paid and requires a real refund", () => {
    const item = createVariant(`c26-paid-${randomUUID()}`, 10);
    const order = createOrder({ variantId: item.variantId });
    query(`
      UPDATE orders SET payment_status='paid' WHERE order_id=${literal(order.order_id)}::uuid;
      INSERT INTO payments(order_id,payment_method,amount,payment_status,transaction_code)
      VALUES (${literal(order.order_id)}::uuid,'banking',205000,'paid',${literal(`C26-${randomUUID()}`)});
    `);
    const result = JSON.parse(query(cancel(order.order_id)));
    assert.equal(result.refund_required, true);
    assert.equal(query(`SELECT payment_status::text FROM orders WHERE order_id=${literal(order.order_id)}::uuid;`), "paid");
    assert.equal(query(`SELECT count(*)||'|'||min(payment_status::text) FROM payments WHERE order_id=${literal(order.order_id)}::uuid;`), "1|paid");
  });

  await t.test("immutable combo ledger survives later combo edits", () => {
    const item = createVariant(`c26-combo-${randomUUID()}`, 10);
    const comboId = randomUUID();
    query(`
      INSERT INTO combos(combo_id,name,slug,price,status)
      VALUES (${literal(comboId)}::uuid,'C26 combo',${literal(`c26-combo-${comboId}`)},150000,'active');
      INSERT INTO combo_items(combo_id,product_id,variant_id,quantity)
      VALUES (${literal(comboId)}::uuid,${literal(item.productId)}::uuid,${literal(item.variantId)}::uuid,3);
    `);
    const order = createOrder({ comboId });
    assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "7");
    query(`UPDATE combo_items SET quantity=1 WHERE combo_id=${literal(comboId)}::uuid;`);
    query(cancel(order.order_id));
    assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "10");
  });

  await t.test("legacy order without provenance fails closed with no effects", () => {
    const customerId = randomUUID();
    const orderId = randomUUID();
    const code = `C26-LEGACY-${randomUUID().slice(0, 8)}`;
    const phone = `09${randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`;
    query(`
      INSERT INTO customers(customer_id,full_name,phone) VALUES (${literal(customerId)}::uuid,'Legacy',${literal(phone)});
      INSERT INTO orders(order_id,order_code,customer_id,receiver_name,receiver_phone,delivery_type,subtotal,final_amount,order_status,payment_status)
      VALUES (${literal(orderId)}::uuid,${literal(code)},${literal(customerId)}::uuid,'Legacy',${literal(phone)},'home_delivery',100000,100000,'pending','pending');
    `);
    const result = JSON.parse(query(cancel(orderId)));
    assert.equal(result.outcome, "inventory_unverified");
    assert.equal(query(`SELECT order_status::text FROM orders WHERE order_id=${literal(orderId)}::uuid;`), "pending");
    assert.equal(query(`SELECT count(*) FROM audit_logs WHERE entity_id=${literal(orderId)}::uuid AND action='order.cancel';`), "0");
  });

  await t.test("terminal order status cannot be cancelled or reversed", () => {
    const item = createVariant(`c26-terminal-${randomUUID()}`, 10);
    const order = createOrder({ variantId: item.variantId });
    query(`UPDATE orders SET order_status='completed', completed_at=now() WHERE order_id=${literal(order.order_id)}::uuid;`);
    const result = JSON.parse(query(cancel(order.order_id)));
    assert.equal(result.outcome, "not_cancellable");
    assert.equal(query(`SELECT order_status::text FROM orders WHERE order_id=${literal(order.order_id)}::uuid;`), "completed");
    assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "8");
    assert.equal(query(`SELECT count(*) FROM audit_logs WHERE entity_id=${literal(order.order_id)}::uuid AND action='order.cancel';`), "0");
  });

  for (const target of ["order_status_history", "audit_logs"] as const) {
    await t.test(`${target} failure rolls back status, stock, and voucher`, () => {
      const item = createVariant(`c26-rollback-${target}-${randomUUID()}`, 10);
      const voucherCode = `C26-RB-${randomUUID()}`;
      query(`INSERT INTO vouchers(code,discount_type,discount_value,usage_limit,status)
        VALUES (${literal(voucherCode)},'fixed_amount',10000,5,'active');`);
      const order = createOrder({ variantId: item.variantId, voucherCode });
      const fn = `c26_reject_${target}_${randomUUID().replaceAll("-", "")}`;
      const trigger = `${fn}_trigger`;
      const predicate = target === "audit_logs"
        ? `NEW.entity_id=${literal(order.order_id)}::uuid AND NEW.action='order.cancel'`
        : `NEW.order_id=${literal(order.order_id)}::uuid AND NEW.to_status='cancelled'`;
      query(`
        CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF ${predicate} THEN RAISE EXCEPTION 'C26 forced rollback'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER ${trigger} BEFORE INSERT ON public.${target}
        FOR EACH ROW EXECUTE FUNCTION public.${fn}();
      `);
      try {
        assert.throws(() => query(cancel(order.order_id)));
        assert.equal(query(`SELECT order_status::text FROM orders WHERE order_id=${literal(order.order_id)}::uuid;`), "pending");
        assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "8");
        assert.equal(query(`SELECT times_used FROM vouchers WHERE code=${literal(voucherCode)};`), "1");
      } finally {
        query(`DROP TRIGGER ${trigger} ON public.${target}; DROP FUNCTION public.${fn}();`);
      }
    });
  }

  await t.test("unsafe voucher counter aborts before any mutation", () => {
    const item = createVariant(`c26-voucher-unsafe-${randomUUID()}`, 10);
    const voucherCode = `C26-UNSAFE-${randomUUID()}`;
    query(`INSERT INTO vouchers(code,discount_type,discount_value,usage_limit,status)
      VALUES (${literal(voucherCode)},'fixed_amount',10000,5,'active');`);
    const order = createOrder({ variantId: item.variantId, voucherCode });
    query(`UPDATE vouchers SET times_used=0 WHERE code=${literal(voucherCode)};`);
    const result = JSON.parse(query(cancel(order.order_id)));
    assert.equal(result.outcome, "voucher_release_unsafe");
    assert.equal(query(`SELECT order_status::text FROM orders WHERE order_id=${literal(order.order_id)}::uuid;`), "pending");
    assert.equal(query(`SELECT stock FROM product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "8");
  });
});
