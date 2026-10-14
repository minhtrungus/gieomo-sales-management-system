import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Voucher } from "../src/types/database";

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
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if (isRelative && !name.includes(".")) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

type StubResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
type FetchHandler = (url: string, init?: RequestInit) => Promise<StubResponse>;

const storage = new Map<string, string>();

const g = globalThis as unknown as {
  window: typeof globalThis;
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
  dispatchEvent(event: Event): boolean;
  fetch: (url: string, init?: RequestInit) => Promise<unknown>;
};

g.window = globalThis;
g.localStorage = {
  getItem: (key) => (storage.has(key) ? (storage.get(key) as string) : null),
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
  removeItem: (key) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
};
g.dispatchEvent = () => true;

const defaultHandler: FetchHandler = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: false }),
});
let fetchHandler: FetchHandler = defaultHandler;
g.fetch = (url, init) => fetchHandler(url, init);

const { saveNewVoucher, updateStoredVoucher, deleteStoredVoucher, getStoredVouchers } = await import(
  "../src/lib/data/orderStore.ts"
);

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    voucher_id: "v-test-1",
    code: "FSTEST",
    discount_type: "freeship",
    discount_value: 1,
    min_order_value: 0,
    usage_limit: null,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const httpOk = (body: unknown = { success: true }): StubResponse => ({
  ok: true,
  status: 200,
  json: async () => body,
});
const httpError = (status: number, body: unknown): StubResponse => ({
  ok: false,
  status,
  json: async () => body,
});

test("seed: getStoredVouchers đọc voucher cũ từ localStorage", () => {
  storage.set(
    "gieomo_vouchers",
    JSON.stringify([makeVoucher({ voucher_id: "v-old", code: "OLD1" })])
  );
  const list = getStoredVouchers();
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "OLD1");
});

test("saveNewVoucher: HTTP 200 → ghi local sau khi server xác nhận", async () => {
  fetchHandler = async () => httpOk();
  await saveNewVoucher(makeVoucher());
  const list = getStoredVouchers();
  assert.equal(list.length, 2);
  assert.equal(list[0].code, "FSTEST");
  const persisted = JSON.parse(storage.get("gieomo_vouchers") as string);
  assert.equal(persisted[0].code, "FSTEST");
});

test("saveNewVoucher: HTTP 400 → throw message server, KHÔNG ghi local", async () => {
  fetchHandler = async () => httpError(400, { success: false, error: "Mã đã tồn tại" });
  await assert.rejects(
    saveNewVoucher(makeVoucher({ voucher_id: "v-bad", code: "BAD1" })),
    /Mã đã tồn tại/
  );
  const list = getStoredVouchers();
  assert.equal(list.length, 2);
  assert.equal(list.some((v) => v.code === "BAD1"), false);
});

test("saveNewVoucher: lỗi mạng → throw, KHÔNG ghi local", async () => {
  fetchHandler = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(
    saveNewVoucher(makeVoucher({ voucher_id: "v-net", code: "NET1" })),
    /fetch failed/
  );
  assert.equal(getStoredVouchers().length, 2);
});

test("updateStoredVoucher: HTTP 500 → throw, giữ nguyên trạng thái cũ", async () => {
  fetchHandler = async () => httpError(500, { success: false, error: "Lỗi máy chủ" });
  await assert.rejects(
    updateStoredVoucher(makeVoucher({ voucher_id: "v-test-1", status: "inactive" })),
    /Lỗi máy chủ/
  );
  const fs = getStoredVouchers().find((v) => v.code === "FSTEST");
  assert.equal(fs?.status, "active");
});

test("updateStoredVoucher: HTTP 200 → cập nhật local", async () => {
  fetchHandler = async () => httpOk();
  await updateStoredVoucher(makeVoucher({ voucher_id: "v-test-1", status: "inactive" }));
  const fs = getStoredVouchers().find((v) => v.code === "FSTEST");
  assert.equal(fs?.status, "inactive");
});

test("deleteStoredVoucher: HTTP 500 → throw, voucher vẫn còn", async () => {
  fetchHandler = async () => httpError(500, { success: false, error: "Xóa thất bại" });
  await assert.rejects(deleteStoredVoucher("v-test-1"), /Xóa thất bại/);
  assert.equal(
    getStoredVouchers().some((v) => v.code === "FSTEST"),
    true
  );
});

test("deleteStoredVoucher: HTTP 200 → xóa khỏi local", async () => {
  fetchHandler = async () => httpOk();
  await deleteStoredVoucher("v-test-1");
  const list = getStoredVouchers();
  assert.equal(list.some((v) => v.code === "FSTEST"), false);
  assert.equal(list.length, 1);
  fetchHandler = defaultHandler;
});
