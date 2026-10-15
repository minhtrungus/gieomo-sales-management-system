import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
