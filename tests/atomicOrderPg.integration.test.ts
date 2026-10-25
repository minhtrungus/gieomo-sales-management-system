import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";
import { defaultPsqlBin, resolvePsqlBin } from "./helpers/psqlBin.ts";

const databaseUrl = process.env.ATOMIC_PG_URL;
const psql = databaseUrl ? resolvePsqlBin() : defaultPsqlBin();
const execFileAsync = promisify(execFile);

function literal(value: string): string {
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

function hash(label: string): string {
  return createHash("sha256").update(label).digest("hex");
}

function scope(label: string): string {
  return `guest:${hash(`scope:${label}`)}`;
}

function payload(options: {
  label: string;
  key?: string;
  requestHash?: string;
  variantId?: string;
  comboId?: string;
  voucherCode?: string;
  quantity?: number;
  note?: string;
  extra?: Record<string, unknown>;
}): { key: string; requestHash: string; value: Record<string, unknown> } {
  const key = options.key || randomUUID();
  const requestHash = options.requestHash || hash(`request:${options.label}`);
  return {
    key,
    requestHash,
    value: {
      scope_key: scope(options.label),
      idempotency_key: key,
      request_hash: requestHash,
      buyer_name: `D3 ${options.label}`,
      buyer_phone: `09${hash(options.label).replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`,
      recipient_phone: "0900000000",
      customer_note: options.note || `D3:${options.label}`,
      voucher_code: options.voucherCode || null,
      payment_method: "banking",
      items: [
        options.comboId
          ? { combo_id: options.comboId, quantity: options.quantity || 1 }
          : { variant_id: options.variantId, quantity: options.quantity || 1 },
      ],
      ...options.extra,
    },
  };
}

function rpc(value: Record<string, unknown>): string {
  return `SELECT public.create_order_atomic(${literal(JSON.stringify(value))}::jsonb)::text;`;
}

function createCatalog(label: string, stock = 20): { productId: string; variantId: string } {
  const productId = randomUUID();
  const variantId = randomUUID();
  query(`
    INSERT INTO public.products (product_id, name, slug, price, status)
    VALUES (${literal(productId)}::uuid, ${literal(`D3 ${label}`)}, ${literal(`d3-${label}-${productId}`)}, 100000, 'active');
    INSERT INTO public.product_variants (variant_id, product_id, sku, name, price, stock, status)
    VALUES (${literal(variantId)}::uuid, ${literal(productId)}::uuid, ${literal(`D3-${variantId}`)}, 'Default', 90000, ${stock}, 'active');
  `);
  return { productId, variantId };
}

function orderCounts(key: string): string {
  return query(`
    SELECT
      (SELECT count(*) FROM public.orders WHERE idempotency_key = ${literal(key)}::uuid) || '|' ||
      (SELECT count(*) FROM public.order_items i JOIN public.orders o USING (order_id) WHERE o.idempotency_key = ${literal(key)}::uuid) || '|' ||
      (SELECT count(*) FROM public.order_status_history h JOIN public.orders o USING (order_id) WHERE o.idempotency_key = ${literal(key)}::uuid) || '|' ||
      (SELECT count(*) FROM public.audit_logs a JOIN public.orders o ON o.order_id = a.entity_id WHERE o.idempotency_key = ${literal(key)}::uuid) || '|' ||
      (SELECT count(*) FROM public.order_idempotency WHERE idempotency_key = ${literal(key)}::uuid);
  `);
}

test("Decision 3 atomic order PostgreSQL contract", { skip: !databaseUrl, timeout: 90_000 }, async (t) => {
  query(`
    INSERT INTO public.system_configs (config_key, config_value)
    VALUES ('flat_shipping_fee', '25000'), ('free_shipping_threshold', '500000')
    ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
  `);

  // Test-only setup. The tracked migration chain (001-012, 021, 025) keeps
  // discount_type = ('percentage','fixed_amount'); the 'freeship' label comes
  // from dashboard-only migration 014, which is deliberately not part of the
  // tracked chain. Disposable test databases therefore add it explicitly so
  // the freeship pricing contract below can be exercised.
  query(`ALTER TYPE public.discount_type ADD VALUE IF NOT EXISTS 'freeship';`);

  await t.test("creates one complete order using server prices", () => {
    const item = createCatalog("valid");
    const request = payload({ label: `valid-${randomUUID()}`, variantId: item.variantId });
    const result = JSON.parse(query(rpc(request.value)));
    assert.equal(result.outcome, "created");
    assert.equal(result.replayed, false);
    assert.equal(result.final_amount, 115000);
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "19");
  });

  await t.test("sequential retry replays the committed result", () => {
    const item = createCatalog("sequential");
    const request = payload({ label: `sequential-${randomUUID()}`, variantId: item.variantId });
    const first = JSON.parse(query(rpc(request.value)));
    const second = JSON.parse(query(rpc(request.value)));
    assert.equal(second.replayed, true);
    assert.equal(second.order_id, first.order_id);
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "19");
  });

  await t.test("concurrent retry creates at most one order", async () => {
    const item = createCatalog("same-key-race");
    const request = payload({ label: `same-key-race-${randomUUID()}`, variantId: item.variantId });
    const responses = await Promise.all([queryAsync(rpc(request.value)), queryAsync(rpc(request.value))]);
    const parsed = responses.map((response) => JSON.parse(response));
    assert.deepEqual(parsed.map((value) => value.replayed).sort(), [false, true]);
    assert.equal(parsed[0].order_id, parsed[1].order_id);
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
  });

  await t.test("same scope and key with a different hash is rejected", () => {
    const item = createCatalog("hash-mismatch");
    const request = payload({ label: `hash-mismatch-${randomUUID()}`, variantId: item.variantId });
    query(rpc(request.value));
    assert.throws(() => query(rpc({ ...request.value, request_hash: hash("different") })));
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
  });

  await t.test("lost response is recovered from durable state in a new process", () => {
    const item = createCatalog("lost-response");
    const request = payload({ label: `lost-response-${randomUUID()}`, variantId: item.variantId });
    query(rpc(request.value));
    const recovered = JSON.parse(query(rpc(request.value)));
    assert.equal(recovered.replayed, true);
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
  });

  await t.test("insufficient stock rolls back every effect", () => {
    const item = createCatalog("no-stock", 0);
    const request = payload({ label: `no-stock-${randomUUID()}`, variantId: item.variantId });
    assert.throws(() => query(rpc(request.value)));
    assert.equal(orderCounts(request.key), "0|0|0|0|0");
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "0");
  });

  await t.test("two orders competing for the last unit do not oversell", async () => {
    const item = createCatalog("last-unit", 1);
    const left = payload({ label: `last-left-${randomUUID()}`, variantId: item.variantId });
    const right = payload({ label: `last-right-${randomUUID()}`, variantId: item.variantId });
    const settled = await Promise.allSettled([queryAsync(rpc(left.value)), queryAsync(rpc(right.value))]);
    assert.equal(settled.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal(settled.filter((value) => value.status === "rejected").length, 1);
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "0");
    assert.equal(query(`SELECT count(*) FROM public.orders WHERE idempotency_key IN (${literal(left.key)}::uuid,${literal(right.key)}::uuid);`), "1");
  });

  await t.test("voucher usage limit is preserved under contention", async () => {
    const item = createCatalog("voucher-race", 2);
    const code = `D3-${randomUUID()}`;
    query(`INSERT INTO public.vouchers(code,discount_type,discount_value,usage_limit,status) VALUES (${literal(code)},'fixed_amount',10000,1,'active');`);
    const left = payload({ label: `voucher-left-${randomUUID()}`, variantId: item.variantId, voucherCode: code });
    const right = payload({ label: `voucher-right-${randomUUID()}`, variantId: item.variantId, voucherCode: code });
    const settled = await Promise.allSettled([queryAsync(rpc(left.value)), queryAsync(rpc(right.value))]);
    assert.equal(settled.filter((value) => value.status === "fulfilled").length, 1);
    assert.equal(query(`SELECT times_used FROM public.vouchers WHERE code=${literal(code)};`), "1");
    assert.equal(query(`SELECT count(*) FROM public.orders WHERE idempotency_key IN (${literal(left.key)}::uuid,${literal(right.key)}::uuid);`), "1");
  });

  for (const target of ["order_items", "order_status_history", "audit_logs"] as const) {
    await t.test(`${target} failure rolls back order, inventory, voucher, and idempotency`, () => {
      const item = createCatalog(`rollback-${target}`, 1);
      const code = `D3-${randomUUID()}`;
      const marker = `D3:rollback:${target}:${randomUUID()}`;
      query(`INSERT INTO public.vouchers(code,discount_type,discount_value,usage_limit,status) VALUES (${literal(code)},'fixed_amount',10000,5,'active');`);
      const request = payload({ label: `rollback-${target}-${randomUUID()}`, variantId: item.variantId, voucherCode: code, note: marker });
      const functionName = `d3_reject_${target}`;
      const triggerName = `d3_reject_${target}_trigger`;
      const orderIdExpression = target === "audit_logs" ? "NEW.entity_id" : "NEW.order_id";
      query(`
        CREATE OR REPLACE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF EXISTS (SELECT 1 FROM public.orders WHERE order_id=${orderIdExpression} AND customer_note=${literal(marker)}) THEN
            RAISE EXCEPTION 'D3 forced ${target} failure';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER ${triggerName} BEFORE INSERT ON public.${target}
        FOR EACH ROW EXECUTE FUNCTION public.${functionName}();
      `);
      try {
        assert.throws(() => query(rpc(request.value)));
      } finally {
        query(`DROP TRIGGER ${triggerName} ON public.${target}; DROP FUNCTION public.${functionName}();`);
      }
      assert.equal(orderCounts(request.key), "0|0|0|0|0");
      assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "1");
      assert.equal(query(`SELECT times_used FROM public.vouchers WHERE code=${literal(code)};`), "0");
    });
  }

  await t.test("client-supplied prices and totals are ignored", () => {
    const item = createCatalog("price-authority");
    const request = payload({
      label: `price-authority-${randomUUID()}`,
      variantId: item.variantId,
      extra: { subtotal: 1, shipping_fee: 0, voucher_discount: 999999, final_amount: 1 },
    });
    const result = JSON.parse(query(rpc(request.value)));
    assert.equal(result.final_amount, 115000);
    assert.equal(
      query(`SELECT subtotal || '|' || shipping_fee || '|' || voucher_discount || '|' || final_amount FROM public.orders WHERE idempotency_key=${literal(request.key)}::uuid;`),
      "90000|25000|0|115000"
    );
  });

  await t.test("freeship voucher waives shipping and invents no monetary discount", () => {
    const item = createCatalog("freeship");
    const code = `D3-${randomUUID()}`;
    query(`INSERT INTO public.vouchers(code,discount_type,discount_value,usage_limit,status) VALUES (${literal(code)},'freeship',1,5,'active');`);
    const request = payload({ label: `freeship-${randomUUID()}`, variantId: item.variantId, voucherCode: code });

    const created = JSON.parse(query(rpc(request.value)));
    assert.equal(created.outcome, "created");
    assert.equal(created.replayed, false);
    // 90000 subtotal + 0 shipping (freeship) - 0 discount (freeship has no
    // monetary reduction). Treating freeship as fixed_amount would instead
    // produce 90000 + 25000 - 1 = 114999.
    assert.equal(created.final_amount, 90000);
    assert.equal(
      query(`SELECT subtotal || '|' || shipping_fee || '|' || voucher_discount || '|' || final_amount FROM public.orders WHERE idempotency_key=${literal(request.key)}::uuid;`),
      "90000|0|0|90000"
    );
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "19");
    assert.equal(query(`SELECT times_used FROM public.vouchers WHERE code=${literal(code)};`), "1");

    const replay = JSON.parse(query(rpc(request.value)));
    assert.equal(replay.replayed, true);
    assert.equal(replay.order_id, created.order_id);
    assert.equal(replay.final_amount, created.final_amount);
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "19");
    assert.equal(query(`SELECT times_used FROM public.vouchers WHERE code=${literal(code)};`), "1");
  });

  await t.test("failed freeship order rolls back usage and inventory", () => {
    const item = createCatalog("freeship-fail", 0);
    const code = `D3-${randomUUID()}`;
    query(`INSERT INTO public.vouchers(code,discount_type,discount_value,usage_limit,status) VALUES (${literal(code)},'freeship',1,5,'active');`);
    const request = payload({ label: `freeship-fail-${randomUUID()}`, variantId: item.variantId, voucherCode: code });
    assert.throws(() => query(rpc(request.value)));
    assert.equal(orderCounts(request.key), "0|0|0|0|0");
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "0");
    assert.equal(query(`SELECT times_used FROM public.vouchers WHERE code=${literal(code)};`), "0");
  });

  await t.test("combo NULL component uses the migration-035 wildcard contract", () => {
    const item = createCatalog("wildcard-combo");
    const comboId = randomUUID();
    query(`
      INSERT INTO public.combos(combo_id,name,slug,price,status) VALUES (${literal(comboId)}::uuid,'D3 combo',${literal(`d3-combo-${comboId}`)},150000,'active');
      INSERT INTO public.combo_items(combo_id,product_id,variant_id,quantity) VALUES (${literal(comboId)}::uuid,${literal(item.productId)}::uuid,NULL,1);
    `);
    const request = payload({ label: `wildcard-combo-${randomUUID()}`, comboId });
    const result = JSON.parse(query(rpc(request.value)));
    assert.equal(result.outcome, "created");
    assert.equal(orderCounts(request.key), "1|1|1|1|1");
    assert.equal(query(`SELECT stock FROM public.product_variants WHERE variant_id=${literal(item.variantId)}::uuid;`), "19");
    assert.equal(query(`SELECT quantity FROM public.order_inventory_reservations WHERE order_id=${literal(result.order_id)}::uuid AND variant_id=${literal(item.variantId)}::uuid;`), "1");
  });
});
