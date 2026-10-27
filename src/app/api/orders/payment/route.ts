import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _\-/]{2,63}$/;

function normalizeReference(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validBankReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value) && !/^ADMIN-CONFIRM/i.test(value);
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) return authCheck.response;

    const body = await request.json();
    const { orderId, orderCode, action } = body;
    if (!orderId && !orderCode) {
      return NextResponse.json({ success: false, error: "Thiếu orderId hoặc orderCode" }, { status: 400 });
    }

    const supabase = createAdminClient();
    let query = supabase
      .from("orders")
      .select("order_id, order_code, payment_status, order_status, final_amount, internal_note");
    query = orderCode
      ? query.eq("order_code", String(orderCode).trim().toUpperCase())
      : query.eq("order_id", orderId);
    const { data: order, error: findError } = await query.maybeSingle();
    if (findError || !order) {
      return NextResponse.json({ success: false, error: "Không tìm thấy đơn hàng" }, { status: 404 });
    }

    if (action === "confirm") {
      const method = String(body.paymentMethod || "banking").toLowerCase();
      if (!["banking", "cod", "cash"].includes(method)) {
        return NextResponse.json({ success: false, error: "Phương thức thanh toán không hợp lệ" }, { status: 400 });
      }
      const isCash = method === "cod" || method === "cash";
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ success: false, error: "Bắt buộc số tiền thực nhận (amount > 0)" }, { status: 400 });
      }

      const reference = normalizeReference(body.referenceNumber ?? body.reference_number);
      if (isCash && reference) {
        return NextResponse.json(
          { success: false, error: "Xác nhận tiền mặt không nhận referenceNumber; máy chủ tự tạo identity" },
          { status: 400 }
        );
      }
      if (!isCash && !validBankReference(reference)) {
        return NextResponse.json(
          { success: false, error: "Bắt buộc mã giao dịch ngân hàng thật (3-64 ký tự)" },
          { status: 400 }
        );
      }

      const transactionCode = isCash ? `CASH-${order.order_code}` : reference;
      const { data: result, error: rpcError } = await supabase.rpc("apply_payment_event", {
        p: {
          order_code: order.order_code,
          amount,
          transaction_code: transactionCode,
          payment_method: isCash ? "cod" : "banking",
          provider: isCash ? "cash" : "bank",
          source: "admin",
          admin_member_id: authCheck.user.memberId,
          note: isCash ? "Thu tiền mặt tại quầy" : "Admin xác nhận từ bằng chứng ngân hàng",
        },
      });

      if (rpcError) {
        console.error("[POST /api/orders/payment] apply_payment_event failed:", rpcError.message);
        return NextResponse.json(
          { success: false, error: "Không ghi nhận được thanh toán; toàn bộ thay đổi đã rollback" },
          { status: 500 }
        );
      }
      if (!result || typeof result.outcome !== "string") {
        return NextResponse.json({ success: false, error: "Kết quả payment RPC không hợp lệ" }, { status: 500 });
      }

      if (result.outcome === "applied") {
        return NextResponse.json({
          success: true,
          outcome: "applied",
          orderId: result.order_id,
          orderCode: result.order_code,
          paymentStatus: result.payment_status,
          orderStatus: result.order_status,
          replayed: result.replayed === true,
        });
      }

      const status = result.outcome === "unmatched_order" ? 404 : 409;
      return NextResponse.json(
        {
          success: false,
          outcome: result.outcome,
          error: result.message || "Giao dịch đã được lưu để đối soát nhưng không được áp dụng tự động",
          needsReview: result.needs_review === true,
          orderId: result.order_id,
          orderCode: result.order_code,
        },
        { status }
      );
    }

    if (action === "reject") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) {
        return NextResponse.json({ success: false, error: "Lý do từ chối là bắt buộc" }, { status: 400 });
      }
      const { data: result, error } = await supabase.rpc("reject_payment_atomic", {
        p: { order_id: order.order_id, reason, actor_member_id: authCheck.user.memberId },
      });
      if (error) {
        console.error("[POST /api/orders/payment] reject_payment_atomic failed:", error.message);
        return NextResponse.json(
          { success: false, error: "Không thể từ chối thanh toán; toàn bộ thay đổi đã rollback" },
          { status: 500 }
        );
      }
      if (result?.outcome === "rejected" || result?.outcome === "already_rejected") {
        return NextResponse.json({
          success: true,
          outcome: result.outcome,
          orderId: result.order_id,
          orderCode: result.order_code,
          paymentStatus: result.payment_status,
        });
      }
      const status = result?.outcome === "not_found" ? 404 : result?.outcome === "invalid_reason" ? 400 : 409;
      return NextResponse.json(
        { success: false, outcome: result?.outcome ?? "invalid_result", error: "Payment state không cho phép từ chối" },
        { status }
      );
    }

    if (action === "adjust_confirmation") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
      if (reason.length < 8 || reason.length > 500) {
        return NextResponse.json({ success: false, error: "Lý do phải có từ 8 đến 500 ký tự" }, { status: 400 });
      }
      if (!expectedUpdatedAt) {
        return NextResponse.json({ success: false, error: "Thiếu phiên bản đơn hàng để chống cập nhật đồng thời" }, { status: 400 });
      }
      const { data: result, error } = await supabase.rpc("adjust_payment_confirmation_atomic", {
        p: {
          order_id: order.order_id,
          reason,
          expected_updated_at: expectedUpdatedAt,
          actor_member_id: authCheck.user.memberId,
        },
      });
      if (error) {
        console.error("[POST /api/orders/payment] adjust_payment_confirmation_atomic failed:", error.message);
        const unavailable = error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message);
        return NextResponse.json({ success: false, error: unavailable
          ? "Database hiện tại chưa áp dụng migration 039 cho điều chỉnh xác nhận tiền mặt."
          : "Không thể điều chỉnh; toàn bộ thay đổi đã rollback" }, { status: unavailable ? 503 : 500 });
      }
      if (result?.outcome === "adjusted") {
        return NextResponse.json({ success: true, ...result });
      }
      const status = result?.outcome === "not_found" ? 404 : result?.outcome === "version_conflict" ? 409 : 422;
      return NextResponse.json({
        success: false,
        outcome: result?.outcome ?? "invalid_result",
        needsReview: result?.needs_review === true,
        error: result?.message || "Đơn hoặc lịch sử thanh toán không cho phép điều chỉnh",
      }, { status });
    }

    return NextResponse.json({ success: false, error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (error) {
    console.error("[POST /api/orders/payment] exception:", error);
    return NextResponse.json({ success: false, error: "Lỗi máy chủ khi xử lý thanh toán" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authCheck = await requireAdmin(request);
  if (!authCheck.authorized) return authCheck.response;
  const orderCode = new URL(request.url).searchParams.get("orderCode")?.trim().toUpperCase();
  if (!orderCode) {
    return NextResponse.json({ success: false, error: "Thiếu tham số orderCode" }, { status: 400 });
  }
  const { data: order, error } = await createAdminClient()
    .from("orders")
    .select("order_id, order_code, payment_status, order_status, final_amount")
    .eq("order_code", orderCode)
    .maybeSingle();
  if (error || !order) {
    return NextResponse.json({ success: false, error: "Không tìm thấy đơn hàng" }, { status: 404 });
  }
  return NextResponse.json({ success: true, order });
}
