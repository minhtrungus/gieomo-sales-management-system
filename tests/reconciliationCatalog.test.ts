import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { createFakeOrderDb, type FakeOrderDb, type HookContext } from "./helpers/fakeOrderDb.ts";

/**
 * Batch 3B — catalog lookup correction trong reconciliationService.
 *
 * Root cause (đã xác minh từ source/schema):
 *   products (001:88-105): KHÔNG có cột stock, KHÔNG có cột sku.
 *   Query cũ `.select("product_id, name, sku, price, stock, status")` →
 *   PostgREST PGRST204 → data=null → `productsRes.data || []` NUỐT lỗi
 *   thành catalog rỗng → MỌI dòng product không biến thể bị gắn nhãn
 *   "Sản phẩm không còn trong catalog hiện tại" (finding sai).
 *
 *   Nguồn tồn kho duy nhất theo schema: product_variants.stock (001:120).
 *   Dòng product không biến thể KHÔNG kiểm tồn kho (parity 016/orderService).
 *
 *   order_items.variant_id ON DELETE SET NULL (001:254): variant bị xóa →
 *   variant_id NULL, snapshot giữ nguyên. KHÔNG ghép snapshot theo tên/SKU
 *   (không có contract duy nhất).
 *
 * Tests (MOCK/contract — không phải PostgreSQL integration):
 *   C1  products select KHÔNG chứa stock/sku; variant select GIỮ stock
 *   C2  catalog OK: variant theo variant.stock; product-line currentStock=null
 *   C3  catalog query lỗi → THROW (không nuốt thành catalog rỗng)
 *   C4  variant_id NULL + snapshot variant_name → UNVERIFIED, không suy đoán
 *   C5  inventory_adjustments.variant_id NULL — Batch 3B KHÔNG đọc ledger
 *   C6  payment verdicts không đổi khi catalog hợp lệ (T6 regression)
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

const ORDER_OK = "aaaaaaa1-1111-4111-8111-111111111111";
const PROD_SIMPLE = "bbbbbbb1-1111-4111-8111-111111111111";
const VARIANT_OK = "ccccccc1-1111-4111-8111-111111111111";

const g = globalThis as unknown as { __fakeOrderDb?: unknown };

function seedDb(): FakeOrderDb {
  const db = createFakeOrderDb({
    products: [
      {
        product_id: PROD_SIMPLE,
        name: "Sản phẩm không biến thể",
        status: "active",
      },
    ],
    product_variants: [
      {
        variant_id: VARIANT_OK,
        product_id: PROD_SIMPLE,
        name: "Phân loại A",
        sku: "SKU-A",
        price: 50000,
        stock: 7,
        status: "active",
      },
    ],
    customers: [],
    members: [],
    order_status_history: [],
    order_idempotency: [],
    order_items: [
      {
        order_item_id: "oi-variant-1",
        order_id: ORDER_OK,
        product_id: PROD_SIMPLE,
        variant_id: VARIANT_OK,
        combo_id: null,
        item_name_snapshot: "Sản phẩm không biến thể",
        variant_name_snapshot: "Phân loại A",
        sku_snapshot: "SKU-A",
        quantity: 1,
        unit_price: 50000,
        subtotal: 50000,
      },
      {
        order_item_id: "oi-simple-1",
        order_id: ORDER_OK,
        product_id: PROD_SIMPLE,
        variant_id: null,
        combo_id: null,
        item_name_snapshot: "Sản phẩm không biến thể",
        variant_name_snapshot: null,
        sku_snapshot: null,
        quantity: 1,
        unit_price: 50000,
        subtotal: 50000,
      },
    ],
    orders: [
      {
        order_id: ORDER_OK,
        order_code: "GM-CAT1",
        order_status: "pending",
        payment_status: "paid",
        delivery_status: "not_ready",
        receiver_name: "Khách Catalog",
        receiver_phone: "0900000001",
        shipping_address_snapshot: "TP. HCM",
        final_amount: 100000,
        subtotal: 100000,
        shipping_fee: 0,
        voucher_discount: 0,
        customer_note: null,
        internal_note: null,
        payment_method: "banking",
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ],
    payments: [
      {
        payment_id: "pay-cat-1",
        order_id: ORDER_OK,
        payment_method: "banking",
        amount: 100000,
        payment_status: "paid",
        transaction_code: "REF-CAT-1",
        created_at: "2026-02-01T01:00:00.000Z",
      },
    ],
  });
  g.__fakeOrderDb = db;
  return db;
}

// ============================================================
// C1 — products select KHÔNG chứa stock/sku (001 không có cột);
//      variant select GIỮ stock (ngồnồn tồn kho duy nhất)
// ============================================================
test("C1 — source contract: products select không chứa stock/sku; variant select giữ stock", () => {
  const src = readFileSync(
    new URL("../src/lib/services/reconciliationService.ts", import.meta.url),
    "utf8"
  );

  const prodMatch = src.match(/from\("products"\)\s*\.select\("([^"]+)"\)/);
  assert.ok(prodMatch, "phải tìm thấy truy vấn from(\"products\").select(...)");
  const prodCols = prodMatch![1].split(",").map((c) => c.trim());
  assert.ok(prodCols.length > 0);
  assert.ok(!prodCols.includes("stock"), "products (001:88-105) KHÔNG có cột stock — không được select");
  assert.ok(!prodCols.includes("sku"), "products (001:88-105) KHÔNG có cột sku — không được select");
  assert.ok(prodCols.includes("product_id") && prodCols.includes("status"));

  const variantMatch = src.match(/from\("product_variants"\)\s*\.select\("([^"]+)"\)/);
  assert.ok(variantMatch, "phải tìm thấy truy vấn from(\"product_variants\").select(...)");
  const variantCols = variantMatch![1].split(",").map((c) => c.trim());
  assert.ok(
    variantCols.includes("stock"),
    "product_variants.stock (001:120) là nguồn tồn kho duy nhất — variant select phải giữ stock"
  );
});

// ============================================================
// C2 — catalog OK: variant theo variant.stock; product-line
//      currentStock=null (không đọc products.stock); payment OK
// ============================================================
test("C2 — catalog hợp lệ: variant theo variant.stock, product-line currentStock=null, payment OK", async () => {
  resetReconciliationCatalogCache();
  const db = seedDb();

  const res = await getReconciliationDataServer();
  const rec = res.records.find((r) => r.order_id === ORDER_OK);
  assert.ok(rec);
  assert.equal(rec.reconciliation_status, "OK", "đơn paid đủ tiền + inventory OK → OK");

  const itemVariant = rec.items.find((i) => i.order_item_id === "oi-variant-1");
  assert.ok(itemVariant);
  assert.equal(itemVariant.inventory_state, "CONSISTENT");
  assert.equal(itemVariant.current_catalog_stock, 7, "tồn kho variant đọc từ product_variants.stock");

  const itemSimple = rec.items.find((i) => i.order_item_id === "oi-simple-1");
  assert.ok(itemSimple);
  assert.equal(itemSimple.inventory_state, "CONSISTENT");
  assert.equal(
    itemSimple.current_catalog_stock,
    null,
    "product-line: currentStock=null, KHÔNG đọc products.stock (schema không có cột)"
  );
  assert.ok(
    String(itemSimple.inventory_note).includes("không kiểm tồn kho"),
    `note phải nêu rõ không kiểm tồn kho, got: ${itemSimple.inventory_note}`
  );
  db.hook = null;
});

// ============================================================
// C3 — catalog query lỗi → THROW, không nuốt thành catalog rỗng
// ============================================================
test("C3a — lỗi query products → THROW 'Không thể tải dữ liệu sản phẩm đối soát'", async () => {
  resetReconciliationCatalogCache();
  const db = seedDb();
  db.hook = (ctx: HookContext) => {
    if (ctx.table === "products" && ctx.op === "select") {
      return {
        error: {
          code: "PGRST204",
          message: "Could not find the 'stock' column of 'products' in the schema cache",
        },
      };
    }
  };

  await assert.rejects(
    () => getReconciliationDataServer(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Không thể tải dữ liệu sản phẩm đối soát/);
      return true;
    },
    "lỗi catalog products phải ném lỗi → route 500, KHÔNG trả danh sách rỗng"
  );
  db.hook = null;
  resetReconciliationCatalogCache();
});

test("C3b — lỗi query product_variants → THROW 'Không thể tải dữ liệu phân loại sản phẩm đối soát'", async () => {
  resetReconciliationCatalogCache();
  const db = seedDb();
  db.hook = (ctx: HookContext) => {
    if (ctx.table === "product_variants" && ctx.op === "select") {
      return {
        error: { code: "PGRST204", message: "schema cache miss" },
      };
    }
  };

  await assert.rejects(
    () => getReconciliationDataServer(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Không thể tải dữ liệu phân loại sản phẩm đối soát/);
      return true;
    },
    "lỗi catalog variants phải ném lỗi → route 500"
  );
  db.hook = null;
  resetReconciliationCatalogCache();
});

// ============================================================
// C4 — variant_id NULL + snapshot variant_name → UNVERIFIED,
//      currentCatalogStock=null, không suy đoán tồn kho
// ============================================================
test("C4 — order item variant đã xóa (variant_id NULL + snapshot): UNVERIFIED, không suy đoán", async () => {
  resetReconciliationCatalogCache();
  const db = seedDb();
  // Thêm item đại diện variant đã bị xóa: FK SET NULL → variant_id NULL,
  // snapshot variant_name/sku giữ nguyên (001:254-258).
  db.tables.order_items.push({
    order_item_id: "oi-deleted-variant",
    order_id: ORDER_OK,
    product_id: PROD_SIMPLE,
    variant_id: null,
    combo_id: null,
    item_name_snapshot: "Sản phẩm không biến thể",
    variant_name_snapshot: "Phân loại đã xóa",
    sku_snapshot: "SKU-DEAD",
    quantity: 1,
    unit_price: 10000,
    subtotal: 10000,
  });

  const res = await getReconciliationDataServer();
  const rec = res.records.find((r) => r.order_id === ORDER_OK);
  assert.ok(rec);

  const item = rec.items.find((i) => i.order_item_id === "oi-deleted-variant");
  assert.ok(item);
  assert.equal(item.inventory_state, "UNVERIFIED");
  assert.equal(
    item.current_catalog_stock,
    null,
    "KHÔNG suy diễn tồn kho từ snapshot hoặc product-line khi variant đã xóa"
  );
  assert.ok(
    String(item.inventory_note).includes("đã bị xóa"),
    `note phải nêu biến thể đã bị xóa, got: ${item.inventory_note}`
  );
  // KHÔNG ghép snapshot theo tên/SKU với variant đang có trong catalog
  // (Phân loại A có sku SKU-A — không được match SKU-DEAD/Phân loại đã xóa).
  assert.notEqual(item.current_catalog_stock, 7);
  db.hook = null;
});

// ============================================================
// C5 — inventory_adjustments: Batch 3B KHÔNG đọc ledger
//      (không mở rộng ledger reconciliation trong batch này)
// ============================================================
test("C5 — reconciliationService KHÔNG tham chiếu inventory_adjustments (Batch 3B không đọc ledger)", () => {
  const src = readFileSync(
    new URL("../src/lib/services/reconciliationService.ts", import.meta.url),
    "utf8"
  );
  assert.ok(
    !src.includes("inventory_adjustments"),
    "Batch 3B không bổ sung ledger reconciliation — service không được đọc inventory_adjustments"
  );
});

// ============================================================
// C6 — regression: payment verdicts không đổi khi catalog hợp lệ
//      (mirror T6 — assertion payments giữ nguyên)
// ============================================================
test("C6 — payment verdicts giữ nguyên khi catalog hợp lệ (không làm suy yếu payments)", async () => {
  resetReconciliationCatalogCache();
  const db = seedDb();

  const res = await getReconciliationDataServer();
  assert.equal(res.summary.total_orders, 1);
  assert.equal(res.summary.status_counts.ok, 1);
  assert.equal(res.summary.total_paid_revenue, 100000);
  assert.equal(res.summary.total_expected_revenue, 100000);

  const rec = res.records[0];
  assert.equal(rec.paid_amount, 100000);
  assert.equal(rec.payments_count, 1);
  assert.equal(rec.payments[0].transaction_code, "REF-CAT-1");
  assert.equal(rec.payments[0].status, "paid");
  db.hook = null;
  resetReconciliationCatalogCache();
});
