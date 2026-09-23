"use client";

import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Mail, Phone, MapPin, Send, CheckCircle, Loader2 } from "lucide-react";
import { saveContactMessage } from "@/lib/data/orderStore";
import { useSiteSettings } from "@/lib/hooks/useSiteSettings";

export default function ContactPage() {
  const settings = useSiteSettings();
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) return;
    setIsSubmitting(true);

    try {
      // 1. Save to client/local storage & notification
      saveContactMessage({
        name,
        email,
        phone: phone.trim() || null,
        message,
      });

      // 2. Call backend API to record in DB / send email
      try {
        await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone, message }),
        });
      } catch {
        // Fallback gracefully if API is offline
      }

      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12 max-w-4xl">
        {/* Header section */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold">
            🌱 Kế nối cùng Mầm Mơ
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
            Liên hệ Ban Tổ Chức Gieo Mơ
          </h1>
          <p className="text-gray-600 text-sm max-w-xl mx-auto">
            Bạn có câu hỏi, ý kiến đóng góp hoặc muốn đồng hành gây quỹ cùng dự án? Gửi lời nhắn cho Mầm nhé!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          {/* Contact Info Card */}
          <div className="md:col-span-2 bg-emerald-950 text-white rounded-3xl p-6 sm:p-8 space-y-6 flex flex-col justify-between shadow-md relative overflow-hidden">
            {/* Decorative circles */}
            <div className="absolute -bottom-10 -right-10 w-36 h-36 rounded-full bg-soft-green/10 blur-xl pointer-events-none" />

            <div className="space-y-6">
              <div>
                <h3 className="font-heading font-extrabold text-xl text-white">
                  Thông tin liên hệ
                </h3>
                <p className="text-xs text-emerald-300/80 mt-1">
                  Đội ngũ tình nguyện viên Mầm Mơ luôn sẵn sàng phản hồi bạn sớm nhất.
                </p>
              </div>

              <div className="space-y-4 text-xs sm:text-sm text-emerald-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-900 flex items-center justify-center text-soft-green shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-emerald-400 block font-semibold uppercase">Email</span>
                    <a href={`mailto:${settings.contactEmail}`} className="font-medium hover:underline">
                      {settings.contactEmail}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-900 flex items-center justify-center text-soft-green shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-emerald-400 block font-semibold uppercase">Hotline</span>
                    <a href={`tel:${settings.contactPhone}`} className="font-medium hover:underline">
                      {settings.contactPhone}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-900 flex items-center justify-center text-soft-green shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-emerald-400 block font-semibold uppercase">Địa chỉ văn phòng</span>
                    <span className="font-medium">{settings.officeAddress || "TP. Hồ Chí Minh, Việt Nam"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-emerald-900 text-xs text-soft-pink font-medium">
              ✨ &quot;Little Pieces, Bigger Dreams&quot;
            </div>
          </div>

          {/* Contact Form */}
          <div className="md:col-span-3 bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-2xs">
            {submitted ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-16 h-16 rounded-full bg-soft-green/50 text-emerald-900 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="font-heading font-extrabold text-2xl text-emerald-950">
                  Cảm ơn bạn đã gửi lời nhắn!
                </h3>
                <p className="text-xs text-gray-600 max-w-sm mx-auto leading-relaxed">
                  Mầm Mơ đã nhận được tin nhắn và sẽ phản hồi qua email <strong>{email}</strong> trong thời gian sớm nhất.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setName("");
                    setEmail("");
                    setMessage("");
                  }}
                  className="px-5 py-2.5 rounded-full bg-emerald-900 text-white font-bold text-xs hover:bg-emerald-950 transition-colors"
                >
                  Gửi tin nhắn khác ➔
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="font-heading font-bold text-xl text-emerald-950 mb-2">
                  Gửi lời nhắn cho Mầm
                </h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 block">Họ và tên *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green focus:ring-1 focus:ring-soft-green"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 block">Email của bạn *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green focus:ring-1 focus:ring-soft-green"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 block">Số điện thoại</label>
                    <span className="text-[11px] text-gray-400">Không bắt buộc</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ví dụ: 0901 234 567 (Để Mầm liên lạc khẩn khi cần)"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green focus:ring-1 focus:ring-soft-green"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 block">Lời nhắn / Câu hỏi *</label>
                  <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Nhập nội dung tin nhắn của bạn tại đây..."
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-soft-green focus:ring-1 focus:ring-soft-green resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-2xl bg-emerald-900 hover:bg-emerald-950 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang gửi lời nhắn...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Gửi tin nhắn cho Mầm ➔</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
