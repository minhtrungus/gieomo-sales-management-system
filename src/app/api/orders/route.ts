import { NextResponse } from "next/server";
import { createOrderServer, getOrdersServer } from "@/lib/services/orderService";
import { getAuthenticatedUser, requireAdmin, requireAuth } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code") || undefined;
    const phone = searchParams.get("phone") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;

    const user = await getAuthenticatedUser(request);
    const isAdmin = Boolean(user && (user.role === "admin" || user.role === "btc_sale"));

    // If requester is not admin, order code is strictly mandatory to prevent customer phone enumeration
    if (!isAdmin && !code) {
      return NextResponse.json(
        {
          success: false,
          error: "Yêu cầu mã đơn hàng để tra cứu (401 Unauthorized)",
        },
        { status: 401 }
      );
    }

    const orders = await getOrdersServer({ code, phone, limit, isAdmin });
    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Lỗi truy vấn đơn hàng" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await getAuthenticatedUser(request);
    const result = await createOrderServer(body, { memberId: user?.memberId ?? null });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Không thể tạo đơn hàng" },
        { status: result.conflict ? 409 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderCode: result.orderCode,
      finalAmount: result.finalAmount,
      proofToken: result.proofToken,
      replayed: result.replayed,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Lỗi xử lý yêu cầu" },
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
      cancelReason,
    } = body;

    const idOrCode = orderCode || orderId;
    if (!idOrCode) {
      return NextResponse.json({ success: false, error: "Missing orderCode or orderId" }, { status: 400 });
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    if (orderStatus === "cancelled") {
      if (
        deliveryStatus !== undefined ||
        delivery_status !== undefined ||
        assignedShipperId !== undefined ||
        internalNote !== undefined ||
        paymentProof !== undefined ||
        payment_proof !== undefined
      ) {
        return NextResponse.json(
          { success: false, error: "Cancellation must be submitted as a standalone operation." },
          { status: 400 }
        );
      }

      const identity = orderCode
        ? { order_code: String(orderCode).trim().toUpperCase() }
        : { order_id: String(orderId).trim() };
      const { data, error } = await supabase.rpc("cancel_order_atomic", {
        p: {
          ...identity,
          actor_member_id: authCheck.user.memberId,
          reason: typeof cancelReason === "string" ? cancelReason.trim() : "",
        },
      });

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      const result = data as {
        outcome?: string;
        refund_required?: boolean;
      } | null;

      if (result?.outcome === "cancelled" || result?.outcome === "already_cancelled") {
        return NextResponse.json({
          success: true,
          alreadyCancelled: result.outcome === "already_cancelled",
          refundRequired: result.refund_required === true,
        });
      }

      const status = result?.outcome === "not_found" ? 404
        : result?.outcome === "invalid_identity" || result?.outcome === "invalid_actor" ? 400
          : 409;
      return NextResponse.json(
        {
          success: false,
          error: `Cancellation rejected: ${result?.outcome || "invalid_rpc_result"}`,
          outcome: result?.outcome || "invalid_rpc_result",
        },
        { status }
      );
    }

    const updateData: any = { updated_at: new Date().toISOString() };

    if (orderStatus) {
      updateData.order_status = orderStatus;
      if (orderStatus === "completed") updateData.completed_at = new Date().toISOString();
      if (orderStatus === "confirmed") updateData.confirmed_at = new Date().toISOString();
    }
    const resolvedDelivery = deliveryStatus || delivery_status;
    if (resolvedDelivery) {
      updateData.delivery_status = resolvedDelivery;
    }
    if (assignedShipperId !== undefined) {
      updateData.assigned_shipper_id = assignedShipperId || null;
    }
    if (internalNote !== undefined) {
      updateData.internal_note = internalNote;
    }
    if (paymentProof || payment_proof) {
      const proofUrl = paymentProof || payment_proof;
      const proofTag = `[Khách đã nộp ảnh biên lai CK - Chờ BTC đối soát] [Ảnh biên lai]: ${proofUrl}`;
      updateData.internal_note = updateData.internal_note
        ? `${updateData.internal_note} | ${proofTag}`
        : proofTag;
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);

    let query = supabase.from("orders").update(updateData);
    if (orderCode) {
      query = query.eq("order_code", orderCode.trim().toUpperCase());
    } else if (isUuid) {
      query = query.eq("order_id", idOrCode);
    } else {
      query = query.eq("order_code", idOrCode.trim().toUpperCase());
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Lỗi cập nhật trạng thái" },
      { status: 500 }
    );
  }
}
