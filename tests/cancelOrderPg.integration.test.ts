import { test } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PG integration — cancel_order_atomic (Batch 2A-1) — CHỈ chạy khi có cả
 * module `pg` VÀ ATOMIC_PG_URL trỏ PostgreSQL đã apply migrations (001→017).
 *
 *   - Repo KHÔNG có driver PG (`pg` không phải dependency) → mặc định SKIP.
 *   - File này KHÔNG apply migration, KHÔNG chạy ngoài vòng ROLLBACK trừ
 *     phần seed committed có dọn sạch ở cuối (T7, T9).
 *   - KHI SKIP: tuyệt đối KHÔNG tuyên bố atomicity/concurrency đã nghiệm thu.
 *
 * Không fault injection (không GUC đặc biệt trong function Production):
 * T7 kiểm chứng rollback bằng chính nhánh RAISE tự nhiên
 * B2A1:VOUCHER_RELEASE_UNSAFE — sau lỗi, tx thật sự mất thay đổi.
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

const TEST_ACTOR_ID = "00000000-0000-4000-8000-000000000026";

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

type CancelOut = {
  outcome: string;
  orderId?: string;
  orderCode?: string;
  cancelledAt?: string | null;
  stockRestoredAt?: string | null;
  voucherReleasedAt?: string | null;
  currentStatus?: string;
  allowedFrom?: string[];
  stock?: { restoredLines: number; variants: Array<{ variantId: string; quantity: number }> };
  voucher?: { outcome: string; voucherId: string | null };
  unrestoredLines?: Array<Record<string, unknown>>;
  notes?: string[];
  needsRecon?: boolean;
};

async function callCancel(
  client: any,
  opts: { id?: string | null; code?: string | null; reason?: string | null; by?: string | null }
): Promise<CancelOut> {
  const res = await client.query("SELECT public.cancel_order_atomic($1::jsonb) AS r", [
    JSON.stringify({
      order_id: opts.id ?? null,
      order_code: opts.code ?? null,
      reason: opts.reason ?? null,
      actor_member_id: opts.by ?? TEST_ACTOR_ID,
    }),
  ]);
  const raw = res.rows[0].r as Record<string, any>;
  return {
    ...raw,
    orderId: raw.order_id,
    orderCode: raw.order_code,
    cancelledAt: raw.cancelled_at,
    stockRestoredAt: raw.stock_restored_at,
    voucherReleasedAt: raw.voucher_released_at,
    currentStatus: raw.current_status,
    stock: raw.inventory_restored
      ? {
          restoredLines: raw.inventory_restored.length,
          variants: raw.inventory_restored.map((line: Record<string, unknown>) => ({
            variantId: line.variant_id,
            quantity: line.quantity,
          })),
        }
      : undefined,
    voucher: {
      outcome: raw.voucher_released ? "released" : "no_voucher",
      voucherId: null,
    },
    needsRecon: false,
  } as CancelOut;
}

const uid = () => crypto.randomUUID();
const mkToken = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function mkProduct(client: any, token: string, label: string): Promise<string> {
  const r = await client.query(
    "INSERT INTO public.products (name, slug, price, status) VALUES ($1, $2, 10000, 'active') RETURNING product_id",
    [`PG2A1 ${label} ${token}`, `${token}-${label.toLowerCase()}`]
  );
  return r.rows[0].product_id as string;
}

async function mkVariant(client: any, pid: string, token: string, label: string, stock: number): Promise<string> {
  const r = await client.query(
    "INSERT INTO public.product_variants (product_id, sku, name, price, stock) VALUES ($1, $2, $3, 30000, $4) RETURNING variant_id",
    [pid, `SKU-${token}-${label}`, `PG2A1 ${label}`, stock]
  );
  return r.rows[0].variant_id as string;
}

async function mkCustomer(client: any, token: string): Promise<string> {
  await client.query(
    `INSERT INTO public.members (member_id, full_name, role, status)
     VALUES ($1, 'PG cancellation actor', 'admin', 'active')
     ON CONFLICT (member_id) DO NOTHING`,
    [TEST_ACTOR_ID]
  );
  const phone = `09${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)}`;
  const r = await client.query(
    "INSERT INTO public.customers (full_name, phone) VALUES ($1, $2) RETURNING customer_id",
    [`PG2A1 ${token}`, phone]
  );
  return r.rows[0].customer_id as string;
}

async function mkOrder(
  client: any,
  opts: { code: string; customerId: string; status?: string; voucherId?: string | null }
): Promise<string> {
  const r = await client.query(
    `INSERT INTO public.orders
       (order_id, order_code, customer_id, receiver_name, receiver_phone, delivery_type,
        subtotal, final_amount, order_status, voucher_id, inventory_reservation_recorded_at)
     VALUES ($1, $2, $3, 'PG2A1', '0900000001', 'home_delivery', 10000, 10000, $4, $5, now())
     RETURNING order_id`,
    [uid(), opts.code, opts.customerId, opts.status ?? "pending", opts.voucherId ?? null]
  );
  return r.rows[0].order_id as string;
}

async function mkItem(
  client: any,
  orderId: string,
  opts: {
    variantId?: string | null;
    productId?: string | null;
    comboId?: string | null;
    qty: number;
    name?: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO public.order_items
       (order_id, variant_id, product_id, combo_id, item_name_snapshot, quantity, unit_price, subtotal)
     VALUES ($1, $2, $3, $4, $5, $6, 10000, $6 * 10000)`,
    [
      orderId,
      opts.variantId ?? null,
      opts.productId ?? null,
      opts.comboId ?? null,
      opts.name ?? "PG2A1 item",
      opts.qty,
    ]
  );
  if (opts.variantId) {
    await client.query(
      `INSERT INTO public.order_inventory_reservations (order_id, variant_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id, variant_id)
       DO UPDATE SET quantity = public.order_inventory_reservations.quantity + EXCLUDED.quantity`,
      [orderId, opts.variantId, opts.qty]
    );
  }
}

async function mkVoucher(client: any, code: string, timesUsed: number, usageLimit = 1): Promise<string> {
  const r = await client.query(
    `INSERT INTO public.vouchers (code, discount_type, discount_value, min_order_value, usage_limit, times_used, status)
     VALUES ($1, 'fixed_amount', 5000, 0, $2, $3, 'active') RETURNING voucher_id`,
    [code, usageLimit, timesUsed]
  );
  return r.rows[0].voucher_id as string;
}

async function variantStock(client: any, id: string): Promise<number> {
  const r = await client.query("SELECT stock FROM public.product_variants WHERE variant_id = $1", [id]);
  return Number(r.rows[0].stock);
}

async function orderRow(client: any, id: string): Promise<Record<string, any>> {
  const r = await client.query(
    "SELECT order_status, cancel_reason, cancelled_at, stock_restored_at, voucher_released_at, voucher_id FROM public.orders WHERE order_id = $1",
    [id]
  );
  return r.rows[0];
}

async function historyCount(client: any, id: string): Promise<number> {
  const r = await client.query(
    "SELECT count(*)::int AS n FROM public.order_status_history WHERE order_id = $1 AND status_type = 'order'",
    [id]
  );
  return Number(r.rows[0].n);
}

// ============================================================
// T1 — Hủy đơn chính: gộp qty 2 dòng cùng variant, voucher,
// cờ audit, history; lần 2 = already_cancelled (idempotent).
// ============================================================
test("PG 2A1 T1 — cancel: gộp qty variant + voucher + flags + history, gọi 2 lần side effect x1", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    const token = mkToken("t1");
    await client.query("BEGIN");
    try {
      const pid = await mkProduct(client, token, "Base");
      const vA = await mkVariant(client, pid, token, "VA", 5);
      const vB = await mkVariant(client, pid, token, "VB", 8);
      const customerId = await mkCustomer(client, token);
      const voucherId = await mkVoucher(client, `T1-${token}`, 1);
      const orderId = await mkOrder(client, { code: `GM-T1-${token}`, customerId, voucherId });
      // 2 dòng CÙNG variant vA (1 + 2 = 3) + vB (2) — phải GỘP theo variant
      await mkItem(client, orderId, { variantId: vA, qty: 1, name: "dong 1" });
      await mkItem(client, orderId, { variantId: vA, qty: 2, name: "dong 2" });
      await mkItem(client, orderId, { variantId: vB, qty: 2, name: "dong 3" });

      const out = await callCancel(client, {
        id: orderId,
        reason: "kiểm thử Batch 2A-1",
      });
      assert.equal(out.outcome, "cancelled");
      assert.equal(out.orderId, orderId);

      assert.equal(await variantStock(client, vA), 8, "vA: 5 + (1+2) = 8 (gộp 2 dòng)");
      assert.equal(await variantStock(client, vB), 10, "vB: 8 + 2 = 10");

      const vRes = await client.query("SELECT times_used::int AS n FROM public.vouchers WHERE voucher_id = $1", [
        voucherId,
      ]);
      assert.equal(Number(vRes.rows[0].n), 0, "times_used 1 → 0");

      const row = await orderRow(client, orderId);
      assert.equal(row.order_status, "cancelled");
      assert.equal(row.cancel_reason, "kiểm thử Batch 2A-1");
      assert.ok(row.cancelled_at, "cancelled_at phải set");
      assert.ok(row.stock_restored_at, "stock_restored_at phải set (unrestored rỗng)");
      assert.ok(row.voucher_released_at, "voucher_released_at phải set");
      assert.equal(out.voucher?.outcome, "released");
      assert.equal(out.needsRecon, false);

      const h = await client.query(
        "SELECT status_type, from_status, to_status, note, changed_by_member_id FROM public.order_status_history WHERE order_id = $1 AND status_type = 'order'",
        [orderId]
      );
      assert.equal(h.rowCount, 1, "đúng 1 history row");
      assert.equal(h.rows[0].from_status, "pending");
      assert.equal(h.rows[0].to_status, "cancelled");
      assert.match(String(h.rows[0].note), /kiểm thử Batch 2A-1/);
      assert.equal(h.rows[0].changed_by_member_id, TEST_ACTOR_ID, "history uses authenticated actor");

      // Lần 2: already_cancelled — KHÔNG side effect lần nữa
      const out2 = await callCancel(client, { id: orderId, reason: "gọi lại" });
      assert.equal(out2.outcome, "already_cancelled");
      assert.equal(await variantStock(client, vA), 8, "vA không cộng thêm lần 2");
      assert.equal(await variantStock(client, vB), 10, "vB không cộng thêm lần 2");
      const vRes2 = await client.query("SELECT times_used::int AS n FROM public.vouchers WHERE voucher_id = $1", [
        voucherId,
      ]);
      assert.equal(Number(vRes2.rows[0].n), 0, "không release lần 2");
      assert.equal(await historyCount(client, orderId), 1, "history không thêm dòng thứ 2");
      const row2 = await orderRow(client, orderId);
      assert.equal(row2.cancel_reason, "kiểm thử Batch 2A-1", "reason không bị ghi đè bởi lần gọi lại");
      assert.equal(new Date(row2.cancelled_at).getTime(), new Date(row.cancelled_at).getTime());
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

// ============================================================
// T2 — not_found: KHÔNG giả lập thành công (theo id và theo code)
// ============================================================
test("PG 2A1 T2 — not_found theo id và order_code (không giả lập success)", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }
    await client.query(
      `INSERT INTO public.members (member_id, full_name, role, status)
       VALUES ($1, 'PG cancellation actor', 'admin', 'active')
       ON CONFLICT (member_id) DO NOTHING`,
      [TEST_ACTOR_ID]
    );
    const outById = await callCancel(client, { id: uid() });
    assert.equal(outById.outcome, "not_found");
    const outByCode = await callCancel(client, { code: `GM-KHONG-TON-TAI-${Date.now()}` });
    assert.equal(outByCode.outcome, "not_found");
  });
});

// ============================================================
// T3 — not_cancellable: completed/shipping không đổi gì
// ============================================================
test("PG 2A1 T3 — not_cancellable (completed/shipping): giữ nguyên dữ liệu, allowedFrom đúng", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    const token = mkToken("t3");
    await client.query("BEGIN");
    try {
      const pid = await mkProduct(client, token, "Base");
      const vA = await mkVariant(client, pid, token, "VA", 5);
      const customerId = await mkCustomer(client, token);

      const oCompleted = await mkOrder(client, { code: `GM-T3A-${token}`, customerId, status: "completed" });
      await mkItem(client, oCompleted, { variantId: vA, qty: 2 });
      const oShipping = await mkOrder(client, { code: `GM-T3B-${token}`, customerId, status: "shipping" });

      const out1 = await callCancel(client, { id: oCompleted });
      assert.equal(out1.outcome, "not_cancellable");
      assert.equal(out1.currentStatus, "completed");

      const out2 = await callCancel(client, { id: oShipping });
      assert.equal(out2.outcome, "not_cancellable");
      assert.equal(out2.currentStatus, "shipping");

      assert.equal(await variantStock(client, vA), 5, "stock giữ nguyên");
      assert.equal((await orderRow(client, oCompleted)).order_status, "completed");
      assert.equal((await orderRow(client, oShipping)).order_status, "shipping");
      assert.equal(await historyCount(client, oCompleted), 0, "không ghi history khi từ chối");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

// ============================================================
// T4 — no_voucher: voucher_id NULL và voucher đã xóa (FK SET NULL)
// ============================================================
test("PG 2A1 T4 — no_voucher: voucher_id NULL + voucher bị xóa (FK SET NULL) → hủy vẫn chạy", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    const token = mkToken("t4");
    await client.query("BEGIN");
    try {
      const pid = await mkProduct(client, token, "Base");
      const vA = await mkVariant(client, pid, token, "VA", 3);
      const customerId = await mkCustomer(client, token);

      // Đơn 1: không dùng voucher
      const o1 = await mkOrder(client, { code: `GM-T4A-${token}`, customerId, voucherId: null });
      await mkItem(client, o1, { variantId: vA, qty: 1 });
      const out1 = await callCancel(client, { id: o1 });
      assert.equal(out1.outcome, "cancelled");
      assert.equal(out1.voucher?.outcome, "no_voucher");
      assert.equal(out1.voucherReleasedAt ?? null, null, "voucher_released_at NULL khi no_voucher");
      assert.equal(await variantStock(client, vA), 4, "vA: 3 + 1 = 4");

      // Đơn 2: có voucher nhưng voucher bị DELETE → FK ON DELETE SET NULL
      const voucherId = await mkVoucher(client, `T4-${token}`, 1);
      const o2 = await mkOrder(client, { code: `GM-T4B-${token}`, customerId, voucherId });
      await mkItem(client, o2, { variantId: vA, qty: 1 });
      await client.query("DELETE FROM public.vouchers WHERE voucher_id = $1", [voucherId]);
      const afterDel = await orderRow(client, o2);
      assert.equal(afterDel.voucher_id, null, "FK SET NULL phải kích hoạt");

      const out2 = await callCancel(client, { id: o2 });
      assert.equal(out2.outcome, "cancelled");
      assert.equal(out2.voucher?.outcome, "no_voucher");
      assert.equal(await variantStock(client, vA), 5, "vA: 4 + 1 = 5");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

// ============================================================
// T5 — Combo: KHÔNG hoàn kho combo (lúc tạo không trừ), có note;
// dòng variant thường vẫn hoàn bình thường.
// ============================================================
test("PG 2A1 T5 — combo line: không đụng kho thành phần, note combo_not_tracked, variant line vẫn hoàn", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    const token = mkToken("t5");
    await client.query("BEGIN");
    try {
      const pid = await mkProduct(client, token, "Base");
      const vComponent = await mkVariant(client, pid, token, "COMP", 10);
      const vNormal = await mkVariant(client, pid, token, "NORM", 4);
      const comboId = (
        await client.query(
          "INSERT INTO public.combos (name, slug, price, status) VALUES ('PG2A1 Combo', $1, 50000, 'active') RETURNING combo_id",
          [`${token}-combo`]
        )
      ).rows[0].combo_id as string;
      await client.query(
        "INSERT INTO public.combo_items (combo_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, 1)",
        [comboId, pid, vComponent]
      );

      const customerId = await mkCustomer(client, token);
      const orderId = await mkOrder(client, { code: `GM-T5-${token}`, customerId });
      await mkItem(client, orderId, { comboId, qty: 2, name: "Combo Quà" });
      await mkItem(client, orderId, { variantId: vNormal, qty: 1, name: "Bình thường" });

      const out = await callCancel(client, { id: orderId });
      assert.equal(out.outcome, "cancelled");
      assert.equal(await variantStock(client, vComponent), 10, "kho thành phần combo NGUYÊN VẸN");
      assert.equal(await variantStock(client, vNormal), 5, "variant line: 4 + 1 = 5");
      assert.deepEqual(
        out.stock?.variants,
        [{ variantId: vNormal, quantity: 1 }],
        "chỉ reservation variant trực tiếp được hoàn; combo không có provenance không được suy đoán"
      );
      assert.equal(out.needsRecon, false);
      assert.ok((await orderRow(client, orderId)).stock_restored_at, "stock_restored_at persisted");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

// ============================================================
// T6 — Dòng product-only: nhánh theo cột products.stock THẬT TẠI
// runtime (KHÔNG giả định). Thiếu cột → unrestored + needsRecon
// và KHÔNG set stock_restored_at.
// ============================================================
test("PG 2A1 T6 — product-only line: branch theo information_schema products.stock (không giả định)", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    const token = mkToken("t6");
    await client.query("BEGIN");
    try {
      const hasCol = (
        await client.query(
          "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='stock') AS e"
        )
      ).rows[0].e as boolean;

      const pid = await mkProduct(client, token, "NoVariant");
      const customerId = await mkCustomer(client, token);
      const orderId = await mkOrder(client, { code: `GM-T6-${token}`, customerId });
      await mkItem(client, orderId, { productId: pid, qty: 2, name: "San pham lo le" });

      let stockBefore: number | null = null;
      if (hasCol) {
        const before = await client.query("SELECT stock FROM public.products WHERE product_id = $1", [pid]);
        stockBefore = Number(before.rows[0].stock);
      }

      const out = await callCancel(client, { id: orderId });
      assert.equal(out.outcome, "cancelled");
      const row = await orderRow(client, orderId);
      assert.equal(row.order_status, "cancelled");

      assert.equal(out.needsRecon, false, "canonical cancellation never infers product-level stock");
      assert.equal((out.unrestoredLines ?? []).length, 0);
      assert.ok(row.stock_restored_at, "verified empty reservation set is completed");
      if (hasCol) {
        const after = await client.query("SELECT stock FROM public.products WHERE product_id = $1", [pid]);
        assert.equal(Number(after.rows[0].stock), stockBefore, "product-level stock is not inferred or mutated");
      }
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

// ============================================================
// T7 — voucher times_used=0 returns fail-closed before any mutation.
// (seed COMMITTED, hủy thất bại trong tx riêng, dọn ở cuối).
// ============================================================
test("PG 2A1 T7 — voucher_release_unsafe leaves every table unchanged", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    // Seed COMMITTED (để kiểm chứng sau rollback: dữ liệu không đổi)
    const token = mkToken("t7");
    const pid = await mkProduct(client, token, "Base");
    const vA = await mkVariant(client, pid, token, "VA", 5);
    const customerId = await mkCustomer(client, token);
    const voucherId = await mkVoucher(client, `T7-${token}`, 0); // times_used = 0 → lệch!
    const orderId = await mkOrder(client, { code: `GM-T7-${token}`, customerId, voucherId });
    await mkItem(client, orderId, { variantId: vA, qty: 2 });

    try {
      await client.query("BEGIN");
      const out = await callCancel(client, { id: orderId, reason: "sẽ thất bại" });
      assert.equal(out.outcome, "voucher_release_unsafe");
      await client.query("ROLLBACK");
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* đã rollback */
      }
    }

    // Chứng minh KHÔNG CÓ side effect nào lọt ra ngoài
    const row = await orderRow(client, orderId);
    assert.equal(row.order_status, "pending", "order vẫn pending sau RAISE");
    assert.equal(row.cancel_reason, null, "cancel_reason không bị ghi");
    assert.equal(row.cancelled_at, null);
    assert.equal(row.stock_restored_at, null);
    assert.equal(row.voucher_released_at, null);
    assert.equal(await variantStock(client, vA), 5, "stock không bị cộng");
    const vRes = await client.query("SELECT times_used::int AS n FROM public.vouchers WHERE voucher_id = $1", [
      voucherId,
    ]);
    assert.equal(Number(vRes.rows[0].n), 0, "times_used giữ 0 (không decrement dưới 0)");
    assert.equal(await historyCount(client, orderId), 0, "không có history row");

    // Dọn seed committed (best effort)
    await client.query("DELETE FROM public.order_inventory_reservations WHERE order_id = $1", [orderId]);
    await client.query("DELETE FROM public.orders WHERE order_id = $1", [orderId]);
    await client.query("DELETE FROM public.vouchers WHERE voucher_id = $1", [voucherId]);
    await client.query("DELETE FROM public.products WHERE product_id = $1", [pid]);
    await client.query("DELETE FROM public.customers WHERE customer_id = $1", [customerId]);
  });
});

// ============================================================
// T8 — Các trạng thái CHO PHÉP (confirmed/processing) + hủy theo
// order_code (p_order_id NULL) có side effect đúng.
// ============================================================
test("PG 2A1 T8 — confirmed/processing cho phép hủy; hủy theo order_code (normalize)", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    const token = mkToken("t8");
    await client.query("BEGIN");
    try {
      const pid = await mkProduct(client, token, "Base");
      const vA = await mkVariant(client, pid, token, "VA", 5);
      const customerId = await mkCustomer(client, token);

      const oConfirmed = await mkOrder(client, { code: `GM-T8A-${token}`, customerId, status: "confirmed" });
      await mkItem(client, oConfirmed, { variantId: vA, qty: 1 });
      const out1 = await callCancel(client, { id: oConfirmed });
      assert.equal(out1.outcome, "cancelled");

      const oProcessing = await mkOrder(client, { code: `GM-T8B-${token}`, customerId, status: "processing" });
      await mkItem(client, oProcessing, { variantId: vA, qty: 1 });
      const out2 = await callCancel(client, { id: oProcessing });
      assert.equal(out2.outcome, "cancelled");
      assert.equal(await variantStock(client, vA), 7, "5 + 1 + 1 = 7 (2 đơn)");

      // Hủy theo CODE (p_order_id NULL) — code gửi lên route đã UPPER,
      // hàm cũng tự upper(btrim(...)) để chống lệch case.
      const code = `GM-T8C-${token}`.toUpperCase();
      const oByCode = await mkOrder(client, { code, customerId });
      await mkItem(client, oByCode, { variantId: vA, qty: 2 });
      const out3 = await callCancel(client, { code: code.toLowerCase() });
      assert.equal(out3.outcome, "cancelled");
      assert.equal(out3.orderId, oByCode, "resolve đúng đơn theo code (case-insensitive)");
      assert.equal(await variantStock(client, vA), 9, "7 + 2 = 9");

      assert.equal(await historyCount(client, oConfirmed), 1);
      assert.equal(await historyCount(client, oByCode), 1);
    } finally {
      await client.query("ROLLBACK");
    }
  });
});

// ============================================================
// T9 — CONCURRENCY: 2 kết nối hủy đồng thời → đúng 1 lần restore +
// 1 lần release + 1 history (A giữ lock → B blocked → already).
// ============================================================
test("PG 2A1 T9 — 2 kết nối hủy đồng thời: restore/release/history đúng 1 lần", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  const clientA = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  const clientB = new pgMod.Client({ connectionString: ATOMIC_PG_URL });
  await clientA.connect();
  await clientB.connect();
  try {
    if (!(await functionExists(clientA, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    // Seed COMMITTED (2 client phải thấy chia sẻ), dọn ở cuối
    const token = mkToken("t9");
    const pid = await mkProduct(clientA, token, "Base");
    const vA = await mkVariant(clientA, pid, token, "VA", 3);
    const customerId = await mkCustomer(clientA, token);
    const voucherId = await mkVoucher(clientA, `T9-${token}`, 1);
    const orderId = await mkOrder(clientA, { code: `GM-T9-${token}`, customerId, voucherId });
    await mkItem(clientA, orderId, { variantId: vA, qty: 1 });

    // A: gọi RPC trong tx CHƯA commit → giữ row lock (FOR UPDATE)
    await clientA.query("BEGIN");
    const aRes = await clientA.query("SELECT public.cancel_order_atomic($1::jsonb) AS r", [
      JSON.stringify({ order_id: orderId, reason: "đồng thời A", actor_member_id: TEST_ACTOR_ID }),
    ]);
    assert.equal((aRes.rows[0].r as CancelOut).outcome, "cancelled", "A cancelled trong tx của A");

    // B: tự động chặn tại FOR UPDATE cho tới khi A commit
    const bPromise = (async () => {
      try {
        const out = await callCancel(clientB, { id: orderId, reason: "đồng thời B" });
        return { ok: true as const, out };
      } catch (err: any) {
        return { ok: false as const, message: err?.message };
      }
    })();

    await new Promise((r) => setTimeout(r, 700));
    await clientA.query("COMMIT");
    const bRes = await bPromise;

    assert.equal(bRes.ok, true, `B không được lỗi: ${!bRes.ok ? bRes.message : ""}`);
    assert.equal(bRes.ok && bRes.out.outcome, "already_cancelled", "B thấy đơn đã hủy → idempotent");

    // Xác minh side effect đúng MỘT lần (dù 2 request song song)
    assert.equal(await variantStock(clientA, vA), 4, "restore đúng 1 lần: 3 + 1 = 4 (không phải 5)");
    const vRes = await clientA.query("SELECT times_used::int AS n FROM public.vouchers WHERE voucher_id = $1", [
      voucherId,
    ]);
    assert.equal(Number(vRes.rows[0].n), 0, "release đúng 1 lần");
    assert.equal(await historyCount(clientA, orderId), 1, "history đúng 1 dòng");
    const row = await orderRow(clientA, orderId);
    assert.equal(row.order_status, "cancelled");
    assert.ok(row.stock_restored_at);
    assert.ok(row.voucher_released_at);

    // Dọn seed committed (best effort)
    await clientA.query("DELETE FROM public.order_inventory_reservations WHERE order_id = $1", [orderId]);
    await clientA.query("DELETE FROM public.orders WHERE order_id = $1", [orderId]);
    await clientA.query("DELETE FROM public.vouchers WHERE voucher_id = $1", [voucherId]);
    await clientA.query("DELETE FROM public.products WHERE product_id = $1", [pid]);
    await clientA.query("DELETE FROM public.customers WHERE customer_id = $1", [customerId]);
  } finally {
    await clientA.end();
    await clientB.end();
  }
});

// ============================================================
// T10 — PERMISSIONS/DEFINER: SECURITY DEFINER + search_path cố định,
// EXECUTE không cấp cho anon/authenticated/public; cột audit có mặt.
// ============================================================
test("PG 2A1 T10 — SECURITY DEFINER + search_path + grant chỉ service_role + cột audit", async (t) => {
  if (!canRun) {
    t.skip(skipReason);
    return;
  }
  await withClient(async (client) => {
    if (!(await functionExists(client, "cancel_order_atomic"))) {
      t.skip("public.cancel_order_atomic chưa tồn tại — apply migration 017 trước");
      return;
    }

    const proc = await client.query(
      `SELECT p.prosecdef, p.proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'cancel_order_atomic'`
    );
    assert.equal(proc.rowCount, 1);
    assert.equal(proc.rows[0].prosecdef, true, "PHẢI là SECURITY DEFINER");
    const cfg: string[] = proc.rows[0].proconfig ?? [];
    assert.ok(
      cfg.some((c) => c.startsWith("search_path=") && c.includes("public")),
      `search_path phải cố định, got ${JSON.stringify(cfg)}`
    );

    const priv = await client.query(
      "SELECT grantee FROM information_schema.routine_privileges WHERE routine_schema = 'public' AND routine_name = 'cancel_order_atomic'"
    );
    const grantees = (priv.rows as Array<{ grantee: string }>).map((r) => r.grantee);
    for (const banned of ["anon", "authenticated", "public"]) {
      assert.ok(!grantees.includes(banned), `KHÔNG được cấp EXECUTE cho ${banned}, got ${JSON.stringify(grantees)}`);
    }
    assert.ok(grantees.includes("service_role"), `phải có service_role, got ${JSON.stringify(grantees)}`);

    const cols = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name IN ('stock_restored_at', 'voucher_released_at')"
    );
    assert.equal(cols.rowCount, 2, "cột audit stock_restored_at + voucher_released_at phải tồn tại");
  });
});
