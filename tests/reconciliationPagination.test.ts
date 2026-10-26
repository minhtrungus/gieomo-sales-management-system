import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createFakeOrderDb, type FakeOrderDb, type HookContext } from "./helpers/fakeOrderDb.ts";

/**
 * Batch 3C — pagination + two-phase fetch trong reconciliationService.
 *
 * Thiết kế (đã chốt trong audit Phase 1):
 *   Phase A — lightweight full scan (classify + summary + in-memory filters
 *     trên toàn bộ rows khớp DB filters), sort created_at DESC + order_id
 *     DESC (tie-break), payments theo chunks 500 IDs.
 *   Phase B — detailed fetch CHỈ cho page IDs (≤ limit) + enrich hiển thị
 *     (customer_email, shipping_address, item snapshots) — không classify lại.
 *   Clamp server-side: limit trong [1, 200], offset >= 0.
 *
 * Tests (MOCK/contract — không phải PostgreSQL integration):
 *   P1  boundary offset: 0 / giữa / cuối / == total / > total
 *   P2  tie-break: cùng created_at → order_id DESC, không dup/skip giữa trang
 *   P3  DB filters + pagination nhất quán
 *   P4  in-memory filters (status tab, search transaction_code) + pagination
 *   P5  KPI summary tính trên TOÀN BỘ filtered set, không chỉ page
 *   P6  empty result: records [], total_count 0, summary global hợp lệ
 *   P7  clamp: limit=9999 → 200; limit=0/không có → default 100
 *   P8  chunked payments: 501 orderIds → 2 query, mỗi query ≤ 500 IDs
 *   P11 Phase B enrich: customer_email + item snapshots đầy đủ, shape record
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "@/lib/supabase/admin": "mock:supabase-admin",
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) {
    return { url: MOCKS[specifier], shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try {
      return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" });
    } catch (err) {
      return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export function createAdminClient() { return globalThis.__fakeOrderDb; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { getReconciliationDataServer, resetReconciliationCatalogCache } = await import(
  "../src/lib/services/reconciliationService.ts"
);

const g = globalThis as unknown as { __fakeOrderDb?: unknown };

function oid(i: number): string {
  return `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
}

function makeOrder(i: number, overrides: Record<string, unknown> = {}) {
  return {
    order_id: oid(i),
    order_code: `GM-P${String(i).padStart(3, "0")}`,
    order_status: "pending",
    payment_status: "pending",
    delivery_status: "not_ready",
    receiver_name: `Khách ${i}`,
    receiver_phone: `0900${String(i).padStart(6, "0")}`,
    shipping_address_snapshot: `Địa chỉ ${i}`,
    final_amount: 100000,
    subtotal: 100000,
    shipping_fee: 0,
    voucher_discount: 0,
    customer_note: null,
    internal_note: null,
    payment_method: "banking",
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function seedOrders(orders: Array<Record<string, unknown>>, extra: Record<string, Array<Record<string, unknown>>> = {}): FakeOrderDb {
  const db = createFakeOrderDb({
    products: [],
    product_variants: [],
    customers: [],
    members: [],
    order_items: [],
    order_status_history: [],
    order_idempotency: [],
    orders,
    payments: [],
    ...extra,
  });
  g.__fakeOrderDb = db;
  return db;
}

// ============================================================
// P1 — boundary offset
// ============================================================
test("P1 — boundary offset: 0 / cuối / == total / > total", async () => {
  resetReconciliationCatalogCache();
  const orders = [1, 2, 3, 4, 5].map((i) => makeOrder(i));
  seedOrders(orders);

  const page0 = await getReconciliationDataServer({ limit: 2, offset: 0 });
  assert.equal(page0.records.length, 2);
  assert.equal(page0.total_count, 5);
  assert.deepEqual(
    page0.records.map((r) => r.order_code),
    ["GM-P005", "GM-P004"],
    "sort created_at DESC — seed cùng thời điểm → thứ tự insertion giữ nguyên qua DESC trên tie-break order_id"
  );

  const page2 = await getReconciliationDataServer({ limit: 2, offset: 4 });
  assert.equal(page2.records.length, 1, "offset cuối: còn 1 record");
  assert.equal(page2.records[0].order_code, "GM-P001");

  const atTotal = await getReconciliationDataServer({ limit: 2, offset: 5 });
  assert.equal(atTotal.records.length, 0, "offset == total → trang rỗng");
  assert.equal(atTotal.total_count, 5, "total_count vẫn trả");

  const beyond = await getReconciliationDataServer({ limit: 2, offset: 10 });
  assert.equal(beyond.records.length, 0, "offset > total → trang rỗng");
  assert.equal(beyond.total_count, 5);
});

// ============================================================
// P2 — tie-break: cùng created_at → order_id DESC, không dup/skip
// ============================================================
test("P2 — cùng created_at: order_id DESC tie-break, ghép 2 trang không dup/skip", async () => {
  resetReconciliationCatalogCache();
  const t = "2026-03-01T00:00:00.000Z";
  seedOrders([makeOrder(1, { created_at: t }), makeOrder(2, { created_at: t })]);

  const p1 = await getReconciliationDataServer({ limit: 1, offset: 0 });
  const p2 = await getReconciliationDataServer({ limit: 1, offset: 1 });

  assert.equal(p1.records.length, 1);
  assert.equal(p2.records.length, 1);
  assert.equal(p1.records[0].order_id, oid(2), "order_id DESC: id lớn hơn đứng trước");
  assert.equal(p2.records[0].order_id, oid(1));

  const ids = [p1.records[0].order_id, p2.records[0].order_id];
  assert.equal(new Set(ids).size, 2, "ghép 2 trang: không duplicate");
  assert.equal(p1.total_count, 2);
  assert.equal(p2.total_count, 2);
});

// ============================================================
// P3 — DB filters + pagination nhất quán
// ============================================================
test("P3 — start_date filter + limit: records trong khoảng, total_count theo filtered", async () => {
  resetReconciliationCatalogCache();
  seedOrders([
    makeOrder(1, { created_at: "2026-03-01T00:00:00.000Z" }),
    makeOrder(2, { created_at: "2026-03-05T00:00:00.000Z" }),
    makeOrder(3, { created_at: "2026-03-10T00:00:00.000Z" }),
  ]);

  const res = await getReconciliationDataServer({
    start_date: "2026-03-04T00:00:00.000Z",
    limit: 1,
    offset: 0,
  });
  assert.equal(res.total_count, 2, "2 orders sau start_date");
  assert.equal(res.records.length, 1);
  assert.equal(res.records[0].order_id, oid(3), "mới nhất trước (created_at DESC)");

  const res2 = await getReconciliationDataServer({
    start_date: "2026-03-04T00:00:00.000Z",
    limit: 1,
    offset: 1,
  });
  assert.equal(res2.records.length, 1);
  assert.equal(res2.records[0].order_id, oid(2));
});

test("P3b — end_date date-only bao trọn cả ngày cuối (C10)", async () => {
  resetReconciliationCatalogCache();
  seedOrders([
    makeOrder(1, { created_at: "2026-03-01T00:00:00.000Z" }),
    makeOrder(2, { created_at: "2026-03-05T12:00:00.000Z" }),
    makeOrder(3, { created_at: "2026-03-10T00:00:00.000Z" }),
  ]);

  // end_date-only, date-only string: order 2 (12:00 ngày 05) PHẢI nằm trong
  // khoảng — trước đây lte so midnight UTC → loại trọn ngày 05.
  const res = await getReconciliationDataServer({
    end_date: "2026-03-05",
    limit: 10,
    offset: 0,
  });
  assert.equal(res.total_count, 2, "orders 03-01 + 03-05T12:00 nằm trong khoảng");
  const codes = res.records.map((r) => r.order_code).sort();
  assert.deepEqual(codes, ["GM-P001", "GM-P002"]);

  // start + enddategether: chỉ order 03-05
  const res2 = await getReconciliationDataServer({
    start_date: "2026-03-05",
    end_date: "2026-03-05",
    limit: 10,
    offset: 0,
  });
  assert.equal(res2.total_count, 1, "start=end date-only → đúng 1 ngày");
  assert.equal(res2.records[0].order_id, oid(2));
});

// ============================================================
// P4 — in-memory filters (status tab + search tx) + pagination
// ============================================================
test("P4 — reconciliation_status filter + search transaction_code + limit", async () => {
  resetReconciliationCatalogCache();
  seedOrders(
    [
      makeOrder(1, { payment_status: "paid" }), // PAYMENT_MISMATCH (paid flag, 0 payments)
      makeOrder(2), // UNPAID
      makeOrder(3), // UNPAID
    ],
    {
      payments: [
        {
          payment_id: "pay-p4-1",
          order_id: oid(2),
          payment_method: "banking",
          amount: 40000,
          payment_status: "paid",
          transaction_code: "REF-P4-SPECIAL",
          created_at: "2026-03-01T01:00:00.000Z",
        },
      ],
    }
  );
  // oid(2): underpaid 40000/100000 → UNDERPAID
  // oid(3): UNPAID
  // oid(1): PAYMENT_MISMATCH

  const unpaid = await getReconciliationDataServer({
    reconciliation_status: "UNPAID",
    limit: 1,
    offset: 0,
  });
  assert.equal(unpaid.total_count, 1, "chỉ oid(3) unpaid (oid(2) underpaid)");
  assert.equal(unpaid.records.length, 1);
  assert.equal(unpaid.records[0].order_id, oid(3));

  const searchTx = await getReconciliationDataServer({
    search: "REF-P4-SPECIAL",
    limit: 10,
    offset: 0,
  });
  assert.equal(searchTx.total_count, 1, "search theo transaction_code (in-memory Phase A)");
  assert.equal(searchTx.records[0].order_id, oid(2));

  const action = await getReconciliationDataServer({
    action_required_only: true,
    limit: 1,
    offset: 1,
  });
  assert.equal(action.total_count, 3, "3 đơn cần xử lý (không có OK)");
  assert.equal(action.records.length, 1);
});

// ============================================================
// P5 — KPI summary trên TOÀN BỘ filtered set, không chỉ page
// ============================================================
test("P5 — KPI global: summary tính trên toàn bộ dataset kể cả khi limit=2", async () => {
  resetReconciliationCatalogCache();
  seedOrders(
    [
      makeOrder(1), // UNPAID
      makeOrder(2, { payment_status: "paid" }), // PAYMENT_MISMATCH
      makeOrder(3, { order_status: "cancelled" }), // NEEDS_REVIEW
      makeOrder(4), // sẽ underpaid
      makeOrder(5, { payment_status: "paid" }), // sẽ OK (đủ tiền + flag paid)
    ],
    {
      payments: [
        {
          payment_id: "pay-p5-under",
          order_id: oid(4),
          payment_method: "banking",
          amount: 50000,
          payment_status: "paid",
          transaction_code: "REF-P5-U",
          created_at: "2026-03-01T01:00:00.000Z",
        },
        {
          payment_id: "pay-p5-ok",
          order_id: oid(5),
          payment_method: "banking",
          amount: 100000,
          payment_status: "paid",
          transaction_code: "REF-P5-OK",
          created_at: "2026-03-01T01:00:00.000Z",
        },
      ],
    }
  );

  const res = await getReconciliationDataServer({ limit: 2, offset: 0 });
  assert.equal(res.records.length, 2, "page chỉ 2 rows");
  assert.equal(res.total_count, 5);

  const s = res.summary;
  assert.equal(s.total_orders, 5, "KPI trên TOÀN bộ dataset, không phải page");
  assert.equal(s.status_counts.ok, 1);
  assert.equal(s.status_counts.unpaid, 1);
  assert.equal(s.status_counts.underpaid, 1);
  assert.equal(s.status_counts.payment_mismatch, 1);
  assert.equal(s.status_counts.needs_review, 1);
  assert.equal(s.status_counts.action_required_total, 4);
  assert.equal(s.total_expected_revenue, 500000, "5 × 100000");
  assert.equal(s.total_paid_revenue, 150000, "50000 + 100000");
});

// ============================================================
// P6 — empty result: records [], total_count 0, summary global giữ nguyên
// ============================================================
test("P6 — search không match: records rỗng, total_count 0, summary global vẫn đúng", async () => {
  resetReconciliationCatalogCache();
  seedOrders([makeOrder(1), makeOrder(2)]);

  const res = await getReconciliationDataServer({
    search: "khong-ton-tai-xyz",
    limit: 10,
    offset: 0,
  });
  assert.deepEqual(res.records, []);
  assert.equal(res.total_count, 0);
  assert.equal(res.summary.total_orders, 2, "summary = global theo DB filters, KHÔNG phụ thuộc search");
});

// ============================================================
// P7 — clamp server-side
// ============================================================
test("P7 — clamp: limit=9999 → 200 records; limit=0 → default 100; offset âm → 0", async () => {
  resetReconciliationCatalogCache();
  const orders = Array.from({ length: 205 }, (_, idx) => makeOrder(idx + 1));
  seedOrders(orders);

  const clamped = await getReconciliationDataServer({ limit: 9999, offset: 0 });
  assert.equal(clamped.records.length, 200, "clamp MAX_PAGE_SIZE=200");
  assert.equal(clamped.total_count, 205);

  const zero = await getReconciliationDataServer({ limit: 0, offset: 0 });
  assert.equal(zero.records.length, 100, "limit=0/không hợp lệ → DEFAULT_PAGE_SIZE=100");

  const neg = await getReconciliationDataServer({ limit: 10, offset: -5 });
  assert.equal(neg.records.length, 10);
  assert.equal(neg.records[0].order_id, oid(205), "offset âm → 0 (mới nhất trước)");
});

// ============================================================
// P8 — chunked payments: 501 IDs → 2 query, mỗi query ≤ 500 IDs
// ============================================================
test("P8 — payments query theo chunks 500 IDs (chống URL overflow)", async () => {
  resetReconciliationCatalogCache();
  const orders = Array.from({ length: 501 }, (_, idx) => makeOrder(idx + 1));
  const db = seedOrders(orders);

  const paymentBatches: number[] = [];
  let windowScans = 0;
  db.hook = (ctx: HookContext) => {
    if (ctx.table === "payments" && ctx.op === "select") {
      const inFilter = ctx.filters.find(([col]) => col === "order_id");
      if (inFilter && Array.isArray(inFilter[1])) {
        paymentBatches.push((inFilter[1] as unknown[]).length);
      } else {
        // Batch C — window scan của orphan detector (filter theo created_at, không theo order_id).
        windowScans++;
      }
    }
  };

  const res = await getReconciliationDataServer({ limit: 1, offset: 0 });
  db.hook = null;

  assert.equal(res.total_count, 501);
  assert.equal(paymentBatches.length, 2, "501 IDs → 2 query payments chunk (500 + 1)");
  assert.equal(paymentBatches[0], 500);
  assert.equal(paymentBatches[1], 1);
  assert.equal(windowScans, 1, "đúng 1 window scan orphan");
  for (const n of paymentBatches) {
    assert.ok(n <= 500, `mỗi chunk ≤ 500 IDs, got ${n}`);
  }
});

// ============================================================
// P11 — Phase B enrich: customer_email + item snapshots đầy đủ
// ============================================================
test("P11 — Phase B enrich: customer_email, shipping_address, item snapshots + inventory merge", async () => {
  resetReconciliationCatalogCache();
  const PROD = "bbbbbbb3-1111-4111-8111-111111111111";
  const VARIANT = "ccccccc3-1111-4111-8111-111111111111";
  const CUST = "ddddddd3-1111-4111-8111-111111111111";
  const db = seedOrders(
    [makeOrder(1, { customer_id: CUST, final_amount: 50000, subtotal: 50000, payment_status: "paid" })],
    {
      products: [{ product_id: PROD, name: "Sản phẩm P11", status: "active" }],
      product_variants: [
        {
          variant_id: VARIANT,
          product_id: PROD,
          name: "Phân loại P11",
          sku: "SKU-P11",
          price: 50000,
          stock: 9,
          status: "active",
        },
      ],
      customers: [
        {
          customer_id: CUST,
          full_name: "Khách P11",
          phone: "0900000011",
          email: "p11@example.com",
        },
      ],
      order_items: [
        {
          order_item_id: "oi-p11-1",
          order_id: oid(1),
          product_id: PROD,
          variant_id: VARIANT,
          combo_id: null,
          item_name_snapshot: "Sản phẩm P11",
          variant_name_snapshot: "Phân loại P11",
          sku_snapshot: "SKU-P11",
          quantity: 1,
          unit_price: 50000,
          subtotal: 50000,
        },
      ],
      payments: [
        {
          payment_id: "pay-p11",
          order_id: oid(1),
          payment_method: "banking",
          amount: 50000,
          payment_status: "paid",
          transaction_code: "REF-P11",
          created_at: "2026-03-01T01:00:00.000Z",
        },
      ],
    }
  );

  // Phase A KHÔNG select customers — hook xác nhận detail fetch có customers
  const detailSelects: Array<string | undefined> = [];
  db.hook = (ctx: HookContext) => {
    if (ctx.table === "orders" && ctx.op === "select" && ctx.cols?.includes("customers")) {
      detailSelects.push(ctx.cols);
    }
  };

  const res = await getReconciliationDataServer({ limit: 10, offset: 0 });
  db.hook = null;

  assert.equal(res.records.length, 1);
  const rec = res.records[0];
  assert.equal(rec.reconciliation_status, "OK");
  assert.equal(rec.customer_email, "p11@example.com", "customer_email enrich từ Phase B detail fetch");
  assert.equal(rec.shipping_address, "Địa chỉ 1", "shipping_address enrich từ Phase B");
  assert.ok(detailSelects.length >= 1, "Phase B phải query orders có nested customers");

  assert.equal(rec.items.length, 1);
  const item = rec.items[0];
  assert.equal(item.item_name, "Sản phẩm P11", "item_name từ item_name_snapshot (Phase B)");
  assert.equal(item.variant_name, "Phân loại P11");
  assert.equal(item.sku, "SKU-P11");
  assert.equal(item.unit_price, 50000);
  assert.equal(item.subtotal, 50000);
  assert.equal(item.quantity_ordered, 1);
  assert.equal(item.inventory_state, "CONSISTENT", "inventory state merge từ Phase A classify");
  assert.equal(item.current_catalog_stock, 9, "stock đọc từ product_variants.stock (Phase A catalog)");

  // Shape record đầy đủ (backward compat với UI)
  assert.equal(rec.payments_count, 1);
  assert.equal(rec.paid_amount, 50000);
  assert.equal(rec.expected_amount, 50000);
  assert.equal(rec.inventory_status, "OK");
  assert.equal(rec.items_count, 1);
});
