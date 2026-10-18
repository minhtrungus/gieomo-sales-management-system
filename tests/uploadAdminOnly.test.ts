import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

/**
 * Phase H4 — /api/upload admin-only (UP batch).
 *
 * Quyết định policy (2026-10-18): /api/upload là endpoint admin-only.
 * Caller duy nhất ngoài /admin là ProductReviews (trang sản phẩm public) — phần
 * upload ảnh đã được gate bằng cờ isAdmin trên UI, người thường chỉ gửi review
 * text-only. Luồng payment-proof của khách đi qua /api/orders/proof (capability
 * token) và KHÔNG bị ảnh hưởng bởi batch này.
 *
 * ĐÂY LÀ MOCK TESTS (fake requireAdmin + fake Supabase Storage). PostgREST/PG
 * thật không tham gia; skip = không tồn tại trong file này (mọi test luôn chạy).
 *
 * Map tests:
 *   UP1  không có session     → 401, formData KHÔNG được parse, 0 upload  → "UP1 ..."
 *   UP2  session non-admin    → 403, formData không parse, 0 upload       → "UP2 ..."
 *   UP3  admin + JPEG hợp lệ  → 200, upload đúng bucket/contentType       → "UP3 ..."
 *   UP4  magic bytes sai      → 400, 0 upload, errors trả về              → "UP4 ..."
 *   UP5  Storage thất bại     → 400 success:false, KHÔNG báo success      → "UP5 ..."
 *   UP6  request thiếu file   → 400, 0 upload                             → "UP6 ..."
 *   UP7  deny response không  → chỉ {success, error}, không lộ user/stack → "UP7 ..."
 *        lộ field/stack
 *   UP8  source: ProductReviews gate phần photo bằng isAdmin trước           → "UP8 ..."
 *        <input type="file">
 */

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
      return await nextResolve(sub + ".ts", { ...context, parentURL: "${SRC_ROOT}" });
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
        'export class NextResponse { static json(body, init) { return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: { "content-type": "application/json" } }); } }',
    };
  }
  if (url === "mock:supabase-admin") {
    return {
      format: "module",
      shortCircuit: true,
      source: 'export function createAdminClient() { return globalThis.__fakeUploadDb; }',
    };
  }
  if (url === "mock:server-auth") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        'export async function requireAdmin() { const mode = globalThis.__fakeUploadAuth || "admin"; if (mode === "none") { return { authorized: false, response: new Response(JSON.stringify({ success: false, error: "Yêu cầu đăng nhập quản trị viên (401 Unauthorized)" }), { status: 401 }) }; } if (mode === "nonadmin") { return { authorized: false, response: new Response(JSON.stringify({ success: false, error: "Bạn không có quyền thực hiện thao tác này (403 Forbidden)" }), { status: 403 }) }; } return { authorized: true, user: { memberId: "44444444-4444-4444-4444-444444444444", email: "upload-admin@test.local", fullName: "Upload Admin", role: "admin", referralCode: "ADMIN", exp: 99999999999, iat: 0 } }; } export async function requireAuth() { return { authorized: true }; } export async function getAuthenticatedUser() { return { role: "admin" }; } export function createOrderProofToken(code) { return "proof-" + code; }',
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooksSource)}`, import.meta.url);

const { POST } = await import("../src/app/api/upload/route.ts");

type UploadCall = {
  bucket: string;
  path: string;
  opts: { contentType?: string; upsert?: boolean } | null;
};

const g = globalThis as unknown as {
  __fakeUploadAuth?: "none" | "nonadmin" | "admin";
  __fakeUploadDb?: unknown;
  __fakeUploadFail?: string | null;
};

function makeFakeDb() {
  const uploadCalls: UploadCall[] = [];
  const currentBucket: { bucket: string } = { bucket: "" };
  const db = {
    uploadCalls,
    fromCalls: [],
    storage: {
      from(bucket: string) {
        currentBucket.bucket = bucket;
        return {
          async upload(path: string, _buf: Buffer, opts: UploadCall["opts"]) {
            uploadCalls.push({ bucket: currentBucket.bucket, path, opts });
            const fail = g.__fakeUploadFail;
            if (fail) return { error: { message: fail } };
            return { error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://storage.test/${currentBucket.bucket}/${path}` } };
          },
        };
      },
    },
  };
  return db;
}

function fakeRequest(buildForm: () => FormData | Promise<FormData>, counters: { parsed: number }) {
  const obj = {
    headers: new Headers(),
    formData: async () => {
      counters.parsed++;
      return await buildForm();
    },
  };
  return obj as unknown as Request;
}

const VALID_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(16, 0x11),
]);

function jpegFile(name = "ok.jpg") {
  return new File([new Uint8Array(VALID_JPEG)], name, { type: "image/jpeg" });
}

test("UP1 — không có session → 401, formData KHÔNG parse, 0 storage upload", async () => {
  const db = makeFakeDb();
  g.__fakeUploadDb = db;
  g.__fakeUploadAuth = "none";
  g.__fakeUploadFail = null;
  const counters = { parsed: 0 };
  try {
    const res = await POST(fakeRequest(() => new FormData(), counters));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { success: boolean; error: string };
    assert.equal(body.success, false);
    assert.equal(counters.parsed, 0, "auth phải đứng trước request.formData()");
    assert.equal(db.uploadCalls.length, 0);
  } finally {
    g.__fakeUploadAuth = "admin";
  }
});

test("UP2 — session nhưng không phải admin → 403, formData không parse, 0 upload", async () => {
  const db = makeFakeDb();
  g.__fakeUploadDb = db;
  g.__fakeUploadAuth = "nonadmin";
  const counters = { parsed: 0 };
  try {
    const res = await POST(fakeRequest(() => new FormData(), counters));
    assert.equal(res.status, 403);
    const body = (await res.json()) as { success: boolean; error: string };
    assert.equal(body.success, false);
    assert.equal(counters.parsed, 0);
    assert.equal(db.uploadCalls.length, 0);
  } finally {
    g.__fakeUploadAuth = "admin";
  }
});

test("UP3 — admin hợp lệ + JPEG đúng magic bytes → 200 success theo contract (url public)", async () => {
  const db = makeFakeDb();
  g.__fakeUploadDb = db;
  g.__fakeUploadAuth = "admin";
  g.__fakeUploadFail = null;

  const fd = new FormData();
  fd.append("file", jpegFile());
  const res = await POST(fakeRequest(() => fd, { parsed: 0 }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    success: boolean;
    url: string;
    urls: string[];
  };
  assert.equal(body.success, true);
  assert.equal(db.uploadCalls.length, 1);
  assert.equal(db.uploadCalls[0].bucket, "product-media", "mặc định giữ bucket product-media cho admin");
  assert.equal(db.uploadCalls[0].opts?.contentType, "image/jpeg", "content-type lấy từ magic bytes, không theo header");
  assert.match(String(db.uploadCalls[0].path), /^uploads\//);
  assert.equal(body.url, `https://storage.test/product-media/${db.uploadCalls[0].path}`);
  assert.deepEqual(body.urls, [body.url]);
});

test("UP4 — file không đúng magic bytes/chữ ký → 400, 0 upload, errors nằm trong response", async () => {
  const db = makeFakeDb();
  g.__fakeUploadDb = db;
  g.__fakeUploadAuth = "admin";

  const fd = new FormData();
  fd.append("file", new File([new TextEncoder().encode("HELLO THIS IS NOT AN IMAGE")], "fake.jpg", { type: "image/jpeg" }));
  const res = await POST(fakeRequest(() => fd, { parsed: 0 }));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { success: boolean; error?: string; errors?: string[] };
  assert.equal(body.success, false);
  assert.equal(db.uploadCalls.length, 0, "file sai chữ ký không được đưa lên Storage");
  // Hợp đồng hiện có: khi mọi file fail → message gộp vào `error` (string);
  // `errors` (array) chỉ xuất hiện khi có file thành công một phần (HTTP 200).
  assert.ok(typeof body.error === "string" && body.error.length > 0, "phải có thông báo lỗi cụ thể cho file sai chữ ký");
});

test("UP5 — Storage thất bại → 400 success:false, KHÔNG trả url như thành công", async () => {
  const db = makeFakeDb();
  g.__fakeUploadDb = db;
  g.__fakeUploadAuth = "admin";
  g.__fakeUploadFail = "Storage down (mock)";
  try {
    const fd = new FormData();
    fd.append("file", jpegFile());
    const res = await POST(fakeRequest(() => fd, { parsed: 0 }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { success: boolean; url?: string; urls?: string[] };
    assert.equal(body.success, false);
    assert.equal(body.url, undefined);
    assert.equal(body.urls, undefined);
    assert.equal(db.uploadCalls.length, 1, "upload vẫn được attempted trước khi lỗi");
  } finally {
    g.__fakeUploadFail = null;
  }
});

test("UP6 — request không có file nào → 400, 0 upload", async () => {
  const db = makeFakeDb();
  g.__fakeUploadDb = db;
  g.__fakeUploadAuth = "admin";

  const res = await POST(fakeRequest(() => new FormData(), { parsed: 0 }));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { success: boolean };
  assert.equal(body.success, false);
  assert.equal(db.uploadCalls.length, 0);
});

test("UP7 — response deny chỉ chứa {success, error}: không lộ user, stack hay thông tin nhạy cảm", async () => {
  const db = makeFakeDb();
  g.__fakeUploadDb = db;
  g.__fakeUploadAuth = "none";
  const counters = { parsed: 0 };
  try {
    const res = await POST(fakeRequest(() => new FormData(), counters));
    const body = (await res.json()) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(body).sort(),
      ["error", "success"],
      "deny response không được mang thêm field (user/token/stack)"
    );
    assert.doesNotMatch(body.error as string, /test\.local|44444444|admin/i, "không lặp thông tin phiên đăng nhập vào body");
  } finally {
    g.__fakeUploadAuth = "admin";
  }
});

test("UP8 — source: ProductReviews gate phần photo upload bằng isAdmin TRƯỚC <input type=\"file\">", () => {
  const reviews = readFileSync(
    new URL("components/products/ProductReviews.tsx", SRC_ROOT),
    "utf8"
  );
  const photoBlock = reviews.slice(
    reviews.indexOf("{/* Photo upload"),
    reviews.indexOf("{formError")
  );
  assert.ok(photoBlock.length > 0, "photo upload block phải tồn tại");
  const guardMatch = /\{\s*isAdmin\s*&&\s*\(/.exec(photoBlock);
  const fileInput = photoBlock.indexOf('type="file"');
  assert.ok(guardMatch, "photo upload UI phải gate bằng isAdmin");
  assert.ok(fileInput >= 0, "photo upload block phải chứa file input");
  assert.ok(guardMatch.index < fileInput, "guard isAdmin phải bao trọn <input type=\"file\"> (ẩn với người thường)");
  // Người thường vẫn có thể gửi review text-only: /api/reviews POST không đòi session.
  const reviewsApi = readFileSync(new URL("app/api/reviews/route.ts", SRC_ROOT), "utf8");
  assert.match(reviewsApi, /export async function POST/, "/api/reviews POST vẫn tồn tại cho review text-only");
});
