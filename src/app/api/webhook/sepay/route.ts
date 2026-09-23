import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. Authenticate SePay API Key (Header "Authorization: Apikey <SEPAY_API_KEY>")
    const authHeader = request.headers.get("authorization");
    const configuredApiKey = process.env.SEPAY_API_KEY;

    if (configuredApiKey) {
      const expectedBearer = `Apikey ${configuredApiKey}`;
      if (!authHeader || authHeader !== expectedBearer) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Invalid or missing SePay API Key" },
          { status: 401 }
        );
      }
    }

    const payload = await request.json();

    /**
     * SePay Payload Structure:
     * id: number
     * gateway: string (MBBank, VCB, TPBank, etc.)
     * transactionDate: string
     * accountNumber: string
     * amountIn: number
     * amountOut: number
     * transactionContent: string (e.g. "GM-369817 ung ho du an mam mo")
     * referenceNumber: string
     */
    const { id, amountIn, transactionContent, referenceNumber, gateway, accountNumber } = payload;

    if (!transactionContent || typeof amountIn !== "number" || amountIn <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: Missing transactionContent or amountIn" },
        { status: 400 }
      );
    }

    // 2. Extract Order Code from transactionContent
    // Matches GM-123456 or GM123456 or GM-XXXXXX
    const codeMatch = transactionContent.match(/GM[-_]?([0-9]{4,8}|[A-Z0-9]{4,8})/i);
    let matchedOrderCode: string | null = null;

    if (codeMatch) {
      // Normalize to GM-XXXXXX format
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

    // 3. Update Order & Payment Status in Supabase (if configured)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Find matching order
        const { data: order, error: findError } = await supabase
          .from("orders")
          .select("order_id, order_code, final_amount, order_status, payment_status")
          .eq("order_code", matchedOrderCode)
          .single();

        if (findError || !order) {
          console.warn(`SePay Webhook: Order #${matchedOrderCode} not found in database.`);
        } else {
          // Confirm payment & advance order status
          const newOrderStatus = order.order_status === "pending" ? "confirmed" : order.order_status;

          await supabase
            .from("orders")
            .update({
              payment_status: "paid",
              order_status: newOrderStatus,
              internal_note: `Tự động duyệt thanh toán qua SePay Webhook (Mã GD: ${id || referenceNumber}, Ngân hàng: ${gateway}). Số tiền nhận: ${amountIn.toLocaleString("vi-VN")}đ.`,
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
          if (resendApiKey && (order as any).buyer_email) {
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
                  to: [(order as any).buyer_email],
                  subject: `✓ Đã nhận thanh toán cho đơn hàng #${order.order_code} - Gieo Mơ`,
                  html: generatePaymentReceivedHtml(order as any),
                }),
              });
            } catch (mailErr) {
              console.error("SePay Webhook: Error sending payment email:", mailErr);
            }
          }
        }
      } catch (dbErr) {
        console.error("SePay Webhook: Database update error:", dbErr);
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
