import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createFakeOrderDb, type FakeOrderDb, type HookContext } from "./helpers/fakeOrderDb.ts";

/**
 * Batch 2F — unit/mock tests cho SAFE variant upsert trong upsertProductServer
 * + chống push absolute-stock khi tải trang inventory.
 *
 * Bằng chứng code-level (KHÔNG cần PG): upsert KHÔNG delete-all, UPDATE variant
 * hiện có KHÔNG chứa stock trong payload → cấu trúc không thể clobber stock
 * do order RPC trừ. PG concurrency cho các RPC vẫn ngoài scope (26 SKIP).
 *
 * Map yêu cầu → tests:
 *   U1  variant hiện có, stock client khác → UPDATE không chứa stock, DB giữ nguyên
 *   U2  match theo variant_id ổn định (UUID thật trong DB)
 *   U3  SKU fallback chỉ khi mapping duy nhất
 *   U4  SKU mơ hồ trong payload → fail closed, không update nhầm
 *   U5  variant vắng trong payload → KHÔNG bị xóa
 *   U6  variant mới → INSERT đúng contract (stock payload)
 *   U7  insert variant lỗi → không có delete-all, lỗi trả về rõ ràng
 *   U8  lỗi update metadata product → không bị nuốt
 *   U9  nhiều payload match cùng1 DB row → fail closed
 *   U10 stock ban đầu variant mới không hợp lệ → fail closed
 *   U11 inventory page healing không còn push updateStoredProduct khi tải trang
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
      source: "export function createAdminClient() { return globalThis.__fakeUpsertDb; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { upsertProductServer } = await import("../src/lib/services/productService.ts");

const g = globalThis as unknown as { __fakeUpsertDb?: unknown };

const PRODUCT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VAR_ID_1 = "11111111-1111-1111-1111-111111111111";
const VAR_ID_2 = "22222222-2222-2222-2222-222222222222";

type OpRecord = { table: string; op: string; payload?: any };

function seedDb(): { db: FakeOrderDb; ops: OpRecord[] } {
  const ops: OpRecord[] = [];
  const db = createFakeOrderDb({
    products: [
      {
        product_id: PRODUCT_ID,
        name: "Sản phẩm A",
        slug: "sp-a",
        price: 100000,
        status: "active",
        featured: false,
        sort_order: 1,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    product_variants: [
      {
        variant_id: VAR_ID_1,
        product_id: PRODUCT_ID,
        sku: "SKU-RED-XL",
        name: "Đỏ XL",
        price: 100000,
        stock: 7,
        status: "active",
        sort_order: 1,
      },
      {
        variant_id: VAR_ID_2,
        product_id: PRODUCT_ID,
        sku: "SKU-BLU-M",
        name: "Xanh M",
        price: 90000,
        stock: 5,
        status: "active",
        sort_order: 2,
      },
    ],
  });
  // Ghi nhận mọi op + cho phép test inject lỗi
  db.hook = (ctx: HookContext) => {
    ops.push({ table: ctx.table, op: ctx.op, payload: ctx.payload });
    return undefined;
  };
  g.__fakeUpsertDb = db;
  return { db, ops };
}

function baseProduct(overrides: Record<string, any> = {}): any {
  return {
    product_id: PRODUCT_ID,
    name: "Sản phẩm A",
    slug: "sp-a",
    price: 100000,
    status: "active",
    variants: [] as any[],
    ...overrides,
  };
}

function variantOps(ops: OpRecord[], op: string) {
  return ops.filter((o) => o.table === "product_variants" && o.op === op);
}

// ============================================================
// U1 + U2 — variant hiện có match theo variant_id; UPDATE không chứa stock
// ============================================================
test("U1/U2 — variant hiện có match theo variant_id; UPDATE payload KHÔNG chứa stock, DB giữ nguyên", async () => {
  const { db, ops } = seedDb();
  const res = await upsertProductServer(
    baseProduct({
      variants: [
        {
          variant_id: VAR_ID_1,
          sku: "SKU-RED-XL",
          name: "Đỏ XL size to",
          price: 120000,
          stock: 999, // client gửi stock khác — server KHÔNG được ghi đè
        },
      ],
    })
  );
  assert.equal(res.success, true, res.error);
  assert.equal(res.product_id, PRODUCT_ID);

  const updates = variantOps(ops, "update");
  assert.equal(updates.length, 1, "phải UPDATE đúng1 variant hiện có");
  const updPayload = updates[0].payload;
  assert.ok(updPayload, "update phải có payload");
  assert.equal(
    "stock" in updPayload,
    false,
    `UPDATE variant hiện có KHÔNG được chứa stock, got keys: ${Object.keys(updPayload).join(",")}`
  );
  assert.equal(updPayload.name, "Đỏ XL size to");
  assert.equal(updPayload.sku, "SKU-RED-XL");
  assert.equal(updPayload.price, 120000);

  // DB stock giữ nguyên (fake áp payload lên row nhưng payload không có stock)
  const row = db.tables.product_variants!.find((r) => r.variant_id === VAR_ID_1)!;
  assert.equal(row.stock, 7, "stock DB phải giữ nguyên 7 (không bị 999 đè)");
  // Không có delete nào trên product_variants
  assert.equal(variantOps(ops, "delete").length, 0, "KHÔNG được delete variant");
});

// ============================================================
// U3 — SKU fallback: payload variant_id là pseudo-id (không phải UUID) → match theo SKU
// ============================================================
test("U3 — SKU fallback: pseudo variant_id không match; match theo SKU duy nhất → UPDATE không stock", async () => {
  const { db, ops } = seedDb();
  const res = await upsertProductServer(
    baseProduct({
      variants: [
        {
          variant_id: "var-1700000000000-0", // pseudo-id client tạo variant mới — KHÔNG phải UUID
          sku: "SKU-RED-XL", // nhưng SKU đã có trong DB → match
          name: "Đỏ XL (rename)",
          stock: 50,
        },
      ],
    })
  );
  assert.equal(res.success, true, res.error);

  const updates = variantOps(ops, "update");
  assert.equal(updates.length, 1);
  assert.equal(
    "stock" in updates[0].payload,
    false,
    "SKU-fallback UPDATE cũng KHÔNG được chứa stock"
  );
  const row = db.tables.product_variants!.find((r) => r.sku === "SKU-RED-XL")!;
  assert.equal(row.variant_id, VAR_ID_1, "phải match đúng variant theo SKU");
  assert.equal(row.stock, 7, "stock giữ nguyên");
  assert.equal(variantOps(ops, "insert").length, 0, "không insert thêm khi đã match");
});

// ============================================================
// U4 — SKU mơ hồ trong payload (2 entry cùng SKU) → fail closed
// ============================================================
test("U4 — 2 payload entry cùng SKU → fail closed, không update/insert/delete gì", async () => {
  const { db, ops } = seedDb();
  const res = await upsertProductServer(
    baseProduct({
      variants: [
        { variant_id: VAR_ID_1, sku: "SKU-DUP", name: "A", stock: 1 },
        { variant_id: "var-x-1", sku: "SKU-DUP", name: "B", stock: 2 },
      ],
    })
  );
  assert.equal(res.success, false);
  assert.ok(res.error && res.error.includes("trùng lặp"), `error phải báo SKU trùng, got: ${res.error}`);
  assert.equal(variantOps(ops, "update").length, 0, "không update gì khi mơ hồ");
  assert.equal(variantOps(ops, "insert").length, 0, "không insert gì khi mơ hồ");
  assert.equal(variantOps(ops, "delete").length, 0);
});

// ============================================================
// U5 — variant vắng trong payload KHÔNG bị xóa
// ============================================================
test("U5 — payload thiếu variant hiện có → variant đó KHÔNG bị xóa (giữ nguyên trong DB)", async () => {
  const { db, ops } = seedDb();
  const res = await upsertProductServer(
    baseProduct({
      variants: [{ variant_id: VAR_ID_1, sku: "SKU-RED-XL", name: "Đỏ XL", stock: 3 }],
      // VAR_ID_2 vắng trong payload
    })
  );
  assert.equal(res.success, true, res.error);
  assert.equal(variantOps(ops, "delete").length, 0, "tuyệt đối không delete");
  assert.ok(
    db.tables.product_variants!.some((r) => r.variant_id === VAR_ID_2),
    "variant vắng trong payload phải còn nguyên trong DB"
  );
});

// ============================================================
// U6 — variant mới (không match ID/SKU) → INSERT với stock payload
// ============================================================
test("U6 — variant mới → INSERT đúng contract (stock từ payload, không gửi trường client-only)", async () => {
  const { db, ops } = seedDb();
  const res = await upsertProductServer(
    baseProduct({
      variants: [
        {
          variant_id: "var-1700000000001-0", // pseudo-id → không match UUID nào
          sku: "SKU-NEW-01", // không có trong DB
          name: "Màu mới",
          price: 80000,
          stock: 12,
          stock_warehouse_1: 12, // field client-only — KHÔNG được gửi lên DB
          warehouse_stocks: { "wh-1": 12 },
        },
      ],
    })
  );
  assert.equal(res.success, true, res.error);

  const inserts = variantOps(ops, "insert");
  assert.equal(inserts.length, 1, "phải INSERT đúng1 variant mới");
  const insRows = Array.isArray(inserts[0].payload) ? inserts[0].payload : [inserts[0].payload];
  assert.equal(insRows.length, 1);
  const row = insRows[0];
  assert.equal(row.product_id, PRODUCT_ID);
  assert.equal(row.sku, "SKU-NEW-01");
  assert.equal(row.stock, 12, "stock ban đầu = payload");
  assert.equal(row.name, "Màu mới");
  assert.equal(
    "stock_warehouse_1" in row,
    false,
    "không gửi field client-only stock_warehouse_1"
  );
  assert.equal(
    "warehouse_stocks" in row,
    false,
    "không gửi field client-only warehouse_stocks"
  );
  // DB có thêm row mới
  assert.equal(db.tables.product_variants!.length, 3, "DB +1 variant mới");
});

// ============================================================
// U7 — insert variant lỗi → không delete-all, lỗi trả về rõ ràng
// ============================================================
test("U7 — insert variant lỗi → success:false, KHÔNG delete-all, DB cũ còn nguyên", async () => {
  const { db, ops } = seedDb();
  db.hook = (ctx: HookContext) => {
    ops.push({ table: ctx.table, op: ctx.op, payload: ctx.payload });
    if (ctx.table === "product_variants" && ctx.op === "insert") {
      return { error: { code: "23505", message: 'duplicate key value violates unique constraint "product_variants_sku_key"' } };
    }
    return undefined;
  };
  const res = await upsertProductServer(
    baseProduct({
      variants: [
        { variant_id: VAR_ID_1, sku: "SKU-RED-XL", name: "Đỏ XL", stock: 1 },
        { sku: "SKU-NEW-FAIL", name: "Mới", stock: 4 }, // sẽ insert → lỗi
      ],
    })
  );
  assert.equal(res.success, false, "insert lỗi PHẢI trả success:false (không nuốt)");
  assert.ok(res.error && res.error.includes("SKU-NEW-FAIL"), `error phải nêu tên biến thể, got: ${res.error}`);
  assert.equal(variantOps(ops, "delete").length, 0, "KHÔNG có delete-all nào xảy ra");
  // Variant cũ còn nguyên cả2
  assert.equal(db.tables.product_variants!.length, 2, "variants cũ còn nguyên2 dòng");
});

// ============================================================
// U8 — lỗi update metadata product → không bị nuốt
// ============================================================
test("U8 — update products lỗi → success:false, không đụng variants", async () => {
  const { db, ops } = seedDb();
  db.hook = (ctx: HookContext) => {
    ops.push({ table: ctx.table, op: ctx.op, payload: ctx.payload });
    if (ctx.table === "products" && ctx.op === "update") {
      return { error: { code: "XX000", message: "connection reset" } };
    }
    return undefined;
  };
  const res = await upsertProductServer(
    baseProduct({ variants: [{ variant_id: VAR_ID_1, sku: "SKU-RED-XL", name: "X", stock: 1 }] })
  );
  assert.equal(res.success, false);
  assert.equal(res.error, "connection reset", "giữ nguyên thông báo lỗi product update");
  assert.equal(variantOps(ops, "update").length, 0, "không chạm variants khi product update lỗi");
  assert.equal(variantOps(ops, "insert").length, 0);
  assert.equal(variantOps(ops, "delete").length, 0);
});

// ============================================================
// U9 — 2 payload entry match cùng1 DB row (1 theo ID,1 theo SKU) → fail closed
// ============================================================
test("U9 — 2 payload match cùng1 DB variant (ID + SKU) → fail closed", async () => {
  const { db, ops } = seedDb();
  const res = await upsertProductServer(
    baseProduct({
      variants: [
        { variant_id: VAR_ID_1, sku: "SKU-OTHER", name: "A", stock: 1 }, // match VAR_ID_1 theo ID
        { variant_id: "var-pseudo-9", sku: "SKU-RED-XL", name: "B", stock: 2 }, // match CÙNG VAR_ID_1 theo SKU
      ],
    })
  );
  assert.equal(res.success, false);
  assert.ok(res.error && res.error.includes("mơ hồ"), `error phải báo mơ hồ, got: ${res.error}`);
  assert.equal(variantOps(ops, "update").length, 0);
  assert.equal(variantOps(ops, "insert").length, 0);
});

// ============================================================
// U10 — stock ban đầu variant mới không hợp lệ → fail closed
// ============================================================
test("U10 — variant mới có stock âm/không nguyên → fail closed, không insert", async () => {
  const { db, ops } = seedDb();
  for (const bad of [-1, 2.5, NaN as any]) {
    const res = await upsertProductServer(
      baseProduct({
        variants: [{ sku: "SKU-BAD", name: "X", stock: bad }],
      })
    );
    assert.equal(res.success, false, `stock=${bad} phải fail closed`);
    assert.ok(res.error && res.error.includes("SKU-BAD"), `error nêu SKU, got: ${res.error}`);
  }
  assert.equal(variantOps(ops, "insert").length, 0, "không insert stock không hợp lệ");
});

// ============================================================
// U11 — inventory page healing: không còn push updateStoredProduct khi tải trang
// ============================================================
test("U11 — inventory page: healing load KHÔNG còn push updateStoredProduct lên server", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(
    new URL("../src/app/admin/inventory/page.tsx", import.meta.url),
    "utf8"
  );
  // Dòng push cũ: mapped.forEach((mp) => updateStoredProduct(mp)); — phải biến mất
  assert.ok(
    !src.includes("mapped.forEach((mp) => updateStoredProduct(mp))"),
    "healing load không được push updateStoredProduct lên server"
  );
  // updateStoredProduct vẫn được dùng cho các luồng điều chỉnh có chủ đích (import còn)
  assert.ok(
    src.includes("updateStoredProduct"),
    "import updateStoredProduct vẫn giữ cho các luồng +/-, restock, transfer"
  );
});
