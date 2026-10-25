import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/serverAuth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || (body.mode !== "preview" && body.mode !== "mark")) {
    return NextResponse.json({ success: false, error: "Payload không hợp lệ" }, { status: 400 });
  }
  const duplicateOrderId = typeof body.duplicateOrderId === "string" ? body.duplicateOrderId.trim() : "";
  const keepOrderCode = typeof body.keepOrderCode === "string" ? body.keepOrderCode.trim().toUpperCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!UUID_RE.test(duplicateOrderId) || !keepOrderCode || !reason) {
    return NextResponse.json({ success: false, error: "Cần chọn rõ đơn giữ lại, đơn đánh dấu trùng và lý do" }, { status: 400 });
  }
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
  if (
    body.mode === "mark" &&
    (body.confirmation !== "TRUNG" || !expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt)))
  ) {
    return NextResponse.json({ success: false, error: "Cần preview mới và mã xác nhận TRUNG" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("mark_duplicate_order_atomic", {
    p: {
      mode: body.mode,
      duplicate_order_id: duplicateOrderId,
      keep_order_code: keepOrderCode,
      reason,
      confirmation: body.mode === "mark" ? body.confirmation : null,
      expected_updated_at: body.mode === "mark" ? expectedUpdatedAt : null,
      actor_member_id: UUID_RE.test(auth.user.memberId || "") ? auth.user.memberId : null,
    },
  });
  if (error || !data) return NextResponse.json({ success: false, error: "Không thể đánh giá cặp đơn trùng" }, { status: 500 });
  const outcome = String(data.outcome || "");
  const success = ["review", "marked", "replayed"].includes(outcome);
  const status = success ? 200 : outcome === "not_found" ? 404 : outcome === "stale_preview" || outcome === "same_order" ? 409 : 400;
  return NextResponse.json({ success, ...data }, { status });
}
