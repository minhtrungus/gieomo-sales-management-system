import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHmac } from "crypto";

/**
 * Batch C12 — order proof capability token TTL.
 *
 * Bug: token = HMAC(code:orderId) không có timestamp → valid vô thời hạn.
 * Leak token (email/history/share link) = quyền nộp biên lai vĩnh viễn.
 * Fix: payload thêm iat (epoch giây); verify bắt buộc iat trong TTL
 * (mặc định 7 ngày = session TTL, override env PROOF_TOKEN_TTL_HOURS) và
 * không quá tương lai (skew 5 phút). Legacy token 2 phần → false.
 *
 * Đường auth thay thế tại /api/orders/proof: exact phone-match vẫn hoạt
 * động cho khách khi token hết hạn (proof route.ts:114-126) — không có
 * business regression: token chỉ là convenience path.
 *
 * MOCK: next/server + @/lib/supabase/admin (serverAuth import chúng).
 * Function create/verify là THẬT — HMAC với secret test dummy trong env.
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

// Secret test deterministic — KHÔNG phải secret thật, không in giá trị ra log.
process.env.ADMIN_SESSION_SECRET = "test-secret-proof-token-c12";
delete process.env.PROOF_TOKEN_TTL_HOURS;

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
        "export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200 }); } }",
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

const { createOrderProofToken, verifyOrderProofToken } = await import(
  "../src/lib/auth/serverAuth.ts"
);

const ORDER_CODE = "GM-C12T0K";
const ORDER_ID = "99999999-9999-4999-8999-999999999999";

function craftToken(payload: string): string {
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", process.env.ADMIN_SESSION_SECRET!)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

test("C12-T1 — token mới (có iat) tạo→verify hợp lệ trong TTL", () => {
  const token = createOrderProofToken(ORDER_CODE, ORDER_ID);
  assert.equal(verifyOrderProofToken(token, ORDER_CODE), true);
  // order code check không phân biệt hoa thường
  assert.equal(verifyOrderProofToken(token, ORDER_CODE.toLowerCase()), true);
});

test("C12-T2 — token không khớp order code → false", () => {
  const token = createOrderProofToken(ORDER_CODE, ORDER_ID);
  assert.equal(verifyOrderProofToken(token, "GM-OTHER1"), false);
});

test("C12-T3 — payload bị sửa nhưng giữ nguyên chữ ký (tamper) → false", () => {
  const token = createOrderProofToken(ORDER_CODE, ORDER_ID);
  const [payloadB64, sig] = token.split(".");
  const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
  const tamperedB64 = Buffer.from(payload.replace(`:${ORDER_ID}`, ":other-id")).toString("base64url");
  assert.equal(verifyOrderProofToken(`${tamperedB64}.${sig}`, ORDER_CODE), false);
});

test("C12-T4 — token hết hạn (iat quá cũ hơn TTL) → false", () => {
  const now = Math.floor(Date.now() / 1000);
  const oldIat = now - (7 * 24 * 3600 + 3600); // 8 ngày trước (TTL mặc định 7 ngày)
  const expired = craftToken(`${ORDER_CODE}:${ORDER_ID}:${oldIat}`);
  assert.equal(verifyOrderProofToken(expired, ORDER_CODE), false);
});

test("C12-T5 — legacy token 2 phần (không iat, chữ ký đúng) → false", () => {
  const legacy = craftToken(`${ORDER_CODE}:${ORDER_ID}`);
  assert.equal(verifyOrderProofToken(legacy, ORDER_CODE), false);
});

test("C12-T6 — iat quá tương lai (vượt skew 5 phút) → false", () => {
  const now = Math.floor(Date.now() / 1000);
  const future = craftToken(`${ORDER_CODE}:${ORDER_ID}:${now + 3600}`);
  assert.equal(verifyOrderProofToken(future, ORDER_CODE), false);
});

test("C12-T7 — iat không phải integer → false", () => {
  const bad = craftToken(`${ORDER_CODE}:${ORDER_ID}:not-a-number`);
  assert.equal(verifyOrderProofToken(bad, ORDER_CODE), false);
});

test("C12-T8 — env PROOF_TOKEN_TTL_HOURS=1: token 2h tuổi bị từ chối, 30 phút vẫn hợp lệ", () => {
  const now = Math.floor(Date.now() / 1000);
  process.env.PROOF_TOKEN_TTL_HOURS = "1";
  try {
    const tooOld = craftToken(`${ORDER_CODE}:${ORDER_ID}:${now - 2 * 3600}`);
    assert.equal(verifyOrderProofToken(tooOld, ORDER_CODE), false);
    const fresh = craftToken(`${ORDER_CODE}:${ORDER_ID}:${now - 1800}`);
    assert.equal(verifyOrderProofToken(fresh, ORDER_CODE), true);
  } finally {
    delete process.env.PROOF_TOKEN_TTL_HOURS;
  }
});
