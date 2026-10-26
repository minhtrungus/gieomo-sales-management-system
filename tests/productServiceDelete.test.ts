import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

/**
 * Batch 2G.2 — unit/mock tests cho deleteProductServer (productService):
 * lỗi xóa variant PHẢI được trả về, KHÔNG được tiếp tục xóa product.
 *
 * Trước 2G.2: result của variant-delete bị nuốt (không check) → với FK
 * ledger chặn (RESTRICT) hoặc bất kỳ lỗi variant-delete nào, hàm vẫn
 * tiếp tục products.delete → half-delete / lỗi khó hiểu.
 *
 * Map yêu cầu → tests:
 *   D1  single: variant-delete lỗi → success:false, KHÔNG gọi products.delete
 *   D2  single: mọi bước ok → success:true, đúng thứ tự 4 bước
 *   D3  all: variant-delete lỗi → success:false, KHÔNG gọi products.delete
 *   D4  all: variant-delete lỗi KHÔNG được nuốt (message có cấu trúc)
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
      source: "export function createAdminClient() { return globalThis.__fakeDeleteDb; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { deleteProductServer } = await import("../src/lib/services/productService.ts");

const g = globalThis as unknown as { __fakeDeleteDb?: unknown };

const PRODUCT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Call = { table: string; op: string; filters: [string, unknown][] };
type Behavior = (call: Call) => { data?: unknown; error?: { code?: string; message: string } } | undefined;
interface MockQuery {
  delete(): MockQuery;
  select(): MockQuery;
  eq(col: string, val: unknown): MockQuery;
  neq(col: string, val: unknown): MockQuery;
  or(): MockQuery;
  maybeSingle(): MockQuery;
  then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown): Promise<unknown>;
}

/** Chainable mock PostgREST: delete/select + eq/neq/or + maybeSingle, thenable. */
function makeDb(behavior: Behavior, calls: Call[] = []) {
  const client = {
    from(table: string) {
      const state = { op: "select", filters: [] as [string, unknown][] };
      const api: MockQuery = {
        delete() {
          state.op = "delete";
          return api;
        },
        select() {
          return api;
        },
        eq(col: string, val: unknown) {
          state.filters.push([col, val]);
          return api;
        },
        neq(col: string, val: unknown) {
          state.filters.push([`${col}__neq`, val]);
          return api;
        },
        or() {
          return api;
        },
        maybeSingle() {
          state.op = "maybeSingle";
          return api;
        },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          const call: Call = { table, op: state.op, filters: state.filters };
          calls.push(call);
          const r = behavior(call);
          const result = r === undefined ? { data: null, error: null } : { data: r.data ?? null, error: r.error ?? null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return api;
    },
  };
  g.__fakeDeleteDb = client;
  return { calls };
}

function productsDeleteCalls(calls: Call[]) {
  return calls.filter((c) => c.table === "products" && c.op === "delete");
}

// ---- D1: single — variant-delete lỗi → fail, KHÔNG đụng products ----
test("D1 — single: variant-delete lỗi → success:false, KHÔNG gọi products.delete", async () => {
  const { calls } = makeDb((call) => {
    if (call.table === "product_variants" && call.op === "delete") {
      return {
        error: {
          code: "23503",
          message:
            'delete on table "product_variants" violates foreign key constraint "inventory_adjustments_variant_id_fkey"',
        },
      };
    }
    return undefined;
  });

  const res = await deleteProductServer(PRODUCT_ID);
  assert.equal(res.success, false, "variant-delete fail phải trả success:false");
  assert.ok(res.error, "phải có thông điệp lỗi");
  assert.match(res.error!, /Không thể xóa biến thể sản phẩm/);
  assert.match(res.error!, /23503|violates foreign key/, "giữ nguyên chi tiết FK để điều tra");
  assert.equal(productsDeleteCalls(calls).length, 0, "KHÔNG được tiếp tục products.delete");
});

// ---- D2: single — mọi bước ok → success, đúng thứ tự ----
test("D2 — single: toàn bộ ok → success:true, đúng thứ tự combo → media → variants → products", async () => {
  const { calls } = makeDb(() => undefined);

  const res = await deleteProductServer(PRODUCT_ID);
  assert.equal(res.success, true, res.error);

  const deleteTables = calls.filter((c) => c.op === "delete").map((c) => c.table);
  assert.deepEqual(deleteTables, ["combo_items", "product_media", "product_variants", "products"]);
});

// ---- D3: all — variant-delete lỗi → fail, KHÔNG đụng products ----
test("D3 — all: variant-delete lỗi → success:false, KHÔNG gọi products.delete", async () => {
  const { calls } = makeDb((call) => {
    if (call.table === "product_variants" && call.op === "delete") {
      return { error: { code: "23503", message: "restricted by ledger" } };
    }
    return undefined;
  });

  const res = await deleteProductServer("all");
  assert.equal(res.success, false);
  assert.match(res.error!, /Không thể xóa biến thể sản phẩm/);
  assert.equal(productsDeleteCalls(calls).length, 0, "KHÔNG được tiếp tục products.delete (all)");
});

// ---- D4: lỗi variant KHÔNG bị nuốt — message có cấu trúc + cảnh báo partial ----
test("D4 — lỗi variant có cấu trúc, nhắc nhở các bước trước có thể đã commit (không giả định atomic)", async () => {
  makeDb((call) => {
    if (call.table === "product_variants" && call.op === "delete") {
      return { error: { code: "23503", message: "violates FK" } };
    }
    return undefined;
  });

  const res = await deleteProductServer(PRODUCT_ID);
  assert.equal(res.success, false);
  assert.ok(res.error && res.error.length > 0, "lỗi không được rỗng/nuốt");
  assert.match(res.error!, /combo\/media/, "cảnh báo bước trước có thể đã commit");
});
