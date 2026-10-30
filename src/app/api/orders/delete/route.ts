import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/serverAuth";
import { createAdminClient } from "@/lib/supabase/admin";

type DeleteRequest = {
  mode?: "preview" | "delete" | "archive";
  orderId?: string;
  orderIds?: string[];
  reason?: string;
  confirmation?: string;
  expectedUpdatedAt?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const authCheck = await requireAdmin(request);
  if (!authCheck.authorized) return authCheck.response;

  let body: DeleteRequest;
  try {
    body = await request.json() as DeleteRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Payload JSON không hợp lệ" }, { status: 400 });
  }

  if (body.mode === "archive") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!reason || !UUID_RE.test(orderId)) {
      return NextResponse.json({ success: false, error: "Vui lòng nhập lý do và chọn đúng đơn hàng" }, { status: 400 });
    }
    const { data, error } = await createAdminClient().rpc("archive_order_atomic", {
      p: { order_id: orderId, reason, actor_member_id: authCheck.user.memberId },
    });
    if (error) {
      const unavailable = error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message);
      return NextResponse.json({
        success: false,
        error: unavailable
          ? "Database Preview chưa áp dụng migration 043 cho xóa đơn an toàn."
          : "Không thể xóa đơn khỏi danh sách quản trị; dữ liệu chưa thay đổi.",
      }, { status: unavailable ? 503 : 500 });
    }
    if (data?.outcome === "archived" || data?.outcome === "already_archived") {
      return NextResponse.json({ success: true, ...data });
    }
    const status = data?.outcome === "not_found" ? 404 : data?.outcome === "invalid_actor" ? 403 : 409;
    const message = data?.outcome === "not_terminal"
      ? "Chỉ có thể lưu trữ đơn đã hoàn tất hoặc đã hủy đúng quy trình. Hãy xử lý giao hàng/giữ hàng trước."
      : "Đơn không thể được lưu trữ ở trạng thái hiện tại";
    return NextResponse.json({ success: false, ...data, error: message }, { status });
  }

  if (body.mode !== "preview" && body.mode !== "delete") {
    return NextResponse.json({ success: false, error: "mode phải là preview hoặc delete" }, { status: 400 });
  }
  const mode = body.mode;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const ids = Array.isArray(body.orderIds) ? body.orderIds : body.orderId ? [body.orderId] : [];
  const uniqueIds = [...new Set(ids.map((id) => String(id).trim()))];

  if (!reason) {
    return NextResponse.json({ success: false, error: "Vui lòng nhập lý do xóa" }, { status: 400 });
  }
  if (uniqueIds.length === 0 || uniqueIds.length > 20 || uniqueIds.some((id) => !UUID_RE.test(id))) {
    return NextResponse.json({ success: false, error: "Danh sách orderId không hợp lệ (tối đa 20)" }, { status: 400 });
  }
  if (mode === "delete" && body.confirmation !== "XOA") {
    return NextResponse.json({ success: false, error: "Mã xác nhận phải là XOA" }, { status: 400 });
  }
  if (mode === "delete" && (!body.expectedUpdatedAt || Number.isNaN(Date.parse(body.expectedUpdatedAt)))) {
    return NextResponse.json({ success: false, error: "Preview token không hợp lệ; hãy chạy preview lại" }, { status: 400 });
  }
  if (mode === "delete" && uniqueIds.length > 1) {
    return NextResponse.json(
      { success: false, error: "Batch delete cần preview token riêng cho từng đơn; hãy xóa từng đơn sau khi duyệt preview" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const results: Array<Record<string, unknown>> = [];
  for (const orderId of uniqueIds) {
    const { data, error } = await supabase.rpc("manage_order_deletion_atomic", {
      p: {
        mode,
        order_id: orderId,
        reason,
        confirmation: mode === "delete" ? body.confirmation : null,
        expected_updated_at: mode === "delete" ? body.expectedUpdatedAt : null,
        actor_member_id: UUID_RE.test(authCheck.user.memberId || "") ? authCheck.user.memberId : null,
      },
    });
    if (error) {
      results.push({ orderId, outcome: "error", error: "Không thể đánh giá/xóa đơn" });
    } else {
      results.push((data || { orderId, outcome: "invalid_result" }) as Record<string, unknown>);
    }
  }

  const allSucceeded = results.every((result) =>
    mode === "preview" ? result.outcome === "eligible" : result.outcome === "deleted"
  );
  const outcomes = results.map((result) => String(result.outcome || ""));
  const status = allSucceeded
    ? 200
    : outcomes.some((outcome) => outcome === "error")
      ? 500
      : outcomes.every((outcome) => outcome === "not_found")
        ? 404
        : outcomes.some((outcome) => outcome === "invalid_request" || outcome === "invalid_actor")
          ? 400
          : 409;
  return NextResponse.json({ success: allSucceeded, mode, results }, { status });
}
