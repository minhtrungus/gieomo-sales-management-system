import { NextResponse } from "next/server";
import { generateOrderConfirmationHtml, generatePaymentReceivedHtml } from "@/lib/utils/emailService";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, orderCode, orderId } = body as {
      type: "order_confirmation" | "payment_received";
      orderCode?: string;
      orderId?: string;
      order?: any;
    };

    const targetCode = orderCode || body.order?.order_code || orderId || body.order?.order_id;

    if (!targetCode) {
      return NextResponse.json(
        { success: false, error: "Missing order information" },
        { status: 400 }
      );
    }

    // Fetch verified order from database to prevent email relay spoofing
    const supabase = createAdminClient();
    const { data: dbOrder, error: dbError } = await supabase
      .from("orders")
      .select(`
        order_id,
        order_code,
        receiver_name,
        receiver_phone,
        delivery_type,
        shipping_address_snapshot,
        subtotal,
        shipping_fee,
        voucher_discount,
        final_amount,
        order_status,
        payment_status,
        delivery_status,
        payment_method,
        customer_note,
        created_at,
        customers (
          full_name,
          phone,
          email
        ),
        order_items (
          item_name_snapshot,
          variant_name_snapshot,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .or(`order_code.eq.${targetCode.toUpperCase()},order_id.eq.${targetCode}`)
      .maybeSingle();

    if (dbError || !dbOrder) {
      return NextResponse.json(
        { success: false, error: "Đơn hàng không tồn tại trong hệ thống" },
        { status: 404 }
      );
    }

    const verifiedRecipientEmail = (dbOrder.customers as any)?.email;
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "gieomo@mammo.vn";
    const recipient = verifiedRecipientEmail || adminEmail;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Gieo Mơ <onboarding@resend.dev>";

    const orderPayload: any = {
      ...dbOrder,
      buyer_name: (dbOrder.customers as any)?.full_name || dbOrder.receiver_name,
      buyer_email: verifiedRecipientEmail,
      recipient_name: dbOrder.receiver_name,
      recipient_phone: dbOrder.receiver_phone,
      address_detail: dbOrder.shipping_address_snapshot,
      discount_amount: dbOrder.voucher_discount,
      items: dbOrder.order_items || [],
    };

    let subject = "";
    let html = "";

    if (type === "order_confirmation") {
      subject = `🌱 Xác nhận đơn hàng #${dbOrder.order_code} - Gieo Mơ (Mầm Mơ)`;
      html = generateOrderConfirmationHtml(orderPayload);
    } else if (type === "payment_received") {
      subject = `✓ Đã nhận thanh toán cho đơn hàng #${dbOrder.order_code} - Gieo Mơ`;
      html = generatePaymentReceivedHtml(orderPayload);
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid notification type" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && verifiedRecipientEmail) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient],
            subject,
            html,
          }),
        });

        const data = await response.json();
        return NextResponse.json({ success: true, provider: "resend", data });
      } catch (err: any) {
        console.error("Resend API error:", err);
        return NextResponse.json({
          success: false,
          error: "Failed to send email via Resend",
          detail: err?.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      simulated: true,
      message: "Email queued (verified recipient).",
      recipient,
      subject,
    });
  } catch (error: any) {
    console.error("Email notification route error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
