"use client";

import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "Gieo Mơ là dự án gì?",
      a: "Gieo Mơ là kênh bán hàng gây quỹ chính thức của dự án Mầm Mơ. 100% nguồn lợi nhuận thu được từ việc bán các sản phẩm handmade may vá (như Pouch, Kẹp tóc, Túi tote...) sẽ được dùng để tài trợ sách vở, dụng cụ học tập và cơ sở vật chất cho trẻ em vùng cao.",
    },
    {
      q: "Sản phẩm của Gieo Mơ được sản xuất như thế nào?",
      a: "Tất cả sản phẩm đều được may và thêu hoàn toàn thủ công bởi đội ngũ tình nguyện viên khéo tay của Mầm Mơ. Mỗi sản phẩm là duy nhất và mang theo tâm huyết, sự tỉ mỉ của người làm.",
    },
    {
      q: "Phí giao hàng được tính như thế nào?",
      a: "Phí giao hàng mặc định cho đơn giao tận nơi là 25.000đ toàn quốc. Đặc biệt, các đơn hàng từ 200.000đ trở lên sẽ được MIỄN PHÍ VẬN CHUYỂN hoàn toàn.",
    },
    {
      q: "Tôi có thể theo dõi đơn hàng của mình bằng cách nào?",
      a: "Bạn có thể vào mục 'Tra cứu đơn hàng' trên trang web, nhập Mã đơn hàng (dạng GM-XXXXXX) được cấp sau khi thanh toán để xem tiến độ đóng gói và giao nhận.",
    },
    {
      q: "Tôi muốn ủng hộ thêm hoặc hợp tác với Mầm Mơ thì làm thế nào?",
      a: "Bạn có thể liên hệ trực tiếp với Ban tổ chức qua hotline 0123 456 789 hoặc email gieomo@mammo.vn. Chúng mình luôn rộng mở đón nhận sự đồng hành từ các bạn!",
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
