import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOrderProofToken, getAuthenticatedUser } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

const MAX_PROOF_SIZE = 5 * 1024 * 1024; // 5MB limit
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function detectImageMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let orderCode = "";
    let token = "";
    let phone = "";
    let paymentProofUrl = "";
    let customNote = "";
    let fileToUpload: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      orderCode = (formData.get("orderCode") as string || "").trim().toUpperCase();
      token = (formData.get("token") as string || "").trim();
      phone = (formData.get("phone") as string || "").trim().replace(/\D/g, "");
      paymentProofUrl = (formData.get("paymentProof") as string || "").trim();
      customNote = (formData.get("note") as string || "").trim();
      fileToUpload = formData.get("file") as File | null;
    } else {
      const body = await request.json();
      orderCode = (body.orderCode || "").trim().toUpperCase();
      token = (body.token || "").trim();
      phone = (body.phone || "").trim().replace(/\D/g, "");
      paymentProofUrl = (body.paymentProof || "").trim();
      customNote = (body.note || "").trim();
    }

    // 1. Validate Order Code format
    if (!orderCode || !/^GM-[A-Z0-9]{4,10}$/i.test(orderCode)) {
      return NextResponse.json(
        { success: false, error: "Mã đơn hàng không hợp lệ (Ví dụ: GM-369817)" },
        { status: 400 }
      );
    }

    // 2. Reject client-supplied external paymentProof URL
    if (paymentProofUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Không chấp nhận URL biên lai bên ngoài. Vui lòng tải tệp ảnh trực tiếp qua biểu mẫu!",
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 3. Fetch order to verify existence, payment status, and ownership
    const { data: order, error: fetchErr } = await supabase
      .from("orders")
      .select("order_id, order_code, receiver_phone, payment_status, order_status, internal_note, payment_proof, customers (phone)")
      .eq("order_code", orderCode)
      .maybeSingle();

    if (fetchErr || !order) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy đơn hàng #${orderCode}` },
        { status: 404 }
      );
    }

    // 4. Block proof overwrite if order is already paid (HTTP 409 Conflict)
    if (order.payment_status === "paid") {
      return NextResponse.json(
        {
          success: false,
          error: "Đơn hàng này đã được xác nhận thanh toán thành công. Không thể cập nhật lại biên lai!",
          isPaid: true,
        },
        { status: 409 }
      );
    }

    // 5. Authorization check:
    // a. Admin session
    const adminUser = await getAuthenticatedUser(request);
    const isAdmin = Boolean(adminUser && adminUser.role === "admin");

    // b. Cryptographic capability token verification
    const isTokenValid = token ? verifyOrderProofToken(token, order.order_code) : false;

    // c. Customer phone exact normalized match (NO includes / startsWith / endsWith)
    const normalizedInputPhone = phone.replace(/\D/g, "").trim();
    const normalizedReceiverPhone = (order.receiver_phone || "").replace(/\D/g, "").trim();
    const normalizedBuyerPhone = ((order.customers as any)?.phone || "").replace(/\D/g, "").trim();

    const isPhoneMatched = Boolean(
      normalizedInputPhone &&
      normalizedInputPhone.length >= 8 &&
      (
        (normalizedReceiverPhone && normalizedInputPhone === normalizedReceiverPhone) ||
        (normalizedBuyerPhone && normalizedInputPhone === normalizedBuyerPhone)
      )
    );

    if (!isAdmin && !isTokenValid && !isPhoneMatched) {
      return NextResponse.json(
        {
          success: false,
          error: "Không có quyền cập nhật đơn hàng này (Yêu cầu token hợp lệ hoặc xác thực đúng số điện thoại đặt hàng)",
        },
        { status: 403 }
      );
    }

    // 6. Handle file upload if provided
    let uploadedUrl = order.payment_proof || null;

    if (fileToUpload && fileToUpload.size > 0) {
      if (fileToUpload.size > MAX_PROOF_SIZE) {
        return NextResponse.json(
          { success: false, error: "Dung lượng ảnh vượt quá giới hạn 5MB" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await fileToUpload.arrayBuffer());
      const detectedMime = detectImageMimeType(buffer);

      if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
        return NextResponse.json(
          { success: false, error: "Định dạng tệp không hợp lệ. Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP." },
          { status: 400 }
        );
      }

      // Check for dangerous embedded scripts in first 1KB
      const headerSnippet = buffer.slice(0, 1024).toString("utf-8").toLowerCase();
      if (
        headerSnippet.includes("<svg") ||
        headerSnippet.includes("<script") ||
        headerSnippet.includes("<?php") ||
        headerSnippet.includes("<html")
      ) {
        return NextResponse.json(
          { success: false, error: "Tệp tin chứa nội dung không an toàn" },
          { status: 400 }
        );
      }

      const extMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      const ext = extMap[detectedMime] || "jpg";
      const filePath = `payment-proofs/proof-${order.order_code}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("content-media")
        .upload(filePath, buffer, {
          contentType: detectedMime,
          upsert: false,
        });

      if (uploadError) {
        console.error("[POST /api/orders/proof] Supabase Storage upload error:", uploadError);
        return NextResponse.json(
          { success: false, error: "Lỗi lưu trữ ảnh biên lai. Vui lòng thử lại!" },
          { status: 500 }
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from("content-media")
        .getPublicUrl(filePath);

      uploadedUrl = publicUrlData.publicUrl;
    }

    if (!uploadedUrl) {
      return NextResponse.json(
        { success: false, error: "Vui lòng đính kèm tệp ảnh biên lai chuyển khoản!" },
        { status: 400 }
      );
    }

    // 7. Build safe internal note update
    const proofTag = "[Khách đã nộp ảnh biên lai CK - Chờ BTC đối soát]";
    let updatedInternalNote = order.internal_note || "";
    if (!updatedInternalNote.includes("[Khách đã nộp ảnh biên lai CK")) {
      updatedInternalNote = updatedInternalNote
        ? `${updatedInternalNote} | ${proofTag}`
        : proofTag;
    }
    if (customNote) {
      updatedInternalNote += ` (Ghi chú: ${customNote.replace(/[\r\n]+/g, " ").slice(0, 200)})`;
    }

    // 8. Atomic update to orders: ONLY payment_proof, internal_note, updated_at
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        payment_proof: uploadedUrl,
        internal_note: updatedInternalNote,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.order_id);

    if (updateErr) {
      console.error("[POST /api/orders/proof] DB update error:", updateErr);
      return NextResponse.json(
        { success: false, error: "Lỗi cập nhật trạng thái đơn hàng" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Đã tiếp nhận biên lai chuyển khoản thành công!",
      orderCode: order.order_code,
      paymentProof: uploadedUrl,
    });
  } catch (err: any) {
    console.error("[POST /api/orders/proof] Exception:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi máy chủ khi xử lý biên lai" },
      { status: 500 }
    );
  }
}
