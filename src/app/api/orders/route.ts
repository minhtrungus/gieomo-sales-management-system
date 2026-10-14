import { NextResponse } from "next/server";
import { createOrderServer, getOrdersServer, createVoucherCasOps, releaseVoucherSlot } from "@/lib/services/orderService";
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
    const {
      orderCode,
      orderId,
      orderStatus,
      paymentStatus,
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

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    const updateData: any = { updated_at: new Date().toISOString() };

    if (orderStatus) {
      updateData.order_status = orderStatus;
      if (orderStatus === "completed") updateData.completed_at = new Date().toISOString();
      if (orderStatus === "confirmed") updateData.confirmed_at = new Date().toISOString();
      if (orderStatus === "cancelled") updateData.cancelled_at = new Date().toISOString();
    }
    if (paymentStatus) {
      updateData.payment_status = paymentStatus;
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

    if (orderStatus === "cancelled") {
      let cancelQuery = supabase
        .from("orders")
        .update(updateData)
        .neq("order_status", "cancelled");
      if (orderCode) {
        cancelQuery = cancelQuery.eq("order_code", orderCode.trim().toUpperCase());
      } else if (isUuid) {
        cancelQuery = cancelQuery.eq("order_id", idOrCode);
      } else {
        cancelQuery = cancelQuery.eq("order_code", idOrCode.trim().toUpperCase());
      }

      const { data, error } = await cancelQuery.select("order_id, voucher_id");

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        return NextResponse.json({ success: true, alreadyCancelled: true });
      }

      const voucherId = rows[0]?.voucher_id as string | null | undefined;
      if (voucherId) {
        const ops = createVoucherCasOps(supabase);
        const outcome = await releaseVoucherSlot(ops, voucherId);
        if (outcome !== "released") {
          console.error("[orders PATCH] voucher-release-after-cancel-failed", {
            orderId: rows[0]?.order_id,
            voucherId,
            outcome,
          });
        }
      }

      return NextResponse.json({ success: true });
    }

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
