import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createFakeOrderDb, type FakeOrderDb } from "./helpers/fakeOrderDb.ts";

/**
 * Batch B — object-level authorization của POST /api/orders/proof (THẬT).
 *
 * Ba nhánh authz của route: admin session | capability token (code-bound) |
 * exact phone-match. Test chứng minh:
 * - Sai phone + không token → 403.
 * - Token ký cho đơn KHÁC → 403 (mã đơn trong token phải khớp).
 * - Phone đúng / token đúng → vượt authz (rồi 400 vì thiếu ảnh — không 403).
 * - Đơn đã paid → 409 chặn nộp biên lai (kể cả phone đúng).
 *
 * MOCK: next/server + @/lib/supabase/admin. serverAuth THẬT (token HMAC thật).
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

process.env.ADMIN_SESSION_SECRET = "test-secret-proof-ownership-b";

const hooksSource = `
const MOCKS = {
  "next/server": "mock:next-server",
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
  if (url === "mock:next-server") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        "export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { 'content-type': 'application/json' } }); } }",
    };
  }
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: "export function createAdminClient() { return globalThis.__fakeOrderDb; }",
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { POST: PROOF_POST } = await import("../src/app/api/orders/proof/route.ts");
const { createOrderProofToken, createSessionToken } = await import("../src/lib/auth/serverAuth.ts");

const ORDER_CODE = "GM-PR0001";
const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECEIVER_PHONE = "0901234567";
const OTHER_CODE = "GM-OTHER9";
const AUTH_VERSION = "2026-10-23T00:00:00.000Z";

const g = globalThis as unknown as { __fakeOrderDb?: unknown };

function seedDb(payment_status = "pending", orderCode = ORDER_CODE): FakeOrderDb {
  const db = createFakeOrderDb({
    orders: [
      {
        order_id: ORDER_ID,
        order_code: orderCode,
        customer_id: null,
        receiver_name: "Nguyen Van A",
        receiver_phone: RECEIVER_PHONE,
        payment_status,
        order_status: "pending",
        internal_note: null,
      },
    ],
    members: [{
      member_id: "33333333-3333-4333-8333-333333333333",
      email: "admin@test.local",
      full_name: "Admin",
      referral_code: "ADMN",
      role: "admin",
      status: "active",
      updated_at: AUTH_VERSION,
    }],
  });
  g.__fakeOrderDb = db;
  return db;
}

function addStorage(db: FakeOrderDb, uploadError: { message: string } | null = null) {
  const storage = {
    from: () => ({
      upload: async () => ({ error: uploadError }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://proof.test/${path}` } }),
    }),
  };
  Object.assign(db, { storage });
}

function pngFile(): File {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  return new File([bytes], "proof.png", { type: "image/png" });
}

function proofFormReq(orderCode: string, phone: string, file: File): Promise<Response> {
  const form = new FormData();
  form.set("orderCode", orderCode);
  form.set("phone", phone);
  form.set("file", file);
  return PROOF_POST(new Request("http://localhost/api/orders/proof", { method: "POST", body: form }));
}

function proofReq(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return PROOF_POST(
    new Request("http://localhost/api/orders/proof", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
}

const adminToken = () =>
  createSessionToken({
    memberId: "33333333-3333-4333-8333-333333333333",
    email: "admin@test.local",
    fullName: "Admin",
    referralCode: "ADMN",
    role: "admin",
    authVersion: AUTH_VERSION,
  });

test("B7 — sai phone, không token → 403 (ownership chặn)", async () => {
  seedDb();
  const res = await proofReq({ orderCode: ORDER_CODE, phone: "0999999999" });
  assert.equal(res.status, 403);
});

test("B8 — token ký cho đơn KHÁC + không phone → 403 (token bound theo mã đơn)", async () => {
  seedDb();
  const foreignToken = createOrderProofToken(OTHER_CODE, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  const res = await proofReq({ orderCode: ORDER_CODE, token: foreignToken });
  assert.equal(res.status, 403);
});

test("B9 — phone đúng (exact match receiver) vượt authz → 400 thiếu ảnh (KHÔNG phải 403)", async () => {
  seedDb();
  const res = await proofReq({ orderCode: ORDER_CODE, phone: RECEIVER_PHONE });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(!String(body.error).includes("quyền"), "không dính lỗi ownership");
});

test("B10 — token ĐÚNG cho đơn này vượt authz → 400 thiếu ảnh", async () => {
  seedDb();
  const token = createOrderProofToken(ORDER_CODE, ORDER_ID);
  const res = await proofReq({ orderCode: ORDER_CODE, token });
  assert.equal(res.status, 400);
});

test("B11 — admin session vượt authz → 400 thiếu ảnh (không 403)", async () => {
  seedDb();
  const res = await proofReq(
    { orderCode: ORDER_CODE },
    { authorization: `Bearer ${adminToken()}` }
  );
  assert.equal(res.status, 400);
});

test("B12 — đơn đã paid: phone đúng vẫn bị 409 (chặn nộp biên lai mới)", async () => {
  seedDb("paid");
  const res = await proofReq({ orderCode: ORDER_CODE, phone: RECEIVER_PHONE });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.isPaid, true);
});

test("B13 — order code không tồn tại → 404", async () => {
  seedDb();
  const res = await proofReq({ orderCode: "GM-NOPE99", phone: RECEIVER_PHONE });
  assert.equal(res.status, 404);
});

test("B14 — canonical GM-YYMMDD-sequence vượt validation và upload thành công", async () => {
  const canonicalCode = "GM-260901-000001";
  const db = seedDb("pending", canonicalCode);
  addStorage(db);
  const res = await proofFormReq(canonicalCode.toLowerCase(), RECEIVER_PHONE, pngFile());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.orderCode, canonicalCode);
  assert.match(body.paymentProof, /proof-GM-260901-000001-/);
  assert.match(String(db.tables.orders[0].internal_note), /\[Ảnh biên lai\]: https:\/\/proof\.test\//);
});

test("B15 — lỗi storage trả 500 và không ghi proof vào DB", async () => {
  const canonicalCode = "GM-260901-000002";
  const db = seedDb("pending", canonicalCode);
  addStorage(db, { message: "storage unavailable" });
  const res = await proofFormReq(canonicalCode, RECEIVER_PHONE, pngFile());
  assert.equal(res.status, 500);
  assert.equal(db.tables.orders[0].internal_note, null);
});

test("B16 — thiếu hoặc sai format mã đơn bị chặn trước lookup", async () => {
  seedDb();
  assert.equal((await proofReq({ phone: RECEIVER_PHONE })).status, 400);
  assert.equal((await proofReq({ orderCode: "GM-260901-1", phone: RECEIVER_PHONE })).status, 400);
});
