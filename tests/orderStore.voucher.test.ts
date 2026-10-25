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

function serverVoucher(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...makeVoucher(),
    voucher_id: "11111111-1111-4111-8111-111111111111",
    times_used: 0,
    start_date: null,
    end_date: null,
    ...overrides,
  };
}

const httpOk = (body: unknown = { success: true, voucher: serverVoucher() }): StubResponse => ({
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
  fetchHandler = async () => httpOk({ success: true, voucher: serverVoucher({ status: "inactive" }) });
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
  fetchHandler = async () => httpOk({ success: true });
  await deleteStoredVoucher("v-test-1");
  const list = getStoredVouchers();
  assert.equal(list.some((v) => v.code === "FSTEST"), false);
  assert.equal(list.length, 1);
  fetchHandler = defaultHandler;
});

test("mutation response errors preserve local storage, cached vouchers and events", async () => {
  const beforeStorage = [...storage.entries()];
  const beforeVouchers = structuredClone(getStoredVouchers());
  let events = 0;
  const previousDispatch = g.dispatchEvent;
  g.dispatchEvent = () => { events++; return true; };
  try {
    const invalidBodies: unknown[] = [
      { success: false, error: "Server did not save voucher" },
      null, [], { success: "true" }, { success: true },
      { success: true, voucher: null },
      ...[
        { voucher_id: "local-id" }, { code: "OTHER" },
        { discount_type: "unknown" }, { discount_type: ["freeship"] },
        { discount_value: 0 }, { discount_value: 15000 }, { discount_value: "Infinity" },
        { min_order_value: -1 }, { times_used: 0.5 }, { usage_limit: 0 },
        { status: "inactive" }, { status: ["active"] },
        { created_at: "invalid" }, { start_date: "invalid" },
      ].map((fields) => ({ success: true, voucher: serverVoucher(fields) })),
    ];
    for (const body of invalidBodies) {
      fetchHandler = async () => httpOk(body);
      await assert.rejects(saveNewVoucher(makeVoucher()));
      assert.deepEqual([...storage.entries()], beforeStorage);
      assert.deepEqual(getStoredVouchers(), beforeVouchers);
    }
    fetchHandler = async () => ({ ok: true, status: 200, json: async () => { throw new Error("invalid JSON"); } });
    await assert.rejects(saveNewVoucher(makeVoucher()), /JSON/);
    fetchHandler = async () => httpOk({ success: false });
    await assert.rejects(updateStoredVoucher(makeVoucher()));
    await assert.rejects(deleteStoredVoucher("v-old"));
    fetchHandler = async () => httpError(500, { success: true, voucher: serverVoucher() });
    await assert.rejects(saveNewVoucher(makeVoucher()), /HTTP 500/);
    assert.deepEqual([...storage.entries()], beforeStorage);
    assert.deepEqual(getStoredVouchers(), beforeVouchers);
    assert.equal(events, 0);
  } finally {
    g.dispatchEvent = previousDispatch;
    fetchHandler = defaultHandler;
  }
});

test("numeric PostgREST fields and normalized freeship value are valid", async () => {
  fetchHandler = async () => httpOk({
    success: true,
    voucher: serverVoucher({ discount_value: "1", min_order_value: "0", times_used: "0", usage_limit: "5" }),
  });
  await saveNewVoucher(makeVoucher({ discount_value: 15000 }));
  assert.equal(getStoredVouchers().some((voucher) => voucher.code === "FSTEST"), true);
  fetchHandler = defaultHandler;
});

test("saveNewVoucher: HTTP 409 duplicate code → throw, KHÔNG ghi local", async () => {
  fetchHandler = async () => httpError(409, {
    success: false,
    error: 'Mã giảm giá "SUMMER20" đã tồn tại. Vui lòng chọn mã khác.',
  });
  await assert.rejects(
    saveNewVoucher(makeVoucher({ voucher_id: "v-dup", code: "SUMMER20" })),
    /đã tồn tại/
  );
  assert.equal(getStoredVouchers().some((v) => v.code === "SUMMER20"), false);
  fetchHandler = defaultHandler;
});

test("updateStoredVoucher: HTTP 409 đổi sang mã của voucher khác → throw, giữ nguyên local", async () => {
  // Seed two vouchers via saveNewVoucher so cache is consistent
  fetchHandler = async () => httpOk({ success: true, voucher: serverVoucher({ voucher_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "CODE_A" }) });
  await saveNewVoucher(makeVoucher({ voucher_id: "v-a", code: "CODE_A" }));
  fetchHandler = async () => httpOk({ success: true, voucher: serverVoucher({ voucher_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", code: "CODE_B" }) });
  await saveNewVoucher(makeVoucher({ voucher_id: "v-b", code: "CODE_B" }));

  // Now try to change A's code to B's code → 409
  fetchHandler = async () => httpError(409, {
    success: false,
    error: 'Mã giảm giá "CODE_B" đã tồn tại. Vui lòng chọn mã khác.',
  });
  await assert.rejects(
    updateStoredVoucher(makeVoucher({ voucher_id: "v-a", code: "CODE_B" })),
    /đã tồn tại/
  );
  const list = getStoredVouchers();
  assert.equal(list.find((v) => v.code === "CODE_A") !== undefined, true, "voucher A giữ nguyên mã CODE_A");
  assert.equal(list.find((v) => v.code === "CODE_B") !== undefined, true, "voucher B không bị ghi đè");
  fetchHandler = defaultHandler;
});

test("updateStoredVoucher: HTTP 200 đổi mã mới → cập nhật local", async () => {
  // Seed one voucher
  fetchHandler = async () => httpOk({ success: true, voucher: serverVoucher({ voucher_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", code: "OLD_CODE" }) });
  await saveNewVoucher(makeVoucher({ voucher_id: "v-c", code: "OLD_CODE" }));

  // Change code to NEW_CODE
  fetchHandler = async () => httpOk({ success: true, voucher: serverVoucher({ voucher_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", code: "NEW_CODE" }) });
  await updateStoredVoucher(makeVoucher({ voucher_id: "v-c", code: "NEW_CODE" }));
  const list = getStoredVouchers();
  assert.equal(list.find((v) => v.voucher_id === "v-c")?.code, "NEW_CODE");
  assert.equal(list.some((v) => v.code === "OLD_CODE"), false);
  fetchHandler = defaultHandler;
});
