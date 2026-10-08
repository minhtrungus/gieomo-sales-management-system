import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, requireAdmin, requireAuth } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    const { orderId, orderCode, action, reason } = body;

    if (!orderId && !orderCode) {
      return NextResponse.json(
        { success: false, error: "Thiếu orderId hoặc orderCode" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Find order
    let query = supabase.from("orders").select(`
      order_id,
      order_code,
      payment_status,
      order_status,
      final_amount,
      customer_id,
      internal_note
    `);

    if (orderCode) {
      query = query.eq("order_code", orderCode.trim().toUpperCase());
    } else if (orderId) {
      query = query.eq("order_id", orderId);
    }

    const { data: order, error: findError } = await query.maybeSingle();

    if (findError || !order) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy đơn hàng` },
        { status: 404 }
      );
    }

    // Check current state
    if (order.payment_status === "paid") {
      return NextResponse.json({
        success: false,
        error: "Đơn hàng này đã được xác nhận thanh toán trước đó.",
        isAlreadyPaid: true,
      });
    }

    // Business rule: Only "pending" orders can be confirmed
    if (order.order_status !== "pending" && action === "confirm") {
      return NextResponse.json({
        success: false,
        error: "Đơn hàng không ở trạng thái pending, không thể xác nhận thanh toán.",
      });
    }

    // CONFIRM ACTION
    if (action === "confirm") {
      // Verify amount - in real system, would check payment gateway
      // For now, admin confirmation marks as paid
      const newPaymentStatus = "paid";
      const newOrderStatus = order.order_status === "pending" ? "confirmed" : order.order_status;

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          payment_status: newPaymentStatus,
          order_status: newOrderStatus,
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", order.order_id);

      if (updateError) {
        console.error("[POST /api/orders/payment] DB error:", updateError);
        return NextResponse.json(
          { success: false, error: "Lỗi cập nhật trạng thái thanh toán" },
          { status: 500 }
        );
      }

      // Insert payment record
      await supabase.from("payments").insert([
        {
          order_id: order.order_id,
          amount: order.final_amount || 0,
          payment_method: "banking",
          transaction_code: `ADMIN-CONFIRM-${order.order_code}`,
          status: "paid",
          confirmed_at: new Date().toISOString(),
        },
      ]);

      // Insert audit log
      await supabase.from("order_status_history").insert({
        order_id: order.order_id,
        status_type: "payment",
        from_status: order.payment_status,
        to_status: newPaymentStatus,
        note: `Xác nhận thanh toán thủ công bởi admin`,
      });

      return NextResponse.json({
        success: true,
        message: `Đã xác nhận thanh toán đơn hàng #${order.order_code} thành công.`,
        orderId: order.order_id,
        orderCode: order.order_code,
        paymentStatus: newPaymentStatus,
        orderStatus: newOrderStatus,
      });
    }

    // REJECT ACTION
    if (action === "reject") {
      if (!reason) {
        return NextResponse.json(
          { success: false, error: "Lý do từ chối là bắt buộc" },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          payment_status: "failed",
          order_status: order.order_status, // Keep order status unchanged
          internal_note: order.internal_note
            ? `${order.internal_note} | [HỦY THANH TOÁN] Lý do: ${reason}`
            : `[HỦY THANH TOÁN] Lý do: ${reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", order.order_id);

      if (updateError) {
        console.error("[POST /api/orders/payment] DB error:", updateError);
        return NextResponse.json(
          { success: false, error: "Lỗi cập nhật trạng thái từ chối" },
          { status: 500 }
        );
      }

      // Insert audit log
      await supabase.from("order_status_history").insert({
        order_id: order.order_id,
        status_type: "payment",
        from_status: order.payment_status,
        to_status: "failed",
        note: `Từ chối thanh toán bởi admin: ${reason}`,
      });

      return NextResponse.json({
        success: true,
        message: `Đã từ chối thanh toán đơn hàng #${order.order_code}.`,
        orderId: order.order_id,
        orderCode: order.order_code,
        paymentStatus: "failed",
        reason,
      });
    }

    // INVALID ACTION
    return NextResponse.json(
      { success: false, error: "Hành động không hợp lệ. Chọn: confirm hoặc reject." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[POST /api/orders/payment] Exception:", error);
    return NextResponse.json(
      { success: false, error: "Lỗi máy chủ khi xử lý thanh toán" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderCode = searchParams.get("orderCode") || undefined;

    if (!orderCode) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số orderCode" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        order_id,
        order_code,
        payment_status,
        order_status,
        final_amount,
        customer_id,
        internal_note
      `)
      .eq("order_code", orderCode.trim().toUpperCase())
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy đơn hàng #${orderCode}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    console.error("[GET /api/orders/payment] Exception:", error);
    return NextResponse.json(
      { success: false, error: "Lỗi máy chủ" },
      { status: 500 }
    );
  }
}