import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHmac } from "crypto";
import { createFakeOrderDb, type FakeOrderDb } from "./helpers/fakeOrderDb.ts";

/**
 * Batch B — pin HÀNH VI auth primitives THẬT (serverAuth), không mock function.
 *
 * Mục tiêu:
 * - requireAdmin: 401 khi thiếu/tokens hỏng; 403 với mọi role khác admin;
 *   authorized với admin.
 * - requireAuth: hành vi THỰC TẾ = mọi session ký hợp lệ pass (kể cả
 *   delivery_staff) — pin để không ai nhầm với comment cũ "Admin or BTC Sale".
 *   Thu hẹp role cần business matrix (chưa có) → giữ nguyên, chỉ test.
 * - verifySessionToken: token hết hạn / chữ ký sai → null.
 * - getAuthenticatedUser: Bearer header; token sai → null.
 *
 * MOCK: chỉ next/server + @/lib/supabase/admin (serverAuth import chúng).
 * Secret test dummy — không phải secret thật, không in ra log.
 */

const SRC_ROOT = new URL("../src/", import.meta.url).href;

process.env.ADMIN_SESSION_SECRET = "test-secret-auth-primitives-b";

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

const {
  createSessionToken,
  verifySessionToken,
  getAuthenticatedUser,
  requireAdmin,
  requireAuth,
  SESSION_COOKIE_NAME,
} = await import("../src/lib/auth/serverAuth.ts");

const BASE_USER = {
  memberId: "11111111-1111-4111-8111-111111111111",
  email: "user@test.local",
  fullName: "Test User",
  referralCode: "TESTR",
  authVersion: "2026-10-23T00:00:00.000Z",
};

const testGlobal = globalThis as typeof globalThis & { __fakeOrderDb?: FakeOrderDb };

function setCurrentMember(
  role: "admin" | "btc_sale" | "delivery_staff",
  status = "active",
  updatedAt = BASE_USER.authVersion
): void {
  testGlobal.__fakeOrderDb = createFakeOrderDb({
    members: [{
      member_id: BASE_USER.memberId,
      email: BASE_USER.email,
      full_name: BASE_USER.fullName,
      role,
      status,
      referral_code: BASE_USER.referralCode,
      phone: null,
      updated_at: updatedAt,
    }],
  });
}

function tokenForRole(role: "admin" | "btc_sale" | "delivery_staff"): string {
  return createSessionToken({ ...BASE_USER, role });
}

function reqWithCookie(token: string): Request {
  return new Request("http://localhost/api/test", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
  });
}

function reqWithBearer(token: string): Request {
  return new Request("http://localhost/api/test", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function craftSession(payloadObj: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = createHmac("sha256", process.env.ADMIN_SESSION_SECRET!)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

test("B1 — requireAdmin: không token → 401", async () => {
  const res = await requireAdmin(new Request("http://localhost/api/x"));
  assert.equal(res.authorized, false);
  if (!res.authorized) assert.equal(res.response.status, 401);
});

test("B2 — requireAdmin: btc_sale / delivery_staff → 403 (không phải admin)", async () => {
  for (const role of ["btc_sale", "delivery_staff"] as const) {
    setCurrentMember(role);
    const res = await requireAdmin(reqWithCookie(tokenForRole(role)));
    assert.equal(res.authorized, false, `${role} không được requireAdmin`);
    if (!res.authorized) assert.equal(res.response.status, 403);
  }
});

test("B3 — requireAdmin: admin → authorized", async () => {
  setCurrentMember("admin");
  const res = await requireAdmin(reqWithCookie(tokenForRole("admin")));
  assert.equal(res.authorized, true);
  if (res.authorized) assert.equal(res.user.role, "admin");
});

test("B4 — requireAuth (hành vi THỰC TẾ đã pin): mọi role hợp lệ pass, thiếu token → 401", async () => {
  const deny = await requireAuth(new Request("http://localhost/api/x"));
  assert.equal(deny.authorized, false);
  if (!deny.authorized) assert.equal(deny.response.status, 401);

  for (const role of ["admin", "btc_sale", "delivery_staff"] as const) {
    setCurrentMember(role);
    const res = await requireAuth(reqWithCookie(tokenForRole(role)));
    assert.equal(res.authorized, true, `${role} pass requireAuth theo hành vi hiện tại`);
  }
});

test("B5 — verifySessionToken: token hỏng / sai chữ ký / hết hạn → null", () => {
  const valid = tokenForRole("admin");
  assert.ok(verifySessionToken(valid), "token hợp lệ pass");

  const now = Math.floor(Date.now() / 1000);
  const expired = craftSession({ ...BASE_USER, role: "admin", iat: now - 7200, exp: now - 3600 });
  assert.equal(verifySessionToken(expired), null, "token hết hạn bị từ chối");

  const [b64] = valid.split(".");
  assert.equal(verifySessionToken(`${b64}.bad-signature-value-here`), null, "sai chữ ký");

  assert.equal(verifySessionToken(""), null);
  assert.equal(verifySessionToken("not-a-token"), null);
});

test("B6 — getAuthenticatedUser: Bearer header; token sai → null", async () => {
  setCurrentMember("btc_sale");
  const token = tokenForRole("btc_sale");
  const user = await getAuthenticatedUser(reqWithBearer(token));
  assert.ok(user);
  assert.equal(user!.role, "btc_sale");

  const bad = await getAuthenticatedUser(reqWithBearer("aaa.bbb"));
  assert.equal(bad, null);
});

test("H32-A1 — active member state is reloaded; inactive/stale sessions are revoked", async () => {
  const adminToken = tokenForRole("admin");

  setCurrentMember("btc_sale");
  const demoted = await requireAdmin(reqWithCookie(adminToken));
  assert.equal(demoted.authorized, false);
  if (!demoted.authorized) assert.equal(demoted.response.status, 403);

  setCurrentMember("admin", "inactive");
  assert.equal(await getAuthenticatedUser(reqWithCookie(adminToken)), null);

  setCurrentMember("admin", "active", "2026-10-23T00:01:00.000Z");
  assert.equal(await getAuthenticatedUser(reqWithCookie(adminToken)), null);
});
