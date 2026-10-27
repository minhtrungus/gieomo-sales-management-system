import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTokenFromRequest, requireAdmin } from "@/lib/auth/serverAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), orderIds: z.array(z.uuid()).min(1).max(10) }),
  z.object({ action: z.literal("challenge"), orderIds: z.array(z.uuid()).min(1).max(10) }),
  z.object({ action: z.literal("delete"), challengeId: z.uuid(), confirmationCode: z.string().min(20).max(200), reason: z.string().trim().min(8).max(500) }),
]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function projectRef(): string | null {
  try {
    const hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(hostname);
    return match?.[1] || (["127.0.0.1", "localhost"].includes(hostname) ? "local" : null);
  } catch { return null; }
}

function isSameOriginJsonRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type") || "";
  if (!origin || !contentType.toLowerCase().startsWith("application/json")) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

function environmentGuard(): { ref: string } | { response: NextResponse } {
  const ref = projectRef();
  const environmentKind = process.env.VERCEL_ENV || process.env.GIEOMO_DEPLOYMENT_ENV || (process.env.NODE_ENV === "development" ? "local" : "");
  const allowlist = new Set((process.env.TEST_CLEANUP_ALLOWED_PROJECT_REFS || "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!ref || !["local", "test", "preview"].includes(environmentKind) || !allowlist.has(ref)) {
    return { response: NextResponse.json({ success: false, error: "Xóa đơn test bị khóa trên môi trường hoặc database chưa được xác minh." }, { status: 403 }) };
  }
  return { ref };
}

export async function POST(request: Request) {
  if (!isSameOriginJsonRequest(request)) {
    return NextResponse.json({ success: false, error: "Yêu cầu bị từ chối do kiểm tra CSRF/content-type." }, { status: 403 });
  }
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const token = extractTokenFromRequest(request);
  if (!token) return NextResponse.json({ success: false, error: "Phiên quản trị không hợp lệ." }, { status: 401 });
  const guard = environmentGuard();
  if ("response" in guard) return guard.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Payload không hợp lệ; batch chỉ nhận 1–10 UUID duy nhất." }, { status: 400 });

  const body = parsed.data;
  if (body.action === "challenge" && new URL(request.url).protocol !== "https:") {
    return NextResponse.json({ success: false, error: "Mã xác nhận chỉ được cấp qua HTTPS." }, { status: 403 });
  }
  let rawConfirmationCode: string | null = null;
  const rpcPayload: Record<string, unknown> = {
    mode: body.action === "challenge" ? "issue" : body.action,
    project_ref: guard.ref,
    actor_member_id: auth.user.memberId,
    session_binding_hash: sha256(`${auth.user.memberId}:${token}`),
  };
  if (body.action === "preview" || body.action === "challenge") {
    if (new Set(body.orderIds).size !== body.orderIds.length) return NextResponse.json({ success: false, error: "Danh sách đơn không được trùng UUID." }, { status: 400 });
    rpcPayload.order_ids = body.orderIds;
  }
  if (body.action === "challenge") {
    rawConfirmationCode = randomBytes(32).toString("base64url");
    rpcPayload.confirmation_hash = sha256(rawConfirmationCode);
  }
  if (body.action === "delete") {
    rpcPayload.challenge_id = body.challengeId;
    rpcPayload.confirmation_hash = sha256(body.confirmationCode);
    rpcPayload.reason = body.reason;
  }

  const { data, error } = await createAdminClient().rpc("manage_test_payment_deletion_atomic", { p: rpcPayload });
  if (error) {
    console.error("[test-payment-deletion] RPC unavailable", { code: error.code || "unknown" });
    const missingMigration = error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message);
    return NextResponse.json({ success: false, error: missingMigration ? "Database Preview chưa áp dụng migration 042; chức năng đang khóa an toàn." : "Transaction thất bại và đã rollback; không có đơn nào được xóa." }, { status: missingMigration ? 503 : 500 });
  }
  const outcome = typeof data?.outcome === "string" ? data.outcome : "invalid_result";
  if (["eligible", "challenge_issued", "deleted"].includes(outcome)) {
    return NextResponse.json({ success: true, ...data, ...(rawConfirmationCode ? { confirmationCode: rawConfirmationCode } : {}) });
  }
  const status = outcome === "rate_limited" ? 429 : ["challenge_replayed", "challenge_expired", "stale_snapshot"].includes(outcome) ? 409 : outcome === "environment_unverified" ? 503 : outcome === "permission_denied" ? 403 : 422;
  const messages: Record<string, string> = {
    blocked: "Batch chứa đơn không đủ bằng chứng test hoặc có dấu vết tài chính/fulfillment bị chặn.",
    stale_snapshot: "Dữ liệu đã thay đổi; bắt buộc dry-run và lấy mã mới.",
    challenge_expired: "Mã xác nhận đã hết hạn; hãy lấy mã mới.",
    challenge_replayed: "Mã xác nhận đã được dùng và không thể phát lại.",
    rate_limited: "Đã cấp quá nhiều mã; vui lòng chờ trước khi thử lại.",
  };
  return NextResponse.json({ success: false, ...data, error: messages[outcome] || "Yêu cầu không còn hợp lệ; không có dữ liệu nào được xóa." }, { status });
}
