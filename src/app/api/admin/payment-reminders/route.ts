import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/serverAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePaymentReminderHtml } from "@/lib/utils/emailService";
import type { Order } from "@/types/database";

export const dynamic = "force-dynamic";
type ReminderBody = { action?: "preview" | "send"; orderId?: string };

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const body = (await request.json()) as ReminderBody;
    if (!body.orderId || !body.action || !["preview", "send"].includes(body.action)) {
      return NextResponse.json({ success: false, error: "Yêu cầu nhắc thanh toán không hợp lệ" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: row, error: orderError } = await supabase.from("orders").select(`
      order_id, order_code, customer_id, receiver_name, receiver_phone,
      final_amount, subtotal, shipping_fee, voucher_discount, payment_method,
      payment_status, order_status, delivery_status, created_at,
      customers(full_name, email)
    `).eq("order_id", body.orderId).maybeSingle();
    if (orderError || !row) return NextResponse.json({ success: false, error: "Không tìm thấy đơn hàng" }, { status: 404 });

    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    if (row.payment_status !== "pending" || !["pending", "confirmed"].includes(row.order_status) || row.payment_method !== "banking") {
      return NextResponse.json({ success: false, error: "Trạng thái mới nhất của đơn không còn đủ điều kiện nhắc" }, { status: 409 });
    }
    if (!customer?.email) return NextResponse.json({ success: false, error: "Khách hàng chưa có email" }, { status: 422 });

    const order = {
      ...row,
      buyer_name: customer.full_name || row.receiver_name,
      buyer_email: customer.email,
      discount_amount: row.voucher_discount,
    } as unknown as Order;
    const subject = `Nhắc thanh toán đơn #${row.order_code} - Gieo Mơ`;
    const html = generatePaymentReminderHtml(order);
    if (body.action === "preview") {
      return NextResponse.json({ success: true, preview: { subject, html } });
    }

    const { data: claim, error: claimError } = await supabase.rpc("claim_payment_reminder", {
      p: { order_id: body.orderId, actor_member_id: auth.user.memberId },
    });
    if (claimError) {
      console.error("[payment-reminders] claim failed:", claimError.message);
      return NextResponse.json({ success: false, error: "Không thể khóa lượt gửi nhắc" }, { status: 500 });
    }
    if (claim?.outcome !== "claimed") {
      return NextResponse.json({ success: false, outcome: claim?.outcome, retryAfter: claim?.retry_after, error: "Đơn không còn đủ điều kiện hoặc đang trong thời gian chờ 24 giờ" }, { status: 409 });
    }

    const deliveryEnabled = process.env.NODE_ENV === "production" && process.env.PAYMENT_REMINDER_DELIVERY_ENABLED === "true";
    const resendKey = process.env.RESEND_API_KEY;
    if (!deliveryEnabled || !resendKey) {
      await supabase.from("payment_reminders").update({ status: "simulated", completed_at: new Date().toISOString() }).eq("reminder_id", claim.reminder_id);
      return NextResponse.json({ success: true, simulated: true, message: "Đã ghi nhận lượt nhắc mô phỏng; không gửi email thật." });
    }

    const providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Gieo Mơ <onboarding@resend.dev>",
        to: [claim.recipient_email], subject, html,
      }),
    });
    const providerData = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      await supabase.from("payment_reminders").update({ status: "failed", error_message: "Provider rejected request", completed_at: new Date().toISOString() }).eq("reminder_id", claim.reminder_id);
      return NextResponse.json({ success: false, error: "Nhà cung cấp email từ chối yêu cầu" }, { status: 502 });
    }
    await supabase.from("payment_reminders").update({ status: "sent", provider_message_id: providerData?.id || null, completed_at: new Date().toISOString() }).eq("reminder_id", claim.reminder_id);
    return NextResponse.json({ success: true, simulated: false, message: "Đã gửi email nhắc thanh toán." });
  } catch (error) {
    console.error("[payment-reminders] unexpected error:", error);
    return NextResponse.json({ success: false, error: "Không thể xử lý lời nhắc thanh toán" }, { status: 500 });
  }
}
