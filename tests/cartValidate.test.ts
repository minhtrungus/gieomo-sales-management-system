import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const SRC_ROOT = new URL("../src/", import.meta.url).href;
const hooksSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const sub = "./" + specifier.slice(2);
    try {
      return await nextResolve(sub, { ...context, parentURL: "${SRC_ROOT}" });
    } catch {
      return nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const name = specifier.split("/").pop() || "";
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const storage = new Map<string, string>();
let catalogFetchMode: "fail" | "ok" = "fail";
const runtime = globalThis as unknown as {
  window: typeof globalThis;
  localStorage: Storage;
  addEventListener: () => void;
  dispatchEvent: () => boolean;
  fetch: typeof fetch;
};
runtime.window = globalThis;
runtime.addEventListener = () => undefined;
runtime.dispatchEvent = () => true;
runtime.localStorage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => {
    storage.delete(key);
  },
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
};
// Catalog sync fails (500) → getStoredProducts/getStoredCombos return [].
runtime.fetch = (async () => {
  if (catalogFetchMode === "fail") {
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      success: true,
      products: [
        {
          product_id: "P1",
          status: "active",
          name: "Hàng A",
          price: 10000,
          slug: "hang-a",
          thumbnail: null,
          stock: 2,
          variants: [],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}) as typeof fetch;

const { useCartStore } = await import("../src/store/cart.ts");
const { syncProductsFromServer } = await import("../src/lib/data/orderStore.ts");

function cartItem(productId: string, quantity: number) {
  return {
    product_id: productId,
    variant_id: null,
    combo_id: null,
    name: `Product ${productId}`,
    variant_name: null,
    price: 10000,
    quantity,
    stock: quantity,
  };
}

describe("cart.validateCart — P0: empty catalog must not wipe the cart", () => {
  test("keeps all items when products and combos catalogs are both empty (sync failed / not loaded)", () => {
    useCartStore.setState({ items: [cartItem("P1", 2), cartItem("P2", 1)] });

    const result = useCartStore.getState().validateCart();

    assert.equal(result.removedCount, 0);
    assert.equal(result.updatedCount, 0);
    assert.equal(useCartStore.getState().items.length, 2);
  });

  test("still validates normally once a catalog is available: removes missing, clamps over-stock", async () => {
    // Bust the module cache by forcing a successful catalog sync.
    catalogFetchMode = "ok";
    await syncProductsFromServer(true);
    useCartStore.setState({ items: [cartItem("P1", 5), cartItem("P999", 1)] });

    const result = useCartStore.getState().validateCart();

    assert.equal(result.removedCount, 1);
    assert.equal(result.updatedCount, 1);
    const items = useCartStore.getState().items;
    assert.equal(items.length, 1);
    assert.equal(items[0].product_id, "P1");
    assert.equal(items[0].quantity, 2);
  });
});
