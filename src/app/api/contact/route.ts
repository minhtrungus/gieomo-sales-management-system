import { NextResponse } from "next/server";
import { escapeHtml } from "@/lib/utils/emailService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, error: "Vui lòng điền đầy đủ họ tên, email và nội dung tin nhắn." },
        { status: 400 }
      );
    }

    const cleanName = String(name).trim().slice(0, 100);
    const cleanEmail = String(email).trim().slice(0, 100);
    const cleanPhone = phone ? String(phone).trim().slice(0, 20) : null;
    const cleanMessage = String(message).trim().slice(0, 3000);

    // Save to Supabase
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const supabase = createAdminClient();
      await supabase.from("contact_messages").insert([
        {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          message: cleanMessage,
          status: "unread",
        },
      ]);
    } catch (dbErr) {
      console.warn("Could not insert contact message to Supabase:", dbErr);
    }

    // Optional: Send email notification to Admin via Resend if RESEND_API_KEY is available
    if (process.env.RESEND_API_KEY) {
      try {
        const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "gieomo@mammo.vn";
        const fromEmail = process.env.RESEND_FROM_EMAIL || "Gieo Mơ <onboarding@resend.dev>";
        const safeName = escapeHtml(cleanName);
        const safeEmail = escapeHtml(cleanEmail);
        const safePhone = escapeHtml(cleanPhone || "Không cung cấp");
        const safeMessage = escapeHtml(cleanMessage).replace(/\n/g, "<br/>");

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [adminEmail],
            subject: `[Gieo Mơ] Lời nhắn mới từ ${safeName}`,
            html: `
              <h2>Lời nhắn mới từ khách hàng website Gieo Mơ</h2>
              <p><strong>Họ tên:</strong> ${safeName}</p>
              <p><strong>Email:</strong> ${safeEmail}</p>
              <p><strong>Số điện thoại:</strong> ${safePhone}</p>
              <hr />
              <p><strong>Nội dung:</strong></p>
              <blockquote style="background:#f4fbf5;padding:12px 16px;border-left:4px solid #2d6338;border-radius:6px;">
                ${safeMessage}
              </blockquote>
              <p style="font-size:12px;color:#888;">Gửi từ form liên hệ gieomo.store</p>
            `,
          }),
        });
      } catch (emailErr) {
        console.warn("Failed to send admin notification email:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Lời nhắn của bạn đã được gửi thành công đến Ban Quản Trị Mầm Mơ.",
    });
  } catch (error) {
    console.error("Error processing contact message:", error);
    return NextResponse.json(
      { success: false, error: "Đã xảy ra lỗi khi gửi tin nhắn. Vui lòng thử lại sau." },
      { status: 500 }
    );
  }
}
