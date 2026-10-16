import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createFakeOrderDb } from "./helpers/fakeOrderDb.ts";

/**
 * Batch F7 — getOrdersServer item mapping aliases.
 *
 * Bug: trang admin/sale đọc `product_name_snapshot`/`variant_name_snapshot`
 * (OrderItem) nhưng mapping của getOrdersServer chỉ trả `product_name`/
 * `variant_name` → đơn server-sync hiển thị thiếu tên/spacer biến thể.
 * Mapping mới phải:
 *   - alias snapshot (product_name_snapshot/variant_name_snapshot/sku_snapshot)
 *     từ cột DB item_name_snapshot/variant_name_snapshot/sku_snapshot;
 *   - giữ nguyên legacy fields (product_name/variant_name/sku/price/unit_price);
 *   - không bịa dữ liệu: biến thể null → variant_name_snapshot null.
 *
 * Scope: display mapping. Combo component SKU snapshot KHÔNG thuộc batch này
 * (cần business decision) — combo line chỉ có một hàng order_items với
 * sku_snapshot COMBO-xxxxx như khi tạo đơn.
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "@/lib/supabase/admin": "mock:supabase-admin",
  "@/lib/services/configService": "mock:config-service",
  "@/lib/auth/serverAuth": "mock:server-auth",
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
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export function createAdminClient() { return globalThis.__fakeOrderDb; }",
    };
  }
  if (url === "mock:config-service") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        "export async function getSystemSettingsServer() { return { flatShippingFee: 25000, freeShippingThreshold: 500000 }; }",
    };
  }
  if (url === "mock:server-auth") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        'export function createOrderProofToken(code) { return "tok-" + code; }' +
        "export async function getAuthenticatedUser() { return null; }" +
        "export async function requireAdmin() { return { authorized: true }; }" +
        "export async function requireAuth() { return { authorized: true }; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { getOrdersServer } = await import("../src/lib/services/orderService.ts");

const ORDER_ROW = {
  order_id: "o1",
  order_code: "GM000001",
  customer_id: "c1",
  receiver_name: "Nguyen Van A",
  receiver_phone: "0901234567",
  delivery_type: "ship",
  shipping_address_snapshot: "123 Duong A, Quan 1",
  subtotal: 150000,
  shipping_fee: 25000,
  voucher_discount: 0,
  final_amount: 175000,
  order_status: "pending",
  payment_status: "pending",
  delivery_status: "not_ready",
  payment_method: "cod",
  customer_note: null,
  internal_note: null,
  assigned_shipper_id: null,
  source_type: "landing_page",
  introducer_info: null,
  seller_id: null,
  created_at: "2026-10-13T10:00:00.000Z",
  confirmed_at: null,
  completed_at: null,
  cancelled_at: null,
};

const VARIANT_ITEM = {
  order_item_id: "oi1",
  order_id: "o1",
  item_name_snapshot: "Mầm Mơ Hộp",
  variant_name_snapshot: "Hộp lớn",
  sku_snapshot: "MM-HOP-LON",
  quantity: 1,
  unit_price: 100000,
  subtotal: 100000,
};

const PLAIN_ITEM = {
  order_item_id: "oi2",
  order_id: "o1",
  item_name_snapshot: "Mầm Mơ Lẻ",
  variant_name_snapshot: null,
  sku_snapshot: "MM-LE",
  quantity: 2,
  unit_price: 25000,
  subtotal: 50000,
};

const COMBO_ITEM = {
  order_item_id: "oi3",
  order_id: "o1",
  item_name_snapshot: "Combo Quà Mầm Mơ",
  variant_name_snapshot: "Set Combo Quà Tặng",
  sku_snapshot: "COMBO-ABCDE",
  quantity: 1,
  unit_price: 300000,
  subtotal: 300000,
};

function seedDb() {
  const db = createFakeOrderDb({
    customers: [
      {
        customer_id: "c1",
        full_name: "Nguyen Van A",
        phone: "0901234567",
        email: "a@example.com",
      },
    ],
    orders: [{ ...ORDER_ROW }],
    order_items: [{ ...VARIANT_ITEM }, { ...PLAIN_ITEM }, { ...COMBO_ITEM }],
    products: [{ product_id: "p-pack", name: "Túi Mầm Mơ" }],
    product_variants: [{
      variant_id: "v-pack",
      product_id: "p-pack",
      name: "Mẫu #01 · Xanh lá",
      sku: "TUI-01-XANH",
    }],
    order_inventory_reservations: [{ order_id: "o1", variant_id: "v-pack", quantity: 2 }],
  });
  (globalThis as any).__fakeOrderDb = db;
  return db;
}

test("F7-T1 — admin mapping: alias snapshot + giữ SKU trên từng dòng", async () => {
  seedDb();
  const orders = await getOrdersServer({ isAdmin: true });
  assert.equal(orders.length, 1);
  const items = orders[0].items;
  assert.equal(items.length, 3);

  const [variant, plain, combo] = items;

  // Dòng biến thể: snapshot alias = cột DB, SKU nguyên vẹn.
  assert.equal(variant.product_name_snapshot, "Mầm Mơ Hộp");
  assert.equal(variant.variant_name_snapshot, "Hộp lớn");
  assert.equal(variant.sku_snapshot, "MM-HOP-LON");
  assert.equal(variant.sku, "MM-HOP-LON");

  // Dòng sản phẩm thường: variant null phải là null (không bịa), SKU vẫn có.
  assert.equal(plain.product_name_snapshot, "Mầm Mơ Lẻ");
  assert.equal(plain.variant_name_snapshot, null);
  assert.equal(plain.sku_snapshot, "MM-LE");
  assert.equal(plain.sku, "MM-LE");

  // Combo: một dòng snapshot COMBO-xxxxx như khi tạo đơn (KHÔNG component SKUs
  // — ngoài scope batch này).
  assert.equal(combo.product_name_snapshot, "Combo Quà Mầm Mơ");
  assert.equal(combo.sku_snapshot, "COMBO-ABCDE");
  assert.equal(combo.sku, "COMBO-ABCDE");
});

test("F7-T5 — mapping trả danh sách đóng gói đúng variant/SKU từ reservation", async () => {
  seedDb();
  const orders = await getOrdersServer({ isAdmin: true });
  assert.deepEqual(orders[0].packing_items, [
    {
      variant_id: "v-pack",
      product_name: "Túi Mầm Mơ",
      variant_name: "Mẫu #01 · Xanh lá",
      sku: "TUI-01-XANH",
      quantity: 2,
    },
  ]);
});

test("F7-T2 — mapping không làm mất legacy fields (product_name/variant_name/price/unit_price)", async () => {
  seedDb();
  const orders = await getOrdersServer({ isAdmin: true });
  const [variant, plain] = orders[0].items;

  assert.equal(variant.product_name, "Mầm Mơ Hộp");
  assert.equal(variant.variant_name, "Hộp lớn");
  assert.equal(variant.price, 100000);
  assert.equal(variant.unit_price, 100000);
  assert.equal(variant.quantity, 1);
  assert.equal(variant.subtotal, 100000);

  assert.equal(plain.product_name, "Mầm Mơ Lẻ");
  assert.equal(plain.price, 25000);
  assert.equal(plain.quantity, 2);
});

test("F7-T3 — customer lookup (code + phone) dùng chung mapping, item snapshot đầy đủ", async () => {
  seedDb();
  const orders = await getOrdersServer({ code: "GM000001", phone: "0901234567" });
  assert.equal(orders.length, 1);
  const items = orders[0].items;
  assert.equal(items.length, 3);
  assert.equal(items[0].product_name_snapshot, "Mầm Mơ Hộp");
  assert.equal(items[0].variant_name_snapshot, "Hộp lớn");
  assert.equal(items[0].sku_snapshot, "MM-HOP-LON");
  // PII không verified chỉ mask tên/phone — item mapping không liên quan.
  assert.equal(orders[0].buyer_name, "Nguyen Van A");
});

test("F7-T4 — order không có order_items → items rỗng, không ném lỗi", async () => {
  const db = seedDb();
  db.tables.order_items = [];
  const orders = await getOrdersServer({ isAdmin: true });
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].items, []);
});
