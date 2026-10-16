import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

const hooksSource = `
const MOCKS = {
  "next/server": "mock:next-server",
  "@/lib/supabase/admin": "mock:supabase-admin",
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
  if (url === "mock:next-server") {
    return { format: "module", shortCircuit: true, source: 'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { "content-type": "application/json" } }); } }' };
  }
  if (url === "mock:server-auth") {
    return { format: "module", shortCircuit: true, source: 'export async function requireAdmin() { return { authorized: true }; }' };
  }
  if (url === "mock:supabase-admin") {
    return { format: "module", shortCircuit: true, source: 'export function createAdminClient() { return { from(table) { return globalThis.__comboDb.from(table); }, rpc(name, args) { return globalThis.__comboDb.rpc(name, args); } }; }' };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P_MISSING = "99999999-9999-4999-8999-999999999999";
const V1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const V2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const V3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const V_UNKNOWN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9";
const COMBO1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

type Op = { table: string; action: string; payload?: unknown };
type Row = Record<string, any>;

const db: Record<string, Row[]> = {
  combos: [],
  combo_items: [],
  products: [],
  product_variants: [],
};
const ops: Op[] = [];
// Đếm số lần INSERT combo_items phải fail: 1 = fail lần INSERT mới (restore chạy
// thành công), 2 = fail cả INSERT mới lẫn INSERT restore.
let comboItemsInsertFailures = 0;
// One-shot: snapshot SELECT trên combo_items trả lỗi.
let failComboItemsSnapshot = false;
// One-shot: DELETE trên combo_items trả lỗi.
let failComboItemsDelete = false;

function writeOps(): Op[] {
  return ops.filter((o) => o.action !== "select");
}

function comboItemsOf(comboId: string): Row[] {
  return db.combo_items.filter((r) => r.combo_id === comboId);
}

function makeBuilder(table: string): unknown {
  const state = {
    action: "select" as "select" | "insert" | "update" | "delete",
    filters: [] as Array<[string, any]>,
    ilike: null as null | [string, string],
    limitN: null as null | number,
    payload: null as any,
    returning: false,
  };

  const exec = (mode: "many" | "maybeSingle" | "single") => {
    const rows = db[table] || [];
    if (state.action === "select") {
      if (table === "combo_items" && failComboItemsSnapshot) {
        failComboItemsSnapshot = false;
        ops.push({ table, action: "select" });
        return { data: null, error: { message: "simulated snapshot failure" } };
      }
      let out = rows.filter((r) => state.filters.every(([c, v]) => r[c] === v));
      if (state.ilike) {
        const [c, pattern] = state.ilike;
        const needle = pattern.replace(/^%/, "").replace(/%$/, "").toLowerCase();
        out = out.filter((r) => String(r[c] || "").toLowerCase().includes(needle));
      }
      if (state.limitN != null) out = out.slice(0, state.limitN);
      ops.push({ table, action: "select" });
      if (mode === "maybeSingle") return { data: out[0] ?? null, error: null };
      if (mode === "single") {
        return out[0]
          ? { data: out[0], error: null }
          : { data: null, error: { message: "no row" } };
      }
      return { data: out, error: null };
    }
    if (state.action === "insert") {
      ops.push({ table, action: "insert", payload: state.payload });
      if (table === "combo_items" && comboItemsInsertFailures > 0) {
        comboItemsInsertFailures -= 1;
        return { data: null, error: { message: "simulated insert failure" } };
      }
      const list = Array.isArray(state.payload) ? state.payload : [state.payload];
      const inserted = list.map((r) =>
        table === "combos" ? { combo_id: `new-combo-${ops.length}`, ...r } : { ...r }
      );
      db[table] = [...rows, ...inserted];
      if (state.returning) {
        if (mode === "single") return { data: inserted[0], error: null };
        return { data: inserted, error: null };
      }
      return { data: null, error: null };
    }
    if (state.action === "update") {
      const matched = rows.filter((r) => state.filters.every(([c, v]) => r[c] === v));
      for (const r of matched) Object.assign(r, state.payload);
      ops.push({ table, action: "update", payload: state.payload });
      return { data: matched, error: null };
    }
    if (table === "combo_items" && failComboItemsDelete) {
      failComboItemsDelete = false;
      ops.push({ table, action: "delete" });
      return { data: null, error: { message: "simulated delete failure" } };
    }
    const matched = rows.filter((r) => state.filters.every(([c, v]) => r[c] === v));
    db[table] = rows.filter((r) => !state.filters.every(([c, v]) => r[c] === v));
    ops.push({ table, action: "delete", payload: { count: matched.length } });
    return { data: matched, error: null };
  };

  const b: any = {
    select() {
      if (state.action !== "select") state.returning = true;
      return b;
    },
    insert(payload: unknown) {
      state.action = "insert";
      state.payload = payload;
      return b;
    },
    update(payload: unknown) {
      state.action = "update";
      state.payload = payload;
      return b;
    },
    delete() {
      state.action = "delete";
      return b;
    },
    eq(col: string, val: unknown) {
      state.filters.push([col, val]);
      return b;
    },
    ilike(col: string, val: string) {
      state.ilike = [col, val];
      return b;
    },
    limit(n: number) {
      state.limitN = n;
      return b;
    },
    maybeSingle() {
      return Promise.resolve(exec("maybeSingle"));
    },
    single() {
      return Promise.resolve(exec("single"));
    },
    then(resolve: any, reject: any) {
      return Promise.resolve(exec("many")).then(resolve, reject);
    },
  };
  return b;
}

const g = globalThis as unknown as {
  __comboDb: {
    from: (table: string) => unknown;
    rpc: (name: string, args: Record<string, any>) => Promise<{ data: any; error: any }>;
  };
};

async function rpc(name: string, args: Record<string, any>) {
  assert.equal(name, "save_combo_atomic");
  const p = args.p as Record<string, any>;
  const combosBefore = structuredClone(db.combos);
  const itemsBefore = structuredClone(db.combo_items);
  const existing = db.combos.find(
    (row) => row.combo_id === p.combo_id || (!p.combo_id && row.slug === p.lookup_slug)
  );
  const comboId = existing?.combo_id || `new-combo-${ops.length + 1}`;
  const header = Object.fromEntries(
    Object.entries(p).filter(
      ([key]) => !["combo_id", "lookup_slug", "replace_items", "items"].includes(key)
    )
  );

  try {
    if (existing) {
      Object.assign(existing, header);
      ops.push({ table: "combos", action: "update", payload: header });
    } else {
      db.combos.push({ combo_id: comboId, ...header });
      ops.push({ table: "combos", action: "insert", payload: header });
    }

    if (p.replace_items) {
      if (failComboItemsSnapshot) {
        failComboItemsSnapshot = false;
        throw new Error("simulated atomic validation failure");
      }
      if (failComboItemsDelete) {
        failComboItemsDelete = false;
        throw new Error("simulated atomic delete failure");
      }
      ops.push({ table: "combo_items", action: "delete" });
      db.combo_items = db.combo_items.filter((row) => row.combo_id !== comboId);
      if (comboItemsInsertFailures > 0) {
        comboItemsInsertFailures -= 1;
        throw new Error("simulated atomic insert failure");
      }
      const inserted = p.items.map((row: Row) => ({ combo_id: comboId, ...row }));
      db.combo_items.push(...inserted);
      ops.push({ table: "combo_items", action: "insert", payload: inserted });
    }

    const saved = db.combos.find((row) => row.combo_id === comboId)!;
    if (saved.status === "active" && !db.combo_items.some((row) => row.combo_id === comboId)) {
      throw new Error("C1:ACTIVE_COMBO_REQUIRES_ITEMS");
    }
    return { data: { outcome: "saved", combo_id: comboId }, error: null };
  } catch (error) {
    db.combos = combosBefore;
    db.combo_items = itemsBefore;
    return { data: null, error: { message: (error as Error).message } };
  }
}

g.__comboDb = { from: (table: string) => makeBuilder(table), rpc };

const { POST, PATCH } = await import("../src/app/api/combos/route.ts");

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/combos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new Request("http://localhost/api/combos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  db.combos = [{ combo_id: COMBO1, name: "Set Quà", slug: "set-qua", price: 180000 }];
  db.combo_items = [
    { combo_id: COMBO1, product_id: P1, variant_id: V1, quantity: 1 },
    { combo_id: COMBO1, product_id: P2, variant_id: V3, quantity: 2 },
  ];
  db.products = [
    { product_id: P1, name: "Áo Mầm Mơ", slug: "ao-mam-mo" },
    { product_id: P2, name: "Túi Tote", slug: "tui-tote" },
  ];
  db.product_variants = [
    { variant_id: V1, product_id: P1, name: "Trắng" },
    { variant_id: V2, product_id: P1, name: "Xanh" },
    { variant_id: V3, product_id: P2, name: "Hồng" },
  ];
  ops.length = 0;
  comboItemsInsertFailures = 0;
  failComboItemsSnapshot = false;
  failComboItemsDelete = false;
});

test("CR1 — POST combo mới với items có variant_id hợp lệ: ghi đủ mapping", async () => {
  const res = await post({
    name: "Set Mới",
    slug: "set-moi",
    price: 180000,
    items: [
      { product_id: P1, variant_id: V1, quantity: 2 },
      { product_id: P2, variant_id: V3, quantity: 1 },
    ],
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean; combo_id: string };
  assert.equal(body.success, true);
  const rows = comboItemsOf(body.combo_id);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => ({ product_id: r.product_id, variant_id: r.variant_id, quantity: r.quantity })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
    [
      { product_id: P1, variant_id: V1, quantity: 2 },
      { product_id: P2, variant_id: V3, quantity: 1 },
    ].sort((a, b) => a.product_id.localeCompare(b.product_id))
  );
});

test("CR2 — POST items thiếu variant_id: 400, không ghi bất kỳ dữ liệu nào", async () => {
  const res = await post({
    name: "Set Lỗi",
    slug: "set-loi",
    items: [{ product_id: P1, quantity: 1 }],
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /chưa chọn phân loại/);
  assert.match(body.error, /Thành phần #1/);
  assert.equal(writeOps().length, 0, "không được ghi gì khi validate fail");
  assert.equal(db.combos.length, 1, "combo không được tạo khi payload invalid");
});

test("CR3 — POST variant không tồn tại: 400, không ghi", async () => {
  const res = await post({
    name: "Set Lỗi Variant",
    slug: "set-loi-variant",
    items: [{ product_id: P1, variant_id: V_UNKNOWN, quantity: 1 }],
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /phân loại sản phẩm không tồn tại/);
  assert.equal(writeOps().length, 0);
});

test("CR4 — POST variant thuộc sản phẩm khác: 400, không ghi", async () => {
  const res = await post({
    name: "Set Sai Sản Phẩm",
    slug: "set-sai-sp",
    items: [{ product_id: P1, variant_id: V3, quantity: 1 }],
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /không thuộc sản phẩm đã chọn/);
  assert.equal(writeOps().length, 0);
});

test("CR5 — POST product không tồn tại: 400, không ghi", async () => {
  const res = await post({
    name: "Set Sản Phẩm Ảo",
    slug: "set-sp-ao",
    items: [{ product_id: P_MISSING, variant_id: V1, quantity: 1 }],
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /sản phẩm không tồn tại/);
  assert.equal(writeOps().length, 0);
});

test("CR6 — POST combo active với items rỗng: fail-closed và không ghi dữ liệu", async () => {
  const combosBefore = JSON.stringify(db.combos);
  const before = JSON.stringify(db.combo_items);
  const res = await post({ name: "Set Trống", slug: "set-trong", items: [] });
  assert.equal(res.status, 400);
  assert.equal(JSON.stringify(db.combos), combosBefore, "header active không được tạo thiếu mapping");
  assert.equal(JSON.stringify(db.combo_items), before, "combo_items không được thay đổi");
  assert.equal(writeOps().filter((o) => o.table === "combo_items").length, 0);
});

test("CR7 — POST cập nhật combo hiện có với items hợp lệ: thay thế có kiểm soát, mapping đủ variant", async () => {
  const res = await post({
    combo_id: COMBO1,
    name: "Set Quà",
    slug: "set-qua",
    items: [{ product_id: P1, variant_id: V2, quantity: 3 }],
  });
  assert.equal(res.status, 200);
  const rows = comboItemsOf(COMBO1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].variant_id, V2);
  assert.equal(rows[0].quantity, 3);
});

test("CR8 — PATCH đổi tên (không có items): không đụng combo_items, bảo toàn mapping", async () => {
  const before = JSON.stringify(db.combo_items);
  const res = await patch({ id: COMBO1, name: "Đổi Tên Mới" });
  assert.equal(res.status, 200);
  assert.equal(JSON.stringify(db.combo_items), before, "combo_items phải giữ nguyên tuyệt đối");
  assert.equal(writeOps().filter((o) => o.table === "combo_items").length, 0);
  assert.equal(db.combos[0].name, "Đổi Tên Mới");
});

test("CR9 — PATCH items hợp lệ: thay thế có kiểm soát, giữ nguyên variant_id", async () => {
  const res = await patch({
    id: COMBO1,
    items: [{ product_id: P1, variant_id: V1, quantity: 2 }],
  });
  assert.equal(res.status, 200);
  const rows = comboItemsOf(COMBO1);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { combo_id: COMBO1, product_id: P1, variant_id: V1, quantity: 2 });
});

test("CR10 — PATCH sửa trường không liên quan KÈM items thiếu variant: 400, không update header", async () => {
  const res = await patch({
    id: COMBO1,
    name: "Tên Sẽ Không Được Ghi",
    items: [{ product_id: P1, quantity: 1 }],
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /chưa chọn phân loại/);
  assert.equal(writeOps().length, 0, "validate phải chạy trước mọi write");
  assert.equal(db.combos[0].name, "Set Quà", "header không được cập nhật khi payload invalid");
  assert.equal(JSON.stringify(comboItemsOf(COMBO1)), JSON.stringify(db.combo_items), "combo_items giữ nguyên");
});

test("CR11 — PATCH items null / không phải mảng: 400, không ghi", async () => {
  const resNull = await patch({ id: COMBO1, items: null });
  assert.equal(resNull.status, 400);
  const bodyNull = (await resNull.json()) as { error: string };
  assert.match(bodyNull.error, /phải là mảng/);

  const resObj = await patch({ id: COMBO1, items: { product_id: P1 } });
  assert.equal(resObj.status, 400);
  assert.equal(writeOps().length, 0);
});

test("CR12 — PATCH items rỗng: không đụng combo_items", async () => {
  const before = JSON.stringify(db.combo_items);
  const res = await patch({ id: COMBO1, name: "Đổi Tên", items: [] });
  assert.equal(res.status, 200);
  assert.equal(JSON.stringify(db.combo_items), before);
  assert.equal(writeOps().filter((o) => o.table === "combo_items").length, 0);
});

test("CR13 — PATCH resolve sản phẩm qua slug + variant hợp lệ: ghi đúng product/variant", async () => {
  const res = await patch({
    id: COMBO1,
    items: [{ slug: "ao-mam-mo", variant_id: V1, quantity: 4 }],
  });
  assert.equal(res.status, 200);
  const rows = comboItemsOf(COMBO1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].product_id, P1);
  assert.equal(rows[0].variant_id, V1);
  assert.equal(rows[0].quantity, 4);
});

test("CR14 — PATCH variant_id sai format: 400, không ghi", async () => {
  const res = await patch({
    id: COMBO1,
    items: [{ product_id: P1, variant_id: "khong-phai-uuid", quantity: 1 }],
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /variant_id không hợp lệ/);
  assert.equal(writeOps().length, 0);
});

test("CR15 — Ghi combo_items fail giữa chừng: transaction rollback mapping cũ", async () => {
  const before = JSON.stringify(db.combo_items);
  comboItemsInsertFailures = 1;
  const res = await patch({
    id: COMBO1,
    items: [{ product_id: P1, variant_id: V2, quantity: 9 }],
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /atomic insert failure/);
  assert.equal(
    JSON.stringify(db.combo_items),
    before,
    "combo_items cũ (kể cả variant_id) phải được khôi phục nguyên vẹn"
  );
});

test("CR16 — POST items có phần tử thiếu variant sau phần tử hợp lệ: vẫn 400, không ghi gì", async () => {
  const res = await post({
    name: "Set Nửa Vời",
    slug: "set-nua-vi",
    items: [
      { product_id: P1, variant_id: V1, quantity: 1 },
      { product_id: P2, quantity: 1 },
    ],
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /Thành phần #2/);
  assert.match(body.error, /chưa chọn phân loại/);
  assert.equal(writeOps().length, 0, "validate toàn bộ trước khi ghi — kể cả khi phần tử đầu hợp lệ");
});

test("CR17 — INSERT fail: header và mapping cùng rollback, không còn nhánh restore thủ công", async () => {
  const combosBefore = JSON.stringify(db.combos);
  const itemsBefore = JSON.stringify(db.combo_items);
  comboItemsInsertFailures = 2;
  const res = await patch({
    id: COMBO1,
    name: "Header Vẫn Được Ghi",
    items: [{ product_id: P1, variant_id: V2, quantity: 9 }],
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { success: boolean; error: string; combo_id?: string };
  assert.equal(body.success, false);
  assert.match(body.error, /atomic insert failure/);
  assert.equal(body.combo_id, undefined);
  assert.equal(JSON.stringify(db.combos), combosBefore, "header rollback cùng transaction");
  assert.equal(JSON.stringify(db.combo_items), itemsBefore, "mapping cũ giữ nguyên sau rollback");
});

test("CR18 — POST không có key items (đường rename/status thực tế của UI): không đụng combo_items", async () => {
  const before = JSON.stringify(db.combo_items);
  const res = await post({ combo_id: COMBO1, name: "Đổi Tên Qua POST", slug: "set-qua" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { success: boolean };
  assert.equal(body.success, true);
  assert.equal(db.combos[0].name, "Đổi Tên Qua POST");
  assert.equal(JSON.stringify(db.combo_items), before, "combo_items giữ nguyên tuyệt đối");
  assert.equal(writeOps().filter((o) => o.table === "combo_items").length, 0);
});

test("CR19 — validation trong RPC fail: header và component cùng rollback", async () => {
  const combosBefore = JSON.stringify(db.combos);
  const itemsBefore = JSON.stringify(db.combo_items);
  failComboItemsSnapshot = true;
  const res = await patch({
    id: COMBO1,
    name: "Tên Đã Được Ghi Trước Lỗi",
    items: [{ product_id: P1, variant_id: V1, quantity: 2 }],
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { success: boolean; error: string; combo_id?: string };
  assert.equal(body.success, false);
  assert.match(body.error, /atomic validation failure/);
  assert.equal(body.combo_id, undefined);
  assert.equal(JSON.stringify(db.combos), combosBefore, "header rollback khi validation fail");
  assert.equal(JSON.stringify(db.combo_items), itemsBefore, "component chưa bị đụng tới");
});

test("CR20 — DELETE fail: cả header và component rollback", async () => {
  const combosBefore = JSON.stringify(db.combos);
  const itemsBefore = JSON.stringify(db.combo_items);
  failComboItemsDelete = true;
  const res = await patch({
    id: COMBO1,
    name: "Tên Sau Lỗi Delete",
    items: [{ product_id: P1, variant_id: V1, quantity: 2 }],
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.match(body.error, /atomic delete failure/);
  assert.equal(JSON.stringify(db.combos), combosBefore);
  assert.equal(JSON.stringify(db.combo_items), itemsBefore, "DELETE fail → mapping cũ nguyên vẹn, không INSERT nào chạy");
});

test("CR21 — POST tạo mới rồi INSERT component fail: không để lại header hoặc mapping", async () => {
  const combosBefore = JSON.stringify(db.combos);
  comboItemsInsertFailures = 1;
  const res = await post({
    name: "Set Mới Lỗi Component",
    slug: "set-moi-loi-component",
    items: [{ product_id: P1, variant_id: V1, quantity: 1 }],
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { success: boolean; error: string; combo_id?: string };
  assert.equal(body.success, false);
  assert.equal(body.combo_id, undefined);
  assert.match(body.error, /atomic insert failure/);
  assert.equal(JSON.stringify(db.combos), combosBefore, "header mới rollback");
  assert.equal(db.combo_items.some((row) => row.combo_id.startsWith("new-combo-")), false);
});

test("CR22 — PATCH chỉ đổi status (không gửi items): mapping không đổi", async () => {
  const before = JSON.stringify(db.combo_items);
  const res = await patch({ id: COMBO1, status: "draft" });
  assert.equal(res.status, 200);
  assert.equal(db.combos[0].status, "draft");
  assert.equal(JSON.stringify(db.combo_items), before, "mapping giữ nguyên");
  assert.equal(writeOps().filter((o) => o.table === "combo_items").length, 0);
});

test("CR23 — quantity thiếu/sai kiểu/0/âm/thập phân → 400 trước mọi write; số nguyên dương hợp lệ vẫn được nhận", async () => {
  const invalids: unknown[] = [undefined, null, 0, -1, 1.5, "abc", "", true, {}, NaN];
  for (const q of invalids) {
    const item: Record<string, unknown> = { product_id: P1, variant_id: V1 };
    if (q !== undefined) item.quantity = q;
    const res = await post({
      name: "Set Quantity Lỗi",
      slug: "set-qty-loi",
      items: [item],
    });
    assert.equal(res.status, 400, `quantity=${JSON.stringify(q) ?? String(q)} phải bị 400`);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /quantity/, `lỗi phải nêu rõ quantity (nhận: ${String(q)})`);
    assert.equal(writeOps().length, 0, "reject trước mọi write");
  }
  // Tương thích payload hợp lệ: chuỗi số nguyên dương được chấp nhận.
  const ok = await post({
    name: "Set Quantity Hợp Lệ",
    slug: "set-qty-hop-le",
    items: [{ product_id: P1, variant_id: V1, quantity: "3" }],
  });
  assert.equal(ok.status, 200);
  const okBody = (await ok.json()) as { combo_id: string };
  const rows = comboItemsOf(okBody.combo_id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 3, "chuỗi số nguyên dương parse thành 3");
});
