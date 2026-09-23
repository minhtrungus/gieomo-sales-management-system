import { NextResponse } from "next/server";
import { createOrderServer, getOrdersServer } from "@/lib/services/orderService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code") || undefined;
    const phone = searchParams.get("phone") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;

    const orders = await getOrdersServer({ code, phone, limit });
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
    const result = await createOrderServer(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Không thể tạo đơn hàng" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: result.orderId,
      orderCode: result.orderCode,
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
    const { orderCode, orderId, orderStatus, paymentStatus } = await request.json();
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();

    const updateData: any = { updated_at: new Date().toISOString() };
    if (orderStatus) {
      updateData.order_status = orderStatus;
      if (orderStatus === "completed") updateData.completed_at = new Date().toISOString();
    }
    if (paymentStatus) {
      updateData.payment_status = paymentStatus;
    }

    let query = supabase.from("orders").update(updateData);
    if (orderCode) {
      query = query.eq("order_code", orderCode);
    } else if (orderId) {
      query = query.eq("order_id", orderId);
    } else {
      return NextResponse.json({ success: false, error: "Missing orderCode or orderId" }, { status: 400 });
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
