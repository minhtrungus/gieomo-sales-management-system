"use client";

import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

import { useSiteSettings } from "@/lib/hooks/useSiteSettings";

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const settings = useSiteSettings();

  const faqs = [
    {
      q: "Gieo Mơ là dự án gì?",
      a: "Gieo Mơ thuộc Tổ chức thiện nguyện Mầm Mơ - nơi những món hàng nhỏ bé lan tỏa yêu thương. Mỗi sản phẩm là một “hạt mơ” góp mang đến hy vọng và cơ hội tốt đẹp hơn cho trẻ em khó khăn.",
    },
    {
      q: "Sản phẩm của Gieo Mơ có ý nghĩa như thế nào?",
      a: "Tựa như sợi chỉ nối liền khoảng cách hay chiếc nút gom những mảnh rời lại gần nhau, mỗi món đồ ở Gieo Mơ thành hình từ sự góp nhặt những điều giản dị. Khi bạn sở hữu một sản phẩm từ Gieo Mơ, hành trình ấy không dừng lại ở một vật dụng thường ngày, mà vòng tay sẻ chia lại được nối dài thêm một nhịp. Bởi đôi khi, thay đổi thế giới không cần những điều kỳ vĩ, mà chính tình yêu thương nhỏ bé bạn gieo xuống hôm nay sẽ cùng nhau vun đắp nên một cuộc đời tốt đẹp hơn cho ai đó ngày mai.",
    },
    {
      q: "Phí giao hàng được tính như thế nào?",
      a: `Phí giao hàng mặc định cho đơn giao tận nơi là ${settings.flatShippingFee.toLocaleString("vi-VN")}đ toàn quốc.`,
    },
    {
      q: "Tôi có thể xem thông tin về các chiến dịch mà Gieo Mơ đóng góp ở đâu?",
      a: (
        <div className="space-y-3">
          <p>
            Bạn có thể theo dõi thông tin về các chiến dịch thiện nguyện và hành trình lan toả yêu thương mà Gieo Mơ đồng hành thông qua trang Facebook chính thức của Mầm Mơ. Chúng mình luôn cập nhật chi tiết về từng chiến dịch, hình ảnh thực tế và giá trị mà bạn đã cùng tạo nên.
          </p>
          <a
            href={settings.facebookUrl || "https://www.facebook.com/BanHangGieoMo"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 font-bold text-xs transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Ghé thăm Facebook Mầm Mơ ➔</span>
          </a>
        </div>
      ),
    },
    {
      q: "Tôi muốn ủng hộ thêm hoặc hợp tác với Mầm Mơ thì làm thế nào?",
      a: `Bạn có thể liên hệ trực tiếp với Ban tổ chức qua hotline ${settings.contactPhone} hoặc email ${settings.contactEmail}. Chúng mình luôn rộng mở đón nhận sự đồng hành từ các bạn!`,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 max-w-4xl">
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold whitespace-nowrap">
            ❓ Giải đáp thắc mắc
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 text-balance">
            Hỏi đáp thường gặp (FAQ)
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm max-w-xl mx-auto text-balance">
            Những câu hỏi phổ biến về sản phẩm, giao hàng và dự án gây quỹ Gieo Mơ.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-emerald-100 overflow-hidden shadow-2xs transition-all"
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full p-5 text-left font-heading font-bold text-base text-emerald-950 flex items-center justify-between hover:text-emerald-700 transition-colors gap-3 cursor-pointer"
              >
                <span className="text-balance leading-snug">{faq.q}</span>
                <span className="text-xl font-mono text-emerald-800 shrink-0 w-6 h-6 flex items-center justify-center">
                  {openIndex === idx ? "−" : "+"}
                </span>
              </button>

              {openIndex === idx && (
                <div className="px-5 pb-5 text-xs sm:text-sm text-gray-600 leading-relaxed border-t border-emerald-50 pt-3 text-justify hyphens-auto break-words">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
