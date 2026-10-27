import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/serverAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Candidate = { orderId?: unknown; classificationReason?: unknown };

function projectRef(): string | null {
  try {
    const hostname = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname;
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(hostname);
    return match?.[1] || (hostname === "127.0.0.1" || hostname === "localhost" ? "local" : null);
  } catch { return null; }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const ref = projectRef();
  const environmentKind = process.env.VERCEL_ENV || process.env.GIEOMO_DEPLOYMENT_ENV ||
    (process.env.NODE_ENV === "development" ? "local" : "");
  const allowlist = new Set((process.env.TEST_CLEANUP_ALLOWED_PROJECT_REFS || "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  if (!["local", "test", "preview"].includes(environmentKind) || !ref || !allowlist.has(ref)) {
    return NextResponse.json({ success: false, error: "Workflow lưu trữ dữ liệu test bị khóa trên môi trường này." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const mode = body?.mode === "archive" ? "archive" : body?.mode === "preview" ? "preview" : null;
  const candidates = Array.isArray(body?.candidates) ? body.candidates as Candidate[] : [];
  if (!mode || candidates.length < 1 || candidates.length > 20) {
    return NextResponse.json({ success: false, error: "Batch phải có từ 1 đến 20 đơn." }, { status: 400 });
  }
  const normalized = candidates.map((candidate) => ({
    order_id: typeof candidate.orderId === "string" ? candidate.orderId.trim() : "",
    classification_reason: typeof candidate.classificationReason === "string" ? candidate.classificationReason.trim() : "",
  }));
  if (normalized.some((candidate) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.order_id) || candidate.classification_reason.length < 8)) {
    return NextResponse.json({ success: false, error: "Mỗi dòng cần UUID đơn và lý do phân loại test tối thiểu 8 ký tự." }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("manage_test_order_archival_atomic", {
    p: {
      mode, project_ref: ref, actor_member_id: auth.user.memberId, candidates: normalized,
      reason: typeof body?.reason === "string" ? body.reason.trim() : "",
      preview_token: typeof body?.previewToken === "string" ? body.previewToken : "",
      confirmation: typeof body?.confirmation === "string" ? body.confirmation.trim() : "",
    },
  });
  if (error) {
    console.error("[test-order-cleanup] RPC failed", { code: error.code || "unknown" });
    const unavailable = error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message);
    return NextResponse.json({ success: false, error: unavailable
      ? "Database Preview chưa áp dụng migration 041; workflow đang khóa an toàn."
      : "Không thể kiểm tra batch; không có dữ liệu nào được thay đổi." }, { status: unavailable ? 503 : 500 });
  }
  if (data?.outcome === "eligible" || data?.outcome === "archived") {
    return NextResponse.json({ success: true, ...data });
  }
  const status = data?.outcome === "environment_unverified" ? 503
    : data?.outcome === "not_found" ? 404
      : ["stale_or_unconfirmed", "concurrent_change", "already_archived"].includes(data?.outcome) ? 409 : 422;
  return NextResponse.json({ success: false, outcome: data?.outcome || "invalid_result",
    error: data?.outcome === "environment_unverified"
      ? "Database chưa được quản trị viên hạ tầng bật cờ cleanup cho đúng Preview project."
      : "Batch không còn hợp lệ hoặc dữ liệu đã thay đổi; hãy dry-run lại." }, { status });
}
