import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { createFakeOrderDb } from "./helpers/fakeOrderDb.ts";

// Entire suite uses an in-memory DB and browser stubs; no external services.
const root = new URL("../src/", import.meta.url).href;
const hooks = `
export async function resolve(s, c, next) {
  const mocks = { "next/server": "mock:next", "@/lib/supabase/admin": "mock:db", "@/lib/auth/serverAuth": "mock:auth", "@/lib/services/configService": "mock:config" };
  if (mocks[s]) return { url: mocks[s], shortCircuit: true };
  if (s.startsWith("@/")) { s = "./" + s.slice(2); c = { ...c, parentURL: ${JSON.stringify(root)} }; }
  try { return await next(s, c); } catch (e) {
    if ((s.startsWith("./") || s.startsWith("../")) && !s.split("/").pop().includes(".")) return next(s + ".ts", c);
    throw e;
  }
}
export async function load(url, c, next) {
  const sources = {
    "mock:next": 'export class NextResponse { static json(b, i) { return Response.json(b, i); } }',
    "mock:db": 'export function createAdminClient() { return globalThis.__n2Db; }',
    "mock:auth": 'export async function requireAdmin() { return globalThis.__n2Deny ? { authorized: false, response: Response.json({ success: false, error: "Unauthorized" }, { status: 401 }) } : { authorized: true, user: { memberId: null } }; } export async function requireAuth() {} export async function getAuthenticatedUser() { return { role: "admin" }; } export function createOrderProofToken() { return "test-token"; } export function verifyOrderProofToken() { return false; }',
    "mock:config": 'export async function getSystemSettingsServer() { return {}; }',
  };
  if (sources[url]) return { format: "module", shortCircuit: true, source: sources[url] };
  return next(url, c);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);
const { PATCH } = await import("../src/app/api/orders/route.ts");
const g = globalThis as any;
const storage = new Map<string, string>();
g.window = globalThis;
g.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
let events = 0;
g.dispatchEvent = () => { events++; return true; };
let release: (() => void) | null = null;
let failure: "http" | "network" | "body" | "json" | null = null;
let lastBody: any;
g.fetch = async (url: string, init?: RequestInit) => {
  if (init?.method === "PATCH") {
    lastBody = JSON.parse(String(init.body));
    if (release) await new Promise<void>((resolve) => { release = resolve; });
    if (failure === "network") throw new Error("Offline");
    if (failure === "http") return Response.json({ success: false, error: "DB unavailable" }, { status: 503 });
    if (failure === "body") return Response.json({ success: true });
    if (failure === "json") return new Response("invalid JSON");
    return PATCH(new Request("http://localhost/api/orders", init));
  }
  if (url.startsWith("/api/orders")) return Response.json({ success: true, orders: structuredClone(g.__n2Db.tables.orders) });
  return Response.json({ success: false }, { status: 401 });
};
const store = await import("../src/lib/data/orderStore.ts");
const ID = "11111111-1111-4111-8111-111111111111";
const SHIPPER = "22222222-2222-4222-8222-222222222222";
const RECEIPT = "[Khách đã nộp ảnh biên lai CK - Chờ BTC đối soát] [Ảnh biên lai]: https://test.invalid/new.png (Ghi chú: CK)";
const AUDIT = "[HỦY THANH TOÁN] Lý do: kiểm tra";
async function seed(note: string | null = `Cũ | ${RECEIPT} | ${AUDIT}`) {
  failure = null; release = null; g.__n2Deny = false; storage.clear(); events = 0;
  const db = createFakeOrderDb({ orders: [{
    order_id: ID, order_code: "GM-N2", internal_note: note, customer_note: "Khách nhờ gọi trước",
    assigned_shipper_id: null, delivery_status: "packed", order_status: "pending", payment_status: "pending",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  }] });
  g.__n2Db = db;
  await sync();
  events = 0;
  return db;
}
async function sync() {
  store.syncOrdersFromServer(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
}
function local() { return store.getStoredOrders()[0]; }
async function patch(fields: Record<string, unknown>) {
  return PATCH(new Request("http://localhost/api/orders", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: ID, ...fields }),
  }));
}

test("N2 server-first: no cache/storage/event update before success; canonical note and shipper survive sync", async () => {
  const db = await seed();
  const before = storage.get("gieomo_orders");
  release = () => {};
  const pending = store.updateStoredOrderDetails(ID, { internalNote: "Mới", assignedShipperId: SHIPPER });
  assert.equal(storage.get("gieomo_orders"), before);
  assert.equal(local().assigned_shipper_id, null);
  assert.equal(events, 0);
  release!(); release = null;
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(local().internal_note, `Mới | ${RECEIPT} | ${AUDIT}`);
  assert.equal(local().assigned_shipper_id, SHIPPER);
  assert.equal(local().delivery_status, "packed");
  assert.equal(db.tables.orders[0].customer_note, "Khách nhờ gọi trước");
  await sync();
  assert.equal(local().internal_note, `Mới | ${RECEIPT} | ${AUDIT}`);
  assert.equal(local().assigned_shipper_id, SHIPPER);
  assert.equal(JSON.parse(storage.get("gieomo_orders")!)[0].assigned_shipper_id, SHIPPER);
  // A fresh module has no cachedOrders: it reloads the persisted browser snapshot.
  const reloadUrl = new URL("../src/lib/data/orderStore.ts?reload=n2", import.meta.url).href;
  const reloadedStore = await import(reloadUrl) as typeof store;
  assert.equal(reloadedStore.getStoredOrders()[0].assigned_shipper_id, SHIPPER);
  assert.equal(reloadedStore.getStoredOrders()[0].internal_note, `Mới | ${RECEIPT} | ${AUDIT}`);
  await new Promise<void>((resolve) => setImmediate(resolve));
});

for (const mode of ["http", "network", "body", "json"] as const) {
  test(`N2 ${mode} failure: old cache/storage remain; no success event`, async () => {
    await seed(); failure = mode;
    const before = storage.get("gieomo_orders");
    const result = await store.updateStoredOrderDetails(ID, { internalNote: "Mới", assignedShipperId: SHIPPER });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error);
    assert.equal(storage.get("gieomo_orders"), before);
    assert.equal(local().assigned_shipper_id, null);
    assert.equal(events, 0);
  });
}

test("N2 wrappers await server: clear note retains tags; assign/unassign shipper persists", async () => {
  await seed();
  assert.equal((await store.updateStoredOrderNotes(ID, { internal_note: "" })).success, true);
  assert.equal(local().internal_note, `${RECEIPT} | ${AUDIT}`);
  assert.equal(lastBody.internalNote, "");
  assert.equal((await store.updateOrderShipper("GM-N2", SHIPPER, "Shipper")).success, true);
  await sync(); assert.equal(local().assigned_shipper_id, SHIPPER);
  assert.equal((await store.updateOrderShipper("GM-N2", null, null)).success, true);
  await sync(); assert.equal(local().assigned_shipper_id, null);
  assert.equal(local().delivery_status, "packed");
});

test("N2 stale/tampered client proof is replaced with current server proof and audit", async () => {
  const db = await seed();
  const res = await patch({ internalNote: "Mới | [Ảnh biên lai]: https://test.invalid/stale.png | [HỦY THANH TOÁN] giả" });
  assert.equal(res.status, 200);
  assert.equal(db.tables.orders[0].internal_note, `Mới | ${RECEIPT} | ${AUDIT}`);
});

test("N2 null old note can be saved", async () => {
  await seed(null);
  assert.equal((await store.updateStoredOrderNotes(ID, { internal_note: "Đầu tiên" })).success, true);
  assert.equal(local().internal_note, "Đầu tiên");
});

test("N2 concurrent receipt update: 409, no partial shipper write or local mutation", async () => {
  const db = await seed();
  const before = storage.get("gieomo_orders");
  db.hook = (ctx) => { if (ctx.op === "update") db.tables.orders[0].internal_note = `Concurrent | ${RECEIPT}`; };
  const result = await store.updateStoredOrderDetails(ID, { internalNote: "Mới", assignedShipperId: SHIPPER });
  assert.equal(result.success, false);
  assert.equal(db.tables.orders[0].internal_note, `Concurrent | ${RECEIPT}`);
  assert.equal(db.tables.orders[0].assigned_shipper_id, null);
  assert.equal(storage.get("gieomo_orders"), before);
  assert.equal(events, 0);
});

test("N2 DB failure returns 500 and does not write either field", async () => {
  const db = await seed();
  db.hook = (ctx) => ctx.op === "update" ? { error: { message: "DB failed" } } : undefined;
  const res = await patch({ internalNote: "Mới", assignedShipperId: SHIPPER });
  assert.equal(res.status, 500);
  assert.equal(db.tables.orders[0].assigned_shipper_id, null);
  assert.match(db.tables.orders[0].internal_note, /Cũ/);
});

test("N2 authorization and field validation reject entire request", async () => {
  const db = await seed(); const before = structuredClone(db.tables.orders);
  g.__n2Deny = true;
  assert.equal((await patch({ internalNote: "Mới" })).status, 401);
  g.__n2Deny = false;
  for (const fields of [{ internalNote: null }, { internalNote: {} }, { assignedShipperId: "wh-1" }, { assignedShipperId: 42 }]) {
    assert.equal((await patch(fields)).status, 400);
  }
  assert.deepEqual(db.tables.orders, before);
});

test("N2 missing order is an error for note and shipper", async () => {
  const db = await seed(); db.tables.orders = [];
  assert.equal((await patch({ internalNote: "Mới" })).status, 404);
  assert.equal((await patch({ assignedShipperId: SHIPPER })).status, 404);
});

test("N2 proof-only PATCH preserves ordinary note while replacing receipt", async () => {
  const db = await seed();
  assert.equal((await patch({ paymentProof: "https://test.invalid/replacement.png" })).status, 200);
  assert.match(db.tables.orders[0].internal_note, /^Cũ/);
  assert.match(db.tables.orders[0].internal_note, /replacement\.png/);
  assert.ok(db.tables.orders[0].internal_note.includes(AUDIT));
});

test("N2 unsupported warehouse never writes cache or sends a request", async () => {
  await seed(); const before = storage.get("gieomo_orders"); lastBody = null;
  assert.equal(store.updateStoredOrderWarehouse(ID, "wh-2").success, false);
  assert.equal(storage.get("gieomo_orders"), before);
  assert.equal(lastBody, null);
  const ui = readFileSync(new URL("../src/app/admin/orders/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(ui, /value=\{warehouseId\}\s+disabled/);
  assert.doesNotMatch(ui, /updateStoredOrderWarehouse/);
  const handler = ui.slice(ui.indexOf("const handleSaveChanges"), ui.indexOf("if (!order) {"));
  assert.match(handler, /await updateStoredOrderDetails/);
  assert.ok(handler.indexOf("if (!result.success)") < handler.indexOf("setIsSavedNotice(true)"));
  assert.match(handler, /setIsSavedNotice\(false\)/);
});
