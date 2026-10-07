import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    // 1. Authenticate SePay API Key (Header "Authorization: Apikey <SEPAY_API_KEY>")
    const authHeader = request.headers.get("authorization") || request.headers.get("x-api-key") || "";
    const configuredApiKey = (process.env.SEPAY_API_KEY || "").trim();

    if (configuredApiKey) {
      const token = authHeader.replace(/^(Apikey|Bearer|apikey)\s+/i, "").trim();
      if (!token || token !== configuredApiKey) {
        console.warn(`[SePay Webhook] 401 Unauthorized: Received token '${token}'`);
        return NextResponse.json(
          {
            success: false,
            error: "Unauthorized: Invalid or missing SePay API Key",
          },
          { status: 401 }
        );
      }
    } else if (process.env.NODE_ENV === "production") {
      console.error("[SePay Webhook] SEPAY_API_KEY environment variable is missing in production.");
      return NextResponse.json(
        { success: false, error: "Server Misconfiguration: SEPAY_API_KEY not configured" },
        { status: 500 }
      );
    }

    const payload = await request.json();

    const transactionContent: string =
      payload.transactionContent ||
      payload.content ||
      payload.description ||
      payload.body ||
      payload.code ||
      "";

    const id = payload.id || "";
    const referenceNumber = payload.referenceNumber || payload.reference_number || "";
    const gateway = payload.gateway || "Bank";
    const accountNumber = payload.accountNumber || payload.account_number || "";

    const rawAmount =
      payload.amountIn ??
      payload.amount_in ??
      payload.transferAmount ??
      payload.amount ??
      0;
    const amountIn = typeof rawAmount === "string" ? parseFloat(rawAmount) || 0 : Number(rawAmount) || 0;

    // Handle test pings from SePay
    if (!transactionContent && amountIn <= 0) {
      return NextResponse.json(
        {
          success: true,
          message: "SePay Webhook test ping received successfully. Endpoint is active and ready.",
          test: true,
        },
        { status: 200 }
      );
    }

    // 2. Extract Order Code from transactionContent (GM-XXXXXX)
    const codeMatch = transactionContent.match(/GM[-_]?([0-9]{4,8}|[A-Z0-9]{4,8})/i);
    let matchedOrderCode: string | null = null;

    if (codeMatch) {
      const rawCode = codeMatch[0].toUpperCase();
      matchedOrderCode = rawCode.includes("-") ? rawCode : `GM-${rawCode.replace("GM", "")}`;
    }

    if (!matchedOrderCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Transaction received, but no valid Gieo Mơ order code (GM-...) was found in the content.",
          transactionContent,
        },
        { status: 200 }
      );
    }

    // 3. Update Order & Payment Status in Supabase
    const supabase = createAdminClient();

    // Find matching order
    const { data: order, error: findError } = await supabase
      .from("orders")
      .select("order_id, order_code, final_amount, order_status, payment_status, internal_note")
      .eq("order_code", matchedOrderCode)
      .maybeSingle();

    if (findError || !order) {
      console.warn(`SePay Webhook: Order #${matchedOrderCode} not found in database.`);
      return NextResponse.json(
        {
          success: false,
          message: `Order #${matchedOrderCode} not found in database.`,
        },
        { status: 200 }
      );
    }

    // Check Idempotency: If already paid, return early to prevent duplicate records
    if (order.payment_status === "paid") {
      return NextResponse.json({
        success: true,
        message: `Order #${matchedOrderCode} was already marked as paid.`,
        matched_order_code: matchedOrderCode,
      });
    }

    // 4. Verify Amount: Ensure amount received meets or exceeds order final_amount
    const isAmountSufficient = amountIn >= (order.final_amount || 0);

    if (!isAmountSufficient) {
      const note = `[CẢNH BÁO SEPAY] Khách chuyển thiếu tiền. Cần: ${(order.final_amount || 0).toLocaleString("vi-VN")}đ, Nhận: ${amountIn.toLocaleString("vi-VN")}đ. Mã GD: ${id || referenceNumber}.`;
      await supabase
        .from("orders")
        .update({
          internal_note: order.internal_note ? `${order.internal_note} | ${note}` : note,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", order.order_id);

      return NextResponse.json({
        success: false,
        message: `Số tiền chuyển (${amountIn}đ) nhỏ hơn tổng đơn (${order.final_amount}đ). Ghi chú đơn đã được cập nhật để đối soát thủ công.`,
        matched_order_code: matchedOrderCode,
        amount_received: amountIn,
        amount_required: order.final_amount,
      });
    }

    // Confirm payment & advance order status
    const newOrderStatus = order.order_status === "pending" ? "confirmed" : order.order_status;
    const paymentNote = `Tự động duyệt thanh toán qua SePay Webhook (Mã GD: ${id || referenceNumber}, Ngân hàng: ${gateway}). Số tiền nhận: ${amountIn.toLocaleString("vi-VN")}đ.`;

    await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        order_status: newOrderStatus,
        confirmed_at: order.order_status === "pending" ? new Date().toISOString() : undefined,
        internal_note: order.internal_note ? `${order.internal_note} | ${paymentNote}` : paymentNote,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.order_id);

    // Insert payment record
    await supabase.from("payments").insert([
      {
        order_id: order.order_id,
        amount: amountIn,
        payment_method: "banking",
        transaction_code: referenceNumber || `SEPAY-${id}`,
        status: "paid",
        confirmed_at: new Date().toISOString(),
      },
    ]);

    // Send payment confirmation email via Resend if configured
    const resendApiKey = process.env.RESEND_API_KEY;
    const { data: customerData } = await supabase
      .from("customers")
      .select("email, full_name")
      .eq("customer_id", (order as any).customer_id || "")
      .maybeSingle();

    if (resendApiKey && customerData?.email) {
      try {
        const { generatePaymentReceivedHtml } = await import("@/lib/utils/emailService");
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || "Gieo Mơ <onboarding@resend.dev>",
            to: [customerData.email],
            subject: `✓ Đã nhận thanh toán cho đơn hàng #${order.order_code} - Gieo Mơ`,
            html: generatePaymentReceivedHtml({
              ...order,
              buyer_name: customerData.full_name,
              buyer_email: customerData.email,
            } as any),
          }),
        });
      } catch (mailErr) {
        console.error("SePay Webhook: Error sending payment email:", mailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã tự động xác nhận thanh toán đơn #${matchedOrderCode} thành công qua SePay.`,
      matched_order_code: matchedOrderCode,
      amount_received: amountIn,
      transaction_id: id || referenceNumber,
    });
  } catch (error) {
    console.error("SePay Webhook handling error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error processing webhook" },
      { status: 500 }
    );
  }
}
