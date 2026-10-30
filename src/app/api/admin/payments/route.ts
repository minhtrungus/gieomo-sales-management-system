import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/serverAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const supabase = createAdminClient();
  const ordersResult = await supabase
    .from("orders")
    .select("order_id, order_code, created_at, payment_status, final_amount, receiver_name, receiver_phone")
    .order("created_at", { ascending: false })
    .limit(200);
  if (ordersResult.error) {
    return NextResponse.json({ success: false, error: "Không thể tải danh sách thanh toán" }, { status: 500 });
  }

  let orders = ordersResult.data || [];
  if (orders.length > 0) {
    const archivedResult = await supabase
      .from("admin_order_archives")
      .select("order_id")
      .in("order_id", orders.map((order) => order.order_id));
    const missingArchiveMigration = archivedResult.error &&
      (archivedResult.error.code === "PGRST205" || archivedResult.error.code === "42P01");
    if (archivedResult.error && !missingArchiveMigration) {
      return NextResponse.json({ success: false, error: "Không thể xác minh danh sách đơn đã xóa" }, { status: 500 });
    }
    const archivedIds = new Set((archivedResult.data || []).map((row) => row.order_id));
    orders = orders.filter((order) => !archivedIds.has(order.order_id));
  }
  const orderIds = orders.map((order) => order.order_id);
  const paymentsResult = orderIds.length === 0
    ? { data: [], error: null }
    : await supabase
        .from("payments")
        .select("payment_id, order_id, amount, payment_method, payment_status, transaction_code, created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
  if (paymentsResult.error) {
    return NextResponse.json({ success: false, error: "Không thể tải sổ giao dịch thanh toán" }, { status: 500 });
  }

  const paymentsByOrder = new Map<string, typeof paymentsResult.data>();
  for (const payment of paymentsResult.data || []) {
    const rows = paymentsByOrder.get(payment.order_id) || [];
    rows.push(payment);
    paymentsByOrder.set(payment.order_id, rows);
  }

  return NextResponse.json({
    success: true,
    records: orders.map((order) => ({
      ...order,
      expected_amount: order.final_amount,
      payments: (paymentsByOrder.get(order.order_id) || []).map((payment) => ({
        payment_id: payment.payment_id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        status: payment.payment_status,
        transaction_code: payment.transaction_code,
        created_at: payment.created_at,
      })),
    })),
  });
}
