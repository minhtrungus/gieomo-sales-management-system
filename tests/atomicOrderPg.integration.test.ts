import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { computePricing } from "../src/lib/pricing.ts";
import { PRICING_PARITY_CASES } from "./helpers/pricingCases.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PG integration / concurrency (Q5) — CHỈ chạy khi có cả module `pg` và
 * ATOMIC_PG_URL trỏ tới Supabase/PostgreSQL đã apply migrations (001→016).
 *
 * Lưu ý Q5/Q7:
 *   - Repo KHÔNG có driver PG (`pg` không phải dependency) → mặc định SKIP.
 *   - Migration do user tự review + apply qua SQL Editor; file này không
 *     apply migration, không chạy ngoài vòng ROLLBACK trừ phần seed dọn sạch.
 *   - Khi SKIP: tuyệt đối không tuyên bố atomicity/concurrency đã nghiệm thu.
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

function canonicalPayload<T extends Record<string, unknown>>(payload: T): T & {
  scope_key: string;
  request_hash: string;
} {
  const hash = createHash("sha256").update(String(payload.request_hash ?? "pg-test")).digest("hex");
  const keyText = String(payload.idempotency_key ?? "");
  const keyHash = createHash("sha256").update(keyText).digest("hex");
  const idempotencyKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyText)
    ? keyText
    : `${keyHash.slice(0, 8)}-${keyHash.slice(8, 12)}-${keyHash.slice(12, 16)}-${keyHash.slice(16, 20)}-${keyHash.slice(20, 32)}`;
  const recipientName = String(payload.recipient_name ?? payload.receiver_name ?? "PG test");
  const recipientPhone = String(payload.recipient_phone ?? payload.receiver_phone ?? "0900000001");
  return {
    ...payload,
    scope_key: `guest:${createHash("sha256").update("pg-integration-customer").digest("hex")}`,
    idempotency_key: idempotencyKey,
    request_hash: hash,
    buyer_name: String(payload.buyer_name ?? recipientName),
    buyer_phone: String(payload.buyer_phone ?? recipientPhone),
    recipient_name: recipientName,
    recipient_phone: recipientPhone,
  };
}

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

test("PG parity — pricing_preview() === computePricing() trên cùng bảng case", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "pricing_preview"))) {
      t.skip("public.pricing_preview chưa tồn tại — apply migration 016 trước (Q7)");
      return;
    }
    for (const c of PRICING_PARITY_CASES) {
      const p = {
        subtotal: c.params.subtotal,
        base_shipping_fee: c.params.baseShippingFee,
        delivery_type: c.params.deliveryType ?? null,
        free_shipping_threshold:
          c.params.freeShippingThreshold === undefined || c.params.freeShippingThreshold === null
            ? 0
            : Number(c.params.freeShippingThreshold),
        voucher: c.params.voucher ?? null,
      };
      const res = await client.query("SELECT public.pricing_preview($1::jsonb) AS r", [JSON.stringify(p)]);
      const sql = res.rows[0].r as { shipping_fee: number; voucher_discount: number; final_amount: number };
      const ts = computePricing(c.params);
      assert.equal(Number(sql.shipping_fee), ts.shippingFee, `${c.name}: shipping_fee`);
      assert.equal(Number(sql.voucher_discount), ts.voucherDiscount, `${c.name}: voucher_discount`);
      assert.equal(Number(sql.final_amount), ts.finalAmount, `${c.name}: final_amount`);
    }
  });
});

test("PG atomic — create_order_atomic: tạo đơn + trừ stock + ledger completed, tx ROLLBACK sạch", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "create_order_atomic"))) {
      t.skip("public.create_order_atomic chưa tồn tại — apply migration 016 trước (Q7)");
      return;
    }

    const token = `pg-it-${Date.now()}`;
    await client.query("BEGIN");
    try {
      // products KHÔNG có cột stock (schema xác minh) — chỉ variant có stock
      const prodRes = await client.query(
        "INSERT INTO public.products (name, slug, price, status) VALUES ($1, $2, 10000, 'active') RETURNING product_id",
        ["PG integration test", `pg-int-${token}`]
      );
      const productId = prodRes.rows[0].product_id as string;
      const varRes = await client.query(
        "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, 'PG It Variant', 10000, 5) RETURNING variant_id",
        [productId, `SKU-${token}-V`]
      );
      const variantId = varRes.rows[0].variant_id as string;
      const custRes = await client.query(
        "INSERT INTO public.customers (full_name, phone, email) VALUES ('PG Test', $1, null) RETURNING customer_id",
        [`0900${String(Date.now()).slice(-7)}`]
      );
      const customerId = custRes.rows[0].customer_id as string;

      const orderId = "88888888-4444-4444-8444-888888888888";
      const payload = {
        idempotency_key: crypto.randomUUID(),
        request_hash: "pg-integration-hash",
        lease_owner: "pg-it-owner",
        proof_token: `tok-${token}`,
        order_id: orderId,
        order_code: `GM-PG${String(Date.now()).slice(-8)}`,
        customer_id: customerId,
        seller_id: null,
        assigned_shipper_id: null,
        source_type: "landing_page",
        introducer_info: "Trực tiếp (Website)",
        receiver_name: "PG Test",
        receiver_phone: "0900000001",
        delivery_type: "home_delivery",
        shipping_address_snapshot: null,
        customer_note: "pg integration",
        voucher_code: null,
        base_shipping_fee: 25000,
        free_shipping_threshold: 0,
        items: [{ combo_id: null, variant_id: variantId, product_id: null, quantity: 1 }],
      };

      const rpcRes = await client.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
        JSON.stringify(canonicalPayload(payload)),
      ]);
      const out = rpcRes.rows[0].r as { outcome: string; order_id: string; order_code: string; final_amount: number };
      assert.equal(out.outcome, "created");
      assert.match(out.order_id, /^[0-9a-f-]{36}$/i);
      assert.equal(Number(out.final_amount), 10000 + 25000);

      const stockRes = await client.query("SELECT stock FROM public.product_variants WHERE variant_id = $1", [
        variantId,
      ]);
      assert.equal(Number(stockRes.rows[0].stock), 4, "variant stock phải trừ RELATIVE 5 → 4");

      const ledgerRes = await client.query(
        "SELECT status, order_id FROM public.order_idempotency WHERE idempotency_key = $1",
        [payload.idempotency_key]
      );
      assert.equal(ledgerRes.rowCount, 1);
      assert.equal(ledgerRes.rows[0].status, "completed");
      assert.equal(ledgerRes.rows[0].order_id, out.order_id);

      const itemsRes = await client.query("SELECT count(*)::int AS n FROM public.order_items WHERE order_id = $1", [
        out.order_id,
      ]);
      assert.equal(Number(itemsRes.rows[0].n), 1);
    } finally {
      await client.query("ROLLBACK");
    }

    // ROLLBACK phải xóa sạch dấu vết (chứng minh tx thực sự nguyên tử)
    const after = await client.query("SELECT count(*)::int AS n FROM public.orders WHERE order_id = $1", [
      "88888888-4444-4444-8444-888888888888",
    ]);
    assert.equal(Number(after.rows[0].n), 0, "ROLLBACK phải xóa order");
  });
});

test("PG concurrency — 2 kết nối cùng key: đúng 1 created + 1 existing (không 2 đơn)", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const clientA = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  const clientB = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  await clientA.connect();
  await clientB.connect();
  try {
    if (!(await functionExists(clientA, "create_order_atomic"))) {
      t.skip("public.create_order_atomic chưa tồn tại — apply migration 016 trước (Q7)");
      return;
    }

    const token = `pg-conc-${Date.now()}`;
    // Seed COMMITTED (cần chia sẻ thấy được giữa 2 tx), dọn ở cuối.
    // Product KHÔNG có cột stock — dòng product không biến thể không deduct gì.
    const prodRes = await clientA.query(
      "INSERT INTO public.products (name, slug, price, status) VALUES ($1, $2, 20000, 'active') RETURNING product_id",
      ["PG concurrency test", `pg-conc-${token}`]
    );
    const productId = prodRes.rows[0].product_id as string;
    const custRes = await clientA.query(
      "INSERT INTO public.customers (full_name, phone, email) VALUES ('PG Conc', $1, null) RETURNING customer_id",
      [`0911${String(Date.now()).slice(-7)}`]
    );
    const customerId = custRes.rows[0].customer_id as string;
    const key = crypto.randomUUID();

    const mkPayload = (orderId: string, orderCode: string) => ({
      idempotency_key: key,
      request_hash: "pg-conc-hash",
      lease_owner: `owner-${orderCode}`,
      proof_token: `tok-${orderCode}`,
      order_id: orderId,
      order_code: orderCode,
      customer_id: customerId,
      seller_id: null,
      assigned_shipper_id: null,
      source_type: "landing_page",
      introducer_info: "Trực tiếp (Website)",
      receiver_name: "PG Conc",
      receiver_phone: "0911000001",
      delivery_type: "home_delivery",
      shipping_address_snapshot: null,
      customer_note: null,
      voucher_code: null,
      base_shipping_fee: 25000,
      free_shipping_threshold: 0,
      items: [{ combo_id: null, variant_id: null, product_id: productId, quantity: 1 }],
    });

    const run = async (client: any, orderId: string, orderCode: string, commit: boolean) => {
      await client.query("BEGIN");
      try {
        const res = await client.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
          JSON.stringify(canonicalPayload(mkPayload(orderId, orderCode))),
        ]);
        const out = res.rows[0].r as { outcome: string; replayed?: boolean; order_id: string };
        if (commit) {
          await client.query("COMMIT");
        } else {
          await client.query("ROLLBACK");
        }
        return out;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    };

    // ClientA COMMIT để claim visible cho clientB (test idempotency thật);
    // clientB ROLLBACK để không để lại đơn thừa.
    const [a, b] = await Promise.all([
      run(clientA, "aaaaaaa1-4444-4444-8444-888888888888", `GM-C1${String(Date.now()).slice(-7)}`, true),
      run(clientB, "bbbbbbb2-4444-4444-8444-888888888888", `GM-C2${String(Date.now()).slice(-7)}`, false),
    ]);

    assert.equal(a.outcome, "created");
    assert.equal(b.outcome, "created");
    assert.equal(a.order_id, b.order_id, "cùng key chỉ sinh đúng một order");
    assert.deepEqual([Boolean(a.replayed), Boolean(b.replayed)].sort(), [false, true]);

    // Dọn seed (best effort) — clientA đã COMMIT → cần DELETE thủ công.
    await clientA.query("DELETE FROM public.order_items WHERE order_id IN ('aaaaaaa1-4444-4444-8444-888888888888','bbbbbbb2-4444-4444-8444-888888888888')");
    await clientA.query("DELETE FROM public.orders WHERE order_id IN ('aaaaaaa1-4444-4444-8444-888888888888','bbbbbbb2-4444-4444-8444-888888888888')");
    await clientA.query("DELETE FROM public.order_status_history WHERE order_id IN ('aaaaaaa1-4444-4444-8444-888888888888','bbbbbbb2-4444-4444-8444-888888888888')");
    await clientA.query("DELETE FROM public.order_idempotency WHERE idempotency_key = $1", [key]);
    await clientA.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    await clientA.query("DELETE FROM public.customers WHERE customer_id = $1", [customerId]);
  } finally {
    await clientA.end();
    await clientB.end();
  }
});

// ============================================================
// Batch 1B — inventory reconcile: stock = CHỈ product_variants.
// Kịch bản: (1) variant trực tiếp, (2) gộp qty nhiều dòng cùng
// variant, (3) combo → component variant, (5) combo có thành phần
// variant_id NULL → B1B:INVALID_REQUEST (từ chối rõ ràng — không
// tự chọn variant, không bỏ qua im lặng, không deduct gì), (6) đơn
// nhiều combo cùng component + combo 2 rows cùng variant → gộp
// đầy đủ, (7) variant hết hàng → RAISE + rollback (không oversell),
// (8) product không biến thể → order tạo được, không đụng tồn kho.
// ============================================================
test("PG P0-1 — variant-only stock: deduct/gộp qty/combo, combo chưa map variant → reject, hết hàng → rollback", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "create_order_atomic"))) {
      t.skip("public.create_order_atomic chưa tồn tại — apply migration 016 trước (Q7)");
      return;
    }

    // Kịch bản chạy trong MỘT tx → SAVEPOINT/ROLLBACK TO SAVEPOINT thật,
    // ROLLBACK cuối dọn sạch seed (không rò dữ liệu test vào DB).
    await client.query("BEGIN");

    const token = `pg-p01-${Date.now()}`;
    const uid = () => crypto.randomUUID();

    const mkProduct = async (name: string) => {
      const r = await client.query(
        "INSERT INTO public.products (name, slug, price, status) VALUES ($1, $2, 10000, 'active') RETURNING product_id",
        [`PG P01 ${name}`, `${token}-${name.toLowerCase()}`]
      );
      return r.rows[0].product_id as string;
    };
    const mkVariant = async (pid: string, label: string, stock: number) => {
      const r = await client.query(
        "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, $3, 30000, $4) RETURNING variant_id",
        [pid, `SKU-${token}-${label}`, `PG P01 ${label}`, stock]
      );
      return r.rows[0].variant_id as string;
    };

    const pBase = await mkProduct("BASE"); // product không biến thể
    const pVar = await mkProduct("PVAR"); // parent của variants
    const vA = await mkVariant(pVar, "VA", 10);
    const vB = await mkVariant(pVar, "VB", 8);

    // C1 = component vA×1 + vB×2
    const c1 = (
      await client.query(
        "INSERT INTO public.combos (name, slug, price, status) VALUES ('PG P01 Combo 1', $1, 50000, 'active') RETURNING combo_id",
        [`${token}-combo1`]
      )
    ).rows[0].combo_id as string;
    await client.query(
      "INSERT INTO public.combo_items (combo_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, 1), ($1, $2, $4, 2)",
      [c1, pVar, vA, vB]
    );
    // C2 = component vA×1 + component CHỈ product_id (variant_id NULL —
    // chưa map variant như 22 combo Production) → đơn chứa C2 phải bị TỪ CHỐI
    const c2 = (
      await client.query(
        "INSERT INTO public.combos (name, slug, price, status) VALUES ('PG P01 Combo 2', $1, 30000, 'active') RETURNING combo_id",
        [`${token}-combo2`]
      )
    ).rows[0].combo_id as string;
    await client.query(
      "INSERT INTO public.combo_items (combo_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, 1), ($1, $4, NULL, 1)",
      [c2, pVar, vA, pBase]
    );
    // C3 = 2 rows cùng variant vA (mỗi row ×1) → phải GỘP thành 2
    const c3 = (
      await client.query(
        "INSERT INTO public.combos (name, slug, price, status) VALUES ('PG P01 Combo 3', $1, 20000, 'active') RETURNING combo_id",
        [`${token}-combo3`]
      )
    ).rows[0].combo_id as string;
    await client.query(
      "INSERT INTO public.combo_items (combo_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, 1), ($1, $2, $3, 1)",
      [c3, pVar, vA]
    );

    const customerId = (
      await client.query(
        "INSERT INTO public.customers (full_name, phone) VALUES ('PG P01', $1) RETURNING customer_id",
        [`0922${String(Date.now()).slice(-7)}`]
      )
    ).rows[0].customer_id as string;

    let n = 0;
    const runRpc = async (items: Array<Record<string, unknown>>) => {
      n += 1;
      const payload = {
        idempotency_key: uid(),
        request_hash: `p01-${n}`,
        lease_owner: `p01-owner-${n}`,
        proof_token: `p01-tok-${n}`,
        order_id: uid(),
        order_code: `GM-P01${String(Date.now()).slice(-5)}${n}`,
        customer_id: customerId,
        seller_id: null,
        assigned_shipper_id: null,
        source_type: "landing_page",
        introducer_info: "Trực tiếp (Website)",
        receiver_name: "PG P01",
        receiver_phone: "0922000001",
        delivery_type: "home_delivery",
        shipping_address_snapshot: null,
        customer_note: "pg p01",
        voucher_code: null,
        base_shipping_fee: 25000,
        free_shipping_threshold: 0,
        items,
      };
      const res = await client.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
        JSON.stringify(canonicalPayload(payload)),
      ]);
      return res.rows[0].r as { outcome: string; order_id: string };
    };

    const vStock = async (id: string) => {
      const r = await client.query("SELECT stock FROM public.product_variants WHERE variant_id = $1", [id]);
      return Number(r.rows[0].stock);
    };
    const orderCount = async () => {
      const r = await client.query("SELECT count(*)::int AS n FROM public.orders WHERE receiver_phone = '0922000001'");
      return Number(r.rows[0].n);
    };

    // (8) product không biến thể → order tạo được, không deduct gì
    let out = await runRpc([{ product_id: pBase, quantity: 1 }]);
    assert.equal(out.outcome, "created", "(8) product-only line phải tạo được đơn");
    const pItems = await client.query("SELECT count(*)::int AS n FROM public.order_items WHERE order_id = $1", [
      out.order_id,
    ]);
    assert.equal(Number(pItems.rows[0].n), 1, "(8) order_items vẫn có1 dòng snapshot");

    // (1) variant trực tiếp: 10 → 8
    out = await runRpc([{ variant_id: vA, quantity: 2 }]);
    assert.equal(out.outcome, "created");
    assert.equal(await vStock(vA), 8, "(1) variant trực tiếp 10 → 8");

    // (2) gộp qty 2 dòng cùng variant: 8 → 6
    out = await runRpc([
      { variant_id: vA, quantity: 1 },
      { variant_id: vA, quantity: 1 },
    ]);
    assert.equal(out.outcome, "created");
    assert.equal(await vStock(vA), 6, "(2) gộp 2 dòng cùng variant: 8 → 6");

    // (3) combo C1: vA×1 + vB×2 → vA 6→5, vB 8→6
    out = await runRpc([{ combo_id: c1, quantity: 1 }]);
    assert.equal(out.outcome, "created");
    assert.equal(await vStock(vA), 5, "(3) C1 component vA: 6 → 5");
    assert.equal(await vStock(vB), 6, "(3) C1 component vB×2: 8 → 6");

    // C1 ×2 → vA 5→3, vB 6→2
    out = await runRpc([{ combo_id: c1, quantity: 2 }]);
    assert.equal(out.outcome, "created");
    assert.equal(await vStock(vA), 3, "C1×2: vA 5 → 3");
    assert.equal(await vStock(vB), 2, "C1×2: vB 6 → 2");

    // (5) C2 có thành phần variant_id NULL (pBase chưa map variant) →
    // phải TỪ CHỐI B1B:INVALID_REQUEST — không tự chọn variant, không
    // bỏ qua thành phần, không deduct gì, không tạo đơn, claim rollback.
    await client.query("SAVEPOINT p01_combo_unmapped");
    let caught: any = null;
    try {
      await runRpc([{ combo_id: c2, quantity: 1 }]);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "(5) combo có thành phần chưa gán variant phải RAISE");
    assert.match(String(caught.message), /D3:COMBO_COMPONENTS_UNMAPPED/);
    await client.query("ROLLBACK TO SAVEPOINT p01_combo_unmapped");
    assert.equal(await vStock(vA), 3, "(5) C2 bị từ chối — vA giữ nguyên 3");
    assert.equal(await vStock(vB), 2, "(5) C2 bị từ chối — vB giữ nguyên 2");
    assert.equal(await orderCount(), 5, "(5) không có đơn nào được tạo từ C2");
    assert.equal(
      Number((await client.query("SELECT count(*) n FROM public.order_idempotency WHERE status = 'in_progress'")).rows[0].n),
      0,
      "(5) claim idempotency của đơn bị từ chối phải rollback"
    );

    // (6) Đơn [C1 + C3] — cả 2 chứa vA → gộp component; C3 có 2 rows
    // cùng vA ×1 → gộp thêm 2: vA 3 → 0 (1+2), vB 2 → 0 (C1 component)
    out = await runRpc([
      { combo_id: c1, quantity: 1 },
      { combo_id: c3, quantity: 1 },
    ]);
    assert.equal(out.outcome, "created");
    assert.equal(await vStock(vA), 0, "(6) C1+C3: vA 3 → 0 (gộp 1 từ C1 + 2 từ C3)");
    assert.equal(await vStock(vB), 0, "(6) C1+C3: vB 2 → 0 (C1 component vB×2)");
    assert.equal(await orderCount(), 6, "(6) đúng 1 đơn mới được tạo");

    // (7) vA hết hàng → RAISE + rollback toàn tx (không oversell)
    await client.query("SAVEPOINT p01_stockout");
    caught = null;
    try {
      await runRpc([{ variant_id: vA, quantity: 1 }]);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "(7) variant hết hàng phải RAISE");
    assert.match(String(caught.message), /D3:STOCK_INSUFFICIENT/);
    await client.query("ROLLBACK TO SAVEPOINT p01_stockout");
    assert.equal(await vStock(vA), 0, "(7) stock không bị trừ khi RAISE");
    assert.equal(await orderCount(), 6, "(7) không có đơn nào được tạo khi RAISE");

    await client.query("ROLLBACK");

    // ROLLBACK phải xóa cả seed (chứng minh tx thực sự nguyên tử —
    // savepoint/rollback trong test không phải no-op ngoài transaction)
    const seeds = await client.query("SELECT count(*)::int AS n FROM public.products WHERE slug LIKE $1", [
      `${token}-%`,
    ]);
    assert.equal(Number(seeds.rows[0].n), 0, "ROLLBACK phải xóa seed product của test");
  });
});

// ============================================================
// Batch 1B fix — P0-2: variant_id validation
// ============================================================
test("PG P0-2 — variant_id: UUID thường/hoa tạo đơn; UUID thiếu & chuỗi sai → B1B:INVALID_REQUEST", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "create_order_atomic"))) {
      t.skip("public.create_order_atomic chưa tồn tại — apply migration 016 trước (Q7)");
      return;
    }

    const token = `pg-p02-${Date.now()}`;
    const uid = () => crypto.randomUUID();

    const pid = (
      await client.query(
        "INSERT INTO public.products (name, slug, price, status) VALUES ('PG P02', $1, 10000, 'active') RETURNING product_id",
        [`${token}-p`]
      )
    ).rows[0].product_id as string;
    const vx = (
      await client.query(
        "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, 'P02 Variant', 30000, 5) RETURNING variant_id",
        [pid, `SKU-${token}-V`]
      )
    ).rows[0].variant_id as string;
    const customerId = (
      await client.query(
        "INSERT INTO public.customers (full_name, phone) VALUES ('PG P02', $1) RETURNING customer_id",
        [`0933${String(Date.now()).slice(-7)}`]
      )
    ).rows[0].customer_id as string;

    let n = 0;
    const mkPayload = (variantRef: string) => {
      n += 1;
      return {
        idempotency_key: uid(),
        request_hash: `p02-${n}`,
        lease_owner: `p02-owner-${n}`,
        proof_token: `p02-tok-${n}`,
        order_id: uid(),
        order_code: `GM-P02${String(Date.now()).slice(-5)}${n}`,
        customer_id: customerId,
        seller_id: null,
        assigned_shipper_id: null,
        source_type: "landing_page",
        introducer_info: "Trực tiếp (Website)",
        receiver_name: "PG P02",
        receiver_phone: "0933000001",
        delivery_type: "home_delivery",
        shipping_address_snapshot: null,
        customer_note: null,
        voucher_code: null,
        base_shipping_fee: 25000,
        free_shipping_threshold: 0,
        items: [{ combo_id: null, variant_id: variantRef, product_id: null, quantity: 1 }],
      };
    };

    const runRpc = async (variantRef: string) => {
      const res = await client.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
        JSON.stringify(canonicalPayload(mkPayload(variantRef))),
      ]);
      return res.rows[0].r as { outcome: string; order_id: string };
    };

    // 1) UUID hợp lệ + tồn tại → created, order_items.variant_id đúng
    let out = await runRpc(vx);
    assert.equal(out.outcome, "created", "UUID thường phải khớp");
    const itemRes = await client.query(
      "SELECT variant_id FROM public.order_items WHERE order_id = $1",
      [out.order_id]
    );
    assert.equal(String(itemRes.rows[0].variant_id), vx, "order_items.variant_id phải là uuid đã resolve");

    // 2) UUID HOA (cùng bản ghi) → legacy eq() cast uuid không phân biệt hoa/thường;
    //    P0-2: KHÔNG được từ chối UUID hợp lệ.
    out = await runRpc(vx.toUpperCase());
    assert.equal(out.outcome, "created", "UUID HOA hợp lệ phải khớp (case-insensitive)");

    // Mở tx để SAVEPOINT hợp lệ (withClient không tự BEGIN)
    await client.query("BEGIN");

    // 3) UUID hợp lệ nhưng KHÔNG tồn tại → B1B:INVALID_REQUEST (savepoint)
    await client.query("SAVEPOINT p02_missing");
    let caught: any = null;
    try {
      await runRpc(uid());
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "UUID không tồn tại phải RAISE");
    assert.equal(caught.code, "P0001", `mong đợi P0001, got ${caught.code}: ${caught.message}`);
    assert.match(String(caught.message), /D3:INVALID_VARIANT/);
    await client.query("ROLLBACK TO SAVEPOINT p02_missing");

    // 4) Chuỗi KHÔNG phải UUID → không ép kiểu (không crash invalid input
    //    syntax), xử lý theo hợp đồng: cùng lỗi nghiệp vụ B1B:INVALID_REQUEST
    await client.query("SAVEPOINT p02_malformed");
    caught = null;
    try {
      await runRpc("khong-phai-uuid");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "chuỗi sai định dạng phải RAISE theo hợp đồng");
    assert.equal(caught.code, "P0001", `mong đợi P0001, got ${caught.code}: ${caught.message}`);
    assert.match(String(caught.message), /D3:INVALID_VARIANT/);
    assert.doesNotMatch(
      String(caught.message || ""),
      /invalid input syntax for type uuid/,
      "tuyệt đối không ép kiểu chuỗi sai sang uuid"
    );
    await client.query("ROLLBACK TO SAVEPOINT p02_malformed");

    await client.query("ROLLBACK");
  });
});

// ============================================================
// Batch 1B — checklist PG readiness: 2 kết nối tranh stock cuối
// (A giữ lock → B bị chặn → A commit → B phải fail, không oversell).
// Lặp chậm/trễ cũng ra cùng kết quả (A commit trước → B thấy stock=0).
// ============================================================
test("PG race stock — 2 kết nối tranh stock cuối cùng (stock=1): không oversell", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const clientA = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  const clientB = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  await clientA.connect();
  await clientB.connect();
  try {
    if (!(await functionExists(clientA, "create_order_atomic"))) {
      t.skip("public.create_order_atomic chưa tồn tại — apply migration 016 trước (Q7)");
      return;
    }

    const token = `pg-rs-${Date.now()}`;
    const uid = () => crypto.randomUUID();
    const keyA = uid();
    const keyB = uid();

    // Stock cuối tranh chấp = VARIANT stock (products không có cột stock)
    const prodRes = await clientA.query(
      "INSERT INTO public.products (name, slug, price, status) VALUES ('PG race stock', $1, 10000, 'active') RETURNING product_id",
      [`pg-rs-${token}`]
    );
    const productId = prodRes.rows[0].product_id as string;
    const varRes = await clientA.query(
      "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, 'PG RS Variant', 10000, 1) RETURNING variant_id",
      [productId, `SKU-${token}-V`]
    );
    const variantId = varRes.rows[0].variant_id as string;
    const phone = `0944${String(Date.now()).slice(-7)}`;
    const custRes = await clientA.query(
      "INSERT INTO public.customers (full_name, phone) VALUES ('PG RS', $1) RETURNING customer_id",
      [phone]
    );
    const customerId = custRes.rows[0].customer_id as string;

    const mkPayload = (key: string, orderId: string, orderCode: string, owner: string) => ({
      idempotency_key: key,
      request_hash: `rs-${key}`,
      lease_owner: owner,
      proof_token: `rs-tok-${key}`,
      order_id: orderId,
      order_code: orderCode,
      customer_id: customerId,
      seller_id: null,
      assigned_shipper_id: null,
      source_type: "landing_page",
      introducer_info: "Trực tiếp (Website)",
      receiver_name: "PG RS",
      receiver_phone: phone,
      delivery_type: "home_delivery",
      shipping_address_snapshot: null,
      customer_note: null,
      voucher_code: null,
      base_shipping_fee: 25000,
      free_shipping_threshold: 0,
      items: [{ combo_id: null, variant_id: variantId, product_id: null, quantity: 1 }],
    });

    // A: chạy RPC trong tx CHƯA commit → giữ row lock (stock 1→0 pending)
    await clientA.query("BEGIN");
    const aRes = await clientA.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
      JSON.stringify(canonicalPayload(mkPayload(keyA, uid(), `GM-RS1${String(Date.now()).slice(-6)}`, "rs-owner-a"))),
    ]);
    assert.equal((aRes.rows[0].r as { outcome: string }).outcome, "created", "A phải created trong tx của A");

    // B: cùng product, key khác — bị chặn tại FOR UPDATE cho tới khi A commit
    const bPromise = (async () => {
      await clientB.query("BEGIN");
      try {
        await clientB.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
          JSON.stringify(canonicalPayload(mkPayload(keyB, uid(), `GM-RS2${String(Date.now()).slice(-6)}`, "rs-owner-b"))),
        ]);
        return { ok: true as const };
      } catch (err: any) {
        return { ok: false as const, code: err.code, detail: err.detail, message: err.message };
      } finally {
        try {
          await clientB.query("ROLLBACK");
        } catch {
          /* B có thể đã abort sẵn */
        }
      }
    })();

    await new Promise((r) => setTimeout(r, 700));
    await clientA.query("COMMIT");
    const bRes = await bPromise;

    assert.equal(bRes.ok, false, "B KHÔNG được tạo đơn thứ 2 khi stock cuối đã bị A chiếm");
    assert.match(String((bRes as any).message), /D3:STOCK_INSUFFICIENT/);

    const stockRes = await clientA.query("SELECT stock FROM public.product_variants WHERE variant_id = $1", [
      variantId,
    ]);
    assert.equal(Number(stockRes.rows[0].stock), 0, "variant stock cuối = 0 — không oversell");
    const orderCount = await clientA.query("SELECT count(*)::int AS n FROM public.orders WHERE customer_id = $1", [
      customerId,
    ]);
    assert.equal(Number(orderCount.rows[0].n), 1, "chỉ 1 đơn được commit");

    await clientA.query("DELETE FROM public.order_idempotency WHERE idempotency_key = ANY($1)", [[keyA, keyB]]);
    await clientA.query(
      "DELETE FROM public.order_inventory_reservations WHERE order_id IN (SELECT order_id FROM public.orders WHERE customer_id = $1)",
      [customerId]
    );
    await clientA.query("DELETE FROM public.orders WHERE customer_id = $1", [customerId]);
    await clientA.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    await clientA.query("DELETE FROM public.customers WHERE customer_id = $1", [customerId]);
  } finally {
    await clientA.end();
    await clientB.end();
  }
});

// ============================================================
// Batch 1B — checklist PG readiness: 2 kết nối tranh lượt voucher
// cuối (usage_limit=1): B phải fail VOUCHER_UNAVAILABLE, times_used
// sau đó đúng 1 (không 2).
// ============================================================
test("PG race voucher — 2 kết nối tranh lượt cuối (limit=1): không vượt quota", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const clientA = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  const clientB = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  await clientA.connect();
  await clientB.connect();
  try {
    if (!(await functionExists(clientA, "create_order_atomic"))) {
      t.skip("public.create_order_atomic chưa tồn tại — apply migration 016 trước (Q7)");
      return;
    }

    const token = `pg-rv-${Date.now()}`;
    const uid = () => crypto.randomUUID();
    const keyA = uid();
    const keyB = uid();
    const vCode = `VCH-RV-${token}`.toUpperCase();

    // Product-only line (products không có cột stock) — voucher race không cần tồn kho
    const prodRes = await clientA.query(
      "INSERT INTO public.products (name, slug, price, status) VALUES ('PG race voucher', $1, 10000, 'active') RETURNING product_id",
      [`pg-rv-${token}`]
    );
    const productId = prodRes.rows[0].product_id as string;
    const vRes = await clientA.query(
      "INSERT INTO public.vouchers (code, discount_type, discount_value, min_order_value, usage_limit, times_used, status) VALUES ($1, 'percentage', 10, 0, 1, 0, 'active') RETURNING voucher_id",
      [vCode]
    );
    const voucherId = vRes.rows[0].voucher_id as string;
    const phone = `0955${String(Date.now()).slice(-7)}`;
    const custRes = await clientA.query(
      "INSERT INTO public.customers (full_name, phone) VALUES ('PG RV', $1) RETURNING customer_id",
      [phone]
    );
    const customerId = custRes.rows[0].customer_id as string;

    const mkPayload = (key: string, orderId: string, orderCode: string, owner: string) => ({
      idempotency_key: key,
      request_hash: `rv-${key}`,
      lease_owner: owner,
      proof_token: `rv-tok-${key}`,
      order_id: orderId,
      order_code: orderCode,
      customer_id: customerId,
      seller_id: null,
      assigned_shipper_id: null,
      source_type: "landing_page",
      introducer_info: "Trực tiếp (Website)",
      receiver_name: "PG RV",
      receiver_phone: phone,
      delivery_type: "home_delivery",
      shipping_address_snapshot: null,
      customer_note: null,
      voucher_code: vCode,
      base_shipping_fee: 25000,
      free_shipping_threshold: 0,
      items: [{ combo_id: null, variant_id: null, product_id: productId, quantity: 1 }],
    });

    // A: giữ lock product + voucher trong tx chưa commit (reserve times_used 0→1 pending)
    await clientA.query("BEGIN");
    const aRes = await clientA.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
      JSON.stringify(canonicalPayload(mkPayload(keyA, uid(), `GM-RV1${String(Date.now()).slice(-6)}`, "rv-owner-a"))),
    ]);
    const aOut = aRes.rows[0].r as { outcome: string; final_amount: number };
    assert.equal(aOut.outcome, "created");
    assert.equal(Number(aOut.final_amount), 10000 - 1000 + 25000, "A: 10% của 10000 = 1000 discount");

    // B: cùng voucher, key khác — sau khi A commit phải thấy hết lượt
    const bPromise = (async () => {
      await clientB.query("BEGIN");
      try {
        await clientB.query("SELECT public.create_order_atomic($1::jsonb) AS r", [
          JSON.stringify(canonicalPayload(mkPayload(keyB, uid(), `GM-RV2${String(Date.now()).slice(-6)}`, "rv-owner-b"))),
        ]);
        return { ok: true as const };
      } catch (err: any) {
        return { ok: false as const, code: err.code, detail: err.detail, message: err.message };
      } finally {
        try {
          await clientB.query("ROLLBACK");
        } catch {
          /* B có thể đã abort sẵn */
        }
      }
    })();

    await new Promise((r) => setTimeout(r, 700));
    await clientA.query("COMMIT");
    const bRes = await bPromise;

    assert.equal(bRes.ok, false, "B KHÔNG được dùng vượt quota voucher (limit=1)");
    assert.match(String((bRes as any).message), /D3:VOUCHER_UNAVAILABLE/);

    const timesRes = await clientA.query("SELECT times_used::int AS n FROM public.vouchers WHERE voucher_id = $1", [
      voucherId,
    ]);
    assert.equal(Number(timesRes.rows[0].n), 1, "times_used sau tranh chấp = đúng 1 (không 2)");
    const orderCount = await clientA.query("SELECT count(*)::int AS n FROM public.orders WHERE customer_id = $1", [
      customerId,
    ]);
    assert.equal(Number(orderCount.rows[0].n), 1, "chỉ đơn của A được commit");
    const aOrder = await clientA.query(
      "SELECT voucher_discount::numeric AS d FROM public.orders WHERE customer_id = $1",
      [customerId]
    );
    assert.equal(Number(aOrder.rows[0].d), 1000, "đơn A giữ voucher_discount = 1000");

    await clientA.query("DELETE FROM public.order_idempotency WHERE idempotency_key = ANY($1)", [[keyA, keyB]]);
    await clientA.query("DELETE FROM public.orders WHERE customer_id = $1", [customerId]);
    await clientA.query("DELETE FROM public.products WHERE product_id = $1", [productId]);
    await clientA.query("DELETE FROM public.vouchers WHERE voucher_id = $1", [voucherId]);
    await clientA.query("DELETE FROM public.customers WHERE customer_id = $1", [customerId]);
  } finally {
    await clientA.end();
    await clientB.end();
  }
});
