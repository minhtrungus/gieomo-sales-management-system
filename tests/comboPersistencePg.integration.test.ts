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

async function seed(c: any, suffix: string) {
  const category = (
    await c.query(
      "INSERT INTO public.product_categories(name,slug,status) VALUES($1,$2,'active') RETURNING category_id",
      [`Combo PG ${suffix}`, `combo-pg-${suffix}`]
    )
  ).rows[0].category_id;
  const product = (
    await c.query(
      "INSERT INTO public.products(category_id,name,slug,price,status) VALUES($1,$2,$3,10000,'active') RETURNING product_id",
      [category, `Combo product ${suffix}`, `combo-product-${suffix}`]
    )
  ).rows[0].product_id;
  const variants = (
    await c.query(
      "INSERT INTO public.product_variants(product_id,sku,name,stock,status) VALUES($1,$2,'A',20,'active'),($1,$3,'B',20,'active') RETURNING variant_id",
      [product, `CP-${suffix}-A`, `CP-${suffix}-B`]
    )
  ).rows.map((row: any) => row.variant_id);
  return { category, product, variants };
}

async function save(c: any, payload: Record<string, unknown>) {
  return (await c.query("SELECT public.save_combo_atomic($1::jsonb) result", [payload])).rows[0]
    .result;
}

test("combo persistence rolls header and components back on a component fault", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const suffix = `${Date.now()}-rollback`;
    const seeded = await seed(c, suffix);
    const created = await save(c, {
      name: "Atomic combo old",
      slug: `atomic-combo-${suffix}`,
      price: 25000,
      status: "active",
      replace_items: true,
      items: [{ product_id: seeded.product, variant_id: seeded.variants[0], quantity: 1 }],
    });
    assert.equal(created.outcome, "saved");

    await c.query(`
      CREATE FUNCTION pg_temp.fail_combo_item() RETURNS trigger
      LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'combo item fault'; END$$
    `);
    await c.query(`
      CREATE TRIGGER combo_item_fault BEFORE INSERT ON public.combo_items
      FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_combo_item()
    `);
    await c.query("SAVEPOINT before_fault");
    await assert.rejects(
      save(c, {
        combo_id: created.combo_id,
        name: "Atomic combo partial",
        replace_items: true,
        items: [{ product_id: seeded.product, variant_id: seeded.variants[1], quantity: 3 }],
      }),
      /combo item fault/
    );
    await c.query("ROLLBACK TO SAVEPOINT before_fault");

    const header = await c.query("SELECT name FROM public.combos WHERE combo_id=$1", [created.combo_id]);
    const items = await c.query(
      "SELECT variant_id, quantity FROM public.combo_items WHERE combo_id=$1",
      [created.combo_id]
    );
    assert.equal(header.rows[0].name, "Atomic combo old");
    assert.deepEqual(items.rows, [{ variant_id: seeded.variants[0], quantity: 1 }]);
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("combo persistence rejects active combos without items and mismatched variants", { skip: !canRun }, async () => {
  const c = await client();
  await c.query("BEGIN");
  try {
    const suffix = `${Date.now()}-invalid`;
    const a = await seed(c, `${suffix}-a`);
    const b = await seed(c, `${suffix}-b`);
    await assert.rejects(
      save(c, { name: "No items", slug: `no-items-${suffix}`, status: "active" }),
      /C1:ACTIVE_COMBO_REQUIRES_ITEMS/
    );
    await c.query("ROLLBACK");
    await c.query("BEGIN");
    const a2 = await seed(c, `${suffix}-a2`);
    const b2 = await seed(c, `${suffix}-b2`);
    await assert.rejects(
      save(c, {
        name: "Mismatch",
        slug: `mismatch-${suffix}`,
        status: "active",
        replace_items: true,
        items: [{ product_id: a2.product, variant_id: b2.variants[0], quantity: 1 }],
      }),
      /C1:VARIANT_PRODUCT_MISMATCH/
    );
    void a;
    void b;
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
});

test("concurrent combo replacements serialize to one complete payload", { skip: !canRun }, async () => {
  const setup = await client();
  const suffix = `${Date.now()}-race`;
  const seeded = await seed(setup, suffix);
  const created = await save(setup, {
    name: "Race base",
    slug: `race-combo-${suffix}`,
    status: "active",
    replace_items: true,
    items: [{ product_id: seeded.product, variant_id: seeded.variants[0], quantity: 1 }],
  });
  const a = await client();
  const b = await client();
  try {
    const [first, second] = await Promise.all([
      save(a, {
        combo_id: created.combo_id,
        name: "Race A",
        replace_items: true,
        items: [{ product_id: seeded.product, variant_id: seeded.variants[0], quantity: 2 }],
      }),
      save(b, {
        combo_id: created.combo_id,
        name: "Race B",
        replace_items: true,
        items: [{ product_id: seeded.product, variant_id: seeded.variants[1], quantity: 3 }],
      }),
    ]);
    assert.equal(first.outcome, "saved");
    assert.equal(second.outcome, "saved");
    const final = (
      await setup.query(
        `SELECT c.name, ci.variant_id, ci.quantity
           FROM public.combos c JOIN public.combo_items ci USING (combo_id)
          WHERE c.combo_id=$1`,
        [created.combo_id]
      )
    ).rows;
    assert.equal(final.length, 1);
    assert.ok(
      (final[0].name === "Race A" && final[0].variant_id === seeded.variants[0] && final[0].quantity === 2) ||
        (final[0].name === "Race B" && final[0].variant_id === seeded.variants[1] && final[0].quantity === 3)
    );
  } finally {
    await a.end();
    await b.end();
    await setup.query("DELETE FROM public.combos WHERE combo_id=$1", [created.combo_id]).catch(() => undefined);
    await setup.query("DELETE FROM public.products WHERE product_id=$1", [seeded.product]).catch(() => undefined);
    await setup.query("DELETE FROM public.product_categories WHERE category_id=$1", [seeded.category]).catch(() => undefined);
    await setup.end();
  }
});

test("runtime roles cannot execute combo persistence RPC", { skip: !canRun }, async () => {
  const c = await client();
  try {
    await c.query("SET ROLE authenticated");
    await assert.rejects(
      c.query("SELECT public.save_combo_atomic('{}'::jsonb)"),
      /permission denied/
    );
  } finally {
    await c.end();
  }
});

