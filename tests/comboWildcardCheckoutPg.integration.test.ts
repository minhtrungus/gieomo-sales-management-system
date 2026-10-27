import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error pg is a test-only runtime dependency without bundled TypeScript declarations.
const pg: any = await import("pg");

const databaseUrl = process.env.ATOMIC_PG_URL;
const canRun = Boolean(databaseUrl && process.env.GIEOMO_PG_ISOLATED === "1");

function client(connectionString = databaseUrl) {
  const value = new pg.Client({ connectionString });
  return value;
}

const canonicalHash = (payload: unknown) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

interface CheckoutInput {
  comboRef: string;
  quantity: number;
  idempotencyKey?: string;
  scopeSuffix?: string;
}

function checkoutPayload(input: CheckoutInput) {
  const payload = {
    items: [{ combo_id: input.comboRef, quantity: input.quantity }],
    buyer_phone: "0901234567",
    recipient_phone: "0901234567",
    buyer_name: "Wildcard Checkout PG",
    recipient_name: "Wildcard Checkout PG",
    idempotency_key: input.idempotencyKey ?? randomUUID(),
  };
  return {
    ...payload,
    scope_key: `guest:${createHash("sha256")
      .update(`wildcard-pg-${input.scopeSuffix ?? payload.idempotency_key}`)
      .digest("hex")}`,
    request_hash: canonicalHash(payload),
  };
}

async function callCheckout(c: any, input: CheckoutInput) {
  return (
    await c.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
      JSON.stringify(checkoutPayload(input)),
    ])
  ).rows[0].r;
}

async function seedCatalog(c: any, suffix: string, stocks: number[]) {
  const category = (
    await c.query(
      "INSERT INTO public.product_categories(name,slug,status) VALUES($1,$2,'active') RETURNING category_id",
      [`Wildcard checkout ${suffix}`, `wildcard-checkout-${suffix}`],
    )
  ).rows[0].category_id;
  const product = (
    await c.query(
      "INSERT INTO public.products(category_id,name,slug,price,status) VALUES($1,$2,$3,15000,'active') RETURNING product_id",
      [category, `Wildcard product ${suffix}`, `wildcard-product-${suffix}`],
    )
  ).rows[0].product_id;
  const variants = (
    await c.query(
      `INSERT INTO public.product_variants(product_id,sku,name,stock,status)
       SELECT $1, 'WK-' || $2 || '-' || s.ord, 'Variant ' || s.ord, s.st, 'active'
       FROM unnest($3::int[]) WITH ORDINALITY AS s(st, ord) RETURNING variant_id, sku`,
      [product, suffix, stocks],
    )
  ).rows;
  return { category, product, variants };
}

async function saveWildcardCombo(c: any, suffix: string, product: string, quantity = 1) {
  return (
    await c.query("SELECT public.save_combo_atomic($1::jsonb) AS r", [
      JSON.stringify({
        name: `Wildcard combo ${suffix}`,
        slug: `wildcard-combo-${suffix}`,
        price: 50000,
        status: "active",
        replace_items: true,
        items: [{ product_id: product, variant_id: null, quantity }],
      }),
    ])
  ).rows[0].r;
}

async function stocksFor(c: any, variants: { variant_id: string }[]) {
  return (
    await c.query(
      "SELECT variant_id, stock FROM public.product_variants WHERE variant_id = ANY($1::uuid[]) ORDER BY variant_id",
      [variants.map((variant) => variant.variant_id)],
    )
  ).rows;
}

async function reservationsFor(c: any, orderId: string) {
  return (
    await c.query(
      `SELECT variant_id, quantity FROM public.order_inventory_reservations
       WHERE order_id = $1 ORDER BY variant_id`,
      [orderId],
    )
  ).rows;
}

async function memberFor(c: any, suffix: string) {
  return (
    await c.query(
      "INSERT INTO public.members(full_name,role,status) VALUES($1,'admin','active') RETURNING member_id",
      [`Wildcard admin ${suffix}`],
    )
  ).rows[0].member_id;
}

test("wildcard combo checkout deducts the pool once and persists per-variant provenance", {
  skip: !canRun,
}, async () => {
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN");
    const suffix = `${Date.now()}-provenance`;
    const { product, variants } = await seedCatalog(c, suffix, [5, 5]);
    const combo = await saveWildcardCombo(c, suffix, product, 1);
    assert.equal(combo.outcome, "saved");

    const result = await callCheckout(c, { comboRef: combo.combo_id, quantity: 2 });
    assert.equal(result.outcome, "created");

    // Pool of 10 supporting demand 2: greedy by variant_id consumes the
    // first variant's full headroom (deterministic, once).
    const stocks = await stocksFor(c, variants);
    const totalAfter = stocks.reduce((sum: number, row: any) => sum + row.stock, 0);
    assert.equal(totalAfter, 8);
    assert.equal(Math.max(...stocks.map((row: any) => row.stock)), 5, "second variant untouched");

    // Order line carries the combo identity only (no fake variant).
    const items = await c.query(
      `SELECT product_id, variant_id, combo_id, item_name_snapshot
       FROM public.order_items WHERE order_id = $1`,
      [result.order_id],
    );
    assert.equal(items.rows.length, 1);
    assert.equal(items.rows[0].combo_id, combo.combo_id);
    assert.equal(items.rows[0].variant_id, null);
    assert.equal(items.rows[0].product_id, null);

    // Provenance rows equal the exact deducted stock by variant.
    const reservations = await reservationsFor(c, result.order_id);
    const reservationTotal = reservations.reduce((sum: any, row: any) => sum + row.quantity, 0);
    assert.equal(Number(reservationTotal), 2);
    const deductedVariant = stocks.find((row: any) => row.stock === 3) as any;
    assert.ok(deductedVariant, "exactly one variant was deducted by 2");
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].variant_id, deductedVariant.variant_id);
    assert.equal(Number(reservations[0].quantity), 2);

    const flag = await c.query(
      "SELECT inventory_reservation_recorded_at FROM public.orders WHERE order_id = $1",
      [result.order_id],
    );
    assert.ok(flag.rows[0].inventory_reservation_recorded_at !== null);

    // Idempotency evidence stores the exact deducted stock lines.
    const idempotency = await c.query(
      `SELECT response_json FROM public.order_idempotency WHERE order_id = $1`,
      [result.order_id],
    );
    const storedLines = idempotency.rows[0].response_json.stock_lines;
    assert.equal(storedLines.length, 1);
    assert.equal(storedLines[0].variant_id, reservations[0].variant_id);
    assert.equal(storedLines[0].quantity, 2);
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
});

test("explicit variant plus wildcard on one product never consumes the same stock twice", {
  skip: !canRun,
}, async () => {
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN");
    const suffix = `${Date.now()}-explicit-wild`;
    const { product, variants } = await seedCatalog(c, suffix, [2, 5]);
    const combo = (
      await c.query("SELECT public.save_combo_atomic($1::jsonb) AS r", [
        JSON.stringify({
          name: `Mixed combo ${suffix}`,
          slug: `mixed-combo-${suffix}`,
          price: 60000,
          status: "active",
          replace_items: true,
          items: [
            { product_id: product, variant_id: variants[0].variant_id, quantity: 1 },
            { product_id: product, variant_id: null, quantity: 1 },
          ],
        }),
      ])
    ).rows[0].r;
    assert.equal(combo.outcome, "saved");

    const result = await callCheckout(c, { comboRef: combo.combo_id, quantity: 1 });
    assert.equal(result.outcome, "created");

    // Explicit A always consumes one unit. Both seeded variants have the same
    // default sort_order, so migration 044's bottom-up allocation uses the
    // descending UUID tie-breaker (seed INSERT order is not allocation order).
    const [{ variant_id: variantA }, { variant_id: variantB }] = variants;
    const stocks = (
      await c.query(
        "SELECT variant_id, stock FROM public.product_variants WHERE variant_id IN ($1,$2) ORDER BY variant_id",
        [variantA, variantB],
      )
    ).rows;
    const stockByVariant = new Map(stocks.map((row: any) => [row.variant_id, row.stock]));
    const wildcardVariant = [variantA, variantB].sort().at(-1)!;
    assert.equal(stockByVariant.get(variantA), wildcardVariant === variantA ? 0 : 1);
    assert.equal(stockByVariant.get(variantB), wildcardVariant === variantB ? 4 : 5);
    assert.equal(Number(stockByVariant.get(variantA)) + Number(stockByVariant.get(variantB)), 5);

    // Provenance aggregates explicit and wildcard demand without counting any
    // physical stock unit twice, whether the wildcard lands on A or B.
    const reservations = await reservationsFor(c, result.order_id);
    const reservedByVariant = new Map(
      reservations.map((row: any) => [row.variant_id, Number(row.quantity)]),
    );
    assert.equal(
      reservations.reduce((sum: number, row: any) => sum + Number(row.quantity), 0),
      2,
    );
    assert.equal(reservedByVariant.get(variantA), wildcardVariant === variantA ? 2 : 1);
    assert.equal(reservedByVariant.get(variantB) ?? 0, wildcardVariant === variantB ? 1 : 0);
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
});

test("undersupplied wildcard pool fails with STOCK_INSUFFICIENT and rolls back clean", {
  skip: !canRun,
}, async () => {
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN");
    const suffix = `${Date.now()}-pool-short`;
    const { product } = await seedCatalog(c, suffix, [1, 0]);
    const combo = await saveWildcardCombo(c, suffix, product, 1);
    assert.equal(combo.outcome, "saved");
    await c.query("SAVEPOINT pool_short");

    const scopeKey = `guest:${createHash("sha256")
      .update("wildcard-pg-pool-short-scope")
      .digest("hex")}`;
    await assert.rejects(
      () => callCheckout(c, { comboRef: combo.combo_id, quantity: 2, scopeSuffix: "pool-short-scope" }),
      /D3:STOCK_INSUFFICIENT/,
    );
    // The failed statement aborted the transaction; rewind to the savepoint
    // so the following read-only checks can run, then discard the test tx.
    await c.query("ROLLBACK TO SAVEPOINT pool_short");

    // No catalog mutation and no order/idempotency leak from the failed call.
    const orders = await c.query(
      "SELECT count(*)::int AS n FROM public.orders WHERE idempotency_scope = $1",
      [scopeKey],
    );
    assert.equal(orders.rows[0].n, 0);
    const idempotency = await c.query(
      "SELECT count(*)::int AS n FROM public.order_idempotency WHERE scope_key = $1",
      [scopeKey],
    );
    assert.equal(idempotency.rows[0].n, 0);
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
});

test("wildcard product with no eligible variant fails closed as INVALID_COMBO_COMPONENT", {
  skip: !canRun,
}, async () => {
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN");
    const suffix = `${Date.now()}-disabled`;
    const { product, variants } = await seedCatalog(c, suffix, [3]);
    const combo = await saveWildcardCombo(c, suffix, product, 1);
    assert.equal(combo.outcome, "saved");
    await c.query(
      "UPDATE public.product_variants SET status = 'archived' WHERE variant_id = $1",
      [variants[0].variant_id],
    );

    await assert.rejects(
      () => callCheckout(c, { comboRef: combo.combo_id, quantity: 1 }),
      /D3:INVALID_COMBO_COMPONENT/,
    );
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
});

test("idempotent replay keeps stock, provenance and results intact", {
  skip: !canRun,
}, async () => {
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN");
    const suffix = `${Date.now()}-replay`;
    const { product, variants } = await seedCatalog(c, suffix, [4, 4]);
    const combo = await saveWildcardCombo(c, suffix, product, 1);
    assert.equal(combo.outcome, "saved");

    const idempotencyKey = randomUUID();
    const input = { comboRef: combo.combo_id, quantity: 1, idempotencyKey, scopeSuffix: "replay" };
    const first = await callCheckout(c, input);
    assert.equal(first.outcome, "created");
    const stocksAfterFirst = await stocksFor(c, variants);
    const reservationsFirst = await reservationsFor(c, first.order_id);
    assert.equal(reservationsFirst.length, 1);

    const second = await callCheckout(c, input);
    assert.equal(second.outcome, "created");
    assert.equal(second.replayed, true);
    assert.equal(second.order_id, first.order_id);
    assert.equal(second.order_code, first.order_code);
    assert.equal(second.final_amount, first.final_amount);

    const stocksAfterSecond = await stocksFor(c, variants);
    assert.deepEqual(stocksAfterSecond, stocksAfterFirst);
    const reservationsSecond = await reservationsFor(c, first.order_id);
    assert.deepEqual(reservationsSecond, reservationsFirst);
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
});

test("cancelled wildcard order restores stock exactly per allocated variant", {
  skip: !canRun,
}, async () => {
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN");
    const suffix = `${Date.now()}-cancel`;
    const { product, variants } = await seedCatalog(c, suffix, [3, 4]);
    const combo = await saveWildcardCombo(c, suffix, product, 1);
    assert.equal(combo.outcome, "saved");
    const actor = await memberFor(c, suffix);

    const first = await callCheckout(c, { comboRef: combo.combo_id, quantity: 2 });
    assert.equal(first.outcome, "created");
    const midStocks = await stocksFor(c, variants);
    const reserved = await reservationsFor(c, first.order_id);
    assert.equal(Number(reserved.reduce((s: any, row: any) => s + row.quantity, 0)), 2);

    const cancel = (
      await c.query("SELECT public.cancel_order_atomic($1::jsonb) AS r", [
        JSON.stringify({
          order_id: first.order_id,
          actor_member_id: actor,
          reason: "Wildcard checkout restore check",
        }),
      ])
    ).rows[0].r;
    assert.equal(cancel.outcome, "cancelled");

    // Every restored line mirrors the allocation provenance exactly.
    const restored = cancel.inventory_restored;
    assert.equal(restored.length, reserved.length);
    assert.deepEqual(
      restored.map((row: any) => ({ variant_id: row.variant_id, quantity: Number(row.quantity) })),
      reserved.map((row: any) => ({ variant_id: row.variant_id, quantity: Number(row.quantity) })),
    );
    const stocksAfter = await stocksFor(c, variants);
    assert.deepEqual(
      stocksAfter,
      midStocks.map((row: any) => ({
        ...row,
        stock: row.stock + (restored.find((line: any) => line.variant_id === row.variant_id)?.quantity ?? 0),
      })),
    );
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
});

test("two concurrent checkouts over an exact pool: one wins, one fails, no oversell", {
  skip: !canRun,
}, async () => {
  const seedConnection = client();
  await seedConnection.connect();
  const suffix = `${Date.now()}-conc`;
  let comboId = "";
  let createdOrderId = "";
  try {
    const { product } = await seedCatalog(seedConnection, suffix, [1, 0]);
    const combo = await saveWildcardCombo(seedConnection, suffix, product, 1);
    assert.equal(combo.outcome, "saved");
    const variantRows = (
      await seedConnection.query(
        "SELECT variant_id FROM public.product_variants WHERE product_id = $1 ORDER BY variant_id",
        [product],
      )
    ).rows.map((row: any) => ({ variant_id: row.variant_id }));
    // The pool of 1+1 supports exactly one set.
    comboId = combo.combo_id;

    const attempt = (index: number) => {
      const c = client();
      return (async () => {
        await c.connect();
        try {
          return await callCheckout(c, {
            comboRef: comboId,
            quantity: 1,
            scopeSuffix: `conc-${index}`,
          });
        } finally {
          await c.end();
        }
      })();
    };

    const [first, second] = await Promise.allSettled([
      attempt(1),
      attempt(2),
    ]) as [PromiseSettledResult<any>, PromiseSettledResult<any>];

    const outcomes: string[] = [];
    if (first.status === "fulfilled" && first.value?.outcome) outcomes.push(first.value.outcome);
    if (first.status === "rejected") outcomes.push(`rejected:${String(first.reason)}`);
    if (second.status === "fulfilled" && second.value?.outcome) outcomes.push(second.value.outcome);
    if (second.status === "rejected") outcomes.push(`rejected:${String(second.reason)}`);

    const successes = outcomes.filter((outcome) => outcome === "created").length;
    const poolExhausted = outcomes.filter((outcome) =>
      outcome.startsWith("rejected:") && outcome.includes("D3:STOCK_INSUFFICIENT"),
    ).length;
    assert.equal(successes + poolExhausted, 2);
    assert.equal(successes, 1, "pool of 1 set supports exactly one winner");

    createdOrderId = first.status === "fulfilled" ? first.value.order_id
      : second.status === "fulfilled" ? second.value.order_id : "";
    const stocks = await stocksFor(seedConnection, variantRows);
    assert.equal(
      stocks.reduce((sum: number, row: any) => sum + row.stock, 0),
      0,
      "the single pool unit was consumed exactly once",
    );

    if (createdOrderId) {
      const reservations = await reservationsFor(seedConnection, createdOrderId);
      assert.equal(
        Number(reservations.reduce((s: any, row: any) => s + row.quantity, 0)),
        1,
      );
    }
  } finally {
    // Cleanup the committed parallel-test data (disposable database anyway).
    if (createdOrderId) {
      await seedConnection.query(
        "DELETE FROM public.order_inventory_reservations WHERE order_id = $1",
        [createdOrderId],
      );
      await seedConnection.query("DELETE FROM public.order_items WHERE order_id = $1", [createdOrderId]);
      await seedConnection.query("DELETE FROM public.order_status_history WHERE order_id = $1", [createdOrderId]);
      await seedConnection.query("DELETE FROM public.order_idempotency WHERE order_id = $1", [createdOrderId]);
      await seedConnection.query(
        "DELETE FROM public.audit_logs WHERE entity_type = 'order' AND entity_id = $1",
        [createdOrderId],
      );
      await seedConnection.query("DELETE FROM public.orders WHERE order_id = $1", [createdOrderId]);
    }
    await seedConnection.end();
  }
});
