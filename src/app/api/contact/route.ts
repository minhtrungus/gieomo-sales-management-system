import { NextResponse } from "next/server";

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

    // Try saving to Supabase if configured
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from("contact_messages").insert([
          {
            name,
            email,
            phone: phone || null,
            message,
            status: "unread",
          },
        ]);
      }
    } catch (dbErr) {
      console.warn("Could not insert contact message to Supabase (table may not exist or keys unset):", dbErr);
    }

    // Optional: Send email notification to Admin via Resend if RESEND_API_KEY is available
    if (process.env.RESEND_API_KEY) {
      try {
        const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "gieomo@mammo.vn";
        const fromEmail = process.env.RESEND_FROM_EMAIL || "Gieo Mo Website <onboarding@resend.dev>";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [adminEmail],
            subject: `[Gieo Mơ] Lời nhắn mới từ ${name}`,
            html: `
              <h2>Lời nhắn mới từ khách hàng website Gieo Mơ</h2>
              <p><strong>Họ tên:</strong> ${name}</p>
              <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
              <p><strong>Số điện thoại:</strong> ${phone || "Không cung cấp"}</p>
              <hr />
              <p><strong>Nội dung:</strong></p>
              <blockquote style="background:#f4fbf5;padding:12px 16px;border-left:4px solid #2d6338;border-radius:6px;">
                ${message.replace(/\n/g, "<br/>")}
              </blockquote>
              <p style="font-size:12px;color:#888;">Gửi từ form liên hệ gieomo.vn</p>
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
