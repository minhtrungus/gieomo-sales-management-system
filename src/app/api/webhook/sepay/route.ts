import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function apiKeysMatch(provided: string, configured: string): boolean {
  const left = createHash("sha256").update(provided, "utf8").digest();
  const right = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(left, right);
}

function response(status: number, body: Record<string, unknown>): Response {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const configuredKey = (process.env.SEPAY_API_KEY || "").trim();
    if (!configuredKey) {
      console.error("[SePay] SEPAY_API_KEY is not configured");
      return response(500, { success: false, error: "Webhook authentication is not configured" });
    }
    const auth = request.headers.get("authorization") || request.headers.get("x-api-key") || "";
    const token = auth.replace(/^(?:Apikey|Bearer)\s+/i, "").trim();
    if (!token || !apiKeysMatch(token, configuredKey)) {
      return response(401, { success: false, error: "Unauthorized" });
    }

    const payload = await request.json();
    const content = String(
      payload.transactionContent || payload.content || payload.description || payload.body || payload.code || ""
    );
    const providerId = payload.referenceNumber || payload.reference_number || payload.id;
    const transactionCode = providerId === undefined || providerId === null ? "" : String(providerId).trim();
    const rawAmount = payload.amountIn ?? payload.amount_in ?? payload.transferAmount ?? payload.amount;
    const amount = Number(rawAmount);

    if (!content && (!Number.isFinite(amount) || amount <= 0)) {
      return response(200, { success: true, test: true });
    }
    if (!transactionCode) {
      return response(422, {
        success: false,
        outcome: "missing_transaction_identity",
        needs_review: true,
        error: "Webhook thiếu định danh giao dịch bền vững",
      });
    }

    const supabase = createAdminClient();
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ provider: "sepay", transactionCode, amount }))
      .digest("hex");

    if (!Number.isFinite(amount) || amount <= 0) {
      const { error } = await supabase.from("payment_events").insert({
        provider: "sepay",
        provider_transaction_id: transactionCode,
        received_amount: null,
        classification: "unmatched_reference",
        outcome: "invalid_amount",
        payload_fingerprint: fingerprint,
      });
      if (error) return response(500, { success: false, error: "Không lưu được payment event" });
      return response(422, { success: false, outcome: "invalid_amount", needs_review: true });
    }

    const match = content.match(/GM[-_]?([0-9]{4,8}|[A-Z0-9]{4,8})/i);
    const orderCode = match
      ? (match[0].toUpperCase().includes("-")
          ? match[0].toUpperCase()
          : `GM-${match[0].toUpperCase().replace("GM", "")}`)
      : null;

    if (!orderCode) {
      const { error } = await supabase.from("payment_events").insert({
        provider: "sepay",
        provider_transaction_id: transactionCode,
        received_amount: amount,
        classification: "unmatched_reference",
        outcome: "no_order_reference",
        payload_fingerprint: fingerprint,
      });
      if (error) return response(500, { success: false, error: "Không lưu được payment event" });
      return response(200, {
        success: false,
        outcome: "no_order_reference",
        needs_review: true,
        message: "Đã lưu giao dịch để đối soát; không tìm thấy mã đơn trong nội dung",
      });
    }

    const { data, error } = await supabase.rpc("apply_payment_event", {
      p: {
        order_code: orderCode,
        amount,
        transaction_code: transactionCode,
        payment_method: "banking",
        provider: "sepay",
        gateway: payload.gateway ? String(payload.gateway) : null,
        account_number: payload.accountNumber || payload.account_number || null,
        source: "webhook",
        note: "SePay webhook",
      },
    });
    if (error) {
      console.error("[SePay] apply_payment_event failed:", error.message);
      return response(500, {
        success: false,
        error: "Không ghi nhận được giao dịch; yêu cầu nhà cung cấp retry",
        retryable: true,
      });
    }
    if (!data || typeof data.outcome !== "string") {
      return response(500, { success: false, error: "Payment RPC returned an invalid result", retryable: true });
    }

    const success = data.outcome === "applied" || data.outcome === "duplicate";
    let canonicalOrderPaymentStatus: string | null = null;
    if (data.order_id) {
      const { data: canonicalOrder, error: canonicalOrderError } = await supabase
        .from("orders")
        .select("payment_status")
        .eq("order_id", data.order_id)
        .maybeSingle();
      if (canonicalOrderError) {
        console.error("[SePay] cannot read canonical order payment status:", canonicalOrderError.message);
      } else {
        canonicalOrderPaymentStatus = canonicalOrder?.payment_status ?? null;
      }
    }
    return response(200, {
      success,
      outcome: data.outcome,
      needs_review: data.needs_review === true,
      message: data.message,
      matched_order_code: orderCode,
      order_id: data.order_id ?? null,
      payment_id: data.payment_id ?? null,
      // Backward-compatible: payment_status is the newly recorded payment row.
      payment_status: data.payment_status ?? null,
      payment_record_status: data.payment_status ?? null,
      order_payment_status: canonicalOrderPaymentStatus,
      order_status: data.order_status ?? null,
      amount_received: data.amount_received ?? amount,
      amount_expected: data.amount_expected ?? null,
    });
  } catch (error) {
    console.error("[SePay] webhook exception:", error);
    return response(500, { success: false, error: "Internal Server Error", retryable: true });
  }
}
