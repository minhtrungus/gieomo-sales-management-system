import { NextResponse } from "next/server";
import { getOrdersServer } from "@/lib/services/orderService";
import { createOrderServerAtomicV2 } from "@/lib/services/orderCreateAtomicV2";
import { getAuthenticatedUser, requireAdmin } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

type OrderUpdateData = {
  updated_at: string;
  order_status?: string;
  completed_at?: string;
  confirmed_at?: string;
  delivery_status?: string;
  assigned_shipper_id?: string | null;
  internal_note?: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code") || undefined;
    const phone = searchParams.get("phone") || undefined;
    const proofToken = searchParams.get("token") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;

    const user = await getAuthenticatedUser(request);
    const isAdmin = Boolean(user && (user.role === "admin" || user.role === "btc_sale"));

    // Predictable order codes are identifiers, not credentials. Public detail
    // requires code + exact phone or the order-bound proof token.
    if (!isAdmin && (!code || (!phone && !proofToken))) {
      return NextResponse.json(
        {
          success: false,
          error: "Yêu cầu mã đơn hàng kèm số điện thoại hoặc token xác thực (401 Unauthorized)",
        },
        { status: 401 }
      );
    }

    const orders = await getOrdersServer({ code, phone, proofToken, limit, isAdmin });
    return NextResponse.json({ success: true, orders });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Lỗi truy vấn đơn hàng") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const headerKey = request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key");
    const idempotencyKey = (headerKey || body?.idempotency_key || "") as string;
    const user = await getAuthenticatedUser(request);
    const result = await createOrderServerAtomicV2({
      ...body,
      idempotency_key: idempotencyKey,
    }, { memberId: user?.memberId ?? null });

    if (result.idempotency === "processing") {
      return NextResponse.json(
        { success: false, error: result.error || "Đang xử lý", idempotency: "processing" },
        { status: 409 }
      );
    }
    if (result.idempotency === "hash_mismatch") {
      return NextResponse.json(
        { success: false, error: result.error || "Idempotency key conflict", idempotency: "hash_mismatch" },
        { status: 409 }
      );
    }
    if (result.idempotency === "needs_reconciliation") {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Cần đối soát thủ công",
          idempotency: "needs_reconciliation",
          needsReconciliation: true,
          // Pass through identifiers when the order row exists so the client
          // can reference it (e.g. markCompleted-failed / order_items-failed).
          ...(result.orderId ? { orderId: result.orderId } : {}),
          ...(result.orderCode ? { orderCode: result.orderCode } : {}),
        },
        { status: 409 }
      );
    }
    if (result.idempotency === "failed_terminal") {
      return NextResponse.json(
        { success: false, error: result.error || "Yêu cầu thất bại vĩnh viễn", idempotency: "failed_terminal" },
        { status: 400 }
      );
    }
    if (result.idempotency === "replay_cancelled") {
      return NextResponse.json(
        { success: false, error: result.error || "Đơn đã hủy", idempotency: "replay_cancelled" },
        { status: 409 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Không thể tạo đơn hàng", idempotency: result.idempotency },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderCode: result.orderCode,
      finalAmount: result.finalAmount,
      proofToken: result.proofToken,
      idempotency: result.idempotency,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Lỗi xử lý yêu cầu") },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();

    // Batch 1 — ĐÓNG PATCH BYPASS: payment_status CHỈ đổi qua
    // POST /api/orders/payment (insert-first + audit). Kiểm tra own-property
    // (không check truthiness) nên null/""/giá-trùng-vẫn-bị-từ-chối; request
    // trộn payment field với field hợp lệ cũng bị reject TOÀN BỘ (không
    // update partial). Browser bundle cũ gửi paymentStatus → 400, side-effect 0.
    if (
      Object.prototype.hasOwnProperty.call(body, "paymentStatus") ||
      Object.prototype.hasOwnProperty.call(body, "payment_status")
    ) {
      return NextResponse.json(
        { success: false, error: "paymentStatus chỉ đổi qua /api/orders/payment" },
        { status: 400 }
      );
    }

    const {
      orderCode,
      orderId,
      orderStatus,
      deliveryStatus,
      delivery_status,
      internalNote,
      paymentProof,
      payment_proof,
      assignedShipperId,
    } = body;

    const idOrCode = orderCode || orderId;
    if (!idOrCode) {
      return NextResponse.json({ success: false, error: "Missing orderCode or orderId" }, { status: 400 });
    }
    if (internalNote !== undefined && typeof internalNote !== "string") {
      return NextResponse.json({ success: false, error: "Ghi chú nội bộ phải là chuỗi." }, { status: 400 });
    }
    if (assignedShipperId !== undefined && assignedShipperId !== null &&
      (typeof assignedShipperId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedShipperId))) {
      return NextResponse.json({ success: false, error: "Mã thành viên giao hàng không hợp lệ." }, { status: 400 });
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    const updateData: OrderUpdateData = { updated_at: new Date().toISOString() };

    if (orderStatus) {
      updateData.order_status = orderStatus;
      if (orderStatus === "completed") updateData.completed_at = new Date().toISOString();
      if (orderStatus === "confirmed") updateData.confirmed_at = new Date().toISOString();
      // orderStatus === "cancelled" đi nhánh RPC bên dưới (không dùng updateData)
    }
    const resolvedDelivery = deliveryStatus || delivery_status;
    if (resolvedDelivery) {
      updateData.delivery_status = resolvedDelivery;
    }
    if (assignedShipperId !== undefined) {
      updateData.assigned_shipper_id = assignedShipperId || null;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);

    if (orderStatus === "cancelled") {
      // Batch 2A-1 — hủy đơn NGUYÊN TỬ qua RPC cancel_order_atomic:
      // flip → hoàn kho (relative) → giải phóng voucher → cờ audit →
      // order_status_history — CÙNG một transaction (migration 017).
      // Không tự hoàn kho / không release voucher ở đây nữa — mọi side
      // effect nằm trong function; lỗi → rollback toàn tx → 500 retryable.
      const cancelReason =
        typeof body.cancelReason === "string" && body.cancelReason.trim()
          ? body.cancelReason.trim()
          : typeof body.reason === "string" && body.reason.trim()
            ? body.reason.trim()
            : null;
      const isMemberUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        authCheck.user.memberId || ""
      );

      let rpcData: Record<string, unknown> | null = null;
      let rpcError: { message?: string; details?: string | null } | null = null;
      try {
        const res = await supabase.rpc("cancel_order_atomic", {
          p: {
            order_id: !orderCode && isUuid ? idOrCode : null,
            order_code: orderCode
              ? orderCode.trim().toUpperCase()
              : isUuid
                ? null
                : idOrCode.trim().toUpperCase(),
            reason: cancelReason,
            actor_member_id: isMemberUuid ? authCheck.user.memberId : null,
          },
        });
        rpcData = (res.data ?? null) as Record<string, unknown> | null;
        rpcError = res.error as { message?: string; details?: string | null } | null;
      } catch (err: unknown) {
        rpcError = { message: errorMessage(err, "Không gọi được cancel_order_atomic") };
      }

      if (rpcError || !rpcData) {
        // Lỗi RAISE trong function = rollback toàn tx (không side effect).
        // B2A1:VOUCHER_RELEASE_UNSAFE là dữ liệu lệch → retry không tự hết.
        const unsafe = String(rpcError?.details || "").includes("B2A1:VOUCHER_RELEASE_UNSAFE");
        return NextResponse.json(
          {
            success: false,
            error: rpcError?.message || "Không gọi được cancel_order_atomic",
            ...(unsafe ? { retryable: false, needsRecon: true } : { retryable: true }),
          },
          { status: 500 }
        );
      }

      const outcome = rpcData.outcome;

      if (outcome === "cancelled") {
        return NextResponse.json({ success: true, ...rpcData });
      }
      if (outcome === "already_cancelled") {
        return NextResponse.json({ success: true, alreadyCancelled: true, ...rpcData });
      }
      if (outcome === "not_found") {
        return NextResponse.json(
          { success: false, outcome: "not_found", error: "Đơn hàng không tồn tại" },
          { status: 404 }
        );
      }
      if (outcome === "not_cancellable") {
        return NextResponse.json(
          {
            success: false,
            outcome: "not_cancellable",
            error: `Không thể hủy đơn ở trạng thái "${String(rpcData.currentStatus ?? "")}"`,
            currentStatus: rpcData.currentStatus ?? null,
            allowedFrom: rpcData.allowedFrom ?? null,
          },
          { status: 409 }
        );
      }

      // Contract không xác định — KHÔNG BAO GIỜ trả success giả
      return NextResponse.json(
        {
          success: false,
          error: `Kết quả không hợp lệ từ cancel_order_atomic: ${String(outcome)}`,
          retryable: true,
        },
        { status: 500 }
      );
    }

    // Batch 2B — chỉ guard khi request thực sự đổi order_status (nhánh
    // orderStatus === "cancelled" đã return ở nhánh RPC phía trên).
    const statusChanging = Boolean(orderStatus);

    const idCol = orderCode ? "order_code" : isUuid ? "order_id" : "order_code";
    const idVal = orderCode
      ? orderCode.trim().toUpperCase()
      : isUuid
        ? idOrCode
        : idOrCode.trim().toUpperCase();

    const noteChanging = internalNote !== undefined || Boolean(paymentProof || payment_proof);
    let previousNote: string | null = null;
    if (noteChanging) {
      const { data: rows, error: readError } = await supabase.from("orders")
        .select("internal_note").eq(idCol, idVal);
      if (readError) {
        return NextResponse.json({ success: false, error: readError.message }, { status: 500 });
      }
      if (!rows?.length) {
        return NextResponse.json({ success: false, error: "Không tìm thấy đơn hàng" }, { status: 404 });
      }
      previousNote = rows[0].internal_note ?? null;
      // Receipt and payment audit segments are owned by the server. Ignore
      // stale/edited client copies and carry forward the current server values.
      const protectedTag = /\[(?:Ảnh biên lai|Khách đã nộp ảnh biên lai CK|HỦY THANH TOÁN|XÁC NHẬN TT TRÊN ĐƠN ĐÃ HỦY)/;
      const segments = (previousNote || "").split(" | ");
      updateData.internal_note = internalNote === undefined ? (previousNote || "") : [
        ...internalNote.split(" | ").filter((part: string) => !protectedTag.test(part)),
        ...segments.filter((part: string) => protectedTag.test(part)),
      ].filter(Boolean).join(" | ");
      if (paymentProof || payment_proof) {
        const proofUrl = paymentProof || payment_proof;
        if (/\[Ảnh biên lai\]:\s*[^\s|]+/.test(updateData.internal_note)) {
          updateData.internal_note = updateData.internal_note.replace(
            /\[Ảnh biên lai\]:\s*[^\s|]+/, () => `[Ảnh biên lai]: ${proofUrl}`
          );
        } else {
          const proofTag = `[Khách đã nộp ảnh biên lai CK - Chờ BTC đối soát] [Ảnh biên lai]: ${proofUrl}`;
          updateData.internal_note = [updateData.internal_note, proofTag].filter(Boolean).join(" | ");
        }
      }
    }

    let query = supabase.from("orders").update(updateData).eq(idCol, idVal);
    if (noteChanging) {
      // Compare-and-set: a concurrent receipt upload/payment trace must not
      // be overwritten between the read above and this UPDATE.
      query = previousNote === null ? query.is("internal_note", null) : query.eq("internal_note", previousNote);
    }
    if (statusChanging) {
      // Guard THỰC THI trong câu lệnh UPDATE (không dựa riêng SELECT trước đó):
      // đơn đang cancelled không khớp filter → 0 rows → không bao giờ bị
      // chuyển sang trạng thái khác (chống hồi sinh kể cả race TOCTOU).
      query = query.neq("order_status", "cancelled");
    }
    const { data: updatedRows, error } = await query.select("order_id, internal_note, assigned_shipper_id, updated_at");

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (statusChanging && (!updatedRows || updatedRows.length === 0)) {
      // UPDATE khớp 0 dòng — phân biệt tường minh: đơn đã hủy hay không tồn tại.
      const { data: freshRows } = await supabase
        .from("orders")
        .select("order_status")
        .eq(idCol, idVal);
      const fresh = Array.isArray(freshRows) && freshRows.length > 0 ? freshRows[0] : null;

      if (!fresh) {
        return NextResponse.json(
          { success: false, outcome: "not_found", error: "Không tìm thấy đơn hàng" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          outcome: "order_cancelled",
          error: "Đơn hàng đã bị hủy — không thể thay đổi trạng thái",
          currentStatus: fresh.order_status ?? null,
        },
        { status: 409 }
      );
    }

    if (!updatedRows?.length) {
      return NextResponse.json(
        { success: false, error: noteChanging ? "Ghi chú đã thay đổi hoặc đơn không còn tồn tại. Vui lòng tải lại và thử lại." : "Không tìm thấy đơn hàng" },
        { status: noteChanging ? 409 : 404 }
      );
    }
    return NextResponse.json({ success: true, order: updatedRows[0] });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: errorMessage(error, "Lỗi cập nhật trạng thái") },
      { status: 500 }
    );
  }
}
