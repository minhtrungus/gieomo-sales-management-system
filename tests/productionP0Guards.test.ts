import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { naturalCompare } from "../src/lib/utils.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("order query error propagation — P0: DB failure must not look like an empty order list", () => {
  const serviceSource = read("src/lib/services/orderService.ts");

  test("getOrdersServer throws on DB error instead of returning []", () => {
    const dbErrorIdx = serviceSource.indexOf("DB Error:");
    assert.ok(dbErrorIdx !== -1, "expected a DB Error log branch in getOrdersServer");
    const branch = serviceSource.slice(dbErrorIdx, dbErrorIdx + 400);
    assert.ok(
      branch.includes("throw new Error("),
      "DB error branch must throw so the API route can return success:false"
    );
    assert.ok(
      !branch.includes("return []"),
      "DB error branch must not return [] (indistinguishable from 'no orders' → client wipes cache)"
    );
  });

  test("getOrdersServer outer catch rethrows instead of swallowing to []", () => {
    const exceptionIdx = serviceSource.indexOf("Exception:");
    assert.ok(exceptionIdx !== -1, "expected an Exception log branch in getOrdersServer");
    const branch = serviceSource.slice(exceptionIdx, exceptionIdx + 300);
    assert.ok(branch.includes("throw err"), "outer catch must rethrow");
    assert.ok(!branch.includes("return []"), "outer catch must not return []");
  });

  test("GET /api/orders maps thrown errors to success:false (route catch intact)", () => {
    const routeSource = read("src/app/api/orders/route.ts");
    const getStart = routeSource.indexOf("export async function GET");
    assert.ok(getStart !== -1);
    const getEnd = routeSource.indexOf("export async function POST");
    const getBody = routeSource.slice(getStart, getEnd === -1 ? undefined : getEnd);
    assert.ok(getBody.includes("success: false"), "GET catch must return success:false on error");
    assert.ok(getBody.includes("catch"), "GET must keep its try/catch");
  });
});

describe("sale create-order preselect — P0: ?productId must not overwrite staff edits", () => {
  const pageSource = read("src/app/sale/create-order/page.tsx");

  test("preselect effect is guarded by hasUserEditedItemsRef", () => {
    assert.ok(pageSource.includes("hasUserEditedItemsRef"), "page must track user edits via ref");
    const effectIdx = pageSource.indexOf("appliedQueryProductRef.current === queryProductId");
    assert.ok(effectIdx !== -1, "preselect must re-apply guard for the same queryProductId");
    const guardIdx = pageSource.indexOf("if (hasUserEditedItemsRef.current) return;");
    assert.ok(guardIdx !== -1, "preselect effect must bail out once staff edited items");
  });

  test("all item mutation handlers set hasUserEditedItemsRef", () => {
    for (const handler of [
      "handleAddItem",
      "handleRemoveItem",
      "handleProductChange",
      "handleVariantChange",
      "handleQuantityChange",
    ]) {
      const idx = pageSource.indexOf(`const ${handler} = (`);
      assert.ok(idx !== -1, `missing handler ${handler}`);
      const body = pageSource.slice(idx, idx + 600);
      assert.ok(
        body.includes("hasUserEditedItemsRef.current = true"),
        `${handler} must mark items as user-edited`
      );
    }
  });
});

describe("track page SKU display — order detail must show canonical SKU snapshot", () => {
  const trackSource = read("src/app/track/page.tsx");

  test("server order mapping carries sku_snapshot from both items and order_items shapes", () => {
    assert.ok(
      trackSource.includes("sku_snapshot: it.sku || it.sku_snapshot || null"),
      "mapServerOrder must map sku from /api/orders items"
    );
    assert.ok(
      trackSource.includes("sku_snapshot: it.sku_snapshot || null"),
      "mapServerOrder must map sku from legacy order_items shape"
    );
  });

  test("selected-order item list renders the SKU when present", () => {
    assert.ok(
      trackSource.includes("Mã: {item.sku_snapshot}"),
      "item breakdown must render SKU snapshot"
    );
    assert.ok(
      trackSource.includes("item.sku_snapshot &&"),
      "SKU render must be conditional on presence"
    );
  });
});

describe("F4 natural product sort — order-entry pickers sort by name with numeric collation", () => {
  test("naturalCompare orders embedded numbers numerically (SP-2 before SP-10)", () => {
    const names = ["SP-10", "SP-2", "SP-1"];
    const sorted = [...names].sort(naturalCompare);
    assert.deepEqual(sorted, ["SP-1", "SP-2", "SP-10"]);
  });

  test("naturalCompare is diacritic/base-insensitive for Vietnamese product names", () => {
    const names = ["Bánh", "Áo", "Cây"];
    const sorted = [...names].sort(naturalCompare);
    assert.deepEqual(sorted, ["Áo", "Bánh", "Cây"]);
  });

  test("sale create-order picker renders sortedProducts, not raw availableProducts", () => {
    const pageSource = read("src/app/sale/create-order/page.tsx");
    assert.ok(pageSource.includes("naturalCompare"), "sale page must import naturalCompare");
    assert.ok(pageSource.includes("sortedProducts.map"), "sale picker must map sortedProducts");
    assert.ok(!pageSource.includes("availableProducts.map("), "sale picker must not map raw list");
  });

  test("admin create-order picker renders sortedProducts, not raw availableProducts", () => {
    const pageSource = read("src/app/admin/orders/create/page.tsx");
    assert.ok(pageSource.includes("naturalCompare"), "admin create page must import naturalCompare");
    assert.ok(pageSource.includes("sortedProducts.map"), "admin create picker must map sortedProducts");
    assert.ok(!pageSource.includes("availableProducts.map("), "admin create picker must not map raw list");
  });

  test("admin combos pickers render sortedProducts, not raw availableProducts", () => {
    const pageSource = read("src/app/admin/combos/page.tsx");
    assert.ok(pageSource.includes("naturalCompare"), "combos page must import naturalCompare");
    assert.ok(pageSource.includes("sortedProducts.map"), "combos pickers must map sortedProducts");
    assert.ok(!pageSource.includes("availableProducts.map("), "combos pickers must not map raw list");
  });
});

describe("admin create-order preselect — P0: ?productId must not overwrite admin edits", () => {
  const pageSource = read("src/app/admin/orders/create/page.tsx");

  test("preselect effect reads window.location.search productId once and is guarded", () => {
    assert.ok(pageSource.includes("hasUserEditedItemsRef"), "page must track user edits via ref");
    assert.ok(
      pageSource.includes('window.location.search).get("productId")'),
      "preselect must read ?productId from the URL"
    );
    assert.ok(
      pageSource.includes("appliedQueryProductRef.current === queryProductId"),
      "preselect must re-apply guard for the same queryProductId"
    );
    assert.ok(
      pageSource.includes("if (hasUserEditedItemsRef.current || availableProducts.length === 0) return;"),
      "preselect effect must bail out once admin edited items"
    );
  });

  test("setOrderItems wrapper marks every item mutation as user-edited", () => {
    assert.ok(
      pageSource.includes("const setOrderItems: typeof setOrderItemsState"),
      "page must wrap setOrderItems with a user-edit marker"
    );
    assert.ok(
      pageSource.includes("hasUserEditedItemsRef.current = true"),
      "setOrderItems wrapper must set hasUserEditedItemsRef"
    );
  });
});
