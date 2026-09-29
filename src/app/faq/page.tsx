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
      a: "Bạn có thể theo dõi thông tin về các chiến dịch thiện nguyện mà Gieo Mơ đồng hành thông qua các kênh truyền thông chính thức của Tổ chức Thiện nguyện Mầm Mơ. Chúng mình sẽ cập nhật thông tin về từng chiến dịch, quá trình triển khai và những giá trị mà sự đóng góp của bạn đã cùng tạo nên.",
    },
    {
      q: "Tôi muốn ủng hộ thêm hoặc hợp tác với Mầm Mơ thì làm thế nào?",
      a: `Bạn có thể liên hệ trực tiếp với Ban tổ chức qua hotline ${settings.contactPhone} hoặc email ${settings.contactEmail}. Chúng mình luôn rộng mở đón nhận sự đồng hành từ các bạn!`,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12 max-w-3xl">
        <div className="text-center space-y-2 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold">
            ❓ Giải đáp thắc mắc
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
            Hỏi đáp thường gặp (FAQ)
          </h1>
          <p className="text-gray-600 text-sm">
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
                className="w-full p-5 text-left font-heading font-bold text-base text-emerald-950 flex items-center justify-between hover:text-emerald-700 transition-colors"
              >
                <span>{faq.q}</span>
                <span className="text-lg font-mono text-emerald-800 ml-4">
                  {openIndex === idx ? "−" : "+"}
                </span>
              </button>

              {openIndex === idx && (
                <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-emerald-50 pt-3">
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
