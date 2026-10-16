import { test } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Batch 2C — PostgreSQL integration/concurrency cho
 * public.deduct_variant_stock_atomic (migration 012).
 *
 * Gate giống các file PG integration khác:
 *   - Repo KHÔNG có driver PG (`pg` không phải dependency) → mặc định SKIP;
 *   - Cần ATOMIC_PG_URL trỏ tới Supabase/PostgreSQL đã apply migration 012.
 *
 * File này KHÔNG apply migration, KHÔNG chạy ngoài môi trường được cấp.
 * Khi SKIP: tuyệt đối không tuyên bố concurrency/atomicity đã nghiệm thu.
 * Khi RUN: chứng minh tại PostgreSQL thật — hai session đồng thời không
 * mất lần trừ kho, tổng cầu vượt tồn kho không làm stock âm, ROLLBACK
 * hoàn nguyên.
 */

// @ts-expect-error pg là optional (không có trong package.json) — test tự SKIP khi thiếu
const pgMod: any = await import("pg").catch(() => null);
const ATOMIC_PG_URL = process.env.ATOMIC_PG_URL;
const canRun = Boolean(pgMod && ATOMIC_PG_URL);
const skipReason = !pgMod
  ? "thiếu module pg (không phải dependency của repo) — NOT RUN"
  : !ATOMIC_PG_URL
    ? "thiếu ATOMIC_PG_URL — NOT RUN"
    : "";

async function withClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function functionExists(client: any, name: string): Promise<boolean> {
  const res = await client.query(
    "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1",
    [name]
  );
  return res.rowCount > 0;
}

/** Seed product + variant stock = `stock`, trả về { productId, variantId } và hàm dọn. */
async function seedVariant(
  client: any,
  stock: number
): Promise<{ productId: string; variantId: string; cleanup: () => Promise<void> }> {
  const token = `pg-2c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const prodRes = await client.query(
    "INSERT INTO public.products (name, slug, price, status) VALUES ($1, $2, 10000, 'active') RETURNING product_id",
    ["PG 2C stock test", `pg-2c-${token}`]
  );
  const productId = prodRes.rows[0].product_id as string;
  const varRes = await client.query(
    "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, 'PG 2C Variant', 10000, $3) RETURNING variant_id",
    [productId, `SKU-2C-${token}-V`, stock]
  );
  const variantId = varRes.rows[0].variant_id as string;
  return {
    productId,
    variantId,
    cleanup: async () => {
      await client.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]);
      await client.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    },
  };
}

async function readStock(client: any, variantId: string): Promise<number> {
  const res = await client.query("SELECT stock FROM public.product_variants WHERE variant_id = $1", [variantId]);
  return Number(res.rows[0].stock);
}

async function deduct(client: any, variantId: string, qty: number): Promise<boolean> {
  const res = await client.query("SELECT public.deduct_variant_stock_atomic($1::uuid, $2::int) AS ok", [
    variantId,
    qty,
  ]);
  return res.rows[0].ok === true;
}

test("PG 2C-D1 — hai session đồng thời mỗi bên trừ 3 với stock 5: đúng 1 bên thắng, stock = 2, không lost-update", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "deduct_variant_stock_atomic"))) {
      t.skip("public.deduct_variant_stock_atomic chưa tồn tại — apply migration 012 trước");
      return null;
    }
    return seedVariant(client, 5);
  });
  if (!setup) return;
  const { variantId, productId } = setup;

  try {
    // Hai client/session RIÊNG BIỆT — contention thật ở row lock PostgreSQL.
    const [r1, r2] = await Promise.all([
      withClient((c) => deduct(c, variantId, 3)),
      withClient((c) => deduct(c, variantId, 3)),
    ]);
    const wins = [r1, r2].filter(Boolean).length;
    assert.equal(wins, 1, `phải có đúng 1 bên thắng (got ${wins})`);
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 2, "5 - 3 = 2 — lần trừ thua không được ghi đè");
    assert.ok(stock >= 0, "stock không âm");
  } finally {
    await withClient(async (c) => {
      await c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]);
      await c.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    }).catch(() => {});
  }
});

test("PG 2C-D2 — tổng cầu vượt tồn kho (3+3 > 5): lần 2 fail, stock = 2, không âm", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "deduct_variant_stock_atomic"))) {
      t.skip("public.deduct_variant_stock_atomic chưa tồn tại — apply migration 012 trước");
      return null;
    }
    return seedVariant(client, 5);
  });
  if (!setup) return;
  const { variantId, productId } = setup;

  try {
    const first = await withClient((c) => deduct(c, variantId, 3));
    const second = await withClient((c) => deduct(c, variantId, 3));
    assert.equal(first, true);
    assert.equal(second, false, "3 + 3 > 5 → lần 2 PHẢI bị từ chối tại WHERE stock >= qty");
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 2);
    assert.ok(stock >= 0);
  } finally {
    await withClient(async (c) => {
      await c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]);
      await c.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    }).catch(() => {});
  }
});

test("PG 2C-D3 — tổng cầu vừa đủ tồn kho (2+3 = 5): cả hai thắng, stock = 0", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "deduct_variant_stock_atomic"))) {
      t.skip("public.deduct_variant_stock_atomic chưa tồn tại — apply migration 012 trước");
      return null;
    }
    return seedVariant(client, 5);
  });
  if (!setup) return;
  const { variantId, productId } = setup;

  try {
    const r1 = await withClient((c) => deduct(c, variantId, 2));
    const r2 = await withClient((c) => deduct(c, variantId, 3));
    assert.equal(r1, true);
    assert.equal(r2, true, "2 + 3 = 5 → vừa đủ, cả hai được phép");
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 0);
  } finally {
    await withClient(async (c) => {
      await c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]);
      await c.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    }).catch(() => {});
  }
});

test("PG 2C-D4 — ROLLBACK sau deduct: stock hoàn nguyên, không để lại dấu vết", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "deduct_variant_stock_atomic"))) {
      t.skip("public.deduct_variant_stock_atomic chưa tồn tại — apply migration 012 trước");
      return null;
    }
    return seedVariant(client, 5);
  });
  if (!setup) return;
  const { variantId, productId } = setup;

  try {
    await withClient(async (c) => {
      await c.query("BEGIN");
      const ok = await deduct(c, variantId, 2);
      assert.equal(ok, true, "deduct trong tx phải thành công trước khi rollback");
      assert.equal(await readStock(c, variantId), 3, "trong tx đã thấy 3 (uncommitted)");
      await c.query("ROLLBACK");
    });
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 5, "ROLLBACK phải hoàn nguyên toàn bộ khấu trừ");
  } finally {
    await withClient(async (c) => {
      await c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]);
      await c.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    }).catch(() => {});
  }
});

test("PG 2C-D5 — burst 4 session × trừ 2 với stock 4: stock cuối >= 0 và khớp số lượt thắng", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "deduct_variant_stock_atomic"))) {
      t.skip("public.deduct_variant_stock_atomic chưa tồn tại — apply migration 012 trước");
      return null;
    }
    return seedVariant(client, 4);
  });
  if (!setup) return;
  const { variantId, productId } = setup;

  try {
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => withClient((c) => deduct(c, variantId, 2)))
    );
    const wins = results.filter(Boolean).length;
    assert.ok(wins >= 1 && wins <= 2, `số lượt thắng phải trong [1,2], got ${wins}`);
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 4 - wins * 2, "mỗi lượt thắng trừ đúng 2 — không mất không thêm");
    assert.ok(stock >= 0, "stock không bao giờ âm");
  } finally {
    await withClient(async (c) => {
      await c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]);
      await c.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    }).catch(() => {});
  }
});
