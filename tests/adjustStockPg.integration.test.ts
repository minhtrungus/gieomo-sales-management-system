import { test } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Batch 2G — PostgreSQL integration/concurrency cho
 * public.adjust_variant_stock + public.deduct_variant_stock_atomic
 * (migration 012 + 019 + 020).
 *
 * Gate giống các file PG integration khác:
 *   - Repo KHÔNG có driver PG (`pg` không phải dependency) → mặc định SKIP;
 *   - Cần ATOMIC_PG_URL trỏ tới Supabase/PostgreSQL đã apply 012+019+020.
 *
 * File này KHÔNG apply migration, KHÔNG chạy ngoài môi trường được cấp.
 * Khi SKIP: tuyệt đối không tuyên bố concurrency/atomicity đã nghiệm thu.
 * Khi RUN: chứng minh tại PostgreSQL thật — adjust ± đồng thời không mất
 * update, idempotency key chỉ áp dụng 1 lần, guard không cho stock âm,
 * adjust tương tác an toàn với deduct atomic của order, và (A8/020) DELETE
 * variant không làm mất lịch sử ledger (SET NULL + snapshot).
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

async function seedVariant(
  client: any,
  stock: number
): Promise<{ productId: string; variantId: string; cleanup: (c: any) => Promise<void> }> {
  const token = `pg-2g-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const prodRes = await client.query(
    "INSERT INTO public.products (name, slug, price, status) VALUES ($1, $2, 10000, 'active') RETURNING product_id",
    ["PG 2G adjust test", `pg-2g-${token}`]
  );
  const productId = prodRes.rows[0].product_id as string;
  const varRes = await client.query(
    "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, 'PG 2G Variant', 10000, $3) RETURNING variant_id",
    [productId, `SKU-2G-${token}-V`, stock]
  );
  const variantId = varRes.rows[0].variant_id as string;
  return {
    productId,
    variantId,
    cleanup: async (c: any) => {
      await c.query("DELETE FROM public.inventory_adjustments WHERE variant_id = $1", [variantId]);
      await c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]);
      await c.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    },
  };
}

async function readStock(client: any, variantId: string): Promise<number> {
  const res = await client.query("SELECT stock FROM public.product_variants WHERE variant_id = $1", [variantId]);
  return Number(res.rows[0].stock);
}

async function adjust(
  client: any,
  variantId: string,
  delta: number,
  reason: string,
  key: string
): Promise<{ outcome: string; stockBefore?: number; stockAfter?: number }> {
  const res = await client.query(
    "SELECT public.adjust_variant_stock($1::uuid, $2::int, $3::text, $4::text) AS r",
    [variantId, delta, reason, key]
  );
  const r = res.rows[0].r;
  return {
    outcome: r.outcome,
    stockBefore: r.stockBefore != null ? Number(r.stockBefore) : undefined,
    stockAfter: r.stockAfter != null ? Number(r.stockAfter) : undefined,
  };
}

async function adjustExpectErr(
  client: any,
  variantId: string,
  delta: number,
  reason: string,
  key: string
): Promise<{ code?: string; message?: string }> {
  try {
    await client.query("SELECT public.adjust_variant_stock($1::uuid, $2::int, $3::text, $4::text) AS r", [
      variantId,
      delta,
      reason,
      key,
    ]);
    return {};
  } catch (e: any) {
    return { code: e?.code, message: e?.message };
  }
}

// ---- A1: delta dương/negative đúng, stock theo kỳ vọng ----
test("PG 2G-A1 — delta dương rồi âm: stock = 5 + 3 - 2 = 6", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "adjust_variant_stock"))) {
      t.skip("public.adjust_variant_stock chưa tồn tại — apply migration 019 trước");
      return null;
    }
    return seedVariant(client, 5);
  });
  if (!setup) return;
  const { variantId } = setup;
  try {
    const k1 = `a1-pos-${Date.now()}`;
    const k2 = `a1-neg-${Date.now()}`;
    const r1 = await withClient((c) => adjust(c, variantId, 3, "PG 2G test +", k1));
    assert.equal(r1.outcome, "applied");
    assert.equal(r1.stockAfter, 8);
    const r2 = await withClient((c) => adjust(c, variantId, -2, "PG 2G test -", k2));
    assert.equal(r2.outcome, "applied");
    assert.equal(r2.stockAfter, 6);
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 6);
  } finally {
    await withClient((c) => setup.cleanup(c)).catch(() => {});
  }
});

// ---- A2: guard không cho stock âm ----
test("PG 2G-A2 — delta làm stock âm → insufficient_stock, stock không đổi", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "adjust_variant_stock"))) {
      t.skip("apply migration 019 trước");
      return null;
    }
    return seedVariant(client, 3);
  });
  if (!setup) return;
  const { variantId } = setup;
  try {
    const r = await withClient((c) => adjust(c, variantId, -5, "PG 2G âm test", `a2-${Date.now()}`));
    assert.equal(r.outcome, "insufficient_stock");
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 3, "stock KHÔNG được đổi khi insufficient_stock");
  } finally {
    await withClient((c) => setup.cleanup(c)).catch(() => {});
  }
});

// ---- A3: duplicate key payload giống → chỉ áp dụng 1 lần ----
test("PG 2G-A3 — cùng key payload giống: lần 1 applied, lần 2 duplicate, stock chỉ cộng 1 lần", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "adjust_variant_stock"))) {
      t.skip("apply migration 019 trước");
      return null;
    }
    return seedVariant(client, 10);
  });
  if (!setup) return;
  const { variantId } = setup;
  try {
    const key = `a3-${Date.now()}`;
    const r1 = await withClient((c) => adjust(c, variantId, 4, "PG 2G dup test", key));
    assert.equal(r1.outcome, "applied");
    const r2 = await withClient((c) => adjust(c, variantId, 4, "PG 2G dup test", key));
    assert.equal(r2.outcome, "duplicate");
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 14, "chỉ cộng 1 lần dù gọi 2 lần cùng key");
  } finally {
    await withClient((c) => setup.cleanup(c)).catch(() => {});
  }
});

// ---- A4: duplicate key payload khác → RAISE fail-closed ----
test("PG 2G-A4 — cùng key payload KHÁC → RAISE B2G:IDEMPOTENCY_PAYLOAD_MISMATCH", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "adjust_variant_stock"))) {
      t.skip("apply migration 019 trước");
      return null;
    }
    return seedVariant(client, 10);
  });
  if (!setup) return;
  const { variantId, productId } = setup;
  try {
    const key = `a4-${Date.now()}`;
    await withClient((c) => adjust(c, variantId, 2, "PG 2G mismatch", key));
    const err = await withClient((c) => adjustExpectErr(c, variantId, 5, "PG 2G mismatch", key));
    assert.ok(
      err.message?.includes("B2G:IDEMPOTENCY_PAYLOAD_MISMATCH") ||
        err.message?.includes("điều chỉnh KHÁC"),
      `mong đợi RAISE mismatch, got: ${err.message}`
    );
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 12, "lần gọi sai payload KHÔNG được áp dụng");
    // cùng key nhưng variant khác → cũng fail-closed
    const token = `${key}-alt`;
    const altVar = await withClient(async (c) => {
      const res = await c.query(
        "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, 'alt', 10000, 10) RETURNING variant_id",
        [productId, `SKU-2G-alt-${token}`]
      );
      return res.rows[0].variant_id as string;
    });
    const err2 = await withClient((c) => adjustExpectErr(c, altVar, 2, "PG 2G mismatch", key));
    assert.ok(
      err2.message?.includes("B2G:IDEMPOTENCY_PAYLOAD_MISMATCH") ||
        err2.message?.includes("điều chỉnh KHÁC"),
      `cùng key khác variant phải fail-closed, got: ${err2.message}`
    );
    await withClient(
      (c) => c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [altVar])
    ).catch(() => {});
  } finally {
    await withClient((c) => setup.cleanup(c)).catch(() => {});
  }
});

// ---- A5: ± đồng thời (hai session, key khác nhau) — không lost-update ----
test("PG 2G-A5 — +5 và -3 đồng thời (key khác): tổng stock = 10 + 5 - 3 = 12", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "adjust_variant_stock"))) {
      t.skip("apply migration 019 trước");
      return null;
    }
    return seedVariant(client, 10);
  });
  if (!setup) return;
  const { variantId } = setup;
  try {
    const kPos = `a5-pos-${Date.now()}`;
    const kNeg = `a5-neg-${Date.now()}`;
    const [r1, r2] = await Promise.all([
      withClient((c) => adjust(c, variantId, 5, "PG 2G +5", kPos)),
      withClient((c) => adjust(c, variantId, -3, "PG 2G -3", kNeg)),
    ]);
    assert.equal(r1.outcome, "applied");
    assert.equal(r2.outcome, "applied");
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 12, "hai adjust đồng thời với key khác phải cộng đúng, không lost-update");
  } finally {
    await withClient((c) => setup.cleanup(c)).catch(() => {});
  }
});

// ---- A6: cùng key đồng thời — chỉ 1 lần áp dụng ----
test("PG 2G-A6 — hai session đồng thời CÙNG key: đúng 1 applied, stock chỉ đổi 1 lần", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "adjust_variant_stock"))) {
      t.skip("apply migration 019 trước");
      return null;
    }
    return seedVariant(client, 10);
  });
  if (!setup) return;
  const { variantId } = setup;
  try {
    const key = `a6-${Date.now()}`;
    const results = await Promise.all([
      withClient((c) => adjust(c, variantId, 4, "PG 2G concurrent dup", key)),
      withClient((c) => adjust(c, variantId, 4, "PG 2G concurrent dup", key)),
    ]);
    const applied = results.filter((r) => r.outcome === "applied").length;
    const duplicate = results.filter((r) => r.outcome === "duplicate").length;
    // Một bên có thể thắng (applied) hoặc cả hai serialize thành applied+duplicate;
    // điều quan trọng: stock chỉ đổi ĐÚNG 1 lần.
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 14, `stock chỉ được cộng 1 lần (applied=${applied}, duplicate=${duplicate})`);
    assert.equal(applied, 1, "phải có đúng 1 lần applied");
  } finally {
    await withClient((c) => setup.cleanup(c)).catch(() => {});
  }
});

// ---- A7: tương tác với deduct_variant_stock_atomic (order path) ----
test("PG 2G-A7 — adjust +5 đồng thời với deduct 8 (stock 10): stock cuối ≥ 0, tổng = 10 + 5 - 8 = 7", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (
      !(await functionExists(client, "adjust_variant_stock")) ||
      !(await functionExists(client, "deduct_variant_stock_atomic"))
    ) {
      t.skip("apply migration 012 + 019 trước");
      return null;
    }
    return seedVariant(client, 10);
  });
  if (!setup) return;
  const { variantId } = setup;
  try {
    const [adj, ded] = await Promise.all([
      withClient((c) => adjust(c, variantId, 5, "PG 2G restock", `a7-${Date.now()}`)),
      withClient(async (c) => {
        const res = await c.query("SELECT public.deduct_variant_stock_atomic($1::uuid, $2::int) AS ok", [
          variantId,
          8,
        ]);
        return res.rows[0].ok === true;
      }),
    ]);
    assert.equal(adj.outcome, "applied");
    assert.equal(ded, true, "deduct 8 với stock 10 phải thành công");
    const stock = await withClient((c) => readStock(c, variantId));
    assert.equal(stock, 7, "tổng = 10 + 5 - 8 = 7, không negative, không lost-update");
  } finally {
    await withClient((c) => setup.cleanup(c)).catch(() => {});
  }
});

// ---- A8: ledger bảo toàn sau DELETE variant (020: SET NULL + snapshot) ----
test("PG 2G-A8 — DELETE variant: không 23503, ledger variant_id → NULL, snapshot variant_name/sku giữ nguyên", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const setup = await withClient(async (client) => {
    if (!(await functionExists(client, "adjust_variant_stock"))) {
      t.skip("apply migration 019 trước");
      return null;
    }
    // 020 cần thiết cho A8: FK SET NULL + 2 cột snapshot
    const snapCols = await client.query(
      "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_adjustments' AND column_name IN ('variant_name','sku')"
    );
    if (Number(snapCols.rows[0].n) !== 2) {
      t.skip("apply migration 020 trước (thiếu cột snapshot variant_name/sku)");
      return null;
    }
    return seedVariant(client, 10);
  });
  if (!setup) return;
  const { productId, variantId } = setup;
  const key = `a8-${Date.now()}`;
  try {
    // Điều chỉnh +3 → ledger row với snapshot từ variant vừa khóa
    const adj = await withClient((c) => adjust(c, variantId, 3, "PG 2G A8 snapshot", key));
    assert.equal(adj.outcome, "applied");

    const before = await withClient(async (c) =>
      c.query(
        "SELECT variant_id, variant_name, sku FROM public.inventory_adjustments WHERE idempotency_key = $1",
        [key]
      )
    );
    assert.equal(before.rowCount, 1, "phải có đúng 1 ledger row");
    assert.equal(String(before.rows[0].variant_id), variantId);
    assert.equal(before.rows[0].variant_name, "PG 2G Variant", "snapshot variant_name phải được ghi lúc adjust");
    assert.ok(before.rows[0].sku, "snapshot sku phải được ghi lúc adjust");

    // DELETE variant — trước 020 (RESTRICT) sẽ fail 23503
    await withClient(async (c) => c.query("DELETE FROM public.product_variants WHERE variant_id = $1", [variantId]));

    const after = await withClient(async (c) =>
      c.query(
        "SELECT variant_id, variant_name, sku FROM public.inventory_adjustments WHERE idempotency_key = $1",
        [key]
      )
    );
    assert.equal(after.rowCount, 1, "ledger row phải tồn tại sau khi variant bị xóa");
    assert.equal(after.rows[0].variant_id, null, "FK SET NULL phải kích hoạt — variant_id → NULL");
    assert.equal(
      after.rows[0].variant_name,
      "PG 2G Variant",
      "snapshot variant_name phải giữ nguyên sau khi variant bị xóa"
    );
    assert.ok(after.rows[0].sku, "snapshot sku phải giữ nguyên sau khi variant bị xóa");
  } finally {
    // Variant có thể đã bị xóa → cleanup theo key + product, không theo variant_id
    await withClient(async (c) => {
      await c.query("DELETE FROM public.inventory_adjustments WHERE idempotency_key = $1", [key]);
      await c.query("DELETE FROM public.product_variants WHERE product_id = $1", [productId]);
      await c.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    }).catch(() => {});
  }
});
