import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { register } from "node:module";

const sourceRoot = new URL("../src/", import.meta.url).href;
const loader = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    specifier = "./" + specifier.slice(2);
    context = { ...context, parentURL: ${JSON.stringify(sourceRoot)} };
  }
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.split("/").pop().includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw error;
  }
}`;
register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);

const pageSource = readFileSync(new URL("../src/app/admin/inventory/page.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../src/app/api/inventory/route.ts", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../src/lib/data/orderStore.ts", import.meta.url), "utf8");

test("warehouse UI awaits server confirmation, blocks duplicate clicks, and retains form state on failure", () => {
  for (const handler of ["saveNewWarehouse", "updateStoredWarehouse", "deleteStoredWarehouse"]) {
    assert.match(pageSource, new RegExp(`await ${handler}\\(`));
  }
  assert.match(pageSource, /if \(!result\.success\)[\s\S]*setWarehouseFeedback/);
  assert.match(pageSource, /if \(!result\.success\)[\s\S]*return;[\s\S]*setEditingWarehouse\(null\)/);
  assert.match(pageSource, /warehouseSaving/);
  assert.match(pageSource, /Đang lưu\.\.\./);
  assert.ok(pageSource.indexOf("await saveNewWarehouse") < pageSource.indexOf("setIsAddWarehouseOpen(false)"));
});

test("warehouse store is server-first and only publishes the canonical response", () => {
  const request = storeSource.indexOf('const response = await fetch("/api/inventory"');
  const cacheWrite = storeSource.indexOf("cachedWarehouses = body.warehouses", request);
  assert.ok(request >= 0 && cacheWrite > request);
  assert.match(storeSource, /body\.success !== true \|\| !Array\.isArray\(body\.warehouses\)/);
  assert.doesNotMatch(storeSource.slice(request, cacheWrite), /localStorage\.setItem\("gieomo_warehouses"/);
  assert.match(storeSource, /Dữ liệu đã nhập vẫn được giữ để thử lại/);
  assert.match(storeSource, /expectedWarehouses/);
});

test("warehouse API requires admin, validates the full shape, and fails on database errors", () => {
  assert.match(routeSource, /const authCheck = await requireAdmin\(request\)/);
  assert.match(routeSource, /validateWarehouses\(warehouses\)/);
  assert.match(routeSource, /normalized\.filter\(\(entry\) => entry\.is_default\)\.length !== 1/);
  assert.match(routeSource, /if \(error\) throw new Error/);
  assert.match(routeSource, /success: false, error: "Không thể tải dữ liệu kho từ máy chủ\."/);
  assert.match(routeSource, /return NextResponse\.json\(\{ success: true, warehouses: validatedWarehouses \}\)/);
  assert.match(routeSource, /compareAndSetWarehouses/);
  assert.match(routeSource, /\.eq\("updated_at", currentResult\.data\.updated_at\)/);
  assert.match(routeSource, /status: 409/);
  assert.match(routeSource, /để không ghi đè thay đổi mới/);
});

test("failed warehouse save keeps canonical local data; retry and a second update preserve prior fields", async () => {
  const storage = new Map<string, string>();
  const initial = [
    { warehouse_id: "wh-a", code: "A", name: "Kho A", address: "A", phone: "1", manager_name: "An", is_default: true },
    { warehouse_id: "wh-b", code: "B", name: "Kho B", address: "B", phone: "2", manager_name: "Bình", is_default: false },
  ];
  storage.set("gieomo_warehouses", JSON.stringify(initial));
  const target = globalThis as unknown as { window: unknown; localStorage: unknown };
  target.window = globalThis;
  Object.assign(globalThis, { dispatchEvent: () => true });
  target.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  let failNextPost = true;
  globalThis.fetch = async (_input, init) => {
    if (init?.method !== "POST") return Response.json({ success: true, warehouses: initial, inflowLogs: [], transferLogs: [] });
    const request = JSON.parse(String(init.body)) as { warehouses: typeof initial };
    if (failNextPost) {
      failNextPost = false;
      return Response.json({ success: false, error: "Database unavailable" }, { status: 503 });
    }
    return Response.json({ success: true, warehouses: request.warehouses });
  };

  const store = await import(`../src/lib/data/orderStore.ts?warehouse=${Date.now()}`);
  const failed = await store.updateStoredWarehouse({ ...initial[0], name: "Kho A mới" });
  assert.equal(failed.success, false);
  assert.equal(JSON.parse(storage.get("gieomo_warehouses")!)[0].name, "Kho A");

  const retried = await store.updateStoredWarehouse({ ...initial[0], name: "Kho A mới" });
  assert.equal(retried.success, true);
  assert.equal(JSON.parse(storage.get("gieomo_warehouses")!)[0].name, "Kho A mới");

  const afterRetry = JSON.parse(storage.get("gieomo_warehouses")!)[0];
  const second = await store.updateStoredWarehouse({ ...afterRetry, phone: "0909" });
  assert.equal(second.success, true);
  const saved = JSON.parse(storage.get("gieomo_warehouses")!)[0];
  assert.equal(saved.name, "Kho A mới");
  assert.equal(saved.phone, "0909");
});
