import { NextResponse } from "next/server";
import { generateOrderConfirmationHtml, generatePaymentReceivedHtml } from "@/lib/utils/emailService";
import type { Order } from "@/types/database";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, order, toEmail } = body as {
      type: "order_confirmation" | "payment_received";
      order: Order;
      toEmail?: string;
    };

    if (!order || !order.order_code) {
      return NextResponse.json(
        { success: false, error: "Missing order information" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const recipient = toEmail || process.env.ADMIN_NOTIFICATION_EMAIL || "gieomo@mammo.vn";
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Gieo Mơ <onboarding@resend.dev>";

    let subject = "";
    let html = "";

    if (type === "order_confirmation") {
      subject = `🌱 Xác nhận đơn hàng #${order.order_code} - Gieo Mơ (Mầm Mơ)`;
      html = generateOrderConfirmationHtml(order);
    } else if (type === "payment_received") {
      subject = `✓ Đã nhận thanh toán cho đơn hàng #${order.order_code} - Gieo Mơ`;
      html = generatePaymentReceivedHtml(order);
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid notification type" },
        { status: 400 }
      );
    }

    if (resendApiKey) {
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

    // In development or when no key configured, simulate success
    return NextResponse.json({
      success: true,
      simulated: true,
      message: "Email queued (RESEND_API_KEY not configured).",
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
